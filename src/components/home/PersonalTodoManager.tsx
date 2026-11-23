"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn, formatDateVi, isOverdue, PRIORITY_CONFIG } from "@/lib/utils";
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
  ArrowUpRight,
  Calendar as CalendarIcon,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  FolderKanban,
  ListTodo,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

export const TODO_CATEGORIES: Record<
  PersonalTodoCategory,
  { label: string; color: string; bg: string; dot: string }
> = {
  work: {
    label: "Công việc",
    color: "text-blue-700 dark:text-blue-300",
    bg: "bg-blue-50 border-blue-200 dark:bg-blue-950/50 dark:border-blue-800/60",
    dot: "#3B82F6",
  },
  followup: {
    label: "Follow-up",
    color: "text-amber-700 dark:text-amber-300",
    bg: "bg-amber-50 border-amber-200 dark:bg-amber-950/50 dark:border-amber-800/60",
    dot: "#F59E0B",
  },
  meeting: {
    label: "Lịch họp",
    color: "text-purple-700 dark:text-purple-300",
    bg: "bg-purple-50 border-purple-200 dark:bg-purple-950/50 dark:border-purple-800/60",
    dot: "#A855F7",
  },
  idea: {
    label: "Ý tưởng",
    color: "text-emerald-700 dark:text-emerald-300",
    bg: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/50 dark:border-emerald-800/60",
    dot: "#10B981",
  },
  personal: {
    label: "Cá nhân",
    color: "text-slate-700 dark:text-slate-300",
    bg: "bg-slate-100 border-slate-200 dark:bg-slate-800 dark:border-slate-700",
    dot: "#64748B",
  },
};

export function getTodoCategoryConfig(cat?: string | null) {
  const key = (cat || "work") as PersonalTodoCategory;
  return TODO_CATEGORIES[key] ?? TODO_CATEGORIES.work;
}

type TodoFilterTab = "open" | "today" | "overdue" | "done" | "all";
type TodoGroupBy = "none" | "category" | "priority" | "due";

interface PersonalTodoManagerProps {
  profile: Profile;
  todos: PersonalTodo[];
  setTodos: React.Dispatch<React.SetStateAction<PersonalTodo[]>>;
  projects: Array<{ id: string; name: string; code: string; color: string }>;
  allStatuses: TaskStatus[];
  todayKey: string;
  onTaskPromoted?: (newTask: Task) => void;
  onOpenTaskDrawer?: (taskId: string, projectId: string) => void;
}

