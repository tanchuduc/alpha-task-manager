"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  cn,
  formatDateVi,
  getInitials,
  isOverdue,
  PRIORITY_CONFIG,
} from "@/lib/utils";
import type { PersonalTodo, Profile, Task, TaskPriority } from "@/types/database";
import {
  AlertTriangle,
  ArrowRight,
  Calendar as CalendarIcon,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  FolderKanban,
  ListTodo,
  Plus,
  Search,
  Send,
  Trash2,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

interface HomeDashboardProps {
  profile: Profile;
  initialTasks: Task[];
  initialTodos: PersonalTodo[];
  projects?: Array<{ id: string; name: string; code: string; color: string }>;
}

type MainView = "list" | "calendar";
type ScopeFilter = "assigned_to_me" | "assigned_by_me" | "all";
type TaskFilter = "all" | "open" | "overdue" | "today" | "completed";

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
  initialTodos,
  projects = [],
}: HomeDashboardProps) {
  const router = useRouter();

  const [mainView, setMainView] = useState<MainView>("list");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("assigned_to_me");
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

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
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const [addingTodo, setAddingTodo] = useState(false);

  // Group tasks by scope
  const { assignedToMeTasks, assignedByMeTasks } = useMemo(() => {
    const toMe: Task[] = [];
    const byMe: Task[] = [];

    for (const t of initialTasks) {
      const isAssigned = (t.assignees ?? []).some((a) => a.id === profile.id);
      const isCreated = t.created_by === profile.id;

      if (isAssigned) toMe.push(t);
      if (isCreated) byMe.push(t);
    }

    return { assignedToMeTasks: toMe, assignedByMeTasks: byMe };
  }, [initialTasks, profile.id]);

  // Tasks in current active scope
  const scopedTasks = useMemo(() => {
    if (scopeFilter === "assigned_to_me") return assignedToMeTasks;
    if (scopeFilter === "assigned_by_me") return assignedByMeTasks;
    return initialTasks;
  }, [scopeFilter, assignedToMeTasks, assignedByMeTasks, initialTasks]);

  // KPI calculations based on current scope
  const stats = useMemo(() => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    let inProgress = 0;
    let overdue = 0;
    let dueToday = 0;
    let completedThisWeek = 0;

    for (const t of scopedTasks) {
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
        const doneRef = t.completed_at || t.updated_at;
        if (doneRef && new Date(doneRef).getTime() >= sevenDaysAgo) {
          completedThisWeek += 1;
        }
      }
    }

    return {
      inProgress,
      overdue,
      dueToday,
      completedThisWeek,
      total: scopedTasks.length,
    };
  }, [scopedTasks, todayKey]);

  // Filtered tasks for List view
  const filteredTasks = useMemo(() => {
    return scopedTasks.filter((t) => {
      const isDone = t.status?.category === "done" || Boolean(t.completed_at);
      const taskDateKey = extractDateKey(t.due_date);

      // Status filter
      if (taskFilter === "open" && isDone) return false;
      if (taskFilter === "overdue" && (isDone || !isOverdue(t.due_date, t.completed_at))) return false;
      if (taskFilter === "today" && (isDone || taskDateKey !== todayKey)) return false;
      if (taskFilter === "completed" && !isDone) return false;

      // Project filter
      if (projectFilter !== "all" && t.project_id !== projectFilter) return false;

      // Priority filter
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;

      // Search filter
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
  }, [scopedTasks, taskFilter, projectFilter, priorityFilter, searchQuery, todayKey]);

  // Tasks grouped by YYYY-MM-DD for Calendar view
  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of scopedTasks) {
      const key = extractDateKey(t.due_date);
      if (!key) continue;
      const existing = map.get(key) ?? [];
      existing.push(t);
      map.set(key, existing);
    }
    return map;
  }, [scopedTasks]);

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

    // Previous month trailing days
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

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        dateKey: toDateKey(calYear, calMonth, d),
        dayNumber: d,
        inCurrentMonth: true,
      });
    }

    // Next month leading days
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

  async function handleAddTodo(e: React.FormEvent) {
    e.preventDefault();
    const title = newTodoTitle.trim();
    if (!title || addingTodo) return;

    setAddingTodo(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("personal_todos")
        .insert({
          user_id: profile.id,
          title,
          is_done: false,
          position: todos.length,
        })
        .select("*")
        .single();

      if (error) throw error;
      setTodos((prev) => [data as PersonalTodo, ...prev]);
      setNewTodoTitle("");
    } catch {
      toast.error("Không thể thêm việc cần làm.");
    } finally {
      setAddingTodo(false);
    }
  }

  async function handleToggleTodo(todo: PersonalTodo) {
    const nextDone = !todo.is_done;
    setTodos((prev) =>
      prev.map((item) =>
        item.id === todo.id ? { ...item, is_done: nextDone } : item
      )
    );

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("personal_todos")
        .update({ is_done: nextDone })
        .eq("id", todo.id);
      if (error) throw error;
    } catch {
      setTodos((prev) =>
        prev.map((item) =>
          item.id === todo.id ? { ...item, is_done: todo.is_done } : item
        )
      );
      toast.error("Không thể cập nhật trạng thái.");
    }
  }

  async function handleDeleteTodo(todoId: string) {
    const backup = todos;
    setTodos((prev) => prev.filter((item) => item.id !== todoId));

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("personal_todos")
        .delete()
        .eq("id", todoId);
      if (error) throw error;
    } catch {
      setTodos(backup);
      toast.error("Không thể xóa mục này.");
    }
  }

  const completedTodosCount = todos.filter((t) => t.is_done).length;

  return (
    <div className="space-y-6">
      {/* Greeting Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {getGreeting()}, {profile.full_name}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {getTodayDateVi()}
            {profile.job_title ? ` • ${profile.job_title}` : ""}
          </p>
        </div>

        <Link
          href="/projects"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand hover:bg-brand-hover px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition shrink-0"
        >
          <FolderKanban className="h-4 w-4" />
          <span>Đi tới Dự án</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* 4 KPI Stat Cards (Interactive Filters) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Đang mở */}
        <button
          type="button"
          onClick={() => setTaskFilter((curr) => (curr === "open" ? "all" : "open"))}
          className={cn(
            "rounded-2xl border p-5 text-left transition cursor-pointer shadow-2xs hover:border-brand/40",
            taskFilter === "open"
              ? "border-brand bg-brand-soft/20 ring-2 ring-brand/30 dark:bg-brand-soft-dark/20"
              : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Việc đang thực hiện
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft dark:bg-brand-soft-dark text-brand">
              <Clock className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-900 dark:text-slate-100">
            {stats.inProgress}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Đang mở cần xử lý</span>
            {taskFilter === "open" && <span className="text-brand font-semibold text-[11px]">Đang lọc ●</span>}
          </p>
        </button>

        {/* KPI 2: Quá hạn */}
        <button
          type="button"
          onClick={() => setTaskFilter((curr) => (curr === "overdue" ? "all" : "overdue"))}
          className={cn(
            "rounded-2xl border p-5 text-left transition cursor-pointer shadow-2xs hover:border-red-400/50",
            taskFilter === "overdue"
              ? "border-red-500 bg-red-50/50 ring-2 ring-red-400/40 dark:bg-red-950/40"
              : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Quá hạn
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400">
              <AlertTriangle className="h-4 w-4" />
            </span>
          </div>
          <p
            className={cn(
              "mt-3 text-3xl font-bold",
              stats.overdue > 0
                ? "text-red-600 dark:text-red-400"
                : "text-slate-900 dark:text-slate-100"
            )}
          >
            {stats.overdue}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Cần ưu tiên hoàn tất</span>
            {taskFilter === "overdue" && <span className="text-red-600 font-semibold text-[11px]">Đang lọc ●</span>}
          </p>
        </button>

        {/* KPI 3: Đến hạn hôm nay */}
        <button
          type="button"
          onClick={() => setTaskFilter((curr) => (curr === "today" ? "all" : "today"))}
          className={cn(
            "rounded-2xl border p-5 text-left transition cursor-pointer shadow-2xs hover:border-amber-400/50",
            taskFilter === "today"
              ? "border-amber-500 bg-amber-50/50 ring-2 ring-amber-400/40 dark:bg-amber-950/40"
              : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Đến hạn hôm nay
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
              <CalendarIcon className="h-4 w-4" />
            </span>
          </div>
          <p
            className={cn(
              "mt-3 text-3xl font-bold",
              stats.dueToday > 0
                ? "text-amber-600 dark:text-amber-400"
                : "text-slate-900 dark:text-slate-100"
            )}
          >
            {stats.dueToday}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Deadline trong ngày</span>
            {taskFilter === "today" && <span className="text-amber-600 font-semibold text-[11px]">Đang lọc ●</span>}
          </p>
        </button>

        {/* KPI 4: Tổng việc trong phạm vi */}
        <button
          type="button"
          onClick={() => setTaskFilter("all")}
          className={cn(
            "rounded-2xl border p-5 text-left transition cursor-pointer shadow-2xs hover:border-blue-400/50",
            taskFilter === "all"
              ? "border-blue-500 bg-blue-50/30 ring-2 ring-blue-400/30 dark:bg-blue-950/30"
              : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Tổng số công việc
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <ListTodo className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-900 dark:text-slate-100">
            {stats.total}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {scopeFilter === "assigned_to_me"
              ? "Giao cho bạn"
              : scopeFilter === "assigned_by_me"
              ? "Bạn đã giao"
              : "Tất cả liên quan"}
          </p>
        </button>
      </div>

      {/* Main 2-column layout (2/3 left, 1/3 right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Main Column (2/3) */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs overflow-hidden">
          
          {/* Header 1: Scope Views (Assigned to me vs Assigned by me vs All) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 px-5 py-3.5 bg-slate-50/50 dark:bg-slate-800/20">
            <div className="inline-flex rounded-xl bg-slate-200/70 dark:bg-slate-800 p-1">
              <button
                type="button"
                onClick={() => setScopeFilter("assigned_to_me")}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs sm:text-sm font-semibold transition cursor-pointer",
                  scopeFilter === "assigned_to_me"
                    ? "bg-white dark:bg-slate-900 text-brand shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                )}
              >
                <UserCheck className="h-4 w-4" />
                <span>Được giao cho tôi</span>
                <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 text-[10px] text-slate-600 dark:text-slate-300">
                  {assignedToMeTasks.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setScopeFilter("assigned_by_me")}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs sm:text-sm font-semibold transition cursor-pointer",
                  scopeFilter === "assigned_by_me"
                    ? "bg-white dark:bg-slate-900 text-brand shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                )}
              >
                <Send className="h-4 w-4" />
                <span>Tôi đã giao</span>
                <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 text-[10px] text-slate-600 dark:text-slate-300">
                  {assignedByMeTasks.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setScopeFilter("all")}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs sm:text-sm font-semibold transition cursor-pointer",
                  scopeFilter === "all"
                    ? "bg-white dark:bg-slate-900 text-brand shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                )}
              >
                <Users className="h-4 w-4" />
                <span>Tất cả</span>
                <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 text-[10px] text-slate-600 dark:text-slate-300">
                  {initialTasks.length}
                </span>
              </button>
            </div>

            {/* List vs Calendar Switcher */}
            <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setMainView("list")}
                className={cn(
                  "p-1.5 rounded-lg text-xs font-medium transition cursor-pointer",
                  mainView === "list"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                )}
                title="Dạng danh sách"
              >
                <ListTodo className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setMainView("calendar")}
                className={cn(
                  "p-1.5 rounded-lg text-xs font-medium transition cursor-pointer",
                  mainView === "calendar"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                )}
                title="Dạng lịch"
              >
                <CalendarIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Header 2: Filters Bar (matching Old Open Source Toolbar) */}
          {mainView === "list" && (
            <div className="border-b border-slate-200 dark:border-slate-800 px-5 py-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Status Pills */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { key: "all", label: "Tất cả", count: stats.total },
                      { key: "open", label: "Chưa xong", count: stats.inProgress },
                      { key: "overdue", label: "Quá hạn", count: stats.overdue },
                      { key: "today", label: "Hôm nay", count: stats.dueToday },
                      { key: "completed", label: "Đã xong", count: scopedTasks.length - stats.inProgress },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setTaskFilter(tab.key)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition cursor-pointer",
                        taskFilter === tab.key
                          ? "bg-brand text-white shadow-2xs"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                      )}
                    >
                      <span>{tab.label}</span>
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.2 text-[10px]",
                          taskFilter === tab.key
                            ? "bg-white/20 text-white"
                            : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400"
                        )}
                      >
                        {tab.count}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Search input */}
                <div className="relative w-full sm:w-56">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm tên việc, dự án..."
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:border-brand focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Secondary Filter dropdowns (Project & Priority) */}
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                <span className="text-slate-400 font-medium inline-flex items-center gap-1 mr-1">
                  <Filter className="h-3 w-3" /> Lọc:
                </span>

                {/* Project Filter */}
                {projects.length > 0 && (
                  <select
                    value={projectFilter}
                    onChange={(e) => setProjectFilter(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                  >
                    <option value="all">Tất cả dự án ({projects.length})</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}

                {/* Priority Filter */}
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                >
                  <option value="all">Mọi mức ưu tiên</option>
                  <option value="urgent">Khẩn cấp</option>
                  <option value="high">Cao</option>
                  <option value="medium">Trung bình</option>
                  <option value="low">Thấp</option>
                </select>

                {(projectFilter !== "all" || priorityFilter !== "all" || searchQuery) && (
                  <button
                    type="button"
                    onClick={() => {
                      setProjectFilter("all");
                      setPriorityFilter("all");
                      setSearchQuery("");
                    }}
                    className="text-brand hover:underline font-medium text-[11px] ml-auto cursor-pointer"
                  >
                    Đặt lại bộ lọc
                  </button>
                )}
              </div>
            </div>
          )}

          {/* List View */}
          {mainView === "list" && (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredTasks.length === 0 ? (
                <div className="py-16 px-6 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {taskFilter === "overdue"
                      ? "Tuyệt vời! Không có công việc nào quá hạn."
                      : taskFilter === "today"
                      ? "Hôm nay không có hạn chót nào cần xử lý."
                      : taskFilter === "open"
                      ? "Không còn công việc nào đang mở."
                      : scopeFilter === "assigned_by_me"
                      ? "Bạn chưa giao công việc nào cho nhân sự khác."
                      : "Không tìm thấy công việc phù hợp với bộ lọc."}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {scopeFilter === "assigned_by_me"
                      ? "Khi bạn tạo việc trong các dự án và phân công cho đồng nghiệp, danh sách sẽ xuất hiện tại đây."
                      : "Khám phá các dự án đang hoạt động để nhận hoặc tạo công việc mới."}
                  </p>
                </div>
              ) : (
                filteredTasks.map((task) => {
                  const priorityCfg = PRIORITY_CONFIG[task.priority];
                  const isDone =
                    task.status?.category === "done" || Boolean(task.completed_at);
                  const overdue = !isDone && isOverdue(task.due_date, task.completed_at);
                  const hasAssignees = (task.assignees ?? []).length > 0;

                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() =>
                        router.push(`/projects/${task.project_id}?task=${task.id}`)
                      }
                      className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition cursor-pointer"
                    >
                      <div className="min-w-0 space-y-1.5 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "h-2 w-2 rounded-full shrink-0",
                              priorityCfg.dot
                            )}
                          />
                          <p
                            className={cn(
                              "truncate text-sm font-medium",
                              isDone
                                ? "line-through text-slate-400 dark:text-slate-500"
                                : "text-slate-900 dark:text-slate-100"
                            )}
                          >
                            {task.title}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          {task.project && (
                            <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-slate-600 dark:text-slate-300 font-medium">
                              <span
                                className="h-2 w-2 rounded-full shrink-0"
                                style={{
                                  backgroundColor:
                                    task.project.color || "#F26522",
                                }}
                              />
                              <span className="truncate max-w-[150px]">
                                {task.project.name}
                              </span>
                            </span>
                          )}

                          {task.status && (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700 px-2.5 py-0.5 text-slate-700 dark:text-slate-300">
                              <span
                                className="h-1.5 w-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: task.status.color }}
                              />
                              {task.status.name}
                            </span>
                          )}

                          {/* Show Assignees if looking at 'Assigned by me' */}
                          {scopeFilter === "assigned_by_me" && (
                            hasAssignees ? (
                              <div className="inline-flex items-center gap-1 pl-1">
                                <span className="text-[11px] text-slate-400">Giao cho:</span>
                                <div className="flex -space-x-1.5 items-center">
                                  {task.assignees!.slice(0, 3).map((u) => (
                                    <span
                                      key={u.id}
                                      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-700 ring-1 ring-white dark:ring-slate-900"
                                      title={u.full_name}
                                    >
                                      {getInitials(u.full_name)}
                                    </span>
                                  ))}
                                  {task.assignees!.length > 3 && (
                                    <span className="text-[10px] text-slate-400 pl-1 font-medium">
                                      +{task.assignees!.length - 3}
                                    </span>
                                  )}
                                </div>
                                <span className="text-slate-600 dark:text-slate-300 font-medium text-[11px] ml-1">
                                  {task.assignees![0].full_name}
                                </span>
                              </div>
                            ) : (
                              <span className="rounded bg-amber-50 dark:bg-amber-950/50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                                Chưa phân công
                              </span>
                            )
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-center">
                        <span
                          className={cn(
                            "rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                            priorityCfg.bg,
                            priorityCfg.color
                          )}
                        >
                          {priorityCfg.label}
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-xs font-medium min-w-[88px] justify-end",
                            overdue
                              ? "text-red-600 dark:text-red-400 font-semibold"
                              : "text-slate-500 dark:text-slate-400"
                          )}
                        >
                          <CalendarIcon className="h-3.5 w-3.5" />
                          {formatDateVi(task.due_date)}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}

          {/* Calendar View */}
          {mainView === "calendar" && (
            <div className="p-4">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Tháng {calMonth + 1} năm {calYear}
                </span>
                <div className="inline-flex items-center rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <button
                    type="button"
                    onClick={handlePrevMonth}
                    className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                    aria-label="Tháng trước"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleGoToday}
                    className="border-x border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    Hôm nay
                  </button>
                  <button
                    type="button"
                    onClick={handleNextMonth}
                    className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                    aria-label="Tháng sau"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1 mb-1">
                {WEEKDAY_LABELS.map((day) => (
                  <div
                    key={day}
                    className="py-1.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400"
                  >
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((cell) => {
                  const dayTasks = tasksByDate.get(cell.dateKey) ?? [];
                  const isToday = cell.dateKey === todayKey;

                  return (
                    <div
                      key={cell.dateKey}
                      className={cn(
                        "min-h-[96px] rounded-xl border p-1.5 transition flex flex-col",
                        cell.inCurrentMonth
                          ? "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                          : "border-slate-100 dark:border-slate-800/50 bg-slate-50/70 dark:bg-slate-950/40",
                        isToday &&
                          "ring-2 ring-brand/60 border-brand bg-brand-soft/40 dark:bg-brand-soft-dark/30"
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
                        {dayTasks.length > 0 && (
                          <span className="text-[10px] font-semibold text-brand px-1 rounded bg-brand-soft dark:bg-brand-soft-dark">
                            {dayTasks.length} việc
                          </span>
                        )}
                      </div>

                      <div className="space-y-1 overflow-y-auto max-h-[70px] pr-0.5">
                        {dayTasks.slice(0, 3).map((t) => {
                          const done =
                            t.status?.category === "done" || Boolean(t.completed_at);
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() =>
                                router.push(`/projects/${t.project_id}?task=${t.id}`)
                              }
                              className={cn(
                                "w-full text-left truncate rounded px-1.5 py-0.5 text-[11px] block transition cursor-pointer",
                                done
                                  ? "bg-slate-100 text-slate-400 line-through dark:bg-slate-800"
                                  : "bg-brand-soft/60 hover:bg-brand-soft text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                              )}
                              title={t.title}
                            >
                              {t.title}
                            </button>
                          );
                        })}
                        {dayTasks.length > 3 && (
                          <span className="text-[10px] text-slate-400 block text-center">
                            +{dayTasks.length - 3} việc nữa
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Personal Todos (1/3) */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Ghi chú cần làm cá nhân
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Chỉ mình bạn nhìn thấy ({completedTodosCount}/{todos.length} xong)
              </p>
            </div>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              <Check className="h-4 w-4" />
            </span>
          </div>

          {/* Add Todo Form */}
          <form onSubmit={handleAddTodo} className="flex gap-2">
            <input
              type="text"
              value={newTodoTitle}
              onChange={(e) => setNewTodoTitle(e.target.value)}
              placeholder="Thêm việc nhanh (nhấn Enter)..."
              disabled={addingTodo}
              className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-brand focus:bg-white dark:focus:bg-slate-900 focus:outline-none transition"
            />
            <button
              type="submit"
              disabled={!newTodoTitle.trim() || addingTodo}
              className="inline-flex items-center justify-center rounded-xl bg-brand hover:bg-brand-hover disabled:opacity-50 px-3 py-2 text-white transition cursor-pointer"
              title="Thêm"
            >
              <Plus className="h-4 w-4" />
            </button>
          </form>

          {/* Todos List */}
          <div className="space-y-1.5 max-h-[460px] overflow-y-auto pr-1">
            {todos.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">
                Chưa có ghi chú nào. Gõ việc cần làm và nhấn Enter.
              </p>
            ) : (
              todos.map((todo) => (
                <div
                  key={todo.id}
                  className="group flex items-center justify-between gap-2 rounded-xl p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition"
                >
                  <label className="flex items-center gap-2.5 min-w-0 cursor-pointer flex-1">
                    <input
                      type="checkbox"
                      checked={todo.is_done}
                      onChange={() => handleToggleTodo(todo)}
                      className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand accent-brand cursor-pointer"
                    />
                    <span
                      className={cn(
                        "truncate text-xs",
                        todo.is_done
                          ? "line-through text-slate-400 dark:text-slate-500"
                          : "text-slate-700 dark:text-slate-200"
                      )}
                    >
                      {todo.title}
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={() => handleDeleteTodo(todo.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition cursor-pointer"
                    title="Xóa"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
