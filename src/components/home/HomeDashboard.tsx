"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  cn,
  formatDateVi,
  getInitials,
  isOverdue,
  PRIORITY_CONFIG,
  getTaskKey,
} from "@/lib/utils";

import TaskDrawer from "@/components/tasks/TaskDrawer";
import {
  getTodoCategoryConfig,
  PersonalTodoManager,
  TODO_CATEGORIES,
} from "@/components/home/PersonalTodoManager";
import type {
  PersonalTodo,
  PersonalTodoCategory,
  Profile,
  Task,
  TaskPriority,
  TaskStatus,
} from "@/types/database";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Calendar as CalendarIcon,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  ExternalLink,
  FolderKanban,
  ListTodo,
  Plus,
  Search,
  Send,
  Trash2,
  UserCheck,
  X,
  ListFilter,
  UserX,
  CalendarOff,
  CheckSquare,
  TrendingUp,
  BookOpen,
  Crown,
  Zap,
  Sparkles,
  Users2,
  FileCheck2,
} from "lucide-react";

import { toast } from "sonner";
import { isDirectorOrAdmin, isTeamLeadOrManager } from "@/lib/permissions";

export interface ExecutiveProjectSummary {
  id: string;
  name: string;
  code: string;
  color: string;
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  completionRate: number;
}

export interface ExecutiveStats {
  totalProjects: number;
  activeProjects: number;
  totalCompanyTasks: number;
  completedCompanyTasks: number;
  overdueCompanyTasks: number;
  urgentTasks: Task[];
  projectsSummary: ExecutiveProjectSummary[];
}

export interface HomeDashboardProps {
  profile: Profile;
  initialTasks: Task[];
  explicitlyDelegatedTaskIds?: string[];
  initialTodos: PersonalTodo[];
  projects?: Array<{ id: string; name: string; code: string; color: string }>;
  allProfiles?: Profile[];
  allStatuses?: TaskStatus[];
  executiveStats?: ExecutiveStats;
}

export type HomeViewMode =
  | "overview"
  | "my-tasks"
  | "delegated"
  | "calendar"
  | "todo";

type SubFacetView =
  | "all"
  | "assigned_to_me"
  | "assigned_by_me"
  | "overdue"
  | "unassigned"
  | "no_due_date";

type TaskFilter = "all" | "open" | "overdue" | "today" | "completed";
type GroupByMode = "none" | "project" | "status" | "priority";


const WEEKDAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Chào buổi sáng";
  if (hour < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

function getTodayDateVi(): string {
  const now = new Date();
  const formatted = now.toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function toDateKey(year: number, monthIndex: number, day: number): string {
  const m = String(monthIndex + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

function extractDateKey(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

export function HomeDashboard({
  profile,
  initialTasks,
  explicitlyDelegatedTaskIds = [],
  initialTodos,
  projects = [],
  allProfiles = [],
  allStatuses = [],
  executiveStats,
}: HomeDashboardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const isExecutiveUser = isDirectorOrAdmin(profile);
  const isLeadUser = isTeamLeadOrManager(profile);
  const [executiveMode, setExecutiveMode] = useState<boolean>(
    Boolean(isExecutiveUser && executiveStats)
  );
  const [delegatedSubTab, setDelegatedSubTab] = useState<
    "list" | "workload" | "review"
  >("list");

  // Sync active mode from Left NavRail (?view=overview | my-tasks | delegated | calendar | todo)
  const [activeView, setActiveView] = useState<HomeViewMode>("overview");

  useEffect(() => {
    const viewParam = searchParams.get("view") as HomeViewMode | null;
    if (
      viewParam &&
      ["overview", "my-tasks", "delegated", "calendar", "todo"].includes(
        viewParam
      )
    ) {
      setActiveView(viewParam);
    } else {
      try {
        const pins = JSON.parse(
          localStorage.getItem("alpha_rail_pins") || "{}"
        );
        if (
          pins.home &&
          ["overview", "my-tasks", "delegated", "calendar", "todo"].includes(
            pins.home
          )
        ) {
          setActiveView(pins.home);
        } else {
          setActiveView("overview");
        }
      } catch {
        setActiveView("overview");
      }
    }
  }, [searchParams]);

  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  // Sub-sidebar facet for My Tasks (Worklenz SubSidebar VIEWS)
  const [subFacet, setSubFacet] = useState<SubFacetView>("all");
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [groupBy, setGroupBy] = useState<GroupByMode>("none");
  const [collapsedGroups, setCollapsedGroups] = useState<
    Record<string, boolean>
  >({});


  // In-place TaskDrawer state (so clicking any task opens the Drawer immediately on Home without navigating away!)
  const [activeDrawerTask, setActiveDrawerTask] = useState<{
    taskId: string;
    projectId: string | null;
  } | null>(null);

  // Calendar state
  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(
    () => toDateKey(today.getFullYear(), today.getMonth(), today.getDate()),
    [today]
  );
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  // Personal todos state
  const [todos, setTodos] = useState<PersonalTodo[]>(initialTodos);

  // Real-time synchronization when tasks or todos are created from Global QuickActionButton
  useEffect(() => {
    function handleTodoEvent(e: Event) {
      const detail = (e as CustomEvent).detail as PersonalTodo;
      if (detail && detail.id) {
        setTodos((prev) => {
          if (prev.some((t) => t.id === detail.id)) return prev;
          return [detail, ...prev];
        });
      }
    }

    function handleTaskEvent(e: Event) {
      const detail = (e as CustomEvent).detail as Task;
      if (detail && detail.id) {
        setTasks((prev) => {
          if (prev.some((t) => t.id === detail.id)) return prev;
          return [detail, ...prev];
        });
      }
    }

    window.addEventListener("alpha:todo_created", handleTodoEvent);
    window.addEventListener("alpha:task_created", handleTaskEvent);

    return () => {
      window.removeEventListener("alpha:todo_created", handleTodoEvent);
      window.removeEventListener("alpha:task_created", handleTaskEvent);
    };
  }, []);

  // Split tasks into "Assigned to me" vs "Delegated by me" vs All relevant
  const { assignedToMeTasks, assignedByMeTasks, overdueTasksCount, unassignedTasksCount, noDueDateTasksCount } = useMemo(() => {
    const toMe: Task[] = [];
    const byMe: Task[] = [];
    let overdueCount = 0;
    let unassignedCount = 0;
    let noDueDateCount = 0;
    const delegatedSet = new Set(explicitlyDelegatedTaskIds);

    for (const t of tasks) {
      const assignees = t.assignees ?? [];
      const isAssignedToMe = assignees.some((a) => a.id === profile.id);
      const hasOtherAssignees = assignees.some((a) => a.id !== profile.id);
      const isCreatedByMeForOthers =
        t.created_by === profile.id && hasOtherAssignees;
      const isDelegatedByMe = delegatedSet.has(t.id) && hasOtherAssignees;

      if (isAssignedToMe) toMe.push(t);
      if (isDelegatedByMe || isCreatedByMeForOthers) byMe.push(t);

      const isDone = t.status?.category === "done" || Boolean(t.completed_at);
      if (!isDone && isOverdue(t.due_date, t.completed_at)) {
        overdueCount += 1;
      }
      if (assignees.length === 0) {
        unassignedCount += 1;
      }
      if (!t.due_date) {
        noDueDateCount += 1;
      }
    }

    return {
      assignedToMeTasks: toMe,
      assignedByMeTasks: byMe,
      overdueTasksCount: overdueCount,
      unassignedTasksCount: unassignedCount,
      noDueDateTasksCount: noDueDateCount,
    };
  }, [tasks, profile.id, explicitlyDelegatedTaskIds]);

  // Cân bằng tải nhân sự phòng ban (Team Workload Balancing)
  const workloadByAssignee = useMemo(() => {
    const map = new Map<
      string,
      {
        profile: Profile;
        total: number;
        open: number;
        overdue: number;
        completed: number;
        tasks: Task[];
      }
    >();

    for (const t of assignedByMeTasks) {
      const isDone = t.status?.category === "done" || Boolean(t.completed_at);
      const isTaskOverdue = !isDone && isOverdue(t.due_date, t.completed_at);
      const assignees = t.assignees || [];

      for (const a of assignees) {
        const entry = map.get(a.id) ?? {
          profile: a,
          total: 0,
          open: 0,
          overdue: 0,
          completed: 0,
          tasks: [],
        };
        entry.total += 1;
        if (isDone) {
          entry.completed += 1;
        } else {
          entry.open += 1;
          if (isTaskOverdue) entry.overdue += 1;
        }
        entry.tasks.push(t);
        map.set(a.id, entry);
      }
    }

    return Array.from(map.values()).sort((a, b) => b.open - a.open);
  }, [assignedByMeTasks]);

  // Hàng chờ công việc cần nghiệm thu (Sign-off Queue)
  const reviewQueueTasks = useMemo(() => {
    return assignedByMeTasks.filter(
      (t) =>
        t.review_status === "pending_review" ||
        (Boolean(t.completed_at) && t.review_status !== "approved")
    );
  }, [assignedByMeTasks]);

  const activeScopeTasks = useMemo(() => {
    if (activeView === "delegated") return assignedByMeTasks;
    if (activeView === "my-tasks") {
      switch (subFacet) {
        case "assigned_to_me":
          return assignedToMeTasks;
        case "assigned_by_me":
          return assignedByMeTasks;
        case "overdue":
          return tasks.filter(
            (t) =>
              !(t.status?.category === "done" || Boolean(t.completed_at)) &&
              isOverdue(t.due_date, t.completed_at)
          );
        case "unassigned":
          return tasks.filter((t) => (t.assignees ?? []).length === 0);
        case "no_due_date":
          return tasks.filter((t) => !t.due_date);
        case "all":
        default:
          return tasks;
      }
    }
    return assignedToMeTasks;
  }, [activeView, subFacet, tasks, assignedToMeTasks, assignedByMeTasks]);


  // KPI calculations
  const stats = useMemo(() => {
    let inProgress = 0;
    let overdue = 0;
    let dueToday = 0;
    let completed = 0;

    for (const t of activeScopeTasks) {
      const isDone = t.status?.category === "done" || Boolean(t.completed_at);
      const taskDateKey = extractDateKey(t.due_date);

      if (!isDone) {
        inProgress += 1;
        if (isOverdue(t.due_date, t.completed_at)) {
          overdue += 1;
        }
        if (taskDateKey === todayKey) {
          dueToday += 1;
        }
      } else {
        completed += 1;
      }
    }

    return {
      inProgress,
      overdue,
      dueToday,
      completed,
      total: activeScopeTasks.length,
    };
  }, [activeScopeTasks, todayKey]);

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    return activeScopeTasks.filter((t) => {
      const isDone = t.status?.category === "done" || Boolean(t.completed_at);
      const taskDateKey = extractDateKey(t.due_date);

      if (taskFilter === "open" && isDone) return false;
      if (
        taskFilter === "overdue" &&
        (isDone || !isOverdue(t.due_date, t.completed_at))
      )
        return false;
      if (taskFilter === "today" && (isDone || taskDateKey !== todayKey))
        return false;
      if (taskFilter === "completed" && !isDone) return false;

      if (projectFilter !== "all" && t.project_id !== projectFilter)
        return false;
      if (priorityFilter !== "all" && t.priority !== priorityFilter)
        return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = t.title.toLowerCase().includes(q);
        const matchProject = t.project?.name.toLowerCase().includes(q) ?? false;
        const matchAssignee = (t.assignees ?? []).some((a) =>
          a.full_name.toLowerCase().includes(q)
        );
        if (!matchTitle && !matchProject && !matchAssignee) return false;
      }

      return true;
    });
  }, [
    activeScopeTasks,
    taskFilter,
    projectFilter,
    priorityFilter,
    searchQuery,
    todayKey,
  ]);

  // Grouped tasks for high-density Worklenz table
  const groupedTasks = useMemo(() => {
    if (groupBy === "none") {
      return [
        {
          key: "all",
          label: "Danh sách công việc",
          color: "#F47830",
          items: filteredTasks,
        },
      ];
    }

    const map = new Map<
      string,
      { key: string; label: string; color: string; items: Task[] }
    >();

    for (const t of filteredTasks) {
      let key = "other";
      let label = "Khác";
      let color = "#94A3B8";

      if (groupBy === "project") {
        key = t.project_id || "no_project";
        label = t.project
          ? `[${t.project.code}] ${t.project.name}`
          : "Dự án chung";
        color = t.project?.color || "#F47830";
      } else if (groupBy === "status") {
        key = t.status?.name || "Cần làm";
        label = t.status?.name || "Cần làm";
        color = t.status?.color || "#64748B";
      } else if (groupBy === "priority") {
        key = t.priority;
        label = PRIORITY_CONFIG[t.priority]?.label || t.priority;
        color =
          t.priority === "urgent"
            ? "#EF4444"
            : t.priority === "high"
            ? "#F97316"
            : t.priority === "medium"
            ? "#3B82F6"
            : "#94A3B8";
      }

      const existing = map.get(key) ?? { key, label, color, items: [] };
      existing.items.push(t);
      map.set(key, existing);
    }

    return Array.from(map.values());
  }, [filteredTasks, groupBy]);

  // Inline Quick Status / Priority Toggle directly on Home Table Row
  async function handleInlineToggleDone(task: Task, e: React.MouseEvent) {
    e.stopPropagation();
    const projectStatuses = allStatuses.filter(
      (s) => (task.project_id ? s.project_id === task.project_id : !s.project_id)
    );
    const doneStatus = projectStatuses.find((s) => s.category === "done");
    const todoStatus =
      projectStatuses.find((s) => s.category === "todo") ?? projectStatuses[0];

    const currentlyDone =
      task.status?.category === "done" || Boolean(task.completed_at);
    const targetStatus = currentlyDone ? todoStatus : doneStatus;
    const completed_at = currentlyDone ? null : new Date().toISOString();

    const patch: Partial<Task> = {
      completed_at,
      ...(targetStatus ? { status_id: targetStatus.id } : {}),
    };

    setTasks((prev) =>
      prev.map((item) =>
        item.id === task.id
          ? {
              ...item,
              ...patch,
              status: targetStatus ?? item.status,
            }
          : item
      )
    );

    const { error } = await supabase
      .from("tasks")
      .update(patch)
      .eq("id", task.id);

    if (error) {
      toast.error("Không thể cập nhật trạng thái công việc.");
      router.refresh();
    } else {
      toast.success(
        currentlyDone ? "Đã mở lại công việc" : "Đã hoàn thành công việc!"
      );
    }
  }

  async function handleInlinePriorityChange(
    task: Task,
    newPriority: TaskPriority
  ) {
    setTasks((prev) =>
      prev.map((item) =>
        item.id === task.id ? { ...item, priority: newPriority } : item
      )
    );
    const { error } = await supabase
      .from("tasks")
      .update({ priority: newPriority })
      .eq("id", task.id);
    if (error) {
      toast.error("Không thể đổi độ ưu tiên.");
    }
  }

  // Tasks grouped by YYYY-MM-DD for Calendar view
  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      const key = extractDateKey(t.due_date);
      if (!key) continue;
      const existing = map.get(key) ?? [];
      existing.push(t);
      map.set(key, existing);
    }
    return map;
  }, [tasks]);

  // Personal Todos grouped by YYYY-MM-DD for Calendar view
  const todosByDate = useMemo(() => {
    const map = new Map<string, PersonalTodo[]>();
    for (const item of todos) {
      const key = extractDateKey(item.due_date);
      if (!key) continue;
      const existing = map.get(key) ?? [];
      existing.push(item);
      map.set(key, existing);
    }
    return map;
  }, [todos]);

  // Build calendar cells (Monday-first)
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(calYear, calMonth, 1);
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const startOffset = (firstDayOfMonth.getDay() + 6) % 7;

    const cells: Array<{
      dateKey: string;
      dayNumber: number;
      inCurrentMonth: boolean;
    }> = [];

    const prevMonthDays = new Date(calYear, calMonth, 0).getDate();
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const m = calMonth === 0 ? 11 : calMonth - 1;
      const y = calMonth === 0 ? calYear - 1 : calYear;
      cells.push({
        dateKey: toDateKey(y, m, d),
        dayNumber: d,
        inCurrentMonth: false,
      });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        dateKey: toDateKey(calYear, calMonth, d),
        dayNumber: d,
        inCurrentMonth: true,
      });
    }

    const remaining = 42 - cells.length;
    for (let d = 1; d <= remaining; d++) {
      const m = calMonth === 11 ? 0 : calMonth + 1;
      const y = calMonth === 11 ? calYear + 1 : calYear;
      cells.push({
        dateKey: toDateKey(y, m, d),
        dayNumber: d,
        inCurrentMonth: false,
      });
    }

    return cells;
  }, [calYear, calMonth]);

  function handlePrevMonth() {
    if (calMonth === 0) {
      setCalYear((y) => y - 1);
      setCalMonth(11);
    } else {
      setCalMonth((m) => m - 1);
    }
  }

  function handleNextMonth() {
    if (calMonth === 11) {
      setCalYear((y) => y + 1);
      setCalMonth(0);
    } else {
      setCalMonth((m) => m + 1);
    }
  }

  function handleGoToday() {
    setCalYear(today.getFullYear());
    setCalMonth(today.getMonth());
  }

  const completedTodosCount = todos.filter((t) => t.is_done).length;

  // Statuses for the currently opened task in TaskDrawer
  const drawerProjectStatuses = useMemo(() => {
    if (!activeDrawerTask) return [];
    if (!activeDrawerTask.projectId) {
      return allStatuses.filter((s) => !s.project_id);
    }
    const list = allStatuses.filter(
      (s) => s.project_id === activeDrawerTask.projectId
    );
    return list.length > 0 ? list : allStatuses.filter((s) => !s.project_id);
  }, [activeDrawerTask, allStatuses]);

  // Shared High-Density Worklenz Task Table Renderer
  function renderDenseTaskTable(showDelegatedAssignees = false) {
    return (
      <div className="rounded-[8px] border border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] overflow-hidden">
        {/* Compact 1-Line Filter Toolbar (50px height, matching legacy ImprovedTaskFilters) */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e8e8e8] dark:border-[#303030] bg-[#fafafa] dark:bg-[#181818] px-3.5 py-2">
          {/* Left: Quick Status Tabs */}
          <div className="flex flex-wrap items-center gap-1">
            {(
              [
                { key: "open", label: "Đang mở", count: stats.inProgress },
                { key: "overdue", label: "Quá hạn", count: stats.overdue },
                { key: "today", label: "Hôm nay", count: stats.dueToday },
                { key: "completed", label: "Hoàn thành", count: stats.completed },
                { key: "all", label: "Tất cả", count: stats.total },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setTaskFilter(tab.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-xs font-medium transition cursor-pointer",
                  taskFilter === tab.key
                    ? "bg-brand text-white font-semibold"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-[#2a2a2a]"
                )}
              >
                <span>{tab.label}</span>
                <span
                  className={cn(
                    "rounded px-1 text-[10px]",
                    taskFilter === tab.key
                      ? "bg-white/20 text-white"
                      : "bg-slate-200/80 dark:bg-[#2c2c2c] text-slate-600 dark:text-slate-400"
                  )}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Right: Group By + Project + Priority + Search */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 text-xs text-slate-500">
              <span>Nhóm:</span>
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as GroupByMode)}
                className="rounded-[6px] border border-[#d9d9d9] dark:border-[#3a3a3a] bg-white dark:bg-[#1f1f1f] px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 focus:border-brand focus:outline-none cursor-pointer"
              >
                <option value="project">Theo Dự án</option>
                <option value="status">Theo Trạng thái</option>
                <option value="priority">Theo Độ ưu tiên</option>
                <option value="none">Không nhóm</option>
              </select>
            </div>

            {projects.length > 0 && (
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="max-w-[160px] rounded-[6px] border border-[#d9d9d9] dark:border-[#3a3a3a] bg-white dark:bg-[#1f1f1f] px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 focus:border-brand focus:outline-none cursor-pointer"
              >
                <option value="all">Tất cả dự án</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.code}] {p.name}
                  </option>
                ))}
              </select>
            )}

            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="rounded-[6px] border border-[#d9d9d9] dark:border-[#3a3a3a] bg-white dark:bg-[#1f1f1f] px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 focus:border-brand focus:outline-none cursor-pointer"
            >
              <option value="all">Mọi ưu tiên</option>
              <option value="urgent">Khẩn cấp</option>
              <option value="high">Cao</option>
              <option value="medium">Trung bình</option>
              <option value="low">Thấp</option>
            </select>

            <div className="relative w-44 sm:w-52">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm tên việc..."
                className="w-full rounded-[6px] border border-[#d9d9d9] dark:border-[#3a3a3a] bg-white dark:bg-[#1f1f1f] pl-7 pr-6 py-1 text-xs text-slate-900 dark:text-slate-100 focus:border-brand focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Table Column Headers */}
        <div className="hidden md:grid md:grid-cols-12 items-center border-b border-[#e8e8e8] dark:border-[#303030] bg-[#fafafa] dark:bg-[#181818] px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <div className="col-span-1">ID</div>
          <div className="col-span-4">Công việc</div>
          <div className="col-span-2">Dự án</div>
          <div className="col-span-1 text-center">Người nhận</div>
          <div className="col-span-2">Trạng thái</div>
          <div className="col-span-1 text-center">Ưu tiên</div>
          <div className="col-span-1 text-right">Hạn xong</div>
        </div>


        {/* Table Rows Grouped */}
        {filteredTasks.length === 0 ? (
          <div className="py-14 px-6 text-center">
            <CheckCircle2 className="mx-auto h-7 w-7 text-slate-300 dark:text-slate-600" />
            <p className="mt-2 text-[13px] font-semibold text-slate-700 dark:text-slate-200">
              Không có công việc nào trong danh sách này.
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              Thử chuyển bộ lọc trạng thái hoặc tạo công việc mới từ nút{" "}
              <strong>+ Tạo mới</strong> trên thanh công cụ.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#f0f0f0] dark:divide-[#2a2a2a]">
            {groupedTasks.map((group) => {
              const isCollapsed = !!collapsedGroups[group.key];
              return (
                <div key={group.key}>
                  {groupBy !== "none" && (
                    <button
                      type="button"
                      onClick={() =>
                        setCollapsedGroups((prev) => ({
                          ...prev,
                          [group.key]: !prev[group.key],
                        }))
                      }
                      className="flex w-full items-center justify-between bg-[#fafafa]/80 dark:bg-[#191919] px-4 py-1.5 text-left hover:bg-slate-100/80 dark:hover:bg-[#222222] transition cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        {isCollapsed ? (
                          <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                        )}
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: group.color }}
                        />
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          {group.label}
                        </span>
                        <span className="rounded bg-slate-200/80 dark:bg-[#2c2c2c] px-1.5 py-0.2 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                          {group.items.length}
                        </span>
                      </div>
                    </button>
                  )}

                  {!isCollapsed && (
                    <div className="divide-y divide-[#f3f3f3] dark:divide-[#252525]">
                      {group.items.map((task) => {
                        const priorityCfg = PRIORITY_CONFIG[task.priority];
                        const isDone =
                          task.status?.category === "done" ||
                          Boolean(task.completed_at);
                        const overdue =
                          !isDone &&
                          isOverdue(task.due_date, task.completed_at);
                        const isSelectedInDrawer =
                          activeDrawerTask?.taskId === task.id;

                        return (
                          <div
                            key={task.id}
                            onClick={() =>
                              setActiveDrawerTask({
                                taskId: task.id,
                                projectId: task.project_id,
                              })
                            }
                            className={cn(
                              "group grid grid-cols-1 md:grid-cols-12 items-center gap-2 px-4 py-2 text-left transition cursor-pointer",
                              isSelectedInDrawer
                                ? "bg-brand-soft/60 dark:bg-brand-soft-dark/40"
                                : "hover:bg-[#f8f9fa] dark:hover:bg-[#242424]"
                            )}
                          >
                            {/* Col 0: Task ID Badge */}
                            <div className="md:col-span-1 flex items-center min-w-0">
                              <span className="font-mono text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate rounded bg-slate-100 dark:bg-[#282828] px-1.5 py-0.5">
                                {getTaskKey(task, task.project?.code)}
                              </span>
                            </div>

                            {/* Col 1: Checkbox + Title */}
                            <div className="md:col-span-4 flex items-center gap-2 min-w-0">
                              <button
                                type="button"
                                onClick={(e) => handleInlineToggleDone(task, e)}
                                title={
                                  isDone
                                    ? "Đánh dấu chưa xong"
                                    : "Đánh dấu hoàn thành"
                                }
                                className="shrink-0 text-slate-400 hover:text-emerald-600 transition cursor-pointer"
                              >
                                {isDone ? (
                                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                ) : (
                                  <Circle className="h-4 w-4" />
                                )}
                              </button>
                              <span
                                className={cn(
                                  "truncate text-[13px] font-medium",
                                  isDone
                                    ? "line-through text-slate-400 dark:text-slate-500"
                                    : "text-slate-900 dark:text-slate-100 group-hover:text-brand"
                                )}
                              >
                                {task.title}
                              </span>
                            </div>

                            {/* Col 2: Project Link */}
                            <div className="md:col-span-2 flex items-center min-w-0">
                              {task.project ? (
                                <Link
                                  href={`/projects/${task.project_id}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1.5 truncate rounded-[4px] bg-slate-100 dark:bg-[#2a2a2a] px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-brand"
                                >
                                  <span
                                    className="h-1.5 w-1.5 rounded-full shrink-0"
                                    style={{
                                      backgroundColor:
                                        task.project.color || "#F47830",
                                    }}
                                  />
                                  <span className="truncate">
                                    {task.project.name}
                                  </span>
                                </Link>
                              ) : (
                                <span className="text-xs text-slate-400">—</span>
                              )}
                            </div>

                            {/* Col 3: Assignees Avatar */}
                            <div className="md:col-span-1 flex items-center md:justify-center">
                              {(task.assignees ?? []).length > 0 ? (
                                <div className="flex -space-x-1">
                                  {task.assignees!.slice(0, 2).map((u) => (
                                    <span
                                      key={u.id}
                                      title={u.full_name}
                                      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-soft text-[9px] font-bold text-brand ring-1 ring-white dark:ring-[#1f1f1f]"
                                    >
                                      {getInitials(u.full_name)}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-[11px] text-slate-400">—</span>
                              )}
                            </div>

                            {/* Col 4: Status badge */}
                            <div className="md:col-span-2 flex items-center">
                              {task.status && (
                                <span className="inline-flex items-center gap-1.5 rounded-[4px] border border-[#e0e0e0] dark:border-[#383838] px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:text-slate-300">
                                  <span
                                    className="h-1.5 w-1.5 rounded-full shrink-0"
                                    style={{
                                      backgroundColor: task.status.color,
                                    }}
                                  />
                                  <span className="truncate">
                                    {task.status.name}
                                  </span>
                                </span>
                              )}
                            </div>

                            {/* Col 5: Inline Priority Selector */}
                            <div
                              className="md:col-span-1 flex items-center md:justify-center"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <select
                                value={task.priority}
                                onChange={(e) =>
                                  handleInlinePriorityChange(
                                    task,
                                    e.target.value as TaskPriority
                                  )
                                }
                                className={cn(
                                  "rounded-[4px] border px-1.5 py-0.5 text-[11px] font-medium focus:outline-none cursor-pointer",
                                  priorityCfg.bg,
                                  priorityCfg.color
                                )}
                              >
                                <option value="low">Thấp</option>
                                <option value="medium">TB</option>
                                <option value="high">Cao</option>
                                <option value="urgent">Khẩn</option>
                              </select>
                            </div>

                            {/* Col 6: Due Date */}
                            <div className="md:col-span-1 flex items-center justify-end">
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 font-mono text-[11.5px]",
                                  overdue
                                    ? "text-red-600 dark:text-red-400 font-semibold"
                                    : "text-slate-500 dark:text-slate-400"
                                )}
                              >
                                {task.due_date
                                  ? formatDateVi(task.due_date)
                                  : "—"}
                              </span>
                            </div>

                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Compact Greeting & Context Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-[#e8e8e8] dark:border-[#303030] pb-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {getGreeting()}, {profile.full_name}
          </h1>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {getTodayDateVi()}
            {profile.job_title ? ` • ${profile.job_title}` : ""}
          </span>
          {isExecutiveUser && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-950/60 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60">
              <Crown className="h-3 w-3" />
              Lãnh đạo BOD
            </span>
          )}
          {!isExecutiveUser && isLeadUser && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-950/60 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60">
              <Users2 className="h-3 w-3" />
              Trưởng phòng / Quản lý
            </span>
          )}
        </div>

        {/* View Switcher for BOD & Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {isExecutiveUser && executiveStats && activeView === "overview" && (
            <div className="inline-flex items-center rounded-lg border border-[#e0e0e0] dark:border-[#333333] bg-[#fafafa] dark:bg-[#1a1a1a] p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setExecutiveMode(true)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition cursor-pointer",
                  executiveMode
                    ? "bg-brand text-white shadow-xs font-semibold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                <Crown className="h-3.5 w-3.5" />
                <span>Chỉ huy xuất bản</span>
              </button>
              <button
                type="button"
                onClick={() => setExecutiveMode(false)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition cursor-pointer",
                  !executiveMode
                    ? "bg-brand text-white shadow-xs font-semibold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                <CheckSquare className="h-3.5 w-3.5" />
                <span>Việc cá nhân của tôi</span>
              </button>
            </div>
          )}

          <Link
            href="/projects"
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#d9d9d9] dark:border-[#3a3a3a] bg-white dark:bg-[#1f1f1f] hover:border-brand px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 transition"
          >
            <FolderKanban className="h-3.5 w-3.5 text-brand" />
            <span>Tất cả Dự án</span>
            <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
          </Link>
        </div>
      </div>

      {/* ====================================================================
       * MODE 1: OVERVIEW (Worklenz HomeOverviewView Widget Board)
       * ==================================================================== */}
      {activeView === "overview" && (
        <div className="space-y-4">
          {isExecutiveUser && executiveMode && executiveStats ? (
            /* ==========================================================
             * BAN GIÁM ĐỐC (BOD) — BÀN CHỈ HUY XUẤT BẢN TOÀN CÔNG TY
             * ========================================================== */
            <div className="space-y-4">
              {/* 4 Chỉ số Điều hành cấp cao */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-[8px] border border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Dự án & Đầu sách xuất bản
                    </p>
                    <span className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-brand-soft dark:bg-brand-soft-dark text-brand">
                      <BookOpen className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100">
                      {executiveStats.activeProjects}
                    </span>
                    <span className="text-xs text-slate-400">
                      / {executiveStats.totalProjects} tổng dự án
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                    Đang triển khai vận hành
                  </p>
                </div>

                <div className="rounded-[8px] border border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Tiến độ tổng thể công ty
                    </p>
                    <span className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                      <TrendingUp className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                      {executiveStats.totalCompanyTasks > 0
                        ? Math.round(
                            (executiveStats.completedCompanyTasks /
                              executiveStats.totalCompanyTasks) *
                              100
                          )
                        : 0}
                      %
                    </span>
                    <span className="text-xs text-slate-400">
                      ({executiveStats.completedCompanyTasks}/{executiveStats.totalCompanyTasks} việc)
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-[#2a2a2a]">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                      style={{
                        width: `${
                          executiveStats.totalCompanyTasks > 0
                            ? Math.round(
                                (executiveStats.completedCompanyTasks /
                                  executiveStats.totalCompanyTasks) *
                                  100
                              )
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>

                <div className="rounded-[8px] border border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Công việc Quá hạn
                    </p>
                    <span className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400">
                      <AlertTriangle className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span
                      className={cn(
                        "font-mono text-2xl font-bold",
                        executiveStats.overdueCompanyTasks > 0
                          ? "text-red-600 dark:text-red-400"
                          : "text-slate-900 dark:text-slate-100"
                      )}
                    >
                      {executiveStats.overdueCompanyTasks}
                    </span>
                    <span className="text-xs text-slate-400">cần đốc thúc</span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Toàn bộ các phòng ban nội bộ
                  </p>
                </div>

                <div className="rounded-[8px] border border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Nhiệm vụ Khẩn cấp / Critical
                    </p>
                    <span className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                      <Zap className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="font-mono text-2xl font-bold text-amber-600 dark:text-amber-400">
                      {executiveStats.urgentTasks.length}
                    </span>
                    <span className="text-xs text-slate-400">ưu tiên cao nhất</span>
                  </div>
                  <Link
                    href="/reports"
                    className="mt-1 inline-flex items-center gap-1 text-[11px] text-brand hover:underline font-medium"
                  >
                    Mở Báo cáo Toàn diện <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>

              {/* 2 Khối Lớn: Danh mục Sách Trọng điểm & Điểm nóng Nhiệm vụ */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
                {/* Bảng Danh mục Sách & Dự án Trọng điểm (2 Cột) */}
                <div className="xl:col-span-2 rounded-[8px] border border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] p-4 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-[#f0f0f0] dark:border-[#2a2a2a]">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-brand" />
                      <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        Danh mục Dự án Xuất bản Sách Trọng điểm
                      </h2>
                    </div>
                    <Link
                      href="/projects"
                      className="text-xs text-brand hover:underline flex items-center gap-1 font-medium"
                    >
                      Xem tất cả <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>

                  <div className="divide-y divide-[#f0f0f0] dark:divide-[#2a2a2a] overflow-x-auto">
                    {executiveStats.projectsSummary.length === 0 ? (
                      <p className="py-6 text-center text-xs text-slate-400">
                        Chưa có dự án nào trong hệ thống.
                      </p>
                    ) : (
                      executiveStats.projectsSummary.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between py-2.5 px-1 hover:bg-slate-50 dark:hover:bg-[#242424] rounded-md transition"
                        >
                          <div className="flex items-center gap-3 min-w-0 pr-3">
                            <span
                              className="h-3 w-3 rounded-full shrink-0"
                              style={{ backgroundColor: p.color || "#F26522" }}
                            />
                            <div className="min-w-0">
                              <Link
                                href={`/projects/${p.id}`}
                                className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100 hover:text-brand block"
                              >
                                [{p.code}] {p.name}
                              </Link>
                              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                                <span>{p.totalTasks} công việc</span>
                                {p.overdueTasks > 0 && (
                                  <span className="text-red-500 font-medium">
                                    • {p.overdueTasks} việc quá hạn
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-4 shrink-0">
                            <div className="w-28 text-right">
                              <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                                <span className="text-slate-400">Tiến độ</span>
                                <span className="font-bold text-slate-700 dark:text-slate-300">
                                  {p.completionRate}%
                                </span>
                              </div>
                              <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-[#303030] overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-brand transition-all"
                                  style={{ width: `${p.completionRate}%` }}
                                />
                              </div>
                            </div>

                            <Link
                              href={`/projects/${p.id}`}
                              className="rounded border border-[#e0e0e0] dark:border-[#333333] px-2 py-1 text-[11px] text-slate-600 dark:text-slate-300 hover:border-brand hover:text-brand transition"
                            >
                              Mở
                            </Link>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Khối Điểm nóng & Nhiệm vụ Khẩn cấp Toàn công ty (1 Cột) */}
                <div className="rounded-[8px] border border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] p-4 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-[#f0f0f0] dark:border-[#2a2a2a]">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-amber-500" />
                      <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        Nhiệm vụ Khẩn cấp Toàn công ty
                      </h2>
                    </div>
                  </div>

                  {executiveStats.urgentTasks.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400">
                      <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-500 mb-1" />
                      Không có công việc khẩn cấp nào tồn đọng!
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {executiveStats.urgentTasks.map((t) => (
                        <div
                          key={t.id}
                          onClick={() =>
                            setActiveDrawerTask({
                              taskId: t.id,
                              projectId: t.project_id,
                            })
                          }
                          className="rounded-lg border border-[#f0f0f0] dark:border-[#2a2a2a] p-2.5 hover:border-brand/50 hover:bg-slate-50 dark:hover:bg-[#252525] transition cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100 hover:text-brand">
                              {t.title}
                            </span>
                            <span className="shrink-0 rounded px-1.5 py-0.2 text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400">
                              {t.priority}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                            <span className="truncate">
                              {t.project ? `[${t.project.code}]` : ""}
                            </span>
                            <span className="font-mono text-amber-600 dark:text-amber-400">
                              {t.due_date ? formatDateVi(t.due_date) : "Không hạn"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="pt-2 border-t border-[#f0f0f0] dark:border-[#2a2a2a]">
                    <Link
                      href="/reports?tab=executive"
                      className="w-full flex items-center justify-center gap-1.5 rounded-md bg-brand-soft dark:bg-brand-soft-dark py-2 text-xs font-semibold text-brand hover:opacity-90 transition"
                    >
                      <BarChart3 className="h-3.5 w-3.5" />
                      Báo cáo Phân tích Toàn diện
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* 4 Compact Stat Cards (Worklenz HomeStatCards) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <button
              type="button"
              onClick={() => setTaskFilter("open")}
              className={cn(
                "flex items-center justify-between rounded-[8px] border px-4 py-3 text-left transition cursor-pointer",
                taskFilter === "open"
                  ? "border-brand bg-brand-soft/30 dark:bg-brand-soft-dark/25"
                  : "border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] hover:border-brand/40"
              )}
            >
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Việc đang mở
                </p>
                <p className="mt-1 font-mono text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {stats.inProgress}
                </p>
              </div>
              <span className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-brand-soft dark:bg-brand-soft-dark text-brand">
                <Clock className="h-4 w-4" />
              </span>
            </button>

            <button
              type="button"
              onClick={() => setTaskFilter("overdue")}
              className={cn(
                "flex items-center justify-between rounded-[8px] border px-4 py-3 text-left transition cursor-pointer",
                taskFilter === "overdue"
                  ? "border-red-500 bg-red-50/40 dark:bg-red-950/30"
                  : "border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] hover:border-red-400/50"
              )}
            >
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Quá hạn
                </p>
                <p
                  className={cn(
                    "mt-1 font-mono text-2xl font-bold",
                    stats.overdue > 0
                      ? "text-red-600 dark:text-red-400"
                      : "text-slate-900 dark:text-slate-100"
                  )}
                >
                  {stats.overdue}
                </p>
              </div>
              <span className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400">
                <AlertTriangle className="h-4 w-4" />
              </span>
            </button>

            <button
              type="button"
              onClick={() => setTaskFilter("today")}
              className={cn(
                "flex items-center justify-between rounded-[8px] border px-4 py-3 text-left transition cursor-pointer",
                taskFilter === "today"
                  ? "border-amber-500 bg-amber-50/40 dark:bg-amber-950/30"
                  : "border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] hover:border-amber-400/50"
              )}
            >
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Hạn hôm nay
                </p>
                <p
                  className={cn(
                    "mt-1 font-mono text-2xl font-bold",
                    stats.dueToday > 0
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-slate-900 dark:text-slate-100"
                  )}
                >
                  {stats.dueToday}
                </p>
              </div>
              <span className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                <CalendarIcon className="h-4 w-4" />
              </span>
            </button>

            <button
              type="button"
              onClick={() => setTaskFilter("completed")}
              className={cn(
                "flex items-center justify-between rounded-[8px] border px-4 py-3 text-left transition cursor-pointer",
                taskFilter === "completed"
                  ? "border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/30"
                  : "border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] hover:border-emerald-400/50"
              )}
            >
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Đã hoàn thành
                </p>
                <p className="mt-1 font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {stats.completed}
                </p>
              </div>
              <span className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
              </span>
            </button>
          </div>

          {/* 2-Column Workspace Grid: Main Task Table (3/4) + Right Widgets (1/4) */}
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 items-start">
            <div className="xl:col-span-3">{renderDenseTaskTable(false)}</div>

            {/* Right Column Widgets: Personal Todo + Delegated by Me summary */}
            <div className="space-y-4">
              {/* Widget 1: Personal Todos (Read-Only Glanceable View) */}
              <div className="rounded-[8px] border border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-[#f0f0f0] dark:border-[#2a2a2a]">
                  <div className="flex items-center gap-2">
                    <ListTodo className="h-4 w-4 text-brand" />
                    <div>
                      <h2 className="text-[13.5px] font-bold text-slate-900 dark:text-slate-100">
                        Todo cá nhân
                      </h2>
                      <p className="text-[11px] text-slate-400">
                        Hoàn thành {completedTodosCount} / {todos.length} mục
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push("/home?view=todo")}
                    className="text-[11px] font-medium text-brand hover:underline cursor-pointer"
                  >
                    Xem tất cả →
                  </button>
                </div>

                <div className="space-y-1 max-h-[300px] overflow-y-auto divide-y divide-[#f5f5f5] dark:divide-[#252525]">
                  {todos.length === 0 ? (
                    <div className="py-6 text-center">
                      <p className="text-xs text-slate-400">
                        Chưa có Todo cá nhân nào.
                      </p>
                      <button
                        type="button"
                        onClick={() => router.push("/home?view=todo")}
                        className="mt-1 text-xs font-medium text-brand hover:underline cursor-pointer"
                      >
                        + Mở trang Todo để tạo
                      </button>
                    </div>
                  ) : (
                    todos.slice(0, 8).map((todo) => {
                      const catCfg = getTodoCategoryConfig(todo.category);
                      const isOverdueTodo =
                        !todo.is_done &&
                        Boolean(todo.due_date && todo.due_date < todayKey);
                      return (
                        <div
                          key={todo.id}
                          onClick={() => router.push("/home?view=todo")}
                          className="flex items-start justify-between gap-2.5 py-2 px-1 hover:bg-slate-50 dark:hover:bg-[#252525] rounded-[6px] transition cursor-pointer group"
                          title="Bấm để mở trang Todo cá nhân"
                        >
                          <div className="flex items-start gap-2 min-w-0 flex-1">
                            {todo.is_done ? (
                              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-emerald-500 shrink-0" />
                            ) : (
                              <Circle className="mt-0.5 h-3.5 w-3.5 text-slate-300 dark:text-slate-600 shrink-0 group-hover:text-brand transition" />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="h-1.5 w-1.5 rounded-full shrink-0"
                                  style={{ backgroundColor: catCfg.dot }}
                                  title={catCfg.label}
                                />
                                <span
                                  className={cn(
                                    "truncate text-xs font-medium",
                                    todo.is_done
                                      ? "line-through text-slate-400 dark:text-slate-500"
                                      : "text-slate-700 dark:text-slate-200 group-hover:text-brand"
                                  )}
                                >
                                  {todo.title}
                                </span>
                              </div>
                              {(todo.due_date || todo.notes) && (
                                <div className="flex items-center gap-2 mt-0.5 text-[10.5px] text-slate-400">
                                  {todo.due_date && (
                                    <span
                                      className={cn(
                                        "font-mono",
                                        isOverdueTodo &&
                                          "text-red-500 font-semibold",
                                        todo.due_date === todayKey &&
                                          "text-amber-500 font-medium"
                                      )}
                                    >
                                      {todo.due_date === todayKey
                                        ? "Hôm nay"
                                        : formatDateVi(todo.due_date)}
                                    </span>
                                  )}
                                  {todo.notes && (
                                    <span className="truncate">
                                      • {todo.notes}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          <span
                            className={cn(
                              "shrink-0 rounded-[4px] px-1.5 py-0.2 text-[10px] font-medium border",
                              catCfg.bg,
                              catCfg.color
                            )}
                          >
                            {catCfg.label}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

                {todos.length > 8 && (
                  <button
                    type="button"
                    onClick={() => router.push("/home?view=todo")}
                    className="w-full text-center py-1 text-xs text-slate-400 hover:text-brand cursor-pointer"
                  >
                    + Xem thêm {todos.length - 8} việc khác...
                  </button>
                )}
              </div>

              {/* Widget 2: Assigned By Me Widget (matching legacy HomeAssignedByMeWidget) */}
              <div className="rounded-[8px] border border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Send className="h-3.5 w-3.5 text-brand" />
                    <h2 className="text-[13.5px] font-bold text-slate-900 dark:text-slate-100">
                      Việc tôi đã giao ({assignedByMeTasks.length})
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push("/home?view=delegated")}
                    className="text-[11px] font-medium text-brand hover:underline cursor-pointer"
                  >
                    Xem tất cả
                  </button>
                </div>

                {assignedByMeTasks.length === 0 ? (
                  <p className="py-3 text-xs text-slate-400">
                    Bạn chưa giao việc cho thành viên khác.
                  </p>
                ) : (
                  <div className="divide-y divide-[#f0f0f0] dark:divide-[#2a2a2a]">
                    {assignedByMeTasks.slice(0, 5).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() =>
                          setActiveDrawerTask({
                            taskId: t.id,
                            projectId: t.project_id,
                          })
                        }
                        className="flex w-full items-center justify-between gap-2 py-2 text-left hover:text-brand transition cursor-pointer"
                      >
                        <span className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">
                          {t.title}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] text-slate-400">
                          {t.due_date ? formatDateVi(t.due_date) : "—"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )}

      {/* ====================================================================
       * MODE 2: MY TASKS (Worklenz SubSidebar VIEWS + 4 KPI Cards + Dense Table)
       * ==================================================================== */}
      {activeView === "my-tasks" && (
        <div className="flex flex-col md:flex-row items-start gap-4">
          {/* Sub-sidebar: VIEWS (Dedicated 200px Secondary Rail as seen in legacy Worklenz) */}
          <aside className="w-full md:w-52 shrink-0 rounded-[8px] border border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] p-3 space-y-1">
            <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              VIEWS
            </div>

            <button
              type="button"
              onClick={() => setSubFacet("all")}
              className={cn(
                "flex w-full items-center justify-between rounded-[6px] px-2.5 py-1.5 text-xs font-medium transition cursor-pointer text-left",
                subFacet === "all"
                  ? "bg-brand/10 text-brand font-semibold border-l-2 border-brand"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#282828]"
              )}
            >
              <div className="flex items-center gap-2">
                <ListFilter className="h-3.5 w-3.5" />
                <span>Tất cả</span>
              </div>
              <span className="font-mono text-[10px] text-slate-400">{tasks.length}</span>
            </button>

            <button
              type="button"
              onClick={() => setSubFacet("assigned_to_me")}
              className={cn(
                "flex w-full items-center justify-between rounded-[6px] px-2.5 py-1.5 text-xs font-medium transition cursor-pointer text-left",
                subFacet === "assigned_to_me"
                  ? "bg-brand/10 text-brand font-semibold border-l-2 border-brand"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#282828]"
              )}
            >
              <div className="flex items-center gap-2">
                <UserCheck className="h-3.5 w-3.5" />
                <span>Việc giao cho tôi</span>
              </div>
              <span className="font-mono text-[10px] text-slate-400">{assignedToMeTasks.length}</span>
            </button>

            <button
              type="button"
              onClick={() => setSubFacet("assigned_by_me")}
              className={cn(
                "flex w-full items-center justify-between rounded-[6px] px-2.5 py-1.5 text-xs font-medium transition cursor-pointer text-left",
                subFacet === "assigned_by_me"
                  ? "bg-brand/10 text-brand font-semibold border-l-2 border-brand"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#282828]"
              )}
            >
              <div className="flex items-center gap-2">
                <Send className="h-3.5 w-3.5" />
                <span>Việc tôi đã giao</span>
              </div>
              <span className="font-mono text-[10px] text-slate-400">{assignedByMeTasks.length}</span>
            </button>

            <button
              type="button"
              onClick={() => setSubFacet("overdue")}
              className={cn(
                "flex w-full items-center justify-between rounded-[6px] px-2.5 py-1.5 text-xs font-medium transition cursor-pointer text-left",
                subFacet === "overdue"
                  ? "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 font-semibold border-l-2 border-red-500"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#282828]"
              )}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className={cn("h-3.5 w-3.5", overdueTasksCount > 0 ? "text-red-500" : "")} />
                <span>Quá hạn</span>
              </div>
              {overdueTasksCount > 0 ? (
                <span className="rounded bg-red-100 dark:bg-red-950/70 px-1.5 py-0.2 font-mono text-[10px] font-bold text-red-600 dark:text-red-300">
                  {overdueTasksCount}
                </span>
              ) : (
                <span className="font-mono text-[10px] text-slate-400">0</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setSubFacet("unassigned")}
              className={cn(
                "flex w-full items-center justify-between rounded-[6px] px-2.5 py-1.5 text-xs font-medium transition cursor-pointer text-left",
                subFacet === "unassigned"
                  ? "bg-brand/10 text-brand font-semibold border-l-2 border-brand"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#282828]"
              )}
            >
              <div className="flex items-center gap-2">
                <UserX className="h-3.5 w-3.5" />
                <span>Chưa phân công</span>
              </div>
              <span className="font-mono text-[10px] text-slate-400">{unassignedTasksCount}</span>
            </button>

            <button
              type="button"
              onClick={() => setSubFacet("no_due_date")}
              className={cn(
                "flex w-full items-center justify-between rounded-[6px] px-2.5 py-1.5 text-xs font-medium transition cursor-pointer text-left",
                subFacet === "no_due_date"
                  ? "bg-brand/10 text-brand font-semibold border-l-2 border-brand"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#282828]"
              )}
            >
              <div className="flex items-center gap-2">
                <CalendarOff className="h-3.5 w-3.5" />
                <span>Chưa có hạn</span>
              </div>
              <span className="font-mono text-[10px] text-slate-400">{noDueDateTasksCount}</span>
            </button>
          </aside>

          {/* Main Area: Top 4 KPI Stat Cards + Table */}
          <div className="flex-1 min-w-0 space-y-3.5 w-full">
            {/* 4 Top KPI Stat Cards (Worklenz My Tasks Top Stat Cards) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-[8px] border border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] p-3.5">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total tasks</p>
                <p className="mt-1 font-mono text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {stats.total}
                </p>
              </div>

              <div className="rounded-[8px] border border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] p-3.5">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Overdue</p>
                <p className={cn("mt-1 font-mono text-2xl font-bold", stats.overdue > 0 ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-slate-100")}>
                  {stats.overdue}
                </p>
              </div>

              <div className="rounded-[8px] border border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] p-3.5">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Due today</p>
                <p className={cn("mt-1 font-mono text-2xl font-bold", stats.dueToday > 0 ? "text-blue-600 dark:text-blue-400" : "text-slate-900 dark:text-slate-100")}>
                  {stats.dueToday}
                </p>
              </div>

              <div className="rounded-[8px] border border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] p-3.5">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">In progress</p>
                <p className="mt-1 font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {stats.inProgress}
                </p>
              </div>
            </div>

            {/* Dense Task Table */}
            {renderDenseTaskTable(subFacet === "assigned_by_me" || subFacet === "all")}
          </div>
        </div>
      )}


      {/* ====================================================================
       * MODE 3: DELEGATED BY ME & TEAM WORKLOAD (Worklenz Delegated / Manager View)
       * ==================================================================== */}
      {activeView === "delegated" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#e8e8e8] dark:border-[#303030]">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4 text-brand" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Quản lý Công việc đã giao ({assignedByMeTasks.length})
              </h2>
            </div>

            {/* 3 Sub-tabs: List | Workload Balancing | Review Queue */}
            <div className="inline-flex items-center rounded-lg border border-[#e0e0e0] dark:border-[#333333] bg-[#fafafa] dark:bg-[#1a1a1a] p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setDelegatedSubTab("list")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition cursor-pointer",
                  delegatedSubTab === "list"
                    ? "bg-brand text-white shadow-xs font-semibold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                <CheckSquare className="h-3.5 w-3.5" />
                <span>Danh sách chi tiết</span>
              </button>
              <button
                type="button"
                onClick={() => setDelegatedSubTab("workload")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition cursor-pointer",
                  delegatedSubTab === "workload"
                    ? "bg-brand text-white shadow-xs font-semibold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                <Users2 className="h-3.5 w-3.5" />
                <span>Cân bằng tải ({workloadByAssignee.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setDelegatedSubTab("review")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition cursor-pointer",
                  delegatedSubTab === "review"
                    ? "bg-brand text-white shadow-xs font-semibold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                <FileCheck2 className="h-3.5 w-3.5" />
                <span>Chờ nghiệm thu</span>
                {reviewQueueTasks.length > 0 && (
                  <span
                    className={cn(
                      "ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] font-bold",
                      delegatedSubTab === "review"
                        ? "bg-white text-brand"
                        : "bg-brand text-white"
                    )}
                  >
                    {reviewQueueTasks.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* SubTab 1: Dense Task Table */}
          {delegatedSubTab === "list" && renderDenseTaskTable(true)}

          {/* SubTab 2: Team Workload Balancing Cards */}
          {delegatedSubTab === "workload" && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Thống kê tải công việc theo từng nhân viên được giao việc. Cảnh báo khi nhân sự gánh từ 4 việc chưa xong.
              </p>

              {workloadByAssignee.length === 0 ? (
                <div className="py-12 text-center rounded-[8px] border border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] text-slate-400 text-xs">
                  Chưa có phân công việc nào cho nhân sự.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {workloadByAssignee.map(({ profile: person, total, open, overdue, completed, tasks: pTasks }) => {
                    const isOverloaded = open >= 4;
                    const isLight = open === 0;

                    return (
                      <div
                        key={person.id}
                        className={cn(
                          "rounded-[8px] border bg-white dark:bg-[#1f1f1f] p-4 space-y-3 transition",
                          isOverloaded
                            ? "border-red-300 dark:border-red-900/60 shadow-2xs"
                            : "border-[#e8e8e8] dark:border-[#303030]"
                        )}
                      >
                        {/* Header: Avatar, Name, Job title, Status badge */}
                        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#f0f0f0] dark:border-[#2a2a2a]">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {person.avatar_url ? (
                              <img
                                src={person.avatar_url}
                                alt={person.full_name}
                                className="h-8 w-8 rounded-full object-cover shrink-0"
                              />
                            ) : (
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white shrink-0">
                                {getInitials(person.full_name)}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">
                                {person.full_name}
                              </p>
                              <p className="truncate text-[11px] text-slate-400">
                                {person.job_title || person.email}
                              </p>
                            </div>
                          </div>

                          <span
                            className={cn(
                              "shrink-0 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                              isOverloaded
                                ? "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400"
                                : isLight
                                ? "bg-slate-100 text-slate-600 dark:bg-[#2b2b2b] dark:text-slate-400"
                                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                            )}
                          >
                            {isOverloaded
                              ? "⚠️ Quá tải"
                              : isLight
                              ? "Rảnh việc"
                              : "Tải ổn định"}
                          </span>
                        </div>

                        {/* Numbers grid */}
                        <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                          <div className="rounded bg-slate-50 dark:bg-[#252525] p-1.5">
                            <span className="text-slate-400 block text-[10px]">Đang làm</span>
                            <span className="font-mono text-sm font-bold text-slate-800 dark:text-slate-200">
                              {open}
                            </span>
                          </div>
                          <div className="rounded bg-slate-50 dark:bg-[#252525] p-1.5">
                            <span className="text-slate-400 block text-[10px]">Quá hạn</span>
                            <span
                              className={cn(
                                "font-mono text-sm font-bold",
                                overdue > 0
                                  ? "text-red-600 dark:text-red-400"
                                  : "text-slate-800 dark:text-slate-200"
                              )}
                            >
                              {overdue}
                            </span>
                          </div>
                          <div className="rounded bg-slate-50 dark:bg-[#252525] p-1.5">
                            <span className="text-slate-400 block text-[10px]">Đã xong</span>
                            <span className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">
                              {completed}
                            </span>
                          </div>
                        </div>

                        {/* Recent Tasks */}
                        <div className="space-y-1.5 pt-1">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            Việc gần nhất:
                          </p>
                          {pTasks.slice(0, 3).map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() =>
                                setActiveDrawerTask({
                                  taskId: t.id,
                                  projectId: t.project_id,
                                })
                              }
                              className="w-full flex items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs hover:bg-slate-50 dark:hover:bg-[#252525] transition cursor-pointer"
                            >
                              <span className="truncate text-slate-700 dark:text-slate-300">
                                {t.title}
                              </span>
                              <span className="font-mono text-[10px] text-slate-400 shrink-0">
                                {t.due_date ? formatDateVi(t.due_date) : "—"}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* SubTab 3: Review Queue */}
          {delegatedSubTab === "review" && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Các đầu việc nhân viên báo đã hoàn thành hoặc gửi yêu cầu nghiệm thu cần bạn kiểm tra và xác nhận.
              </p>

              {reviewQueueTasks.length === 0 ? (
                <div className="py-12 text-center rounded-[8px] border border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] text-slate-400 text-xs">
                  <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-500 mb-1" />
                  Hàng chờ nghiệm thu đang trống. Toàn bộ công việc đã được xử lý!
                </div>
              ) : (
                <div className="divide-y divide-[#e8e8e8] dark:divide-[#303030] rounded-[8px] border border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f]">
                  {reviewQueueTasks.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between p-3.5 hover:bg-slate-50/70 dark:hover:bg-[#252525] transition"
                    >
                      <div className="min-w-0 pr-3 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">
                            {t.title}
                          </span>
                          <span
                            className={cn(
                              "rounded px-2 py-0.2 text-[10px] font-bold uppercase tracking-wider",
                              t.review_status === "pending_review"
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400"
                                : "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400"
                            )}
                          >
                            {t.review_status === "pending_review"
                              ? "Yêu cầu nghiệm thu"
                              : "Đã làm xong"}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-slate-400">
                          {t.project && (
                            <span className="font-semibold text-slate-600 dark:text-slate-300">
                              [{t.project.code}] {t.project.name}
                            </span>
                          )}
                          <span>•</span>
                          <span>
                            Người làm:{" "}
                            {(t.assignees ?? []).map((a) => a.full_name).join(", ") ||
                              "Chưa gán"}
                          </span>
                          {t.due_date && (
                            <>
                              <span>•</span>
                              <span>Hạn: {formatDateVi(t.due_date)}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setActiveDrawerTask({
                            taskId: t.id,
                            projectId: t.project_id,
                          })
                        }
                        className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-brand-hover transition cursor-pointer shrink-0"
                      >
                        Mở nghiệm thu
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
       * MODE 4: FULL-WIDTH CALENDAR VIEW (Worklenz HomeCalendarView)
       * ==================================================================== */}
      {activeView === "calendar" && (
        <div className="rounded-[8px] border border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] p-4">
          <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-[#e8e8e8] dark:border-[#303030]">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-brand" />
              <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                Lịch công việc — Tháng {calMonth + 1}/{calYear}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => router.push("/calendar")}
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-[6px] bg-brand text-white hover:bg-brand/90 transition shadow-2xs cursor-pointer"
              >
                <span>Mở Lịch chuyên sâu</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
              <div className="inline-flex items-center rounded-[6px] border border-[#d9d9d9] dark:border-[#3a3a3a] overflow-hidden">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleGoToday}
                  className="border-x border-[#d9d9d9] dark:border-[#3a3a3a] px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Hôm nay
                </button>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAY_LABELS.map((day) => (
              <div
                key={day}
                className="py-1 text-center text-xs font-semibold text-slate-500 dark:text-slate-400"
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((cell) => {
              const dayTasks = tasksByDate.get(cell.dateKey) ?? [];
              const dayTodos = todosByDate.get(cell.dateKey) ?? [];
              const totalCount = dayTasks.length + dayTodos.length;
              const isToday = cell.dateKey === todayKey;

              return (
                <div
                  key={cell.dateKey}
                  className={cn(
                    "min-h-[108px] rounded-[6px] border p-1.5 flex flex-col",
                    cell.inCurrentMonth
                      ? "border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f]"
                      : "border-[#f0f0f0] dark:border-[#252525] bg-[#fafafa] dark:bg-[#161616]",
                    isToday &&
                      "ring-1 ring-brand border-brand bg-brand-soft/30 dark:bg-brand-soft-dark/20"
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={cn(
                        "text-xs font-semibold rounded-full h-5 w-5 flex items-center justify-center",
                        isToday
                          ? "bg-brand text-white"
                          : cell.inCurrentMonth
                          ? "text-slate-700 dark:text-slate-200"
                          : "text-slate-400 dark:text-slate-600"
                      )}
                    >
                      {cell.dayNumber}
                    </span>
                    {totalCount > 0 && (
                      <span className="text-[10px] font-semibold text-brand px-1 rounded bg-brand-soft dark:bg-brand-soft-dark">
                        {totalCount}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 overflow-y-auto max-h-[82px]">
                    {dayTasks.map((t) => {
                      const done =
                        t.status?.category === "done" ||
                        Boolean(t.completed_at);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() =>
                            setActiveDrawerTask({
                              taskId: t.id,
                              projectId: t.project_id,
                            })
                          }
                          className={cn(
                            "w-full text-left truncate rounded-[4px] px-1.5 py-0.5 text-[11px] block transition cursor-pointer",
                            done
                              ? "bg-slate-100 text-slate-400 line-through dark:bg-slate-800"
                              : "bg-brand-soft/70 hover:bg-brand-soft text-slate-800 dark:bg-[#2a2a2a] dark:text-slate-200"
                          )}
                          title={`[Task dự án] ${t.title}`}
                        >
                          {t.title}
                        </button>
                      );
                    })}
                    {dayTodos.map((td) => (
                      <button
                        key={td.id}
                        type="button"
                        onClick={() => router.push("/home?view=todo")}
                        className={cn(
                          "w-full text-left truncate rounded-[4px] border border-dashed px-1.5 py-0.5 text-[10.5px] block transition cursor-pointer",
                          td.is_done
                            ? "border-slate-200 bg-slate-50 text-slate-400 line-through dark:border-slate-800 dark:bg-slate-900"
                            : "border-purple-300 bg-purple-50/70 text-purple-800 hover:bg-purple-100 dark:border-purple-800/70 dark:bg-purple-950/40 dark:text-purple-200"
                        )}
                        title={`[Todo cá nhân] ${td.title}`}
                      >
                        • {td.title}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ====================================================================
       * MODE 5: PERSONAL TODO LIST 2.0 (GTD Personal Workspace)
       * ==================================================================== */}
      {activeView === "todo" && (
        <PersonalTodoManager
          profile={profile}
          todos={todos}
          setTodos={setTodos}
          projects={projects}
          allStatuses={allStatuses}
          todayKey={todayKey}
          onTaskPromoted={(newTask) => {
            setTasks((prev) => [newTask, ...prev]);
          }}
          onOpenTaskDrawer={(taskId, projectId) =>
            setActiveDrawerTask({ taskId, projectId })
          }
        />
      )}

      {/* ====================================================================
       * IN-PLACE TASK DRAWER (Matches legacy HomeLayout TaskDrawer Portal)
       * ==================================================================== */}
      {activeDrawerTask && (() => {
        const currentTask = tasks.find((t) => t.id === activeDrawerTask.taskId) ?? null;
        const currentTaskIdx = filteredTasks.findIndex((t) => t.id === activeDrawerTask.taskId);
        return (
          <TaskDrawer
            taskId={activeDrawerTask.taskId}
            projectId={activeDrawerTask.projectId}
            initialTask={currentTask}
            statuses={drawerProjectStatuses}
            members={allProfiles}
            allProfiles={allProfiles}
            currentUser={profile}
            taskList={filteredTasks.map((t) => ({
              id: t.id,
              projectId: t.project_id || undefined,
            }))}
            currentIndex={currentTaskIdx >= 0 ? currentTaskIdx : undefined}
            onNavigateTask={(nextTaskId) => {
              const targetTask = tasks.find((t) => t.id === nextTaskId);
              if (targetTask) {
                setActiveDrawerTask({ taskId: targetTask.id, projectId: targetTask.project_id });
              }
            }}
            onClose={() => setActiveDrawerTask(null)}
            onUpdated={() => router.refresh()}
            onDeleted={(deletedId) => {
              setTasks((prev) => prev.filter((t) => t.id !== deletedId));
              setActiveDrawerTask(null);
            }}
            onOpenTask={(nextTaskId) => {
              const targetTask = tasks.find((t) => t.id === nextTaskId);
              if (targetTask) {
                setActiveDrawerTask({ taskId: targetTask.id, projectId: targetTask.project_id });
              }
            }}
          />
        );
      })()}

    </div>
  );
}
