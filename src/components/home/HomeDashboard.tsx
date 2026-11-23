"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn, formatDateVi, isOverdue, PRIORITY_CONFIG } from "@/lib/utils";
import type { PersonalTodo, Profile, Task } from "@/types/database";
import {
  AlertTriangle,
  ArrowRight,
  Calendar as CalendarIcon,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FolderKanban,
  ListTodo,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

interface HomeDashboardProps {
  profile: Profile;
  initialTasks: Task[];
  initialTodos: PersonalTodo[];
}

type TaskFilter = "all" | "open" | "overdue";
type MainView = "list" | "calendar";

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
}: HomeDashboardProps) {
  const router = useRouter();

  const [mainView, setMainView] = useState<MainView>("list");
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");

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

  // KPI calculations
  const stats = useMemo(() => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    let inProgress = 0;
    let overdue = 0;
    let completedThisWeek = 0;

    for (const t of initialTasks) {
      const isDone = t.status?.category === "done" || Boolean(t.completed_at);
      if (!isDone) {
        inProgress += 1;
        if (isOverdue(t.due_date, t.completed_at)) {
          overdue += 1;
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
      completedThisWeek,
      total: initialTasks.length,
    };
  }, [initialTasks]);

  // Filtered tasks for List view
  const filteredTasks = useMemo(() => {
    return initialTasks.filter((t) => {
      const isDone = t.status?.category === "done" || Boolean(t.completed_at);
      if (taskFilter === "open") return !isDone;
      if (taskFilter === "overdue") {
        return !isDone && isOverdue(t.due_date, t.completed_at);
      }
      return true;
    });
  }, [initialTasks, taskFilter]);

  // Tasks grouped by YYYY-MM-DD for Calendar view
  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of initialTasks) {
      const key = extractDateKey(t.due_date);
      if (!key) continue;
      const existing = map.get(key) ?? [];
      existing.push(t);
      map.set(key, existing);
    }
    return map;
  }, [initialTasks]);

  // Build calendar cells (Monday-first 6-week or 5-week grid)
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(calYear, calMonth, 1);
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    // Convert JS Sunday=0..Saturday=6 into Monday=0..Sunday=6
    const startOffset = (firstDayOfMonth.getDay() + 6) % 7;

    const cells: Array<{
      dateKey: string;
      dayNumber: number;
      inCurrentMonth: boolean;
    }> = [];

    // Previous month trailing days
    const prevMonthDays = new Date(calYear, calMonth, 0).getDate();
    const prevMonthDate = new Date(calYear, calMonth - 1, 1);
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      cells.push({
        dateKey: toDateKey(
          prevMonthDate.getFullYear(),
          prevMonthDate.getMonth(),
          d
        ),
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

    // Next month leading days to fill complete rows of 7
    const remaining = (7 - (cells.length % 7)) % 7;
    const nextMonthDate = new Date(calYear, calMonth + 1, 1);
    for (let d = 1; d <= remaining; d++) {
      cells.push({
        dateKey: toDateKey(
          nextMonthDate.getFullYear(),
          nextMonthDate.getMonth(),
          d
        ),
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
      // Revert on failure
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

      {/* 4 KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xs">
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
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Đang mở cần xử lý
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xs">
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
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Cần ưu tiên hoàn tất
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Hoàn thành tuần này
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-900 dark:text-slate-100">
            {stats.completedThisWeek}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Trong 7 ngày gần nhất
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Tổng việc được giao
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <ListTodo className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-900 dark:text-slate-100">
            {stats.total}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Trên tất cả dự án
          </p>
        </div>
      </div>

      {/* Main 2-column layout (2/3 left, 1/3 right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Main Column (2/3) */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs overflow-hidden">
          {/* Header with View Toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 dark:border-slate-800 px-5 py-4">
            <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 self-start">
              <button
                type="button"
                onClick={() => setMainView("list")}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition cursor-pointer",
                  mainView === "list"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                )}
              >
                <ListTodo className="h-4 w-4" />
                <span>Danh sách việc của tôi</span>
              </button>
              <button
                type="button"
                onClick={() => setMainView("calendar")}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition cursor-pointer",
                  mainView === "calendar"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                )}
              >
                <CalendarIcon className="h-4 w-4" />
                <span>Lịch công việc</span>
              </button>
            </div>

            {mainView === "list" && (
              <div className="flex items-center gap-1.5">
                {(
                  [
                    { key: "all", label: "Tất cả", count: stats.total },
                    { key: "open", label: "Chưa xong", count: stats.inProgress },
                    { key: "overdue", label: "Quá hạn", count: stats.overdue },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setTaskFilter(tab.key)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition cursor-pointer",
                      taskFilter === tab.key
                        ? "bg-brand text-white"
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
            )}

            {mainView === "calendar" && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 min-w-[130px] text-right">
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
            )}
          </div>

          {/* List View */}
          {mainView === "list" && (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredTasks.length === 0 ? (
                <div className="py-16 px-6 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {taskFilter === "overdue"
                      ? "Tuyệt vời! Bạn không có công việc nào quá hạn."
                      : taskFilter === "open"
                        ? "Bạn đã hoàn thành hết công việc được giao."
                        : "Chưa có công việc nào được giao cho bạn."}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Khám phá các dự án đang hoạt động để nhận hoặc tạo công việc mới.
                  </p>
                </div>
              ) : (
                filteredTasks.map((task) => {
                  const priorityCfg = PRIORITY_CONFIG[task.priority];
                  const isDone =
                    task.status?.category === "done" || Boolean(task.completed_at);
                  const overdue = !isDone && isOverdue(task.due_date, task.completed_at);

                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() =>
                        router.push(`/projects/${task.project_id}?task=${task.id}`)
                      }
                      className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition cursor-pointer"
                    >
                      <div className="min-w-0 space-y-1.5">
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
                                className="h-2 w-2 rounded-full"
                                style={{
                                  backgroundColor:
                                    task.project.color || "#F26522",
                                }}
                              />
                              <span className="truncate max-w-[160px]">
                                {task.project.name}
                              </span>
                            </span>
                          )}

                          {task.status && (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700 px-2.5 py-0.5 text-slate-700 dark:text-slate-300">
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ backgroundColor: task.status.color }}
                              />
                              {task.status.name}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
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
                              ? "text-red-600 dark:text-red-400"
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
                            "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
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
                          <span className="text-[10px] font-medium text-slate-400">
                            {dayTasks.length}
                          </span>
                        )}
                      </div>

                      <div className="space-y-1 flex-1 overflow-y-auto max-h-[76px]">
                        {dayTasks.map((t) => {
                          const isDone =
                            t.status?.category === "done" ||
                            Boolean(t.completed_at);
                          const overdue =
                            !isDone && isOverdue(t.due_date, t.completed_at);

                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() =>
                                router.push(
                                  `/projects/${t.project_id}?task=${t.id}`
                                )
                              }
                              title={`${t.title}${t.project ? ` (${t.project.name})` : ""}`}
                              className={cn(
                                "w-full truncate rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium transition cursor-pointer block",
                                isDone
                                  ? "bg-slate-100 dark:bg-slate-800 text-slate-400 line-through"
                                  : overdue
                                    ? "bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950"
                                    : "bg-brand-soft dark:bg-brand-soft-dark text-brand hover:opacity-90"
                              )}
                            >
                              {t.title}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Column (1/3): Personal Todos */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Việc cần làm cá nhân
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {completedTodosCount}/{todos.length} đã hoàn thành
              </p>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {/* Quick-add form */}
            <form onSubmit={handleAddTodo} className="flex items-center gap-2">
              <input
                type="text"
                value={newTodoTitle}
                onChange={(e) => setNewTodoTitle(e.target.value)}
                placeholder="Thêm việc nhanh... (Nhấn Enter)"
                className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-brand focus:bg-white dark:focus:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-brand/20 transition"
              />
              <button
                type="submit"
                disabled={!newTodoTitle.trim() || addingTodo}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand hover:bg-brand-hover disabled:opacity-50 text-white transition cursor-pointer"
                aria-label="Thêm việc cá nhân"
              >
                <Plus className="h-4 w-4" />
              </button>
            </form>

            {/* Todos list */}
            {todos.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                Chưa có ghi chú cá nhân nào. Thêm một việc nhỏ để bắt đầu ngày mới!
              </div>
            ) : (
              <ul className="space-y-1.5 max-h-[420px] overflow-y-auto pr-0.5">
                {todos.map((todo) => (
                  <li
                    key={todo.id}
                    className="group flex items-center justify-between gap-2.5 rounded-xl border border-transparent hover:border-slate-200 dark:hover:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 px-2.5 py-2 transition"
                  >
                    <button
                      type="button"
                      onClick={() => handleToggleTodo(todo)}
                      className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition",
                          todo.is_done
                            ? "border-brand bg-brand text-white"
                            : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950"
                        )}
                      >
                        {todo.is_done && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span
                        className={cn(
                          "text-sm break-words",
                          todo.is_done
                            ? "line-through text-slate-400 dark:text-slate-500"
                            : "text-slate-800 dark:text-slate-200"
                        )}
                      >
                        {todo.title}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteTodo(todo.id)}
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 rounded-lg p-1 text-slate-400 hover:bg-red-50 dark:hover:bg-red-950/50 hover:text-red-600 dark:hover:text-red-400 transition cursor-pointer"
                      aria-label="Xóa việc cần làm"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
