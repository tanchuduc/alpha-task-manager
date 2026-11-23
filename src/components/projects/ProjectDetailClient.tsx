"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  Plus,
  Users,
  List,
  Kanban,
  Calendar as CalendarIcon,
  CheckCircle2,
  Circle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Search,
  CheckSquare,
  X,
  UserPlus,
  UserMinus,
  Loader2,
  GripVertical,
  MessageSquare,
  Sliders,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { ProjectUpdatesTab } from "./ProjectUpdatesTab";
import BulkActionBar from "@/components/projects/BulkActionBar";
import CustomFieldsManagerModal from "@/components/projects/CustomFieldsManagerModal";
import {
  cn,
  PRIORITY_CONFIG,
  getInitials,
  formatDateVi,
  isOverdue,
} from "@/lib/utils";
import TaskDrawer from "@/components/tasks/TaskDrawer";
import type {
  Profile,
  Project,
  ProjectMember,
  ProjectStatus,
  Task,
  TaskPriority,
  TaskStatus,
} from "@/types/database";

interface ProjectDetailClientProps {
  initialProject: Project;
  initialStatuses: TaskStatus[];
  initialTasks: Task[];
  initialMembers: ProjectMember[];
  allProfiles: Profile[];
  currentUser: Profile;
}

type ViewMode = "list" | "kanban" | "calendar" | "updates";

const WEEKDAYS_VI = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function formatYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/* ============================================================================
 * Kanban Draggable Card & Droppable Column
 * ========================================================================== */