function getRelativeDateKey(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function PersonalTodoManager({
  profile,
  todos,
  setTodos,
  projects,
  allStatuses,
  todayKey,
  onTaskPromoted,
  onOpenTaskDrawer,
}: PersonalTodoManagerProps) {
  const supabase = useMemo(() => createClient(), []);

  // Quick-add composer state
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [showNotesInput, setShowNotesInput] = useState(false);
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [category, setCategory] = useState<PersonalTodoCategory>("work");
  const [dueDate, setDueDate] = useState<string>("");
  const [adding, setAdding] = useState(false);

  // Filter & Group state
  const [filterTab, setFilterTab] = useState<TodoFilterTab>("open");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [groupBy, setGroupBy] = useState<TodoGroupBy>("none");
  const [searchQuery, setSearchQuery] = useState("");

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    title: string;
    notes: string;
    priority: TaskPriority;
    category: PersonalTodoCategory;
    due_date: string;
  }>({
    title: "",
    notes: "",
    priority: "medium",
    category: "work",
    due_date: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Expand notes toggle per item
  const [expandedNotesIds, setExpandedNotesIds] = useState<
    Record<string, boolean>
  >({});

  // Promote to Project Task modal state
  const [promotingTodo, setPromotingTodo] = useState<PersonalTodo | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    projects[0]?.id ?? ""
  );
  const [deleteAfterPromote, setDeleteAfterPromote] = useState(false);
  const [promoting, setPromoting] = useState(false);

  // Stats
  const todoStats = useMemo(() => {
    let open = 0;
    let dueToday = 0;
    let overdue = 0;
    let done = 0;

    for (const item of todos) {
      if (item.is_done) {
        done += 1;
      } else {
        open += 1;
        if (item.due_date === todayKey) {
          dueToday += 1;
        }
        if (item.due_date && item.due_date < todayKey) {
          overdue += 1;
        }
      }
    }

    return { open, dueToday, overdue, done, total: todos.length };
  }, [todos, todayKey]);

  // Filtered todos
  const filteredTodos = useMemo(() => {
    return todos.filter((item) => {
      const isItemOverdue =
        !item.is_done && Boolean(item.due_date && item.due_date < todayKey);
      const isItemToday = !item.is_done && item.due_date === todayKey;

      if (filterTab === "open" && item.is_done) return false;
      if (filterTab === "today" && !isItemToday) return false;
      if (filterTab === "overdue" && !isItemOverdue) return false;
      if (filterTab === "done" && !item.is_done) return false;

      const itemCat = item.category || "work";
      const itemPri = item.priority || "medium";

      if (categoryFilter !== "all" && itemCat !== categoryFilter) return false;
      if (priorityFilter !== "all" && itemPri !== priorityFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = item.title.toLowerCase().includes(q);
        const matchNotes = (item.notes || "").toLowerCase().includes(q);
        if (!matchTitle && !matchNotes) return false;
      }

      return true;
    });
  }, [
    todos,
    filterTab,
    categoryFilter,
    priorityFilter,
    searchQuery,
    todayKey,
  ]);

  // Grouped todos
  const groupedTodos = useMemo(() => {
    if (groupBy === "none") {
      return [
        {
          key: "all",
          label: "Danh sách việc cần làm",
          color: "#F47830",
          items: filteredTodos,
        },
      ];
    }

    const map = new Map<
      string,
      { key: string; label: string; color: string; items: PersonalTodo[] }
    >();

    for (const item of filteredTodos) {
      let key = "other";
      let label = "Khác";
      let color = "#94A3B8";

      if (groupBy === "category") {
        const catKey = (item.category || "work") as PersonalTodoCategory;
        const cfg = getTodoCategoryConfig(catKey);
        key = catKey;
        label = cfg.label;
        color = cfg.dot;
      } else if (groupBy === "priority") {
        const priKey = (item.priority || "medium") as TaskPriority;
        key = priKey;
        label = PRIORITY_CONFIG[priKey]?.label || priKey;
        color =
          priKey === "urgent"
            ? "#EF4444"
            : priKey === "high"
            ? "#F97316"
            : priKey === "medium"
            ? "#3B82F6"
            : "#94A3B8";
      } else if (groupBy === "due") {
        if (!item.due_date) {
          key = "no_due";
          label = "Chưa gắn hạn";
          color = "#94A3B8";
        } else if (!item.is_done && item.due_date < todayKey) {
          key = "overdue";
          label = "Quá hạn";
          color = "#EF4444";
        } else if (item.due_date === todayKey) {
          key = "today";
          label = "Hôm nay";
          color = "#F59E0B";
        } else {
          key = "upcoming";
          label = "Sắp tới";
          color = "#10B981";
        }
      }

      const existing = map.get(key) ?? { key, label, color, items: [] };
      existing.items.push(item);
      map.set(key, existing);
    }

    return Array.from(map.values());
  }, [filteredTodos, groupBy, todayKey]);

  async function handleAddTodo(e: React.FormEvent) {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle || adding) return;

    setAdding(true);
    try {
      const payload = {
        user_id: profile.id,
        title: cleanTitle,
        notes: notes.trim() || null,
        priority,
        category,
        due_date: dueDate || null,
        is_done: false,
        position: todos.length,
      };

      const { data, error } = await supabase
        .from("personal_todos")
        .insert(payload)
        .select("*")
        .single();

      if (error) throw error;

      setTodos((prev) => [data as PersonalTodo, ...prev]);
      setTitle("");
      setNotes("");
      setShowNotesInput(false);
      toast.success("Đã thêm vào Todo cá nhân!");
    } catch {
      toast.error("Không thể thêm việc cần làm.");
    } finally {
      setAdding(false);
    }
  }

  async function handleToggleDone(todo: PersonalTodo) {
    const nextDone = !todo.is_done;
    setTodos((prev) =>
      prev.map((item) =>
        item.id === todo.id ? { ...item, is_done: nextDone } : item
      )
    );

    try {
      const { error } = await supabase
        .from("personal_todos")
        .update({ is_done: nextDone, updated_at: new Date().toISOString() })
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

  function startEditing(todo: PersonalTodo) {
    setEditingId(todo.id);
    setEditDraft({
      title: todo.title,
      notes: todo.notes || "",
      priority: (todo.priority as TaskPriority) || "medium",
      category: (todo.category as PersonalTodoCategory) || "work",
      due_date: todo.due_date ? todo.due_date.slice(0, 10) : "",
    });
  }

  async function handleSaveEdit(todoId: string) {
    const cleanTitle = editDraft.title.trim();
    if (!cleanTitle || savingEdit) return;

    setSavingEdit(true);
    const patch = {
      title: cleanTitle,
      notes: editDraft.notes.trim() || null,
      priority: editDraft.priority,
      category: editDraft.category,
      due_date: editDraft.due_date || null,
      updated_at: new Date().toISOString(),
    };

    const backup = todos;
    setTodos((prev) =>
      prev.map((item) => (item.id === todoId ? { ...item, ...patch } : item))
    );
    setEditingId(null);

    try {
      const { error } = await supabase
        .from("personal_todos")
        .update(patch)
        .eq("id", todoId);
      if (error) throw error;
      toast.success("Đã lưu thay đổi!");
    } catch {
      setTodos(backup);
      toast.error("Không thể cập nhật mục này.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleQuickPriorityChange(
    todo: PersonalTodo,
    nextPriority: TaskPriority
  ) {
    setTodos((prev) =>
      prev.map((item) =>
        item.id === todo.id ? { ...item, priority: nextPriority } : item
      )
    );
    const { error } = await supabase
      .from("personal_todos")
      .update({
        priority: nextPriority,
        updated_at: new Date().toISOString(),
      })
      .eq("id", todo.id);
    if (error) {
      toast.error("Không thể đổi độ ưu tiên.");
    }
  }

  async function handleDeleteTodo(todoId: string) {
    const backup = todos;
    setTodos((prev) => prev.filter((item) => item.id !== todoId));

    try {
      const { error } = await supabase
        .from("personal_todos")
        .delete()
        .eq("id", todoId);
      if (error) throw error;
      toast.success("Đã xóa mục Todo.");
    } catch {
      setTodos(backup);
      toast.error("Không thể xóa mục này.");
    }
  }

  async function handleClearCompleted() {
    const completedIds = todos.filter((t) => t.is_done).map((t) => t.id);
    if (completedIds.length === 0) return;

    const backup = todos;
    setTodos((prev) => prev.filter((t) => !t.is_done));

    try {
      const { error } = await supabase
        .from("personal_todos")
        .delete()
        .in("id", completedIds);
      if (error) throw error;
      toast.success(`Đã dọn ${completedIds.length} mục hoàn thành.`);
    } catch {
      setTodos(backup);
      toast.error("Không thể dọn các mục đã hoàn thành.");
    }
  }

  async function handlePromoteToProjectTask(e: React.FormEvent) {
    e.preventDefault();
    if (!promotingTodo || !selectedProjectId || promoting) return;

    setPromoting(true);
    try {
      const projectStatuses = allStatuses
        .filter((s) => s.project_id === selectedProjectId)
        .sort((a, b) => a.position - b.position);
      const defaultStatus =
        projectStatuses.find((s) => s.category === "todo") ??
        projectStatuses[0] ??
        null;

      const { data: createdTask, error: taskErr } = await supabase
        .from("tasks")
        .insert({
          project_id: selectedProjectId,
          status_id: defaultStatus?.id ?? null,
          title: promotingTodo.title,
          description: promotingTodo.notes || null,
          priority: (promotingTodo.priority as TaskPriority) || "medium",
          due_date: promotingTodo.due_date || null,
          created_by: profile.id,
          position: 0,
        })
        .select("*")
        .single();

      if (taskErr) throw taskErr;

      // Auto-assign to current user so it appears in "Việc của tôi"
      await supabase.from("task_assignees").insert({
        task_id: createdTask.id,
        user_id: profile.id,
        assigned_by: profile.id,
      });

      const targetProject =
        projects.find((p) => p.id === selectedProjectId) ?? null;

      const enrichedTask: Task = {
        ...(createdTask as Task),
        status: defaultStatus,
        project: targetProject,
        assignees: [profile],
      };

      if (deleteAfterPromote) {
        await supabase
          .from("personal_todos")
          .delete()
          .eq("id", promotingTodo.id);
        setTodos((prev) => prev.filter((item) => item.id !== promotingTodo.id));
      } else {
        await supabase
          .from("personal_todos")
          .update({
            promoted_task_id: createdTask.id,
            is_done: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", promotingTodo.id);
        setTodos((prev) =>
          prev.map((item) =>
            item.id === promotingTodo.id
              ? {
                  ...item,
                  promoted_task_id: createdTask.id,
                  is_done: true,
                }
              : item
          )
        );
      }

      onTaskPromoted?.(enrichedTask);
      setPromotingTodo(null);
      toast.success(
        `Đã chuyển thành công việc trong dự án ${targetProject?.name ?? ""}!`
      );
    } catch {
      toast.error("Không thể chuyển Todo thành công việc dự án.");
    } finally {
      setPromoting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* 4 Mini Summary KPI Cards for Personal Todo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => setFilterTab("open")}
          className={cn(
            "flex items-center justify-between rounded-[8px] border px-3.5 py-2.5 text-left transition cursor-pointer",
            filterTab === "open"
              ? "border-brand bg-brand-soft/30 dark:bg-brand-soft-dark/25"
              : "border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] hover:border-brand/40"
          )}
        >
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Cần làm
            </p>
            <p className="mt-0.5 font-mono text-xl font-bold text-slate-900 dark:text-slate-100">
              {todoStats.open}
            </p>
          </div>
          <span className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-brand-soft dark:bg-brand-soft-dark text-brand">
            <ListTodo className="h-3.5 w-3.5" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => setFilterTab("today")}
          className={cn(
            "flex items-center justify-between rounded-[8px] border px-3.5 py-2.5 text-left transition cursor-pointer",
            filterTab === "today"
              ? "border-amber-500 bg-amber-50/40 dark:bg-amber-950/30"
              : "border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] hover:border-amber-400/50"
          )}
        >
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Hạn hôm nay
            </p>
            <p className="mt-0.5 font-mono text-xl font-bold text-amber-600 dark:text-amber-400">
              {todoStats.dueToday}
            </p>
          </div>
          <span className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
            <CalendarIcon className="h-3.5 w-3.5" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => setFilterTab("overdue")}
          className={cn(
            "flex items-center justify-between rounded-[8px] border px-3.5 py-2.5 text-left transition cursor-pointer",
            filterTab === "overdue"
              ? "border-red-500 bg-red-50/40 dark:bg-red-950/30"
              : "border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] hover:border-red-400/50"
          )}
        >
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Quá hạn
            </p>
            <p
              className={cn(
                "mt-0.5 font-mono text-xl font-bold",
                todoStats.overdue > 0
                  ? "text-red-600 dark:text-red-400"
                  : "text-slate-900 dark:text-slate-100"
              )}
            >
              {todoStats.overdue}
            </p>
          </div>
          <span className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400">
            <AlertTriangle className="h-3.5 w-3.5" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => setFilterTab("done")}
          className={cn(
            "flex items-center justify-between rounded-[8px] border px-3.5 py-2.5 text-left transition cursor-pointer",
            filterTab === "done"
              ? "border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/30"
              : "border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] hover:border-emerald-400/50"
          )}
        >
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Đã xong
            </p>
            <p className="mt-0.5 font-mono text-xl font-bold text-emerald-600 dark:text-emerald-400">
              {todoStats.done}
            </p>
          </div>
          <span className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
          </span>
        </button>
      </div>

      {/* Rich GTD Quick-Add Composer Box */}
      <form
        onSubmit={handleAddTodo}
        className="rounded-[8px] border border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] p-4 space-y-3"
      >
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nhập việc cá nhân cần làm (VD: Gọi đối tác in ấn, chuẩn bị slide họp)..."
            disabled={adding}
            className="flex-1 rounded-[6px] border border-[#d9d9d9] dark:border-[#3a3a3a] bg-[#fafafa] dark:bg-[#141414] px-3 py-2 text-[13px] text-slate-900 dark:text-slate-100 focus:border-brand focus:bg-white dark:focus:bg-[#181818] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!title.trim() || adding}
            className="inline-flex items-center justify-center gap-1.5 rounded-[6px] bg-brand hover:bg-brand-hover disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white transition cursor-pointer shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Thêm việc</span>
          </button>
        </div>

        {/* Metadata Bar: Category, Priority, Due Date + Quick Date Chips + Note Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            {/* Category Selector */}
            <div className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#d9d9d9] dark:border-[#3a3a3a] bg-[#fafafa] dark:bg-[#181818] px-2 py-1">
              <Tag className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as PersonalTodoCategory)
                }
                className="bg-transparent text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
              >
                {(
                  Object.entries(TODO_CATEGORIES) as Array<
                    [PersonalTodoCategory, (typeof TODO_CATEGORIES)["work"]]
                  >
                ).map(([key, cfg]) => (
                  <option
                    key={key}
                    value={key}
                    className="bg-white dark:bg-[#1f1f1f]"
                  >
                    {cfg.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority Selector */}
            <div className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#d9d9d9] dark:border-[#3a3a3a] bg-[#fafafa] dark:bg-[#181818] px-2 py-1">
              <span className="text-[11px] text-slate-400">Ưu tiên:</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="bg-transparent text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="low" className="bg-white dark:bg-[#1f1f1f]">
                  Thấp
                </option>
                <option value="medium" className="bg-white dark:bg-[#1f1f1f]">
                  Trung bình
                </option>
                <option value="high" className="bg-white dark:bg-[#1f1f1f]">
                  Cao
                </option>
                <option value="urgent" className="bg-white dark:bg-[#1f1f1f]">
                  Khẩn cấp
                </option>
              </select>
            </div>

            {/* Deadline Date Picker + Quick Preset Buttons */}
            <div className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#d9d9d9] dark:border-[#3a3a3a] bg-[#fafafa] dark:bg-[#181818] px-2 py-1">
              <CalendarIcon className="h-3.5 w-3.5 text-slate-400" />
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="bg-transparent text-xs font-mono text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
              />
              {dueDate && (
                <button
                  type="button"
                  onClick={() => setDueDate("")}
                  title="Bỏ hạn"
                  className="text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => setDueDate(todayKey)}
                className={cn(
                  "rounded-[5px] px-2 py-1 text-[11px] font-medium transition cursor-pointer",
                  dueDate === todayKey
                    ? "bg-brand text-white"
                    : "bg-slate-100 dark:bg-[#2a2a2a] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#333]"
                )}
              >
                Hôm nay
              </button>
              <button
                type="button"
                onClick={() => setDueDate(getRelativeDateKey(1))}
                className={cn(
                  "rounded-[5px] px-2 py-1 text-[11px] font-medium transition cursor-pointer",
                  dueDate === getRelativeDateKey(1)
                    ? "bg-brand text-white"
                    : "bg-slate-100 dark:bg-[#2a2a2a] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#333]"
                )}
              >
                Ngày mai
              </button>
            </div>
          </div>

          {/* Toggle Notes Input */}
          <button
            type="button"
            onClick={() => setShowNotesInput((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[6px] border px-2.5 py-1 text-xs font-medium transition cursor-pointer",
              showNotesInput || notes.trim()
                ? "border-brand text-brand bg-brand-soft/30 dark:bg-brand-soft-dark/20"
                : "border-[#d9d9d9] dark:border-[#3a3a3a] text-slate-600 dark:text-slate-300 hover:border-brand"
            )}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>{showNotesInput ? "Ẩn ghi chú" : "+ Thêm ghi chú"}</span>
          </button>
        </div>

        {/* Expandable Notes Textarea */}
        {showNotesInput && (
          <div>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ghi chú chi tiết, đường dẫn tài liệu, số điện thoại liên hệ hoặc các ý nhỏ..."
              className="w-full rounded-[6px] border border-[#d9d9d9] dark:border-[#3a3a3a] bg-[#fafafa] dark:bg-[#141414] px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:border-brand focus:bg-white dark:focus:bg-[#181818] focus:outline-none"
            />
          </div>
        )}
      </form>

      {/* Main Todo Table Card with Filter Toolbar */}
      <div className="rounded-[8px] border border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e8e8e8] dark:border-[#303030] bg-[#fafafa] dark:bg-[#181818] px-3.5 py-2">
          {/* Left: Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1">
            {(
              [
                { key: "open", label: "Cần làm", count: todoStats.open },
                { key: "today", label: "Hôm nay", count: todoStats.dueToday },
                { key: "overdue", label: "Quá hạn", count: todoStats.overdue },
                { key: "done", label: "Đã xong", count: todoStats.done },
                { key: "all", label: "Tất cả", count: todoStats.total },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilterTab(tab.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-xs font-medium transition cursor-pointer",
                  filterTab === tab.key
                    ? "bg-brand text-white font-semibold"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-[#2a2a2a]"
                )}
              >
                <span>{tab.label}</span>
                <span
                  className={cn(
                    "rounded px-1 text-[10px]",
                    filterTab === tab.key
                      ? "bg-white/20 text-white"
                      : "bg-slate-200/80 dark:bg-[#2c2c2c] text-slate-600 dark:text-slate-400"
                  )}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Right: Group By + Category Filter + Priority Filter + Search + Clear Completed */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 text-xs text-slate-500">
              <span>Nhóm:</span>
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as TodoGroupBy)}
                className="rounded-[6px] border border-[#d9d9d9] dark:border-[#3a3a3a] bg-white dark:bg-[#1f1f1f] px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 focus:border-brand focus:outline-none cursor-pointer"
              >
                <option value="none">Không nhóm</option>
                <option value="category">Theo Phân loại</option>
                <option value="priority">Theo Độ ưu tiên</option>
                <option value="due">Theo Thời hạn</option>
              </select>
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-[6px] border border-[#d9d9d9] dark:border-[#3a3a3a] bg-white dark:bg-[#1f1f1f] px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 focus:border-brand focus:outline-none cursor-pointer"
            >
              <option value="all">Mọi phân loại</option>
              {(
                Object.entries(TODO_CATEGORIES) as Array<
                  [PersonalTodoCategory, (typeof TODO_CATEGORIES)["work"]]
                >
              ).map(([key, cfg]) => (
                <option key={key} value={key}>
                  {cfg.label}
                </option>
              ))}
            </select>

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
                placeholder="Tìm tiêu đề, ghi chú..."
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

            {todoStats.done > 0 && (
              <button
                type="button"
                onClick={handleClearCompleted}
                className="inline-flex items-center gap-1 rounded-[6px] border border-red-200 dark:border-red-900/50 bg-red-50/60 dark:bg-red-950/30 hover:bg-red-100/70 px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 transition cursor-pointer"
                title="Xóa tất cả các mục đã đánh dấu hoàn thành"
              >
                <Trash2 className="h-3 w-3" />
                <span>Dọn mục đã xong ({todoStats.done})</span>
              </button>
            )}
          </div>
        </div>

        {/* Todo Items List */}
        {filteredTodos.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <ListTodo className="mx-auto h-7 w-7 text-slate-300 dark:text-slate-600" />
            <p className="mt-2 text-[13px] font-semibold text-slate-700 dark:text-slate-200">
              Không có mục Todo cá nhân nào trong bộ lọc này.
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              Sử dụng khung nhập nhanh phía trên để ghi chú công việc, gắn hạn,
              phân loại và ghi chú chi tiết.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#f0f0f0] dark:divide-[#2a2a2a]">
            {groupedTodos.map((group) => (
              <div key={group.key}>
                {groupBy !== "none" && (
                  <div className="flex items-center gap-2 bg-[#fafafa]/80 dark:bg-[#191919] px-4 py-1.5 border-b border-[#f0f0f0] dark:border-[#252525]">
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
                )}

                <div className="divide-y divide-[#f3f3f3] dark:divide-[#252525]">
                  {group.items.map((todo) => {
                    const isEditing = editingId === todo.id;
                    const catCfg = getTodoCategoryConfig(todo.category);
                    const priKey = (todo.priority || "medium") as TaskPriority;
                    const priCfg = PRIORITY_CONFIG[priKey];
                    const itemOverdue =
                      !todo.is_done &&
                      Boolean(todo.due_date && todo.due_date < todayKey);
                    const itemDueToday =
                      !todo.is_done && todo.due_date === todayKey;
                    const hasNotes = Boolean(todo.notes && todo.notes.trim());
                    const isNotesOpen =
                      expandedNotesIds[todo.id] !== undefined
                        ? expandedNotesIds[todo.id]
                        : hasNotes;

                    if (isEditing) {
                      return (
                        <div
                          key={todo.id}
                          className="p-3.5 bg-brand-soft/20 dark:bg-brand-soft-dark/15 space-y-2.5"
                        >
                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              type="text"
                              value={editDraft.title}
                              onChange={(e) =>
                                setEditDraft((prev) => ({
                                  ...prev,
                                  title: e.target.value,
                                }))
                              }
                              placeholder="Tiêu đề việc cần làm..."
                              autoFocus
                              className="flex-1 rounded-[6px] border border-brand bg-white dark:bg-[#141414] px-3 py-1.5 text-[13px] font-medium text-slate-900 dark:text-slate-100 focus:outline-none"
                            />
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleSaveEdit(todo.id)}
                                disabled={!editDraft.title.trim() || savingEdit}
                                className="inline-flex items-center gap-1 rounded-[6px] bg-brand hover:bg-brand-hover px-3 py-1.5 text-xs font-semibold text-white transition cursor-pointer"
                              >
                                <Check className="h-3.5 w-3.5" />
                                <span>Lưu</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="inline-flex items-center gap-1 rounded-[6px] border border-[#d9d9d9] dark:border-[#3a3a3a] bg-white dark:bg-[#1f1f1f] px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 cursor-pointer"
                              >
                                <X className="h-3.5 w-3.5" />
                                <span>Hủy</span>
                              </button>
                            </div>
                          </div>

                          <textarea
                            rows={2}
                            value={editDraft.notes}
                            onChange={(e) =>
                              setEditDraft((prev) => ({
                                ...prev,
                                notes: e.target.value,
                              }))
                            }
                            placeholder="Ghi chú chi tiết, link tài liệu, checklist nhỏ..."
                            className="w-full rounded-[6px] border border-[#d9d9d9] dark:border-[#3a3a3a] bg-white dark:bg-[#141414] px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:border-brand focus:outline-none"
                          />

                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              value={editDraft.category}
                              onChange={(e) =>
                                setEditDraft((prev) => ({
                                  ...prev,
                                  category: e.target
                                    .value as PersonalTodoCategory,
                                }))
                              }
                              className="rounded-[6px] border border-[#d9d9d9] dark:border-[#3a3a3a] bg-white dark:bg-[#1f1f1f] px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200"
                            >
                              {(
                                Object.entries(TODO_CATEGORIES) as Array<
                                  [
                                    PersonalTodoCategory,
                                    (typeof TODO_CATEGORIES)["work"]
                                  ]
                                >
                              ).map(([k, cfg]) => (
                                <option key={k} value={k}>
                                  {cfg.label}
                                </option>
                              ))}
                            </select>

                            <select
                              value={editDraft.priority}
                              onChange={(e) =>
                                setEditDraft((prev) => ({
                                  ...prev,
                                  priority: e.target.value as TaskPriority,
                                }))
                              }
                              className="rounded-[6px] border border-[#d9d9d9] dark:border-[#3a3a3a] bg-white dark:bg-[#1f1f1f] px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200"
                            >
                              <option value="low">Ưu tiên: Thấp</option>
                              <option value="medium">
                                Ưu tiên: Trung bình
                              </option>
                              <option value="high">Ưu tiên: Cao</option>
                              <option value="urgent">Ưu tiên: Khẩn cấp</option>
                            </select>

                            <input
                              type="date"
                              value={editDraft.due_date}
                              onChange={(e) =>
                                setEditDraft((prev) => ({
                                  ...prev,
                                  due_date: e.target.value,
                                }))
                              }
                              className="rounded-[6px] border border-[#d9d9d9] dark:border-[#3a3a3a] bg-white dark:bg-[#1f1f1f] px-2.5 py-1 text-xs font-mono text-slate-700 dark:text-slate-200"
                            />
                            {editDraft.due_date && (
                              <button
                                type="button"
                                onClick={() =>
                                  setEditDraft((prev) => ({
                                    ...prev,
                                    due_date: "",
                                  }))
                                }
                                className="text-xs text-slate-400 hover:text-red-500 cursor-pointer"
                              >
                                Xóa hạn
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={todo.id}
                        className="group px-4 py-2.5 hover:bg-[#f8f9fa] dark:hover:bg-[#242424] transition"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          {/* Left: Checkbox + Title + Badges */}
                          <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
                            <input
                              type="checkbox"
                              checked={todo.is_done}
                              onChange={() => handleToggleDone(todo)}
                              className="mt-0.5 sm:mt-0 h-4 w-4 rounded border-slate-300 text-brand accent-brand cursor-pointer shrink-0"
                            />

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  onClick={() => startEditing(todo)}
                                  title="Nhấn để sửa nhanh"
                                  className={cn(
                                    "text-[13px] font-medium cursor-pointer hover:text-brand transition",
                                    todo.is_done
                                      ? "line-through text-slate-400 dark:text-slate-500"
                                      : "text-slate-900 dark:text-slate-100"
                                  )}
                                >
                                  {todo.title}
                                </span>

                                {/* Category Badge */}
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-0.5 text-[10.5px] font-medium",
                                    catCfg.bg,
                                    catCfg.color
                                  )}
                                >
                                  <span
                                    className="h-1.5 w-1.5 rounded-full"
                                    style={{ backgroundColor: catCfg.dot }}
                                  />
                                  {catCfg.label}
                                </span>

                                {/* Notes toggle indicator if notes exist */}
                                {hasNotes && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedNotesIds((prev) => ({
                                        ...prev,
                                        [todo.id]: !isNotesOpen,
                                      }))
                                    }
                                    className="inline-flex items-center gap-1 rounded-[4px] bg-slate-100 dark:bg-[#2c2c2c] px-1.5 py-0.5 text-[10.5px] text-slate-600 dark:text-slate-300 hover:text-brand cursor-pointer"
                                  >
                                    <FileText className="h-3 w-3" />
                                    <span>Ghi chú</span>
                                    {isNotesOpen ? (
                                      <ChevronDown className="h-3 w-3" />
                                    ) : (
                                      <ChevronRight className="h-3 w-3" />
                                    )}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Right: Inline Priority + Due Date + Action Buttons */}
                          <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
                            {/* Inline Priority Select */}
                            <select
                              value={priKey}
                              onChange={(e) =>
                                handleQuickPriorityChange(
                                  todo,
                                  e.target.value as TaskPriority
                                )
                              }
                              className={cn(
                                "rounded-[4px] border px-1.5 py-0.5 text-[11px] font-medium focus:outline-none cursor-pointer",
                                priCfg.bg,
                                priCfg.color
                              )}
                            >
                              <option value="low">Thấp</option>
                              <option value="medium">TB</option>
                              <option value="high">Cao</option>
                              <option value="urgent">Khẩn</option>
                            </select>

                            {/* Due Date Badge */}
                            {todo.due_date ? (
                              <button
                                type="button"
                                onClick={() => startEditing(todo)}
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-[4px] px-2 py-0.5 font-mono text-[11px] font-medium cursor-pointer",
                                  itemOverdue
                                    ? "bg-red-50 text-red-600 border border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-900"
                                    : itemDueToday
                                    ? "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900"
                                    : "bg-slate-100 text-slate-600 dark:bg-[#2a2a2a] dark:text-slate-300"
                                )}
                                title="Nhấn để đổi hạn hoàn thành"
                              >
                                <CalendarIcon className="h-3 w-3" />
                                <span>
                                  {itemDueToday
                                    ? "Hôm nay"
                                    : formatDateVi(todo.due_date)}
                                </span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => startEditing(todo)}
                                className="inline-flex items-center gap-1 rounded-[4px] border border-dashed border-slate-300 dark:border-slate-700 px-2 py-0.5 text-[11px] text-slate-400 hover:border-brand hover:text-brand cursor-pointer"
                              >
                                <CalendarIcon className="h-3 w-3" />
                                <span>+ Gắn hạn</span>
                              </button>
                            )}

                            {/* Action Buttons: Always accessible & clear */}
                            <div className="inline-flex items-center gap-1 border-l border-[#e8e8e8] dark:border-[#303030] pl-2">
                              <button
                                type="button"
                                onClick={() => startEditing(todo)}
                                title="Sửa nội dung & ghi chú"
                                className="rounded-[5px] p-1 text-slate-400 hover:bg-slate-200/70 dark:hover:bg-[#333] hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>

                              {projects.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPromotingTodo(todo);
                                    if (
                                      !selectedProjectId &&
                                      projects.length > 0
                                    ) {
                                      setSelectedProjectId(projects[0].id);
                                    }
                                  }}
                                  title="Chuyển thành Công việc trong Dự án"
                                  className="rounded-[5px] p-1 text-slate-400 hover:bg-brand-soft/60 hover:text-brand transition cursor-pointer"
                                >
                                  <ArrowUpRight className="h-3.5 w-3.5" />
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleDeleteTodo(todo.id)}
                                title="Xóa mục này"
                                className="rounded-[5px] p-1 text-slate-400 hover:bg-red-50 dark:hover:bg-red-950/50 hover:text-red-600 transition cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Expandable Notes Box */}
                        {hasNotes && isNotesOpen && (
                          <div
                            onClick={() => startEditing(todo)}
                            className="mt-1.5 ml-6.5 rounded-[6px] border border-[#ebebeb] dark:border-[#2e2e2e] bg-[#fafafa] dark:bg-[#181818] px-3 py-2 text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap cursor-pointer hover:border-brand/50 transition"
                            title="Nhấn để sửa ghi chú"
                          >
                            {todo.notes}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal: Promote Personal Todo to Official Project Task */}
      {promotingTodo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-[10px] border border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#e8e8e8] dark:border-[#303030] pb-3">
              <div className="flex items-center gap-2">
                <FolderKanban className="h-4 w-4 text-brand" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Chuyển Todo thành Công việc Dự án
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPromotingTodo(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handlePromoteToProjectTask} className="space-y-3.5">
              <div className="rounded-[6px] bg-[#fafafa] dark:bg-[#161616] border border-[#e8e8e8] dark:border-[#2c2c2c] p-3 space-y-1">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {promotingTodo.title}
                </p>
                {promotingTodo.notes && (
                  <p className="text-[11px] text-slate-500 line-clamp-2">
                    {promotingTodo.notes}
                  </p>
                )}
                <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-400">
                  <span>
                    Ưu tiên:{" "}
                    {
                      PRIORITY_CONFIG[
                        (promotingTodo.priority as TaskPriority) || "medium"
                      ]?.label
                    }
                  </span>
                  {promotingTodo.due_date && (
                    <span>• Hạn: {formatDateVi(promotingTodo.due_date)}</span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Chọn Dự án đích
                </label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  required
                  className="w-full rounded-[6px] border border-[#d9d9d9] dark:border-[#3a3a3a] bg-white dark:bg-[#141414] px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 focus:border-brand focus:outline-none"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.code}] {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteAfterPromote}
                  onChange={(e) => setDeleteAfterPromote(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-brand accent-brand"
                />
                <span>Xóa luôn khỏi danh sách Todo cá nhân sau khi chuyển</span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e8e8e8] dark:border-[#303030]">
                <button
                  type="button"
                  onClick={() => setPromotingTodo(null)}
                  className="rounded-[6px] border border-[#d9d9d9] dark:border-[#3a3a3a] px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={!selectedProjectId || promoting}
                  className="inline-flex items-center gap-1.5 rounded-[6px] bg-brand hover:bg-brand-hover disabled:opacity-50 px-4 py-1.5 text-xs font-semibold text-white transition cursor-pointer"
                >
                  <ArrowUpRight className="h-3.5 w-3.5" />
                  <span>
                    {promoting ? "Đang chuyển..." : "Tạo Công việc Dự án"}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
