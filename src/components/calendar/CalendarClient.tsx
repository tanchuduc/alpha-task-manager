"use client";

import React, { useState, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  CheckSquare,
  Square,
  Clock,
  AlertCircle,
  Filter,
  Plus,
  Search,
  Users,
  FolderKanban,
  Building2,
  Sparkles,
  Layers,
  ArrowUpRight,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  User,
  ListTodo,
  CheckCircle2,
  Circle,
  Flag,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  cn,
  getInitials,
  PRIORITY_CONFIG,
  formatDateVi,
  isOverdue,
} from "@/lib/utils";
import type {
  Department,
  PersonalTodo,
  Profile,
  Project,
  Task,
  TaskPriority,
  TaskStatus,
} from "@/types/database";
import TaskDrawer from "@/components/tasks/TaskDrawer";
import { toast } from "sonner";

export interface CalendarClientProps {
  profile: Profile;
  initialTasks: Task[];
  initialTodos: PersonalTodo[];
  projects: Project[];
  departments: Department[];
  allProfiles: Profile[];
  allStatuses: TaskStatus[];
}

type ViewMode = "month" | "week" | "day";
type StatusFilter = "all" | "in_progress" | "overdue" | "done";

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const WEEKDAYS_FULL = [
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
  "Chủ Nhật",
];