function KanbanCardContent({
  task,
  isOverlay = false,
}: {
  task: Task;
  isOverlay?: boolean;
}) {
  const pCfg = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.medium;
  const overdue = isOverdue(task.due_date, task.completed_at);

  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs transition dark:border-slate-800 dark:bg-slate-900",
        isOverlay
          ? "rotate-1 shadow-xl ring-2 ring-brand/50"
          : "hover:border-brand/50 hover:shadow-sm"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
            pCfg.bg,
            pCfg.color
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", pCfg.dot)} />
          {pCfg.label}
        </span>
        <GripVertical className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
      </div>

      <p
        className={cn(
          "mt-2 text-sm font-medium leading-snug text-slate-900 dark:text-slate-100",
          task.completed_at && "text-slate-400 line-through"
        )}
      >
        {task.title}
      </p>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          {task.due_date && (
            <span
              className={cn(
                "inline-flex items-center gap-1",
                overdue && "font-semibold text-red-600 dark:text-red-400"
              )}
            >
              <CalendarIcon className="h-3 w-3" />
              {formatDateVi(task.due_date)}
            </span>
          )}
          {(task.subtasks_count ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1">
              <CheckSquare className="h-3 w-3" />
              {task.subtasks_done ?? 0}/{task.subtasks_count}
            </span>
          )}
        </div>

        {task.assignees && task.assignees.length > 0 && (
          <div className="flex -space-x-1.5">
            {task.assignees.slice(0, 3).map((a) => (
              <span
                key={a.id}
                title={a.full_name}
                className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-brand-soft text-[10px] font-bold text-brand dark:border-slate-900 dark:bg-brand/25"
              >
                {getInitials(a.full_name)}
              </span>
            ))}
            {task.assignees.length > 3 && (
              <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-[10px] font-semibold text-slate-600 dark:border-slate-900 dark:bg-slate-700 dark:text-slate-300">
                +{task.assignees.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DraggableKanbanCard({
  task,
  onOpen,
}: {
  task: Task;
  onOpen: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: task.id,
      data: { task },
    });

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => onOpen(task.id)}
      className={cn(
        "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-35"
      )}
    >
      <KanbanCardContent task={task} />
    </div>
  );
}

function DroppableKanbanColumn({
  status,
  tasks,
  onOpenTask,
  onQuickAdd,
}: {
  status: TaskStatus;
  tasks: Task[];
  onOpenTask: (id: string) => void;
  onQuickAdd: (statusId: string, title: string) => Promise<void>;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: status.id,
  });
  const [quickTitle, setQuickTitle] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = quickTitle.trim();
    if (!trimmed) return;
    setAdding(true);
    try {
      await onQuickAdd(status.id, trimmed);
      setQuickTitle("");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-80 shrink-0 flex-col rounded-2xl border bg-slate-50/90 p-3 transition dark:bg-slate-900/60",
        isOver
          ? "border-brand bg-brand-soft/40 dark:border-brand dark:bg-brand/10"
          : "border-slate-200 dark:border-slate-800"
      )}
    >
      {/* Column Header */}
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: status.color || "#94A3B8" }}
          />
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {status.name}
          </h3>
        </div>
        <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {tasks.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto pb-2 min-h-[120px]">
        {tasks.map((task) => (
          <DraggableKanbanCard
            key={task.id}
            task={task}
            onOpen={onOpenTask}
          />
        ))}
      </div>

      {/* Quick add card */}
      <form onSubmit={handleSubmit} className="mt-2">
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            placeholder="+ Thêm thẻ công việc..."
            disabled={adding}
            className="w-full rounded-lg border border-transparent bg-white/80 px-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-brand focus:bg-white focus:outline-none dark:bg-slate-800/80 dark:text-slate-100 dark:focus:bg-slate-800"
          />
          {quickTitle.trim() && (
            <button
              type="submit"
              disabled={adding}
              className="rounded-lg bg-brand px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-hover cursor-pointer"
            >
              Thêm
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

/* ============================================================================
 * Main ProjectDetailClient
 * ========================================================================== */

export default function ProjectDetailClient({
  initialProject,
  initialStatuses,
  initialTasks,
  initialMembers,
  allProfiles,
  currentUser,
}: ProjectDetailClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const [project, setProject] = useState<Project>(initialProject);
  const [statuses] = useState<TaskStatus[]>(initialStatuses);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [members, setMembers] = useState<ProjectMember[]>(initialMembers);

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return searchParams.get("tab") === "updates" ? "updates" : "list";
  });

  useEffect(() => {
    if (searchParams.get("tab") === "updates") {
      setViewMode("updates");
    }
  }, [searchParams]);
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<"all" | TaskPriority>(
    "all"
  );
  const [collapsedStatusIds, setCollapsedStatusIds] = useState<
    Record<string, boolean>
  >({});

  // Quick-add per status in List view
  const [listQuickAdd, setListQuickAdd] = useState<Record<string, string>>({});

  // Task drawer state synced with ?task=<id>
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(() =>
    searchParams.get("task")
  );

  useEffect(() => {
    const paramTask = searchParams.get("task");
    if (paramTask) {
      setSelectedTaskId(paramTask);
    }
  }, [searchParams]);

  // Drag overlay active task
  const [activeDragTask, setActiveDragTask] = useState<Task | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  // Calendar state
  const [calMonth, setCalMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // Modals & Selection
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [showCustomFieldsModal, setShowCustomFieldsModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberBusyId, setMemberBusyId] = useState<string | null>(null);

  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskStatusId, setNewTaskStatusId] = useState<string>(
    initialStatuses[0]?.id ?? ""
  );
  const [newTaskPriority, setNewTaskPriority] =
    useState<TaskPriority>("medium");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [creatingTask, setCreatingTask] = useState(false);

  const doneStatus = useMemo(
    () => statuses.find((s) => s.category === "done") ?? null,
    [statuses]
  );
  const todoStatus = useMemo(
    () => statuses.find((s) => s.category === "todo") ?? statuses[0] ?? null,
    [statuses]
  );

  const profilesMap = useMemo(() => {
    const map = new Map<string, Profile>();
    for (const p of allProfiles) map.set(p.id, p);
    return map;
  }, [allProfiles]);

  // Refetch all project tasks (used by Realtime & TaskDrawer updates)
  const fetchTasks = useCallback(async () => {
    const { data: allTaskRows, error } = await supabase
      .from("tasks")
      .select("*, task_assignees(user_id)")
      .eq("project_id", project.id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    if (error || !allTaskRows) return;

    type RawTaskRow = Task & {
      task_assignees?: { user_id: string }[];
    };

    const rows = allTaskRows as RawTaskRow[];
    const subtaskCountMap = new Map<string, { total: number; done: number }>();

    for (const r of rows) {
      if (r.parent_id) {
        const entry = subtaskCountMap.get(r.parent_id) ?? { total: 0, done: 0 };
        entry.total += 1;
        if (r.completed_at || (doneStatus && r.status_id === doneStatus.id)) {
          entry.done += 1;
        }
        subtaskCountMap.set(r.parent_id, entry);
      }
    }

    const topLevel: Task[] = rows
      .filter((r) => !r.parent_id)
      .map((r) => {
        const sub = subtaskCountMap.get(r.id) ?? { total: 0, done: 0 };
        const assignees: Profile[] = (r.task_assignees ?? [])
          .map((a) => profilesMap.get(a.user_id))
          .filter((p): p is Profile => Boolean(p));
        return {
          ...r,
          assignees,
          subtasks_count: sub.total,
          subtasks_done: sub.done,
        };
      });

    setTasks(topLevel);
  }, [supabase, project.id, doneStatus, profilesMap]);

  // Supabase Realtime subscription on public.tasks for this project
  useEffect(() => {
    const channel = supabase
      .channel(`project-tasks-${project.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "alpha_lite",
          table: "tasks",
          filter: `project_id=eq.${project.id}`,
        },
        () => {
          fetchTasks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, project.id, fetchTasks]);

  function openTaskDrawer(taskId: string) {
    setSelectedTaskId(taskId);
    router.replace(`/projects/${project.id}?task=${taskId}`, { scroll: false });
  }

  function closeTaskDrawer() {
    setSelectedTaskId(null);
    router.replace(`/projects/${project.id}`, { scroll: false });
  }

  async function handleProjectStatusChange(newStatus: ProjectStatus) {
    const prev = project.status;
    setProject((p) => ({ ...p, status: newStatus }));
    const { error } = await supabase
      .from("projects")
      .update({ status: newStatus })
      .eq("id", project.id);
    if (error) {
      setProject((p) => ({ ...p, status: prev }));
      toast.error("Không thể cập nhật trạng thái dự án");
    } else {
      toast.success("Đã cập nhật trạng thái dự án");
    }
  }

  async function handleQuickAddTask(statusId: string, title: string) {
    const trimmed = title.trim();
    if (!trimmed) return;

    const targetStatus = statuses.find((s) => s.id === statusId);
    const completed_at =
      targetStatus?.category === "done" ? new Date().toISOString() : null;

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        project_id: project.id,
        status_id: statusId,
        title: trimmed,
        priority: "medium",
        completed_at,
        position: tasks.length,
        created_by: currentUser.id,
      })
      .select("*")
      .single();

    if (error || !data) {
      toast.error("Không thể thêm công việc");
      return;
    }

    setTasks((prev) => [
      ...prev,
      {
        ...(data as Task),
        assignees: [],
        subtasks_count: 0,
        subtasks_done: 0,
      },
    ]);
  }

  async function handleCreateTaskFromModal(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newTaskTitle.trim();
    if (!trimmed) return;

    setCreatingTask(true);
    try {
      const targetStatus = statuses.find((s) => s.id === newTaskStatusId);
      const completed_at =
        targetStatus?.category === "done" ? new Date().toISOString() : null;

      const { data, error } = await supabase
        .from("tasks")
        .insert({
          project_id: project.id,
          status_id: newTaskStatusId || todoStatus?.id || null,
          title: trimmed,
          priority: newTaskPriority,
          due_date: newTaskDueDate || null,
          completed_at,
          position: tasks.length,
          created_by: currentUser.id,
        })
        .select("*")
        .single();

      if (error || !data) throw new Error(error?.message);

      setTasks((prev) => [
        ...prev,
        {
          ...(data as Task),
          assignees: [],
          subtasks_count: 0,
          subtasks_done: 0,
        },
      ]);
      toast.success("Đã thêm công việc mới");
      setNewTaskTitle("");
      setNewTaskDueDate("");
      setShowAddTaskModal(false);
    } catch {
      toast.error("Không thể tạo công việc");
    } finally {
      setCreatingTask(false);
    }
  }

  async function moveTaskToStatus(task: Task, targetStatusId: string) {
    if (task.status_id === targetStatusId) return;
    const targetStatus = statuses.find((s) => s.id === targetStatusId);
    if (!targetStatus) return;

    const prevStatus = statuses.find((s) => s.id === task.status_id);
    const movingToDone = targetStatus.category === "done";
    const wasDone = prevStatus?.category === "done";
    const completed_at = movingToDone
      ? new Date().toISOString()
      : wasDone
      ? null
      : task.completed_at;

    // Optimistic update
    const snapshot = tasks;
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? { ...t, status_id: targetStatusId, completed_at }
          : t
      )
    );

    const { error } = await supabase
      .from("tasks")
      .update({ status_id: targetStatusId, completed_at })
      .eq("id", task.id);

    if (error) {
      setTasks(snapshot);
      toast.error("Không thể di chuyển công việc");
      return;
    }

    if (movingToDone && !wasDone) {
      fetch("/api/webhooks/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "task_completed",
          projectId: project.id,
          title: `Hoàn thành công việc: ${task.title}`,
          body: `${currentUser.full_name} đã hoàn thành "${task.title}" trong dự án ${project.name}.`,
          link: `/projects/${project.id}?task=${task.id}`,
        }),
      }).catch(() => {});
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const dragged = tasks.find((t) => t.id === event.active.id) ?? null;
    setActiveDragTask(dragged);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragTask(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = String(active.id);
    const targetStatusId = String(over.id);
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    moveTaskToStatus(task, targetStatusId);
  }

  async function handleToggleTaskDone(task: Task) {
    if (!doneStatus || !todoStatus) return;
    const isDone = Boolean(task.completed_at) || task.status_id === doneStatus.id;
    await moveTaskToStatus(task, isDone ? todoStatus.id : doneStatus.id);
  }

  // Member management
  const memberIds = useMemo(
    () => new Set(members.map((m) => m.user_id)),
    [members]
  );

  async function handleAddMember(profile: Profile) {
    setMemberBusyId(profile.id);
    try {
      const { error } = await supabase.from("project_members").insert({
        project_id: project.id,
        user_id: profile.id,
        role: "member",
      });
      if (error) throw new Error(error.message);

      setMembers((prev) => [
        ...prev,
        {
          project_id: project.id,
          user_id: profile.id,
          role: "member",
          joined_at: new Date().toISOString(),
          profile,
        },
      ]);

      if (profile.id !== currentUser.id) {
        await supabase.from("notifications").insert({
          user_id: profile.id,
          actor_id: currentUser.id,
          type: "project_added",
          title: `Bạn đã được thêm vào dự án ${project.name}`,
          body: `${currentUser.full_name} đã thêm bạn vào dự án [${project.code}] ${project.name}.`,
          link: `/projects/${project.id}`,
        });
      }
      toast.success(`Đã thêm ${profile.full_name} vào dự án`);
    } catch {
      toast.error("Không thể thêm thành viên");
    } finally {
      setMemberBusyId(null);
    }
  }

  async function handleRemoveMember(userId: string) {
    setMemberBusyId(userId);
    try {
      const { error } = await supabase
        .from("project_members")
        .delete()
        .eq("project_id", project.id)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);

      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
      toast.success("Đã gỡ thành viên khỏi dự án");
    } catch {
      toast.error("Không thể gỡ thành viên");
    } finally {
      setMemberBusyId(null);
    }
  }

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (priorityFilter !== "all" && t.priority !== priorityFilter)
        return false;
      if (q && !t.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tasks, search, priorityFilter]);

  // Calendar days calculation (Mon-Sun grid)
  const calendarDays = useMemo(() => {
    const year = calMonth.getFullYear();
    const month = calMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // JS getDay(): 0=Sun..6=Sat -> convert to Mon=0..Sun=6
    const startOffset = (firstDay.getDay() + 6) % 7;
    const totalCells = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;

    const cells: { date: Date; ymd: string; inMonth: boolean }[] = [];
    for (let i = 0; i < totalCells; i++) {
      const d = new Date(year, month, 1 - startOffset + i);
      cells.push({
        date: d,
        ymd: formatYmd(d),
        inMonth: d.getMonth() === month,
      });
    }
    return cells;
  }, [calMonth]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of filteredTasks) {
      if (!t.due_date) continue;
      const key = t.due_date.slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(t);
      map.set(key, list);
    }
    return map;
  }, [filteredTasks]);

  const todayYmd = useMemo(() => formatYmd(new Date()), []);

  const filteredModalProfiles = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return allProfiles.filter((p) => {
      if (!q) return true;
      return (
        p.full_name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q)
      );
    });
  }, [allProfiles, memberSearch]);

  const assignableProfiles = useMemo(() => {
    // Prefer project members first, or fall back to allProfiles if none
    const projProfiles = members
      .map((m) => m.profile ?? profilesMap.get(m.user_id))
      .filter((p): p is Profile => Boolean(p));
    return projProfiles.length > 0 ? projProfiles : allProfiles;
  }, [members, profilesMap, allProfiles]);

  return (
    <div className="flex flex-col space-y-5">
      {/* Project Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <Link
              href="/projects"
              className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-brand dark:text-slate-400"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Tất cả dự án
            </Link>

            <div className="flex flex-wrap items-center gap-2.5">
              <span
                className="h-3.5 w-3.5 shrink-0 rounded-full"
                style={{ backgroundColor: project.color || "#F26522" }}
              />
              <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {project.code}
              </span>
              <h1 className="truncate text-xl font-bold text-slate-900 dark:text-slate-100">
                {project.name}
              </h1>
            </div>

            {project.description && (
              <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                {project.description}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Project Status Selector */}
            <select
              value={project.status}
              onChange={(e) =>
                handleProjectStatusChange(e.target.value as ProjectStatus)
              }
              aria-label="Trạng thái dự án"
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="active">Đang hoạt động</option>
              <option value="completed">Hoàn thành</option>
              <option value="archived">Lưu trữ</option>
            </select>

            {/* Members button */}
            <button
              type="button"
              onClick={() => setShowMembersModal(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
            >
              <Users className="h-4 w-4 text-slate-500" />
              <span>Thành viên ({members.length})</span>
            </button>

            {/* Custom fields button */}
            <button
              type="button"
              onClick={() => setShowCustomFieldsModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
            >
              <Sliders className="h-4 w-4 text-brand" />
              <span>Tùy biến cột / Trường xuất bản</span>
            </button>

            {/* Add task button */}
            <button
              type="button"
              onClick={() => setShowAddTaskModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-brand-hover cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Thêm công việc
            </button>
          </div>
        </div>

        {/* View Tabs + Filters */}
        <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer",
                viewMode === "list"
                  ? "bg-white text-brand shadow-xs dark:bg-slate-900"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              )}
            >
              <List className="h-3.5 w-3.5" />
              Danh sách
            </button>
            <button
              type="button"
              onClick={() => setViewMode("kanban")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer",
                viewMode === "kanban"
                  ? "bg-white text-brand shadow-xs dark:bg-slate-900"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              )}
            >
              <Kanban className="h-3.5 w-3.5" />
              Bảng Kanban
            </button>
            <button
              type="button"
              onClick={() => setViewMode("calendar")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer",
                viewMode === "calendar"
                  ? "bg-white text-brand shadow-xs dark:bg-slate-900"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              )}
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              Lịch
            </button>
            <button
              type="button"
              onClick={() => setViewMode("updates")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer",
                viewMode === "updates"
                  ? "bg-white text-brand shadow-xs dark:bg-slate-900"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              )}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Thảo luận & Cập nhật
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm công việc..."
                className="w-48 rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-brand focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <select
              value={priorityFilter}
              onChange={(e) =>
                setPriorityFilter(e.target.value as "all" | TaskPriority)
              }
              aria-label="Lọc theo ưu tiên"
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="all">Mọi mức ưu tiên</option>
              <option value="urgent">Khẩn cấp</option>
              <option value="high">Cao</option>
              <option value="medium">Trung bình</option>
              <option value="low">Thấp</option>
            </select>
          </div>
        </div>
      </div>

      {/* ================================================================
       * VIEW 1: LIST VIEW
       * ============================================================== */}
      {viewMode === "list" && (
        <div className="space-y-4">
          {statuses.map((st) => {
            const groupTasks = filteredTasks.filter(
              (t) => t.status_id === st.id
            );
            const collapsed = !!collapsedStatusIds[st.id];
            const quickVal = listQuickAdd[st.id] ?? "";
            const isAllGroupSelected =
              groupTasks.length > 0 &&
              groupTasks.every((t) => selectedTaskIds.has(t.id));
            const isSomeGroupSelected =
              groupTasks.some((t) => selectedTaskIds.has(t.id));

            return (
              <div
                key={st.id}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900"
              >
                <button
                  type="button"
                  onClick={() =>
                    setCollapsedStatusIds((prev) => ({
                      ...prev,
                      [st.id]: !prev[st.id],
                    }))
                  }
                  className="flex w-full items-center justify-between bg-slate-50/80 px-4 py-2.5 text-left dark:bg-slate-800/50 cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    {groupTasks.length > 0 && (
                      <input
                        type="checkbox"
                        checked={isAllGroupSelected}
                        ref={(el) => {
                          if (el) {
                            el.indeterminate =
                              isSomeGroupSelected && !isAllGroupSelected;
                          }
                        }}
                        onChange={(e) => {
                          e.stopPropagation();
                          setSelectedTaskIds((prev) => {
                            const next = new Set(prev);
                            for (const t of groupTasks) {
                              if (isAllGroupSelected) next.delete(t.id);
                              else next.add(t.id);
                            }
                            return next;
                          });
                        }}
                        onClick={(e) => e.stopPropagation()}
                        title="Chọn tất cả công việc trong nhóm này"
                        className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand/40 dark:border-slate-700 dark:bg-slate-800 cursor-pointer mr-0.5"
                      />
                    )}
                    {collapsed ? (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronUp className="h-4 w-4 text-slate-400" />
                    )}
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: st.color || "#94A3B8" }}
                    />
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {st.name}
                    </span>
                    <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                      {groupTasks.length}
                    </span>
                  </div>
                </button>

                {!collapsed && (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {groupTasks.map((task) => {
                      const isDone =
                        Boolean(task.completed_at) || st.category === "done";
                      const pCfg =
                        PRIORITY_CONFIG[task.priority] ??
                        PRIORITY_CONFIG.medium;
                      const overdue = isOverdue(
                        task.due_date,
                        task.completed_at
                      );

                      return (
                        <div
                          key={task.id}
                          className={cn(
                            "group flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40",
                            selectedTaskIds.has(task.id) &&
                              "bg-brand-soft/40 dark:bg-brand/10"
                          )}
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <input
                              type="checkbox"
                              checked={selectedTaskIds.has(task.id)}
                              onChange={() => {
                                setSelectedTaskIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(task.id)) next.delete(task.id);
                                  else next.add(task.id);
                                  return next;
                                });
                              }}
                              onClick={(e) => e.stopPropagation()}
                              aria-label={`Chọn ${task.title}`}
                              className="h-4 w-4 shrink-0 rounded border-slate-300 text-brand focus:ring-brand/40 dark:border-slate-700 dark:bg-slate-800 cursor-pointer"
                            />

                            <button
                              type="button"
                              onClick={() => handleToggleTaskDone(task)}
                              title={
                                isDone
                                  ? "Đánh dấu chưa xong"
                                  : "Đánh dấu hoàn thành"
                              }
                              className="shrink-0 text-slate-400 hover:text-emerald-500 cursor-pointer"
                            >
                              {isDone ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                              ) : (
                                <Circle className="h-4 w-4" />
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => openTaskDrawer(task.id)}
                              className={cn(
                                "truncate text-left text-sm font-medium transition hover:text-brand cursor-pointer",
                                isDone
                                  ? "text-slate-400 line-through"
                                  : "text-slate-800 dark:text-slate-100"
                              )}
                            >
                              {task.title}
                            </button>

                            {(task.subtasks_count ?? 0) > 0 && (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                <CheckSquare className="h-3 w-3" />
                                {task.subtasks_done ?? 0}/{task.subtasks_count}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3">
                            {/* Priority */}
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                                pCfg.bg,
                                pCfg.color
                              )}
                            >
                              <span
                                className={cn(
                                  "h-1.5 w-1.5 rounded-full",
                                  pCfg.dot
                                )}
                              />
                              {pCfg.label}
                            </span>

                            {/* Due date */}
                            <span
                              className={cn(
                                "w-24 text-right text-xs",
                                overdue
                                  ? "font-semibold text-red-600 dark:text-red-400"
                                  : "text-slate-500 dark:text-slate-400"
                              )}
                            >
                              {task.due_date ? formatDateVi(task.due_date) : "—"}
                            </span>

                            {/* Assignees */}
                            <div className="flex w-16 justify-end -space-x-1.5">
                              {task.assignees && task.assignees.length > 0 ? (
                                task.assignees.slice(0, 3).map((a) => (
                                  <span
                                    key={a.id}
                                    title={a.full_name}
                                    className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-brand-soft text-[10px] font-bold text-brand dark:border-slate-900 dark:bg-brand/25"
                                  >
                                    {getInitials(a.full_name)}
                                  </span>
                                ))
                              ) : (
                                <span className="text-[11px] text-slate-300 dark:text-slate-600">
                                  —
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Inline Quick-add */}
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (!quickVal.trim()) return;
                        await handleQuickAddTask(st.id, quickVal);
                        setListQuickAdd((prev) => ({ ...prev, [st.id]: "" }));
                      }}
                      className="flex items-center gap-2 px-4 py-2"
                    >
                      <Plus className="h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        value={quickVal}
                        onChange={(e) =>
                          setListQuickAdd((prev) => ({
                            ...prev,
                            [st.id]: e.target.value,
                          }))
                        }
                        placeholder={`Thêm công việc vào "${st.name}"...`}
                        className="flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none dark:text-slate-100"
                      />
                      {quickVal.trim() && (
                        <button
                          type="submit"
                          className="rounded-lg bg-brand px-3 py-1 text-xs font-semibold text-white hover:bg-brand-hover cursor-pointer"
                        >
                          Thêm
                        </button>
                      )}
                    </form>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ================================================================
       * VIEW 2: KANBAN BOARD
       * ============================================================== */}
      {viewMode === "kanban" && (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 overflow-x-auto pb-4">
            {statuses.map((st) => (
              <DroppableKanbanColumn
                key={st.id}
                status={st}
                tasks={filteredTasks.filter((t) => t.status_id === st.id)}
                onOpenTask={openTaskDrawer}
                onQuickAdd={handleQuickAddTask}
              />
            ))}
          </div>

          <DragOverlay>
            {activeDragTask ? (
              <div className="w-72">
                <KanbanCardContent task={activeDragTask} isOverlay />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* ================================================================
       * VIEW 3: MONTHLY CALENDAR
       * ============================================================== */}
      {viewMode === "calendar" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
          {/* Calendar Header */}
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Tháng {calMonth.getMonth() + 1} / {calMonth.getFullYear()}
            </h2>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setCalMonth(
                    new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1)
                  )
                }
                className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  setCalMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                }}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
              >
                Hôm nay
              </button>
              <button
                type="button"
                onClick={() =>
                  setCalMonth(
                    new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1)
                  )
                }
                className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Weekday Row */}
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
            {WEEKDAYS_VI.map((day) => (
              <div
                key={day}
                className="py-2 text-center text-xs font-semibold text-slate-500 dark:text-slate-400"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 dark:divide-slate-800">
            {calendarDays.map((cell) => {
              const dayTasks = tasksByDate.get(cell.ymd) ?? [];
              const isToday = cell.ymd === todayYmd;

              return (
                <div
                  key={cell.ymd}
                  className={cn(
                    "min-h-[110px] p-2",
                    !cell.inMonth &&
                      "bg-slate-50/60 text-slate-400 dark:bg-slate-950/40"
                  )}
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <span
                      className={cn(
                        "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                        isToday
                          ? "bg-brand text-white"
                          : cell.inMonth
                          ? "text-slate-700 dark:text-slate-200"
                          : "text-slate-400 dark:text-slate-600"
                      )}
                    >
                      {cell.date.getDate()}
                    </span>
                  </div>

                  <div className="space-y-1">
                    {dayTasks.map((t) => {
                      const overdue = isOverdue(t.due_date, t.completed_at);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => openTaskDrawer(t.id)}
                          className={cn(
                            "block w-full truncate rounded-md px-1.5 py-1 text-left text-[11px] font-medium transition cursor-pointer",
                            t.completed_at
                              ? "bg-emerald-50 text-emerald-700 line-through dark:bg-emerald-950/50 dark:text-emerald-300"
                              : overdue
                              ? "bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/60 dark:text-red-300"
                              : "bg-brand-soft text-brand hover:bg-brand/20 dark:bg-brand/15"
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

      {/* ================================================================
       * VIEW 4: PROJECT UPDATES & DISCUSSIONS
       * ============================================================== */}
      {viewMode === "updates" && (
        <ProjectUpdatesTab
          project={project}
          currentUser={currentUser}
          allProfiles={allProfiles}
        />
      )}

      {/* ================================================================
       * ADD TASK MODAL
       * ============================================================== */}
      {showAddTaskModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs"
          onClick={() => !creatingTask && setShowAddTaskModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Thêm công việc mới
              </h2>
              <button
                type="button"
                onClick={() => setShowAddTaskModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={handleCreateTaskFromModal}
              className="mt-4 space-y-4"
            >
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Tên công việc <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="VD: Duyệt thiết kế bìa sách..."
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Trạng thái
                  </label>
                  <select
                    value={newTaskStatusId}
                    onChange={(e) => setNewTaskStatusId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {statuses.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Độ ưu tiên
                  </label>
                  <select
                    value={newTaskPriority}
                    onChange={(e) =>
                      setNewTaskPriority(e.target.value as TaskPriority)
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="low">Thấp</option>
                    <option value="medium">Trung bình</option>
                    <option value="high">Cao</option>
                    <option value="urgent">Khẩn cấp</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Hạn hoàn thành
                </label>
                <input
                  type="date"
                  value={newTaskDueDate}
                  onChange={(e) => setNewTaskDueDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddTaskModal(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={creatingTask}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-60 cursor-pointer"
                >
                  {creatingTask && <Loader2 className="h-4 w-4 animate-spin" />}
                  Tạo công việc
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================
       * MEMBER MANAGEMENT MODAL
       * ============================================================== */}
      {showMembersModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs"
          onClick={() => setShowMembersModal(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Thành viên dự án ({members.length})
              </h2>
              <button
                type="button"
                onClick={() => setShowMembersModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Tìm nhân sự theo tên hoặc email..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-brand focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div className="mt-4 flex-1 space-y-2 overflow-y-auto pr-1">
              {filteredModalProfiles.map((p) => {
                const isInProject = memberIds.has(p.id);
                const busy = memberBusyId === p.id;
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/40"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand dark:bg-brand/20">
                        {getInitials(p.full_name)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {p.full_name}
                        </p>
                        <p className="truncate text-xs text-slate-400">
                          {p.job_title ? `${p.job_title} • ` : ""}
                          {p.email}
                        </p>
                      </div>
                    </div>

                    {isInProject ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleRemoveMember(p.id)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:bg-slate-900 dark:text-red-400 cursor-pointer"
                      >
                        {busy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <UserMinus className="h-3.5 w-3.5" />
                        )}
                        Gỡ
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleAddMember(p)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-hover cursor-pointer"
                      >
                        {busy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <UserPlus className="h-3.5 w-3.5" />
                        )}
                        Thêm
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================
       * TASK DETAIL SLIDE-OVER DRAWER
       * ============================================================== */}
      {selectedTaskId && (
        <TaskDrawer
          taskId={selectedTaskId}
          projectId={project.id}
          statuses={statuses}
          members={assignableProfiles}
          currentUser={currentUser}
          onClose={closeTaskDrawer}
          onUpdated={fetchTasks}
          onDeleted={(deletedId) => {
            setTasks((prev) => prev.filter((t) => t.id !== deletedId));
          }}
        />
      )}

      {/* ================================================================
       * BULK ACTION BAR
       * ============================================================== */}
      <BulkActionBar
        selectedTaskIds={Array.from(selectedTaskIds)}
        selectedTasks={tasks.filter((t) => selectedTaskIds.has(t.id))}
        statuses={statuses}
        profiles={assignableProfiles}
        currentUser={currentUser}
        onClearSelection={() => setSelectedTaskIds(new Set())}
        onTasksUpdated={() => {
          fetchTasks();
          setSelectedTaskIds(new Set());
        }}
      />

      {/* ================================================================
       * CUSTOM FIELDS MANAGER MODAL
       * ============================================================== */}
      <CustomFieldsManagerModal
        projectId={project.id}
        projectName={project.name}
        isOpen={showCustomFieldsModal}
        onClose={() => setShowCustomFieldsModal(false)}
        onFieldsUpdated={fetchTasks}
      />
    </div>
  );
}