// Helper to format Date to YYYY-MM-DD
function toDateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Helper to parse YYYY-MM-DD to Date in local time
function fromDateKey(str: string): Date {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export default function CalendarClient({
  profile,
  initialTasks,
  initialTodos,
  projects,
  departments,
  allProfiles,
  allStatuses,
}: CalendarClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Tasks & Todos state
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [todos, setTodos] = useState<PersonalTodo[]>(initialTodos);

  // Active TaskDrawer
  const [activeDrawerTask, setActiveDrawerTask] = useState<{
    taskId: string;
    projectId: string;
  } | null>(null);

  // Day Overflow Modal state (when user clicks "+X việc nữa" in month cell)
  const [overflowDate, setOverflowDate] = useState<string | null>(null);

  // Calendar View & Navigation state
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const v = searchParams.get("view");
    if (v === "week" || v === "day" || v === "month") return v;
    return "month";
  });

  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());

  // Mini Calendar Month state (in left sidebar)
  const [miniDate, setMiniDate] = useState<Date>(() => new Date());

  // Sidebar visibility toggle (Lark-like collapsible left pane)
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Filters state
  const [showMyTasks, setShowMyTasks] = useState(true);
  const [showPersonalTodos, setShowPersonalTodos] = useState(true);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(
    () => new Set(projects.map((p) => p.id))
  );
  const [selectedDeptIds, setSelectedDeptIds] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedColleagueIds, setSelectedColleagueIds] = useState<Set<string>>(
    () => new Set()
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [colleagueSearch, setColleagueSearch] = useState("");

  const todayKey = useMemo(() => toDateKey(new Date()), []);

  // Today helpers
  const isCurrentToday = useMemo(() => {
    return toDateKey(currentDate) === todayKey;
  }, [currentDate, todayKey]);

  // Navigate functions
  const handleGoToday = useCallback(() => {
    const now = new Date();
    setCurrentDate(now);
    setMiniDate(now);
  }, []);

  const handlePrev = useCallback(() => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      if (viewMode === "month") {
        next.setMonth(next.getMonth() - 1);
      } else if (viewMode === "week") {
        next.setDate(next.getDate() - 7);
      } else {
        next.setDate(next.getDate() - 1);
      }
      return next;
    });
  }, [viewMode]);

  const handleNext = useCallback(() => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      if (viewMode === "month") {
        next.setMonth(next.getMonth() + 1);
      } else if (viewMode === "week") {
        next.setDate(next.getDate() + 7);
      } else {
        next.setDate(next.getDate() + 1);
      }
      return next;
    });
  }, [viewMode]);

  // Mini calendar navigation
  const handleMiniPrev = useCallback(() => {
    setMiniDate((prev) => {
      const next = new Date(prev);
      next.setMonth(next.getMonth() - 1);
      return next;
    });
  }, []);

  const handleMiniNext = useCallback(() => {
    setMiniDate((prev) => {
      const next = new Date(prev);
      next.setMonth(next.getMonth() + 1);
      return next;
    });
  }, []);

  // Toggle Project selection
  const handleToggleProject = useCallback((projectId: string) => {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  }, []);

  const handleSelectAllProjects = useCallback(() => {
    setSelectedProjectIds(new Set(projects.map((p) => p.id)));
  }, [projects]);

  const handleDeselectAllProjects = useCallback(() => {
    setSelectedProjectIds(new Set());
  }, []);

  // Toggle Colleague selection
  const handleToggleColleague = useCallback((userId: string) => {
    setSelectedColleagueIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }, []);

  // Filter Colleagues list
  const filteredColleagues = useMemo(() => {
    return allProfiles.filter((p) => {
      if (p.id === profile.id) return false;
      if (!colleagueSearch.trim()) return true;
      const q = colleagueSearch.toLowerCase();
      return (
        p.full_name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        (p.job_title && p.job_title.toLowerCase().includes(q))
      );
    });
  }, [allProfiles, profile.id, colleagueSearch]);

  // Multi-layer filter logic
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = t.title.toLowerCase().includes(q);
        const matchProject = t.project?.name.toLowerCase().includes(q) ?? false;
        if (!matchTitle && !matchProject) return false;
      }

      // 2. Status Filter
      const isDone =
        t.status?.category === "done" || Boolean(t.completed_at);
      if (statusFilter === "done" && !isDone) return false;
      if (statusFilter === "in_progress" && isDone) return false;
      if (statusFilter === "overdue") {
        if (isDone || !isOverdue(t.due_date, t.completed_at)) return false;
      }

      // 3. Department Filter (if selected)
      if (selectedDeptIds.size > 0) {
        const proj = projects.find((p) => p.id === t.project_id);
        if (!proj?.department_id || !selectedDeptIds.has(proj.department_id)) {
          return false;
        }
      }

      // 4. Layer Matching (Personal, Project, Colleague)
      const isAssignedToMe = (t.assignees ?? []).some(
        (a) => a.id === profile.id
      );
      const isProjectSelected = selectedProjectIds.has(t.project_id);
      const isAssignedToSelectedColleague =
        selectedColleagueIds.size > 0 &&
        (t.assignees ?? []).some((a) => selectedColleagueIds.has(a.id));

      // Case A: Assigned to me
      if (isAssignedToMe && showMyTasks) return true;

      // Case B: In selected project
      if (isProjectSelected) return true;

      // Case C: Assigned to selected colleague
      if (isAssignedToSelectedColleague) return true;

      return false;
    });
  }, [
    tasks,
    searchQuery,
    statusFilter,
    selectedDeptIds,
    projects,
    profile.id,
    showMyTasks,
    selectedProjectIds,
    selectedColleagueIds,
  ]);

  // Filtered Personal Todos
  const filteredTodos = useMemo(() => {
    if (!showPersonalTodos) return [];
    return todos.filter((td) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!td.title.toLowerCase().includes(q)) return false;
      }
      if (statusFilter === "done" && !td.is_done) return false;
      if (statusFilter === "in_progress" && td.is_done) return false;
      if (statusFilter === "overdue") {
        if (td.is_done || !isOverdue(td.due_date)) return false;
      }
      return true;
    });
  }, [todos, showPersonalTodos, searchQuery, statusFilter]);

  // Group tasks by Date (YYYY-MM-DD)
  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of filteredTasks) {
      if (!t.due_date) continue;
      const key = t.due_date.slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return map;
  }, [filteredTasks]);

  // Group todos by Date (YYYY-MM-DD)
  const todosByDate = useMemo(() => {
    const map = new Map<string, PersonalTodo[]>();
    for (const td of filteredTodos) {
      if (!td.due_date) continue;
      const key = td.due_date.slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push(td);
      map.set(key, arr);
    }
    return map;
  }, [filteredTodos]);

  // Dates with items (for mini calendar dots)
  const datesWithItems = useMemo(() => {
    const set = new Set<string>();
    for (const k of tasksByDate.keys()) set.add(k);
    for (const k of todosByDate.keys()) set.add(k);
    return set;
  }, [tasksByDate, todosByDate]);

  // Title string for Top Bar
  const titleDisplay = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;

    if (viewMode === "month") {
      return `Tháng ${month}, ${year}`;
    }

    if (viewMode === "day") {
      const dayOfWeekIdx = (currentDate.getDay() + 6) % 7;
      const dayName = WEEKDAYS_FULL[dayOfWeekIdx];
      const day = currentDate.getDate();
      return `${dayName}, Ngày ${day} Tháng ${month}, ${year}`;
    }

    // Week View: calculate start of week (Monday) and end of week (Sunday)
    const d = new Date(currentDate);
    const dayOfWeek = (d.getDay() + 6) % 7; // Monday = 0
    const monday = new Date(d);
    monday.setDate(d.getDate() - dayOfWeek);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const mDay = monday.getDate();
    const mMonth = monday.getMonth() + 1;
    const sDay = sunday.getDate();
    const sMonth = sunday.getMonth() + 1;
    const sYear = sunday.getFullYear();

    if (mMonth === sMonth) {
      return `${mDay} - ${sDay} Thg ${mMonth}, ${sYear}`;
    }
    return `${mDay} Thg ${mMonth} - ${sDay} Thg ${sMonth}, ${sYear}`;
  }, [currentDate, viewMode]);

  // Mini Calendar grid calculation
  const miniCalendarCells = useMemo(() => {
    const year = miniDate.getFullYear();
    const month = miniDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    let startOffset = (firstDay.getDay() + 6) % 7; // Mon = 0
    const daysInMonth = lastDay.getDate();

    const cells: Array<{
      dateKey: string;
      dayNumber: number;
      inCurrentMonth: boolean;
      hasEvents: boolean;
      isSelected: boolean;
      isToday: boolean;
    }> = [];

    // Prev month padding
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = prevMonthLastDay - i;
      const prevDate = new Date(year, month - 1, d);
      const key = toDateKey(prevDate);
      cells.push({
        dateKey: key,
        dayNumber: d,
        inCurrentMonth: false,
        hasEvents: datesWithItems.has(key),
        isSelected: toDateKey(currentDate) === key,
        isToday: key === todayKey,
      });
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const curDate = new Date(year, month, day);
      const key = toDateKey(curDate);
      cells.push({
        dateKey: key,
        dayNumber: day,
        inCurrentMonth: true,
        hasEvents: datesWithItems.has(key),
        isSelected: toDateKey(currentDate) === key,
        isToday: key === todayKey,
      });
    }

    // Next month padding to fill 35 or 42 cells
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const nextDate = new Date(year, month + 1, i);
      const key = toDateKey(nextDate);
      cells.push({
        dateKey: key,
        dayNumber: i,
        inCurrentMonth: false,
        hasEvents: datesWithItems.has(key),
        isSelected: toDateKey(currentDate) === key,
        isToday: key === todayKey,
      });
    }

    return cells;
  }, [miniDate, datesWithItems, currentDate, todayKey]);

  // Main Month grid calculation (Monday-first)
  const monthCalendarCells = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    let startOffset = (firstDay.getDay() + 6) % 7; // Monday = 0
    const daysInMonth = lastDay.getDate();

    const cells: Array<{
      dateKey: string;
      dayNumber: number;
      inCurrentMonth: boolean;
      isToday: boolean;
    }> = [];

    // Prev month days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = prevMonthLastDay - i;
      const prevDate = new Date(year, month - 1, d);
      const key = toDateKey(prevDate);
      cells.push({
        dateKey: key,
        dayNumber: d,
        inCurrentMonth: false,
        isToday: key === todayKey,
      });
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const curDate = new Date(year, month, day);
      const key = toDateKey(curDate);
      cells.push({
        dateKey: key,
        dayNumber: day,
        inCurrentMonth: true,
        isToday: key === todayKey,
      });
    }

    // Next month days to reach 35 or 42 cells
    const totalNeeded = cells.length > 35 ? 42 : 35;
    const remaining = totalNeeded - cells.length;
    for (let i = 1; i <= remaining; i++) {
      const nextDate = new Date(year, month + 1, i);
      const key = toDateKey(nextDate);
      cells.push({
        dateKey: key,
        dayNumber: i,
        inCurrentMonth: false,
        isToday: key === todayKey,
      });
    }

    return cells;
  }, [currentDate, todayKey]);

  // Main Week columns calculation (7 columns from Monday to Sunday)
  const weekColumns = useMemo(() => {
    const d = new Date(currentDate);
    const dayOfWeek = (d.getDay() + 6) % 7; // Monday = 0
    const monday = new Date(d);
    monday.setDate(d.getDate() - dayOfWeek);

    const cols: Array<{
      dateKey: string;
      dayName: string;
      dayNumber: number;
      isToday: boolean;
      date: Date;
    }> = [];

    for (let i = 0; i < 7; i++) {
      const colDate = new Date(monday);
      colDate.setDate(monday.getDate() + i);
      const key = toDateKey(colDate);
      cols.push({
        dateKey: key,
        dayName: WEEKDAYS_FULL[i],
        dayNumber: colDate.getDate(),
        isToday: key === todayKey,
        date: colDate,
      });
    }

    return cols;
  }, [currentDate, todayKey]);

  // Day View data calculation
  const dayViewData = useMemo(() => {
    const curKey = toDateKey(currentDate);

    // 1. Due Today (Tasks & Todos due on currentDate)
    const todayTasks = tasksByDate.get(curKey) ?? [];
    const todayTodos = todosByDate.get(curKey) ?? [];

    // 2. Overdue Tasks (due before currentDate and not completed)
    const overdueTasks = filteredTasks.filter((t) => {
      if (!t.due_date) return false;
      const isDone =
        t.status?.category === "done" || Boolean(t.completed_at);
      if (isDone) return false;
      return t.due_date.slice(0, 10) < curKey;
    });

    // 3. Upcoming (next 3 days)
    const curTime = currentDate.getTime();
    const upcomingTasks = filteredTasks.filter((t) => {
      if (!t.due_date) return false;
      const isDone =
        t.status?.category === "done" || Boolean(t.completed_at);
      if (isDone) return false;
      const dueKey = t.due_date.slice(0, 10);
      if (dueKey <= curKey) return false;
      const tTime = fromDateKey(dueKey).getTime();
      const diffDays = Math.round((tTime - curTime) / (1000 * 3600 * 24));
      return diffDays >= 1 && diffDays <= 4;
    });

    return {
      todayTasks,
      todayTodos,
      overdueTasks,
      upcomingTasks,
    };
  }, [currentDate, tasksByDate, todosByDate, filteredTasks]);

  // Quick toggle Task completion
  const handleToggleTaskDone = useCallback(
    async (task: Task) => {
      const isDone =
        task.status?.category === "done" || Boolean(task.completed_at);
      const targetCategory = isDone ? "todo" : "done";
      const targetStatus = allStatuses.find(
        (s) =>
          s.project_id === task.project_id && s.category === targetCategory
      );

      const nextCompletedAt = isDone ? null : new Date().toISOString();

      // Optimistic update
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id === task.id) {
            return {
              ...t,
              completed_at: nextCompletedAt,
              status_id: targetStatus ? targetStatus.id : t.status_id,
              status: targetStatus ?? t.status,
            };
          }
          return t;
        })
      );

      try {
        const supabase = createClient();
        const payload: {
          completed_at: string | null;
          status_id?: string;
        } = {
          completed_at: nextCompletedAt,
        };
        if (targetStatus) payload.status_id = targetStatus.id;

        const { error } = await supabase
          .from("tasks")
          .update(payload)
          .eq("id", task.id);

        if (error) throw error;
        toast.success(
          isDone ? "Đã mở lại công việc" : "Đã hoàn thành công việc!"
        );
      } catch {
        toast.error("Không thể cập nhật trạng thái");
        // Rollback
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? task : t))
        );
      }
    },
    [allStatuses]
  );

  // Quick toggle Todo completion
  const handleToggleTodoDone = useCallback(async (todo: PersonalTodo) => {
    const nextDone = !todo.is_done;
    setTodos((prev) =>
      prev.map((td) => (td.id === todo.id ? { ...td, is_done: nextDone } : td))
    );

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("personal_todos")
        .update({ is_done: nextDone })
        .eq("id", todo.id);
      if (error) throw error;
    } catch {
      toast.error("Không thể cập nhật Todo");
      setTodos((prev) =>
        prev.map((td) => (td.id === todo.id ? todo : td))
      );
    }
  }, []);

  // Statuses for TaskDrawer
  const drawerProjectStatuses = useMemo(() => {
    if (!activeDrawerTask) return [];
    return allStatuses.filter(
      (s) => s.project_id === activeDrawerTask.projectId
    );
  }, [activeDrawerTask, allStatuses]);

  return (
    <div className="flex-1 flex overflow-hidden bg-[#f8f9fa] dark:bg-[#121212] select-none">
      {/* ====================================================================
       * 1. LEFT SIDEBAR: LARK-LIKE MULTI-LAYER CHECKLIST & MINI PICKER
       * ==================================================================== */}
      <aside
        className={cn(
          "shrink-0 border-r border-[#e8e8e8] dark:border-[#2b2b2b] bg-white dark:bg-[#181818] transition-all duration-200 flex flex-col z-20",
          sidebarOpen ? "w-[290px] xl:w-[320px]" : "w-0 overflow-hidden border-none"
        )}
      >
        <div className="p-3.5 border-b border-[#f0f0f0] dark:border-[#262626] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-brand" />
            <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
              Bộ lọc & Danh mục Lịch
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            title="Thu gọn bảng điều khiển"
            className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3.5 space-y-5">
          {/* A. MINI CALENDAR PICKER */}
          <div className="rounded-[8px] border border-[#ebebeb] dark:border-[#2e2e2e] bg-[#fcfcfc] dark:bg-[#1c1c1c] p-2.5">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Thg {miniDate.getMonth() + 1}, {miniDate.getFullYear()}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleMiniPrev}
                  className="p-1 rounded text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setMiniDate(new Date())}
                  className="px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded cursor-pointer"
                >
                  Nay
                </button>
                <button
                  type="button"
                  onClick={handleMiniNext}
                  className="p-1 rounded text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-semibold text-slate-400 dark:text-slate-500 mb-1">
              {WEEKDAYS.map((w) => (
                <div key={w} className="py-0.5">
                  {w}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5 text-center">
              {miniCalendarCells.map((c) => (
                <button
                  key={c.dateKey}
                  type="button"
                  onClick={() => {
                    setCurrentDate(fromDateKey(c.dateKey));
                  }}
                  className={cn(
                    "h-6 w-6 mx-auto rounded-full text-[11px] flex items-center justify-center relative transition cursor-pointer",
                    c.isSelected && "bg-brand text-white font-bold",
                    !c.isSelected &&
                      c.isToday &&
                      "border border-brand text-brand font-bold",
                    !c.isSelected &&
                      !c.isToday &&
                      c.inCurrentMonth &&
                      "text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700",
                    !c.isSelected &&
                      !c.isToday &&
                      !c.inCurrentMonth &&
                      "text-slate-300 dark:text-slate-600"
                  )}
                >
                  {c.dayNumber}
                  {c.hasEvents && !c.isSelected && (
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-brand" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* B. LAYER 1: LỊCH CÁ NHÂN (PERSONAL LAYER) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Lịch Cá Nhân
              </span>
            </div>

            <label className="flex items-center justify-between p-1.5 rounded-[6px] hover:bg-slate-100 dark:hover:bg-slate-800/60 cursor-pointer transition">
              <div className="flex items-center gap-2 min-w-0">
                <input
                  type="checkbox"
                  checked={showMyTasks}
                  onChange={(e) => setShowMyTasks(e.target.checked)}
                  className="rounded border-slate-300 text-brand focus:ring-brand h-4 w-4"
                />
                <span className="h-2.5 w-2.5 rounded-full bg-brand shrink-0" />
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                  Việc của tôi
                </span>
              </div>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand-soft text-brand dark:bg-brand-soft-dark">
                {
                  tasks.filter((t) =>
                    (t.assignees ?? []).some((a) => a.id === profile.id)
                  ).length
                }
              </span>
            </label>

            <label className="flex items-center justify-between p-1.5 rounded-[6px] hover:bg-slate-100 dark:hover:bg-slate-800/60 cursor-pointer transition">
              <div className="flex items-center gap-2 min-w-0">
                <input
                  type="checkbox"
                  checked={showPersonalTodos}
                  onChange={(e) => setShowPersonalTodos(e.target.checked)}
                  className="rounded border-purple-400 text-purple-600 focus:ring-purple-500 h-4 w-4"
                />
                <span className="h-2.5 w-2.5 rounded-full bg-purple-500 shrink-0" />
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                  Todo cá nhân
                </span>
              </div>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                {todos.length}
              </span>
            </label>
          </div>

          {/* C. LAYER 2: LỊCH ĐỘI NHÓM / DỰ ÁN (PROJECTS LAYER) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Lịch Dự Án ({selectedProjectIds.size}/{projects.length})
              </span>
              <div className="flex items-center gap-1.5 text-[10px]">
                <button
                  type="button"
                  onClick={handleSelectAllProjects}
                  className="text-brand hover:underline cursor-pointer"
                >
                  Tất cả
                </button>
                <span className="text-slate-300 dark:text-slate-600">|</span>
                <button
                  type="button"
                  onClick={handleDeselectAllProjects}
                  className="text-slate-400 hover:underline cursor-pointer"
                >
                  Bỏ chọn
                </button>
              </div>
            </div>

            <div className="space-y-0.5 max-h-[170px] overflow-y-auto pr-1">
              {projects.map((p) => {
                const isChecked = selectedProjectIds.has(p.id);
                const count = tasks.filter((t) => t.project_id === p.id).length;
                return (
                  <label
                    key={p.id}
                    className="flex items-center justify-between p-1.5 rounded-[6px] hover:bg-slate-100 dark:hover:bg-slate-800/60 cursor-pointer transition text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleProject(p.id)}
                        className="rounded border-slate-300 text-brand focus:ring-brand h-3.5 w-3.5"
                      />
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: p.color || "#F47830" }}
                      />
                      <span className="truncate text-slate-700 dark:text-slate-300">
                        <span className="font-semibold text-slate-900 dark:text-slate-100 mr-1">
                          [{p.code}]
                        </span>
                        {p.name}
                      </span>
                    </div>
                    {count > 0 && (
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {count}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          {/* D. LAYER 3: LỊCH PHÒNG BAN (DEPARTMENTS) */}
          {departments.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Phòng Ban
                </span>
                {selectedDeptIds.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedDeptIds(new Set())}
                    className="text-[10px] text-slate-400 hover:text-brand cursor-pointer"
                  >
                    Xóa lọc
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {departments.map((dept) => {
                  const active = selectedDeptIds.has(dept.id);
                  return (
                    <button
                      key={dept.id}
                      type="button"
                      onClick={() => {
                        setSelectedDeptIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(dept.id)) next.delete(dept.id);
                          else next.add(dept.id);
                          return next;
                        });
                      }}
                      className={cn(
                        "px-2 py-1 rounded-[5px] text-[11px] font-medium transition cursor-pointer border",
                        active
                          ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 border-transparent shadow-xs"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200"
                      )}
                    >
                      {dept.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* E. LAYER 4: THEO DÕI ĐỒNG NGHIỆP (FOLLOWING) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Theo Dõi Đồng Nghiệp ({selectedColleagueIds.size})
              </span>
              {selectedColleagueIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedColleagueIds(new Set())}
                  className="text-[10px] text-slate-400 hover:text-brand cursor-pointer"
                >
                  Bỏ chọn
                </button>
              )}
            </div>

            <div className="relative">
              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm nhân sự..."
                value={colleagueSearch}
                onChange={(e) => setColleagueSearch(e.target.value)}
                className="w-full pl-7 pr-2 py-1 text-xs rounded-[6px] border border-[#d9d9d9] dark:border-[#333] bg-[#fbfbfb] dark:bg-[#1a1a1a] text-slate-800 dark:text-slate-200 focus:outline-none focus:border-brand"
              />
            </div>

            <div className="space-y-1 max-h-[140px] overflow-y-auto pr-1">
              {filteredColleagues.slice(0, 15).map((colleague) => {
                const isSelected = selectedColleagueIds.has(colleague.id);
                const assignedCount = tasks.filter((t) =>
                  (t.assignees ?? []).some((a) => a.id === colleague.id)
                ).length;

                return (
                  <label
                    key={colleague.id}
                    className="flex items-center justify-between p-1 rounded-[6px] hover:bg-slate-100 dark:hover:bg-slate-800/60 cursor-pointer text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleColleague(colleague.id)}
                        className="rounded border-slate-300 text-brand focus:ring-brand h-3.5 w-3.5"
                      />
                      <div className="h-5 w-5 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[9px] font-bold text-slate-700 dark:text-slate-200 shrink-0">
                        {getInitials(colleague.full_name)}
                      </div>
                      <span className="truncate text-slate-700 dark:text-slate-300">
                        {colleague.full_name}
                      </span>
                    </div>
                    {assignedCount > 0 && (
                      <span className="text-[10px] text-slate-400">
                        {assignedCount} việc
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </aside>

      {/* ====================================================================
       * 2. MAIN CALENDAR WORKSPACE
       * ==================================================================== */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white dark:bg-[#151515]">
        {/* TOP TOOLBAR: LARK-LIKE TOP CONTROLS */}
        <header className="h-[54px] shrink-0 border-b border-[#e8e8e8] dark:border-[#2b2b2b] px-4 flex items-center justify-between gap-3 bg-white dark:bg-[#181818]">
          {/* Left: Sidebar Toggle + Today + Prev/Next + Dynamic Title */}
          <div className="flex items-center gap-2.5 min-w-0">
            {!sidebarOpen && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                title="Mở bảng bộ lọc"
                className="p-1.5 rounded-md border border-[#d9d9d9] dark:border-[#383838] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            )}

            <button
              type="button"
              onClick={handleGoToday}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-[6px] border transition cursor-pointer",
                isCurrentToday
                  ? "bg-brand text-white border-brand shadow-xs"
                  : "border-[#d9d9d9] dark:border-[#3a3a3a] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              )}
            >
              Hôm nay
            </button>

            <div className="inline-flex items-center rounded-[6px] border border-[#d9d9d9] dark:border-[#3a3a3a] overflow-hidden">
              <button
                type="button"
                onClick={handlePrev}
                className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer border-l border-[#d9d9d9] dark:border-[#3a3a3a]"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <h1 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate ml-1">
              {titleDisplay}
            </h1>
          </div>

          {/* Right: Search + Status Filter + View Switcher (Ngày | Tuần | Tháng) */}
          <div className="flex items-center gap-2.5">
            {/* Search Box */}
            <div className="relative hidden md:block w-48 lg:w-56">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm việc, dự án..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-7 py-1 text-xs rounded-[6px] border border-[#d9d9d9] dark:border-[#383838] bg-[#f9f9f9] dark:bg-[#202020] text-slate-800 dark:text-slate-200 focus:outline-none focus:border-brand"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Status Filter Dropdown */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="text-xs rounded-[6px] border border-[#d9d9d9] dark:border-[#383838] bg-white dark:bg-[#202020] px-2.5 py-1.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-brand cursor-pointer"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="in_progress">Đang làm</option>
              <option value="overdue">Quá hạn</option>
              <option value="done">Đã hoàn thành</option>
            </select>

            {/* LARK-STYLE VIEW SWITCHER: Ngày | Tuần | Tháng */}
            <div className="inline-flex rounded-[6px] p-0.5 bg-slate-100 dark:bg-[#252525] border border-[#e2e2e2] dark:border-[#333]">
              <button
                type="button"
                onClick={() => setViewMode("day")}
                className={cn(
                  "px-3 py-1 text-xs font-semibold rounded-[4px] transition cursor-pointer",
                  viewMode === "day"
                    ? "bg-white dark:bg-[#181818] text-slate-900 dark:text-slate-100 shadow-2xs"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                )}
              >
                Ngày
              </button>
              <button
                type="button"
                onClick={() => setViewMode("week")}
                className={cn(
                  "px-3 py-1 text-xs font-semibold rounded-[4px] transition cursor-pointer",
                  viewMode === "week"
                    ? "bg-white dark:bg-[#181818] text-slate-900 dark:text-slate-100 shadow-2xs"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                )}
              >
                Tuần
              </button>
              <button
                type="button"
                onClick={() => setViewMode("month")}
                className={cn(
                  "px-3 py-1 text-xs font-semibold rounded-[4px] transition cursor-pointer",
                  viewMode === "month"
                    ? "bg-white dark:bg-[#181818] text-slate-900 dark:text-slate-100 shadow-2xs"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                )}
              >
                Tháng
              </button>
            </div>
          </div>
        </header>

        {/* CALENDAR BODY: 3 MODES (MONTH, WEEK, DAY) */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          {/* ==================================================================
           * VIEW 1: MONTH MATRIX (LƯỚI THÁNG 7 CỘT)
           * ================================================================== */}
          {viewMode === "month" && (
            <div className="h-full flex flex-col rounded-[8px] border border-[#e8e8e8] dark:border-[#2b2b2b] bg-white dark:bg-[#181818] overflow-hidden shadow-2xs">
              {/* Month Header: Weekday Labels */}
              <div className="grid grid-cols-7 border-b border-[#e8e8e8] dark:border-[#2b2b2b] bg-[#fafafa] dark:bg-[#1d1d1d]">
                {WEEKDAYS.map((w, idx) => (
                  <div
                    key={w}
                    className="py-2 text-center text-xs font-bold text-slate-600 dark:text-slate-300"
                  >
                    <span>{w}</span>
                    <span className="hidden sm:inline font-normal text-slate-400 ml-1 text-[11px]">
                      ({WEEKDAYS_FULL[idx]})
                    </span>
                  </div>
                ))}
              </div>

              {/* Month Grid Cells */}
              <div className="grid grid-cols-7 flex-1 auto-rows-fr divide-x divide-y divide-[#efefef] dark:divide-[#262626]">
                {monthCalendarCells.map((cell) => {
                  const dayTasks = tasksByDate.get(cell.dateKey) ?? [];
                  const dayTodos = todosByDate.get(cell.dateKey) ?? [];
                  const totalCount = dayTasks.length + dayTodos.length;
                  const isToday = cell.isToday;
                  const isSelected = toDateKey(currentDate) === cell.dateKey;

                  return (
                    <div
                      key={cell.dateKey}
                      onClick={() => setCurrentDate(fromDateKey(cell.dateKey))}
                      className={cn(
                        "p-1.5 flex flex-col min-h-[96px] transition relative cursor-pointer group",
                        cell.inCurrentMonth
                          ? "bg-white dark:bg-[#181818]"
                          : "bg-[#fafafa]/80 dark:bg-[#141414]/90",
                        isToday &&
                          "bg-brand-soft/20 dark:bg-brand-soft-dark/15 ring-1 ring-inset ring-brand",
                        isSelected &&
                          !isToday &&
                          "bg-slate-50 dark:bg-[#1f1f1f]"
                      )}
                    >
                      {/* Cell Header: Day Number + Total badge */}
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={cn(
                            "h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold transition",
                            isToday
                              ? "bg-brand text-white shadow-xs"
                              : cell.inCurrentMonth
                              ? "text-slate-800 dark:text-slate-200 group-hover:text-brand"
                              : "text-slate-400 dark:text-slate-600"
                          )}
                        >
                          {cell.dayNumber}
                        </span>

                        {totalCount > 0 && (
                          <span
                            className={cn(
                              "text-[10px] font-bold px-1 rounded-full",
                              isToday
                                ? "bg-brand text-white"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                            )}
                          >
                            {totalCount}
                          </span>
                        )}
                      </div>

                      {/* Cell Items (Max 3 items shown, +X overflow) */}
                      <div className="space-y-1 flex-1 overflow-hidden">
                        {dayTasks.slice(0, 3).map((t) => {
                          const isDone =
                            t.status?.category === "done" ||
                            Boolean(t.completed_at);
                          const isTaskUrgent =
                            t.priority === "urgent" || t.priority === "high";

                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveDrawerTask({
                                  taskId: t.id,
                                  projectId: t.project_id,
                                });
                              }}
                              className={cn(
                                "w-full text-left truncate rounded-[4px] px-1.5 py-0.5 text-[11px] block transition cursor-pointer border",
                                isDone
                                  ? "bg-slate-100 text-slate-400 line-through dark:bg-slate-800/60 border-slate-200 dark:border-slate-800"
                                  : "bg-white dark:bg-[#202020] text-slate-800 dark:text-slate-200 hover:border-brand shadow-2xs border-[#e2e2e2] dark:border-[#333]"
                              )}
                              title={`[${t.project?.code || "TASK"}] ${t.title}`}
                            >
                              <span className="inline-flex items-center gap-1 max-w-full">
                                <span
                                  className="h-1.5 w-1.5 rounded-full shrink-0"
                                  style={{
                                    backgroundColor:
                                      t.project?.color || "#F47830",
                                  }}
                                />
                                {isTaskUrgent && (
                                  <Flag className="h-2.5 w-2.5 text-red-500 shrink-0 fill-red-500" />
                                )}
                                <span className="truncate">{t.title}</span>
                              </span>
                            </button>
                          );
                        })}

                        {dayTodos.slice(0, Math.max(0, 3 - dayTasks.length)).map((td) => (
                          <div
                            key={td.id}
                            className={cn(
                              "w-full truncate rounded-[4px] border border-dashed px-1.5 py-0.5 text-[10.5px] block transition text-left",
                              td.is_done
                                ? "border-slate-200 bg-slate-50 text-slate-400 line-through dark:border-slate-800 dark:bg-slate-900"
                                : "border-purple-300 bg-purple-50/70 text-purple-800 dark:border-purple-800/70 dark:bg-purple-950/40 dark:text-purple-200"
                            )}
                            title={`[Todo cá nhân] ${td.title}`}
                          >
                            <span className="truncate">• {td.title}</span>
                          </div>
                        ))}

                        {/* Overflow trigger */}
                        {totalCount > 3 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOverflowDate(cell.dateKey);
                            }}
                            className="w-full text-center text-[10px] font-bold text-brand hover:underline pt-0.5 cursor-pointer"
                          >
                            +{totalCount - 3} việc nữa
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ==================================================================
           * VIEW 2: WEEK GRID (LƯỚI TUẦN 7 CỘT THÔNG MINH)
           * ================================================================== */}
          {viewMode === "week" && (
            <div className="h-full flex flex-col rounded-[8px] border border-[#e8e8e8] dark:border-[#2b2b2b] bg-white dark:bg-[#181818] overflow-hidden shadow-2xs">
              {/* Week Columns Container */}
              <div className="grid grid-cols-7 flex-1 divide-x divide-[#e8e8e8] dark:divide-[#2b2b2b] overflow-hidden">
                {weekColumns.map((col) => {
                  const dayTasks = tasksByDate.get(col.dateKey) ?? [];
                  const dayTodos = todosByDate.get(col.dateKey) ?? [];
                  const total = dayTasks.length + dayTodos.length;

                  return (
                    <div
                      key={col.dateKey}
                      className={cn(
                        "flex flex-col h-full overflow-hidden",
                        col.isToday
                          ? "bg-brand-soft/10 dark:bg-brand-soft-dark/10"
                          : "bg-white dark:bg-[#181818]"
                      )}
                    >
                      {/* Column Header */}
                      <div
                        className={cn(
                          "p-2.5 border-b text-center shrink-0 transition",
                          col.isToday
                            ? "border-brand bg-brand-soft/30 dark:bg-brand-soft-dark/20 text-brand"
                            : "border-[#e8e8e8] dark:border-[#2b2b2b] bg-[#fafafa] dark:bg-[#1c1c1c] text-slate-700 dark:text-slate-300"
                        )}
                      >
                        <div className="text-xs font-bold">{col.dayName}</div>
                        <div className="flex items-center justify-center gap-1.5 mt-0.5">
                          <span
                            className={cn(
                              "h-6 w-6 rounded-full text-xs font-bold flex items-center justify-center",
                              col.isToday
                                ? "bg-brand text-white shadow-xs"
                                : "text-slate-900 dark:text-slate-100"
                            )}
                          >
                            {col.dayNumber}
                          </span>
                          {total > 0 && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                              {total}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Column Task Cards */}
                      <div className="flex-1 overflow-y-auto p-2 space-y-2">
                        {total === 0 ? (
                          <div className="h-28 flex flex-col items-center justify-center text-slate-300 dark:text-slate-600 text-center text-xs">
                            <CheckSquare className="h-5 w-5 mb-1 opacity-50" />
                            <span>Trống</span>
                          </div>
                        ) : (
                          <>
                            {/* Task Cards */}
                            {dayTasks.map((t) => {
                              const isDone =
                                t.status?.category === "done" ||
                                Boolean(t.completed_at);
                              const pCfg = PRIORITY_CONFIG[t.priority];

                              return (
                                <div
                                  key={t.id}
                                  onClick={() =>
                                    setActiveDrawerTask({
                                      taskId: t.id,
                                      projectId: t.project_id,
                                    })
                                  }
                                  className={cn(
                                    "p-2 rounded-[6px] border transition shadow-2xs hover:shadow-xs cursor-pointer group text-left",
                                    isDone
                                      ? "bg-slate-50 dark:bg-[#1a1a1a] border-slate-200 dark:border-slate-800 opacity-70"
                                      : "bg-white dark:bg-[#202020] border-[#e2e2e2] dark:border-[#333] hover:border-brand"
                                  )}
                                >
                                  {/* Project Code & Priority */}
                                  <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-1 min-w-0">
                                      <span
                                        className="h-2 w-2 rounded-full shrink-0"
                                        style={{
                                          backgroundColor:
                                            t.project?.color || "#F47830",
                                        }}
                                      />
                                      <span className="text-[10px] font-bold text-slate-500 truncate">
                                        {t.project?.code}
                                      </span>
                                    </div>
                                    <span
                                      className={cn(
                                        "text-[9px] font-semibold px-1 py-0.2 rounded",
                                        pCfg.bg,
                                        pCfg.color
                                      )}
                                    >
                                      {pCfg.label}
                                    </span>
                                  </div>

                                  {/* Task Title */}
                                  <h4
                                    className={cn(
                                      "text-xs font-medium text-slate-900 dark:text-slate-100 line-clamp-2 mb-1.5 leading-snug",
                                      isDone && "line-through text-slate-400"
                                    )}
                                  >
                                    {t.title}
                                  </h4>

                                  {/* Footer: Checkbox + Assignees */}
                                  <div className="flex items-center justify-between pt-1 border-t border-[#f0f0f0] dark:border-[#2a2a2a] text-[10px]">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleTaskDone(t);
                                      }}
                                      className="flex items-center gap-1 text-slate-500 hover:text-brand cursor-pointer"
                                    >
                                      {isDone ? (
                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                      ) : (
                                        <Circle className="h-3.5 w-3.5" />
                                      )}
                                      <span>
                                        {isDone ? "Đã xong" : "Hoàn thành"}
                                      </span>
                                    </button>

                                    {/* Assignees avatars */}
                                    <div className="flex -space-x-1.5 overflow-hidden">
                                      {(t.assignees ?? [])
                                        .slice(0, 2)
                                        .map((u) => (
                                          <div
                                            key={u.id}
                                            title={u.full_name}
                                            className="h-4.5 w-4.5 rounded-full bg-slate-200 dark:bg-slate-700 ring-1 ring-white dark:ring-[#202020] flex items-center justify-center text-[8px] font-bold text-slate-700 dark:text-slate-200"
                                          >
                                            {getInitials(u.full_name)}
                                          </div>
                                        ))}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}

                            {/* Personal Todo Cards */}
                            {dayTodos.map((td) => (
                              <div
                                key={td.id}
                                className={cn(
                                  "p-2 rounded-[6px] border border-dashed transition text-left text-xs",
                                  td.is_done
                                    ? "border-slate-200 bg-slate-50 text-slate-400 line-through dark:border-slate-800 dark:bg-slate-900"
                                    : "border-purple-300 bg-purple-50/70 text-purple-900 dark:border-purple-800/70 dark:bg-purple-950/40 dark:text-purple-200"
                                )}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400">
                                    TODO CÁ NHÂN
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleTodoDone(td)}
                                    className="cursor-pointer text-purple-600 hover:text-purple-800"
                                  >
                                    {td.is_done ? (
                                      <CheckSquare className="h-3.5 w-3.5" />
                                    ) : (
                                      <Square className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                </div>
                                <div className="font-medium text-[11.5px] truncate">
                                  {td.title}
                                </div>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ==================================================================
           * VIEW 3: DAY VIEW (AGENDA & FOCUS EXECUTION)
           * ================================================================== */}
          {viewMode === "day" && (
            <div className="max-w-4xl mx-auto space-y-5">
              {/* Day Header Summary Banner */}
              <div className="rounded-[10px] border border-brand/30 bg-gradient-to-r from-orange-50/90 to-amber-50/50 dark:from-brand-soft-dark/20 dark:to-transparent p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-brand text-white text-[11px] font-bold">
                      TIÊU ĐIỂM NGÀY
                    </span>
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      {titleDisplay}
                    </h2>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    Tập trung hoàn thành các đầu việc quá hạn và deadline trong ngày hôm nay.
                  </p>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-center">
                    <div className="text-base font-bold text-slate-800 dark:text-slate-100">
                      {dayViewData.todayTasks.length + dayViewData.todayTodos.length}
                    </div>
                    <div className="text-[10px] text-slate-500">Trong ngày</div>
                  </div>
                  <div className="h-6 w-px bg-slate-300 dark:bg-slate-700" />
                  <div className="text-center">
                    <div className="text-base font-bold text-red-600">
                      {dayViewData.overdueTasks.length}
                    </div>
                    <div className="text-[10px] text-red-600 font-medium">
                      Quá hạn
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION A: OVERDUE (CẦN XỬ LÝ GẤP) */}
              {dayViewData.overdueTasks.length > 0 && (
                <div className="rounded-[8px] border border-red-200 dark:border-red-900/60 bg-red-50/30 dark:bg-red-950/20 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-red-600" />
                      <h3 className="text-sm font-bold text-red-700 dark:text-red-400">
                        Quá hạn & Cần xử lý gấp ({dayViewData.overdueTasks.length})
                      </h3>
                    </div>
                    <span className="text-[11px] text-red-600 font-semibold">
                      Chưa hoàn thành
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {dayViewData.overdueTasks.map((t) => (
                      <div
                        key={t.id}
                        onClick={() =>
                          setActiveDrawerTask({
                            taskId: t.id,
                            projectId: t.project_id,
                          })
                        }
                        className="flex items-center justify-between p-2.5 rounded-[6px] border border-red-200 dark:border-red-900/80 bg-white dark:bg-[#1c1c1c] hover:border-red-400 cursor-pointer shadow-2xs transition"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleTaskDone(t);
                            }}
                            className="text-slate-400 hover:text-emerald-600 cursor-pointer shrink-0"
                          >
                            <Circle className="h-4 w-4" />
                          </button>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                {t.project?.code}
                              </span>
                              <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                                {t.title}
                              </h4>
                            </div>
                            <div className="text-[10px] text-red-600 flex items-center gap-1 mt-0.5 font-medium">
                              <Clock className="h-3 w-3" />
                              <span>Hạn chót: {formatDateVi(t.due_date)}</span>
                            </div>
                          </div>
                        </div>

                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 shrink-0">
                          Trễ hạn
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SECTION B: DUE TODAY (HẠN TRONG NGÀY) */}
              <div className="rounded-[8px] border border-[#e8e8e8] dark:border-[#2e2e2e] bg-white dark:bg-[#181818] p-3.5 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between border-b border-[#f0f0f0] dark:border-[#262626] pb-2">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="h-4 w-4 text-brand" />
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      Công việc & Todo trong ngày (
                      {dayViewData.todayTasks.length + dayViewData.todayTodos.length}
                      )
                    </h3>
                  </div>
                </div>

                {dayViewData.todayTasks.length === 0 &&
                dayViewData.todayTodos.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs">
                    Không có công việc nào có hạn chót trong ngày này.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Tasks */}
                    {dayViewData.todayTasks.map((t) => {
                      const isDone =
                        t.status?.category === "done" ||
                        Boolean(t.completed_at);
                      const pCfg = PRIORITY_CONFIG[t.priority];

                      return (
                        <div
                          key={t.id}
                          onClick={() =>
                            setActiveDrawerTask({
                              taskId: t.id,
                              projectId: t.project_id,
                            })
                          }
                          className={cn(
                            "flex items-center justify-between p-2.5 rounded-[6px] border transition cursor-pointer shadow-2xs",
                            isDone
                              ? "bg-slate-50 dark:bg-[#1a1a1a] border-slate-200 dark:border-slate-800"
                              : "bg-white dark:bg-[#202020] border-[#e2e2e2] dark:border-[#333] hover:border-brand"
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleTaskDone(t);
                              }}
                              className="cursor-pointer shrink-0"
                            >
                              {isDone ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                              ) : (
                                <Circle className="h-4 w-4 text-slate-400 hover:text-emerald-600" />
                              )}
                            </button>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="h-2 w-2 rounded-full shrink-0"
                                  style={{
                                    backgroundColor:
                                      t.project?.color || "#F47830",
                                  }}
                                />
                                <span className="text-[10px] font-bold text-slate-500">
                                  [{t.project?.code}]
                                </span>
                                <h4
                                  className={cn(
                                    "text-xs font-semibold text-slate-800 dark:text-slate-200 truncate",
                                    isDone && "line-through text-slate-400"
                                  )}
                                >
                                  {t.title}
                                </h4>
                              </div>
                              <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                                <span
                                  className={cn(
                                    "px-1 rounded font-medium",
                                    pCfg.bg,
                                    pCfg.color
                                  )}
                                >
                                  {pCfg.label}
                                </span>
                                <span>•</span>
                                <span>{t.project?.name}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {isDone ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                                Đã hoàn thành
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                                Hôm nay
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Personal Todos */}
                    {dayViewData.todayTodos.map((td) => (
                      <div
                        key={td.id}
                        className={cn(
                          "flex items-center justify-between p-2.5 rounded-[6px] border border-dashed transition",
                          td.is_done
                            ? "border-slate-200 bg-slate-50 text-slate-400 line-through dark:border-slate-800 dark:bg-slate-900"
                            : "border-purple-300 bg-purple-50/70 text-purple-900 dark:border-purple-800/70 dark:bg-purple-950/40 dark:text-purple-200"
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <button
                            type="button"
                            onClick={() => handleToggleTodoDone(td)}
                            className="cursor-pointer text-purple-600 hover:text-purple-800 shrink-0"
                          >
                            {td.is_done ? (
                              <CheckSquare className="h-4 w-4" />
                            ) : (
                              <Square className="h-4 w-4" />
                            )}
                          </button>
                          <span className="text-xs font-medium truncate">
                            {td.title}
                          </span>
                        </div>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                          Todo Cá Nhân
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SECTION C: UPCOMING (KẾ HOẠCH SẮP TỚI) */}
              {dayViewData.upcomingTasks.length > 0 && (
                <div className="rounded-[8px] border border-[#e8e8e8] dark:border-[#2e2e2e] bg-[#fafafa] dark:bg-[#181818] p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Kế hoạch 3 ngày tới ({dayViewData.upcomingTasks.length})
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {dayViewData.upcomingTasks.map((t) => (
                      <div
                        key={t.id}
                        onClick={() =>
                          setActiveDrawerTask({
                            taskId: t.id,
                            projectId: t.project_id,
                          })
                        }
                        className="flex items-center justify-between p-2 rounded-[6px] border border-[#ebebeb] dark:border-[#2a2a2a] bg-white dark:bg-[#1f1f1f] hover:border-brand cursor-pointer text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{
                              backgroundColor: t.project?.color || "#F47830",
                            }}
                          />
                          <span className="font-semibold text-slate-500">
                            [{t.project?.code}]
                          </span>
                          <span className="truncate text-slate-800 dark:text-slate-200">
                            {t.title}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 shrink-0">
                          Hạn: {formatDateVi(t.due_date)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* ====================================================================
       * 3. DAY OVERFLOW MODAL (WHEN CLICKING "+X VIỆC NỮA" IN MONTH CELL)
       * ==================================================================== */}
      {overflowDate && (() => {
        const dTasks = tasksByDate.get(overflowDate) ?? [];
        const dTodos = todosByDate.get(overflowDate) ?? [];
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-2xs animate-in fade-in duration-150">
            <div className="w-full max-w-lg rounded-[10px] border border-[#e8e8e8] dark:border-[#333] bg-white dark:bg-[#1c1c1c] shadow-xl overflow-hidden flex flex-col max-h-[80vh]">
              <div className="p-3.5 border-b border-[#e8e8e8] dark:border-[#2e2e2e] flex items-center justify-between bg-[#fafafa] dark:bg-[#202020]">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-brand" />
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    Chi tiết công việc ngày {formatDateVi(overflowDate)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setOverflowDate(null)}
                  className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto space-y-2 flex-1">
                {dTasks.map((t) => {
                  const isDone =
                    t.status?.category === "done" || Boolean(t.completed_at);
                  return (
                    <div
                      key={t.id}
                      onClick={() => {
                        setOverflowDate(null);
                        setActiveDrawerTask({
                          taskId: t.id,
                          projectId: t.project_id,
                        });
                      }}
                      className={cn(
                        "p-2.5 rounded-[6px] border flex items-center justify-between cursor-pointer transition",
                        isDone
                          ? "bg-slate-50 dark:bg-[#181818] border-slate-200 dark:border-slate-800 text-slate-400 line-through"
                          : "bg-white dark:bg-[#222] border-[#e2e2e2] dark:border-[#333] hover:border-brand"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{
                            backgroundColor: t.project?.color || "#F47830",
                          }}
                        />
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">
                          [{t.project?.code}] {t.title}
                        </span>
                      </div>
                      <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    </div>
                  );
                })}

                {dTodos.map((td) => (
                  <div
                    key={td.id}
                    className="p-2 rounded-[6px] border border-dashed border-purple-300 bg-purple-50/60 dark:bg-purple-950/30 text-purple-800 dark:text-purple-300 text-xs flex items-center justify-between"
                  >
                    <span>• {td.title}</span>
                    <span className="text-[10px] font-bold">Todo Cá Nhân</span>
                  </div>
                ))}
              </div>

              <div className="p-3 border-t border-[#e8e8e8] dark:border-[#2e2e2e] bg-[#fafafa] dark:bg-[#202020] flex justify-end">
                <button
                  type="button"
                  onClick={() => setOverflowDate(null)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-[6px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ====================================================================
       * 4. IN-PLACE TASK DRAWER (SEAMLESS CLICK-TO-VIEW ON SAME SCREEN)
       * ==================================================================== */}
      {activeDrawerTask && (() => {
        const currentTask =
          tasks.find((t) => t.id === activeDrawerTask.taskId) ?? null;
        return (
          <TaskDrawer
            taskId={activeDrawerTask.taskId}
            projectId={activeDrawerTask.projectId}
            initialTask={currentTask}
            statuses={drawerProjectStatuses}
            members={allProfiles}
            allProfiles={allProfiles}
            currentUser={profile}
            onClose={() => setActiveDrawerTask(null)}
            onUpdated={() => {
              // refresh calendar tasks
            }}
            onDeleted={(deletedTaskId: string) => {
              setTasks((prev) => prev.filter((t) => t.id !== deletedTaskId));
              setActiveDrawerTask(null);
            }}
          />
        );
      })()}
    </div>
  );
}
