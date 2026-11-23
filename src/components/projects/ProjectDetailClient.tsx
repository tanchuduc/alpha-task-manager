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
  Settings,
  Columns3,
  ShieldCheck,
  Lock,
  Layers,
  FolderArchive,
  AlertTriangle,
  Filter,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  getProjectPermissionsMap,
  isProjectPrivilegedUser,
  shouldRestrictTasksToAssignee,
} from "@/lib/permissions";
import { logTaskActivity } from "@/lib/activity-logger";
import { ProjectUpdatesTab } from "./ProjectUpdatesTab";
import ProjectPhasesTab from "./ProjectPhasesTab";
import ProjectFilesTab from "./ProjectFilesTab";
import BulkActionBar from "@/components/projects/BulkActionBar";
import CustomFieldsManagerModal from "@/components/projects/CustomFieldsManagerModal";
import ProjectRolesManagerModal from "./ProjectRolesManagerModal";
import ProjectSettingsModal, { CONFIDENCE_CONFIG } from "./ProjectSettingsModal";
import {
  cn,
  PRIORITY_CONFIG,
  getInitials,
  formatDateVi,
  isOverdue,
} from "@/lib/utils";
import TaskDrawer from "@/components/tasks/TaskDrawer";
import type {
  Department,
  Profile,
  Project,
  ProjectCustomField,
  ProjectMember,
  ProjectPhase,
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
  departments?: Department[];
}

type ViewMode = "list" | "kanban" | "calendar" | "updates" | "phases" | "files";

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
  canChangeStatus = true,
}: {
  task: Task;
  onOpen: (id: string) => void;
  canChangeStatus?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: task.id,
      data: { task },
      disabled: !canChangeStatus,
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
      {...(canChangeStatus ? listeners : {})}
      {...(canChangeStatus ? attributes : {})}
      onClick={() => onOpen(task.id)}
      className={cn(
        canChangeStatus ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
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
  canChangeStatus = true,
  canCreateTasks = true,
}: {
  status: TaskStatus;
  tasks: Task[];
  onOpenTask: (id: string) => void;
  onQuickAdd: (statusId: string, title: string) => Promise<void>;
  canChangeStatus?: boolean;
  canCreateTasks?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: status.id,
    disabled: !canChangeStatus,
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
            canChangeStatus={canChangeStatus}
          />
        ))}
      </div>

      {/* Quick add card */}
      {canCreateTasks && (
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
      )}
    </div>
  );
}

/* ============================================================================
 * Task Custom Columns Helpers
 * ========================================================================== */

function TaskCustomCells({
  task,
  customFields,
  customValuesMap,
  profilesMap,
  onOpenDrawer,
}: {
  task: Task;
  customFields: ProjectCustomField[];
  customValuesMap: Record<string, Record<string, string>>;
  profilesMap: Map<string, Profile>;
  onOpenDrawer: (taskId: string) => void;
}) {
  return (
    <>
      {customFields.map((field) => {
        const val = customValuesMap[task.id]?.[field.id] || "";
        const isPeople = field.field_type === "people";
        const peopleProfile = isPeople && val ? profilesMap.get(val) : null;

        return (
          <div
            key={field.id}
            onClick={(e) => {
              e.stopPropagation();
              onOpenDrawer(task.id);
            }}
            className="hidden lg:flex min-w-[120px] max-w-[170px] shrink-0 items-center text-xs text-slate-700 dark:text-slate-300 px-2 cursor-pointer hover:bg-slate-100/70 dark:hover:bg-slate-800/70 rounded py-0.5 transition"
            title={`${field.name}: ${val || "Chưa có"}`}
          >
            {isPeople ? (
              peopleProfile ? (
                <span className="inline-flex items-center gap-1.5 truncate">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[10px] font-bold text-brand dark:bg-brand/20">
                    {getInitials(peopleProfile.full_name)}
                  </span>
                  <span className="truncate">{peopleProfile.full_name}</span>
                </span>
              ) : (
                <span className="text-slate-300 dark:text-slate-600 italic">
                  —
                </span>
              )
            ) : field.field_type === "dropdown" ? (
              val ? (
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 truncate">
                  {val}
                </span>
              ) : (
                <span className="text-slate-300 dark:text-slate-600 italic">
                  —
                </span>
              )
            ) : field.field_type === "date" ? (
              val ? (
                <span className="text-slate-600 dark:text-slate-300">
                  {formatDateVi(val)}
                </span>
              ) : (
                <span className="text-slate-300 dark:text-slate-600 italic">
                  —
                </span>
              )
            ) : val ? (
              <span className="truncate font-mono text-[11px] text-slate-700 dark:text-slate-200">
                {val}
              </span>
            ) : (
              <span className="text-slate-300 dark:text-slate-600 italic">
                —
              </span>
            )}
          </div>
        );
      })}
    </>
  );
}

function TaskListTableHeader({
  visibleCustomFields,
  visibleStdColumns,
}: {
  visibleCustomFields: ProjectCustomField[];
  visibleStdColumns: {
    priority: boolean;
    due_date: boolean;
    assignees: boolean;
  };
}) {
  return (
    <div className="hidden sm:flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-800/30">
      <div className="flex-1 min-w-[200px]">Công việc</div>
      <div className="flex items-center gap-3">
        {visibleCustomFields.map((f) => (
          <div
            key={f.id}
            className="hidden lg:block min-w-[120px] max-w-[170px] px-2 truncate"
          >
            {f.name}
          </div>
        ))}
        {visibleStdColumns.priority && (
          <div className="w-20 text-center">Ưu tiên</div>
        )}
        {visibleStdColumns.due_date && (
          <div className="w-24 text-right">Hạn chót</div>
        )}
        {visibleStdColumns.assignees && (
          <div className="w-16 text-right">Phân công</div>
        )}
      </div>
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
  departments = [],
}: ProjectDetailClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const [project, setProject] = useState<Project>(initialProject);
  const [statuses] = useState<TaskStatus[]>(initialStatuses);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [members, setMembers] = useState<ProjectMember[]>(initialMembers);
  const [phases, setPhases] = useState<ProjectPhase[]>([]);

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "updates") return "updates";
    if (tabParam === "phases") return "phases";
    if (tabParam === "files") return "files";
    if (tabParam === "kanban") return "kanban";
    if (tabParam === "calendar") return "calendar";
    return "list";
  });

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "updates") setViewMode("updates");
    else if (tabParam === "phases") setViewMode("phases");
    else if (tabParam === "files") setViewMode("files");
    else if (tabParam === "kanban") setViewMode("kanban");
    else if (tabParam === "calendar") setViewMode("calendar");
  }, [searchParams]);

  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<"all" | TaskPriority>(
    "all"
  );
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [phaseFilter, setPhaseFilter] = useState<string>("all");
  const [overdueOnly, setOverdueOnly] = useState<boolean>(false);
  const [collapsedStatusIds, setCollapsedStatusIds] = useState<
    Record<string, boolean>
  >({});

  // List View Grouping: By Status vs By Phase
  const [listGroupBy, setListGroupBy] = useState<"status" | "phase">("status");
  const [collapsedPhaseIds, setCollapsedPhaseIds] = useState<
    Record<string, boolean>
  >({});
  const [phaseQuickAdd, setPhaseQuickAdd] = useState<Record<string, string>>({});

  // Custom Fields & Dynamic Columns State
  const [customFields, setCustomFields] = useState<ProjectCustomField[]>([]);
  const [customValuesMap, setCustomValuesMap] = useState<
    Record<string, Record<string, string>>
  >({});
  const [visibleColumnIds, setVisibleColumnIds] = useState<Set<string>>(
    new Set()
  );
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [visibleStdColumns, setVisibleStdColumns] = useState({
    priority: true,
    due_date: true,
    assignees: true,
  });

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
  const [showProjectRolesModal, setShowProjectRolesModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberBusyId, setMemberBusyId] = useState<string | null>(null);

  // Advanced RBAC Permissions Calculation
  const currentMember = useMemo(
    () => members.find((m) => m.user_id === currentUser.id),
    [members, currentUser.id]
  );

  const permissionsMap = useMemo(
    () => getProjectPermissionsMap(currentUser, project, currentMember),
    [currentUser, project, currentMember]
  );

  const isPrivileged = useMemo(
    () => isProjectPrivilegedUser(currentUser, project, currentMember),
    [currentUser, project, currentMember]
  );

  const canCreateTasks = permissionsMap.canCreateTasks;
  const canChangeStatus = permissionsMap.canChangeStatus;
  const canManageMembers = permissionsMap.canManageMembers;
  const canAssignTasks = useMemo(() => {
    if (!permissionsMap.canEditAllTasks && !permissionsMap.canEditOwnTasks)
      return false;
    if (project.restrict_task_assignment && !isPrivileged) return false;
    return true;
  }, [
    permissionsMap.canEditAllTasks,
    permissionsMap.canEditOwnTasks,
    project.restrict_task_assignment,
    isPrivileged,
  ]);
  const canManageProjectSettings = useMemo(
    () => isPrivileged || permissionsMap.canManageMembers,
    [isPrivileged, permissionsMap.canManageMembers]
  );

  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskStatusId, setNewTaskStatusId] = useState<string>(
    initialStatuses[0]?.id ?? ""
  );
  const [newTaskPriority, setNewTaskPriority] =
    useState<TaskPriority>("medium");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [newTaskPhaseId, setNewTaskPhaseId] = useState<string>("");
  const [newTaskAssigneeIds, setNewTaskAssigneeIds] = useState<string[]>([]);
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

    const restrictToAssignee = shouldRestrictTasksToAssignee(
      currentUser,
      project,
      currentMember
    );

    const parentIdsWithAssignedSubtask = new Set<string>();
    if (restrictToAssignee) {
      for (const r of rows) {
        if (
          r.parent_id &&
          (r.created_by === currentUser.id ||
            (r.task_assignees ?? []).some((a) => a.user_id === currentUser.id))
        ) {
          parentIdsWithAssignedSubtask.add(r.parent_id);
        }
      }
    }

    const topLevel: Task[] = rows
      .filter((r) => {
        if (r.parent_id) return false;
        if (!restrictToAssignee) return true;
        return (
          r.created_by === currentUser.id ||
          (r.task_assignees ?? []).some((a) => a.user_id === currentUser.id) ||
          parentIdsWithAssignedSubtask.has(r.id)
        );
      })
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
  }, [supabase, project, currentUser, currentMember, doneStatus, profilesMap]);

  // Refetch custom fields and their values (scoped to current project's custom fields)
  const fetchCustomFieldsAndValues = useCallback(async () => {
    const { data: fieldsData } = await supabase
      .from("project_custom_fields")
      .select("*")
      .eq("project_id", project.id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    const fList = (fieldsData ?? []) as ProjectCustomField[];
    setCustomFields(fList);
    setVisibleColumnIds((prev) => {
      if (prev.size === 0 && fList.length > 0) {
        return new Set(fList.map((f) => f.id));
      }
      return prev;
    });

    if (fList.length === 0) {
      setCustomValuesMap({});
      return;
    }

    const { data: valuesData } = await supabase
      .from("task_custom_field_values")
      .select("task_id, field_id, value")
      .in(
        "field_id",
        fList.map((f) => f.id)
      );

    if (valuesData) {
      const map: Record<string, Record<string, string>> = {};
      for (const row of valuesData as {
        task_id: string;
        field_id: string;
        value: string;
      }[]) {
        if (!map[row.task_id]) map[row.task_id] = {};
        map[row.task_id][row.field_id] = row.value;
      }
      setCustomValuesMap(map);
    }
  }, [supabase, project.id]);

  // Supabase Realtime subscription on tasks, task_assignees, and task_custom_field_values
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
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "alpha_lite",
          table: "task_assignees",
        },
        () => {
          fetchTasks();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "alpha_lite",
          table: "task_custom_field_values",
        },
        () => {
          fetchCustomFieldsAndValues();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, project.id, fetchTasks, fetchCustomFieldsAndValues]);

  // Refetch all project phases
  const fetchPhases = useCallback(async () => {
    const { data, error } = await supabase
      .from("project_phases")
      .select("*")
      .eq("project_id", project.id)
      .order("position", { ascending: true });
    if (!error && data) {
      setPhases(data as ProjectPhase[]);
    }
  }, [supabase, project.id]);

  useEffect(() => {
    fetchPhases();
  }, [fetchPhases]);

  // Supabase Realtime subscription on public.project_phases
  useEffect(() => {
    const channel = supabase
      .channel(`project-phases-${project.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "alpha_lite",
          table: "project_phases",
          filter: `project_id=eq.${project.id}`,
        },
        () => {
          fetchPhases();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, project.id, fetchPhases]);

  useEffect(() => {
    fetchCustomFieldsAndValues();
  }, [fetchCustomFieldsAndValues]);

  const visibleCustomFields = useMemo(
    () => customFields.filter((f) => visibleColumnIds.has(f.id)),
    [customFields, visibleColumnIds]
  );

  async function handleQuickAddTaskToPhase(
    phaseId: string | null,
    title: string
  ) {
    if (!canCreateTasks) {
      toast.error("Bạn không có quyền tạo công việc trong dự án này.");
      return;
    }
    const trimmed = title.trim();
    if (!trimmed) return;

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        project_id: project.id,
        phase_id: phaseId,
        status_id: todoStatus?.id || statuses[0]?.id || null,
        title: trimmed,
        priority: "medium",
        position: tasks.length,
        created_by: currentUser.id,
      })
      .select("*")
      .single();

    if (error || !data) {
      toast.error("Không thể thêm công việc");
      return;
    }

    const createdTask = data as Task;
    let initialAssignees: Profile[] = [];
    if (project.assign_tasks_to_creator) {
      await supabase.from("task_assignees").insert({
        task_id: createdTask.id,
        user_id: currentUser.id,
        assigned_by: currentUser.id,
      });
      initialAssignees = [currentUser];
    }

    logTaskActivity(supabase, {
      taskId: createdTask.id,
      actorId: currentUser.id,
      action: "created",
      details: { new_value: trimmed },
    });

    setTasks((prev) => [
      ...prev,
      {
        ...createdTask,
        assignees: initialAssignees,
        subtasks_count: 0,
        subtasks_done: 0,
      },
    ]);
    toast.success("Đã thêm công việc vào giai đoạn");
  }

  const openTaskDrawer = useCallback(
    (taskId: string) => {
      setSelectedTaskId(taskId);
      router.replace(`/projects/${project.id}?task=${taskId}`, { scroll: false });
    },
    [project.id, router]
  );

  const closeTaskDrawer = useCallback(() => {
    setSelectedTaskId(null);
    router.replace(`/projects/${project.id}`, { scroll: false });
  }, [project.id, router]);

  async function handleProjectStatusChange(newStatus: ProjectStatus) {
    if (!canManageProjectSettings) {
      toast.error("Bạn không có quyền thay đổi trạng thái dự án.");
      return;
    }
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
    if (!canCreateTasks) {
      toast.error("Bạn không có quyền tạo công việc trong dự án này.");
      return;
    }
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

    const createdTask = data as Task;
    let initialAssignees: Profile[] = [];
    if (project.assign_tasks_to_creator) {
      await supabase.from("task_assignees").insert({
        task_id: createdTask.id,
        user_id: currentUser.id,
        assigned_by: currentUser.id,
      });
      initialAssignees = [currentUser];
    }

    logTaskActivity(supabase, {
      taskId: createdTask.id,
      actorId: currentUser.id,
      action: "created",
      details: { new_value: trimmed },
    });

    setTasks((prev) => [
      ...prev,
      {
        ...createdTask,
        assignees: initialAssignees,
        subtasks_count: 0,
        subtasks_done: 0,
      },
    ]);
  }

  async function handleCreateTaskFromModal(e: React.FormEvent) {
    e.preventDefault();
    if (!canCreateTasks) {
      toast.error("Bạn không có quyền tạo công việc trong dự án này.");
      return;
    }
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
          phase_id: newTaskPhaseId || null,
          completed_at,
          position: tasks.length,
          created_by: currentUser.id,
        })
        .select("*")
        .single();

      if (error || !data) throw new Error(error?.message);

      const createdTask = data as Task;
      const effectiveAssigneeIds =
        newTaskAssigneeIds.length > 0
          ? newTaskAssigneeIds
          : project.assign_tasks_to_creator
          ? [currentUser.id]
          : [];

      const initialAssignees: Profile[] = [];
      if (effectiveAssigneeIds.length > 0) {
        await supabase.from("task_assignees").insert(
          effectiveAssigneeIds.map((uid) => ({
            task_id: createdTask.id,
            user_id: uid,
            assigned_by: currentUser.id,
          }))
        );

        for (const uid of effectiveAssigneeIds) {
          const prof = profilesMap.get(uid);
          if (prof) initialAssignees.push(prof);

          // Auto-add to project_members if not yet a member
          if (!memberIds.has(uid)) {
            await supabase.from("project_members").upsert(
              {
                project_id: project.id,
                user_id: uid,
                role: "member",
              },
              { onConflict: "project_id,user_id", ignoreDuplicates: true }
            );
          }

          if (uid !== currentUser.id) {
            await supabase.from("notifications").insert({
              user_id: uid,
              actor_id: currentUser.id,
              type: "task_assigned",
              title: `Bạn được giao việc mới: ${trimmed}`,
              body: `${currentUser.full_name} đã giao cho bạn "${trimmed}" trong dự án ${project.name}.`,
              link: `/projects/${project.id}?task=${createdTask.id}`,
            });

            fetch("/api/webhooks/dispatch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                event: "task_assigned",
                projectId: project.id,
                title: `Giao việc mới: ${trimmed}`,
                body: `${currentUser.full_name} đã giao "${trimmed}" cho ${prof?.full_name || "nhân sự"}.`,
                link: `/projects/${project.id}?task=${createdTask.id}`,
              }),
            }).catch(() => {});
          }
        }
      }

      logTaskActivity(supabase, {
        taskId: createdTask.id,
        actorId: currentUser.id,
        action: "created",
        details: { new_value: trimmed },
      });

      setTasks((prev) => [
        ...prev,
        {
          ...createdTask,
          assignees: initialAssignees,
          subtasks_count: 0,
          subtasks_done: 0,
        },
      ]);
      toast.success("Đã thêm công việc mới");
      setNewTaskTitle("");
      setNewTaskDueDate("");
      setNewTaskPhaseId("");
      setNewTaskAssigneeIds([]);
      setShowAddTaskModal(false);
    } catch {
      toast.error("Không thể tạo công việc");
    } finally {
      setCreatingTask(false);
    }
  }

  async function moveTaskToStatus(task: Task, targetStatusId: string) {
    if (!canChangeStatus) {
      toast.error("Bạn không có quyền thay đổi trạng thái công việc trong dự án này.");
      return;
    }
    if (project.enable_phase_assignees && task.phase_id) {
      const taskPhase = phases.find((p) => p.id === task.phase_id);
      if (taskPhase?.assignee_id) {
        const isPhaseOwnerOrAdmin =
          currentUser.id === taskPhase.assignee_id ||
          currentUser.role === "admin" ||
          currentUser.role === "manager" ||
          project.project_manager_id === currentUser.id;
        if (!isPhaseOwnerOrAdmin) {
          const ownerName =
            profilesMap.get(taskPhase.assignee_id)?.full_name ||
            "Người phụ trách giai đoạn";
          toast.error(
            `Giai đoạn "${taskPhase.name}" do ${ownerName} phụ trách. Chỉ người phụ trách giai đoạn hoặc Quản lý mới được chuyển trạng thái!`
          );
          return;
        }
      }
    }
    if (task.status_id === targetStatusId) return;
    const targetStatus = statuses.find((s) => s.id === targetStatusId);
    if (!targetStatus) return;

    const prevStatus = statuses.find((s) => s.id === task.status_id);
    const movingToDone = targetStatus.category === "done";
    const wasDone = prevStatus?.category === "done";

    // Dependency Blocker Check when completing a task
    if (movingToDone && !wasDone) {
      const { data: depRows } = await supabase
        .from("task_dependencies")
        .select(
          "id, dependency_type, source_task_id, target_task_id, source:tasks!task_dependencies_source_task_id_fkey(id, title, completed_at), target:tasks!task_dependencies_target_task_id_fkey(id, title, completed_at)"
        )
        .or(`source_task_id.eq.${task.id},target_task_id.eq.${task.id}`);

      if (depRows && depRows.length > 0) {
        const unresolvedTitles: string[] = [];
        for (const row of depRows as unknown as {
          dependency_type: string;
          source_task_id: string;
          target_task_id: string;
          source?: { id: string; title: string; completed_at: string | null } | null;
          target?: { id: string; title: string; completed_at: string | null } | null;
        }[]) {
          // 1) source --blocked_by--> target (where source is current task)
          if (
            row.source_task_id === task.id &&
            row.dependency_type === "blocked_by" &&
            row.target &&
            !row.target.completed_at
          ) {
            unresolvedTitles.push(row.target.title);
          }
          // 2) blocker --blocks--> current task (where target is current task)
          if (
            row.target_task_id === task.id &&
            row.dependency_type === "blocks" &&
            row.source &&
            !row.source.completed_at
          ) {
            unresolvedTitles.push(row.source.title);
          }
        }

        if (unresolvedTitles.length > 0) {
          const confirmed = window.confirm(
            `Cảnh báo phụ thuộc: Công việc "${task.title}" đang chờ ${unresolvedTitles.length} công việc tiên quyết chưa hoàn thành:\n\n` +
              unresolvedTitles.map((t) => `• ${t}`).join("\n") +
              `\n\nBạn có chắc chắn vẫn muốn đánh dấu hoàn thành công việc này?`
          );
          if (!confirmed) return;
        }
      }
    }

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

    logTaskActivity(supabase, {
      taskId: task.id,
      actorId: currentUser.id,
      action: "status_changed",
      details: {
        old_value: prevStatus?.name || "Chưa rõ",
        new_value: targetStatus.name,
      },
    });

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

    if (!canChangeStatus) {
      toast.error("Bạn không có quyền kéo thả hoặc đổi trạng thái công việc.");
      return;
    }

    const taskId = String(active.id);
    const targetStatusId = String(over.id);
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    moveTaskToStatus(task, targetStatusId);
  }

  async function handleToggleTaskDone(task: Task) {
    if (!canChangeStatus) {
      toast.error("Bạn không có quyền thay đổi trạng thái công việc trong dự án này.");
      return;
    }
    if (!doneStatus || !todoStatus) return;
    const isDone = Boolean(task.completed_at) || task.status_id === doneStatus.id;
    await moveTaskToStatus(task, isDone ? todoStatus.id : doneStatus.id);
  }

  async function handleInlinePriorityChange(
    task: Task,
    nextPriority: TaskPriority
  ) {
    const prev = tasks;
    setTasks((curr) =>
      curr.map((t) =>
        t.id === task.id ? { ...t, priority: nextPriority } : t
      )
    );
    const { error } = await supabase
      .from("tasks")
      .update({ priority: nextPriority })
      .eq("id", task.id);
    if (error) {
      setTasks(prev);
      toast.error("Không thể cập nhật mức độ ưu tiên");
    }
  }

  async function handleInlineDueDateChange(
    task: Task,
    nextDueDate: string | null
  ) {
    const prev = tasks;
    setTasks((curr) =>
      curr.map((t) =>
        t.id === task.id ? { ...t, due_date: nextDueDate } : t
      )
    );
    const { error } = await supabase
      .from("tasks")
      .update({ due_date: nextDueDate })
      .eq("id", task.id);
    if (error) {
      setTasks(prev);
      toast.error("Không thể cập nhật hạn hoàn thành");
    }
  }

  // Member management
  const memberIds = useMemo(
    () => new Set(members.map((m) => m.user_id)),
    [members]
  );

  async function handleAddMember(profile: Profile) {
    if (!canManageMembers) {
      toast.error("Bạn không có quyền quản lý thành viên trong dự án này.");
      return;
    }
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
    if (!canManageMembers) {
      toast.error("Bạn không có quyền quản lý thành viên trong dự án này.");
      return;
    }
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

  // Filtered tasks (with Vietnamese NFD accent-insensitive search + Assignee + Phase + Overdue filters)
  const filteredTasks = useMemo(() => {
    const normalizeVi = (str: string) =>
      str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d");

    const q = normalizeVi(search.trim());
    return tasks.filter((t) => {
      if (priorityFilter !== "all" && t.priority !== priorityFilter)
        return false;

      if (assigneeFilter === "unassigned") {
        if (t.assignees && t.assignees.length > 0) return false;
      } else if (assigneeFilter !== "all") {
        const hasAssignee = (t.assignees ?? []).some(
          (a) => a.id === assigneeFilter
        );
        if (!hasAssignee) return false;
      }

      if (phaseFilter === "unassigned") {
        if (t.phase_id) return false;
      } else if (phaseFilter !== "all") {
        if (t.phase_id !== phaseFilter) return false;
      }

      if (overdueOnly) {
        if (!isOverdue(t.due_date, t.completed_at)) return false;
      }

      if (q && !normalizeVi(t.title).includes(q)) return false;
      return true;
    });
  }, [
    tasks,
    search,
    priorityFilter,
    assigneeFilter,
    phaseFilter,
    overdueOnly,
  ]);

  const hasActiveFilters =
    Boolean(search.trim()) ||
    priorityFilter !== "all" ||
    assigneeFilter !== "all" ||
    phaseFilter !== "all" ||
    overdueOnly;

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

  const conf =
    CONFIDENCE_CONFIG[project.delivery_confidence || "on_track"] ??
    CONFIDENCE_CONFIG.on_track;

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
    <div className="flex flex-col space-y-3">
      {/* ====================================================================
       * 1. WORKLENZ SINGLE-LINE PROJECT VIEW HEADER (project-view-header.tsx)
       * ==================================================================== */}
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between border-b border-[#e8e8e8] dark:border-[#303030] pb-2.5">
        {/* Left: Back Arrow + Project Title + Category Tag + Confidence Badge + Client */}
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <Link
            href="/projects"
            className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] border border-[#e0e0e0] dark:border-[#333333] text-slate-500 hover:border-brand hover:text-brand transition shrink-0"
            title="Quay lại Danh sách dự án"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </Link>

          <span
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: project.color || "#F47830" }}
          />
          <span className="rounded-[4px] bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700 dark:bg-[#2a2a2a] dark:text-slate-300">
            {project.code}
          </span>
          <h1 className="truncate text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
            {project.name}
          </h1>

          {project.category && (
            <span className="rounded-[4px] bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
              {project.category}
            </span>
          )}

          {/* Delivery confidence badge */}
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-[4px] border px-2 py-0.5 text-[11px] font-medium",
              conf.badgeClass
            )}
            title={project.confidence_note || conf.desc}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", conf.dotClass)} />
            {conf.label.split(" (")[0]}
          </span>

          {project.client_name && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              • Tác giả: <strong className="text-slate-700 dark:text-slate-200">{project.client_name}</strong>
            </span>
          )}
        </div>

        {/* Right: Compact Action Icon Buttons + Members + Primary Create Task CTA */}
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {/* Status quick dropdown */}
          <select
            value={project.status}
            disabled={!canManageProjectSettings}
            onChange={(e) =>
              handleProjectStatusChange(e.target.value as ProjectStatus)
            }
            aria-label="Trạng thái dự án"
            className="h-[30px] rounded-[6px] border border-[#d9d9d9] bg-[#fafafa] px-2 text-xs font-medium text-slate-700 focus:border-brand focus:outline-none disabled:opacity-60 dark:border-[#3a3a3a] dark:bg-[#181818] dark:text-slate-200 cursor-pointer"
          >
            <option value="active">Đang hoạt động</option>
            <option value="completed">Hoàn thành</option>
            <option value="archived">Lưu trữ</option>
          </select>

          {/* Custom fields icon button */}
          {canManageProjectSettings && (
            <button
              type="button"
              onClick={() => setShowCustomFieldsModal(true)}
              className="inline-flex h-[30px] items-center gap-1 rounded-[6px] border border-[#d9d9d9] bg-white px-2.5 text-xs font-medium text-slate-700 hover:border-brand hover:text-brand dark:border-[#3a3a3a] dark:bg-[#1f1f1f] dark:text-slate-200 cursor-pointer"
              title="Tùy biến trường dữ liệu xuất bản"
            >
              <Sliders className="h-3.5 w-3.5 text-brand" />
              <span className="hidden xl:inline">Trường xuất bản</span>
            </button>
          )}

          {/* Project Roles & Permissions icon button */}
          <button
            type="button"
            onClick={() => setShowProjectRolesModal(true)}
            className="inline-flex h-[30px] items-center gap-1 rounded-[6px] border border-[#d9d9d9] bg-white px-2.5 text-xs font-medium text-slate-700 hover:border-brand hover:text-brand dark:border-[#3a3a3a] dark:bg-[#1f1f1f] dark:text-slate-200 cursor-pointer"
            title="Phân quyền & Vai trò trong dự án"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-brand" />
            <span className="hidden xl:inline">Phân quyền</span>
          </button>

          {/* Project Settings circle icon button */}
          {canManageProjectSettings && (
            <button
              type="button"
              onClick={() => setShowSettingsModal(true)}
              className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[6px] border border-[#d9d9d9] bg-white text-slate-600 hover:border-brand hover:text-brand dark:border-[#3a3a3a] dark:bg-[#1f1f1f] dark:text-slate-300 cursor-pointer"
              title="Cài đặt dự án"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Members button */}
          <button
            type="button"
            onClick={() => setShowMembersModal(true)}
            className="inline-flex h-[30px] items-center gap-1.5 rounded-[6px] border border-[#d9d9d9] bg-white px-2.5 text-xs font-medium text-slate-700 hover:border-brand dark:border-[#3a3a3a] dark:bg-[#1f1f1f] dark:text-slate-200 cursor-pointer"
          >
            <Users className="h-3.5 w-3.5 text-slate-500" />
            <span>Thành viên ({members.length})</span>
          </button>

          {/* Primary CTA: Add task button */}
          {canCreateTasks && (
            <button
              type="button"
              onClick={() => setShowAddTaskModal(true)}
              className="inline-flex h-[30px] items-center gap-1.5 rounded-[6px] bg-brand px-3 text-xs font-semibold text-white shadow-2xs transition hover:bg-brand-hover cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Thêm công việc</span>
            </button>
          )}
        </div>
      </div>

      {/* ====================================================================
       * 2. WORKLENZ UNDERLINE TABS (project-view-tabs)
       * ==================================================================== */}
      <div className="flex items-center justify-between border-b border-[#e8e8e8] dark:border-[#303030]">
        <div className="flex items-center gap-1 overflow-x-auto">
          {(
            [
              { key: "list", label: "Danh sách công việc", icon: List, count: tasks.length },
              { key: "kanban", label: "Bảng Kanban", icon: Kanban },
              { key: "phases", label: "Giai đoạn", icon: Layers, count: phases.length },
              { key: "calendar", label: "Lịch", icon: CalendarIcon },
              { key: "files", label: "Tài liệu & Tệp", icon: FolderArchive },
              { key: "updates", label: "Thảo luận & Cập nhật", icon: MessageSquare },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = viewMode === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setViewMode(tab.key)}
                className={cn(
                  "relative inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium transition cursor-pointer whitespace-nowrap border-b-2",
                  active
                    ? "border-brand text-brand font-semibold"
                    : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
                {"count" in tab && typeof tab.count === "number" && (
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.2 text-[10px]",
                      active
                        ? "bg-brand-soft text-brand dark:bg-brand-soft-dark"
                        : "bg-slate-100 text-slate-500 dark:bg-[#2a2a2a] dark:text-slate-400"
                    )}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ====================================================================
       * 3. WORKLENZ DEDICATED 1-LINE TASK FILTER TOOLBAR (ImprovedTaskFilters)
       * ==================================================================== */}
      {(viewMode === "list" || viewMode === "kanban" || viewMode === "calendar") && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[#e8e8e8] dark:border-[#303030] bg-[#fafafa] dark:bg-[#181818] px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            {viewMode === "list" && (
              <div className="inline-flex items-center gap-1 text-xs text-slate-500">
                <span>Nhóm:</span>
                <div className="inline-flex rounded-[6px] border border-[#d9d9d9] bg-white p-0.5 dark:border-[#3a3a3a] dark:bg-[#1f1f1f]">
                  <button
                    type="button"
                    onClick={() => setListGroupBy("status")}
                    className={cn(
                      "rounded-[4px] px-2 py-0.5 text-xs font-medium transition cursor-pointer",
                      listGroupBy === "status"
                        ? "bg-brand text-white font-semibold"
                        : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
                    )}
                  >
                    Trạng thái
                  </button>
                  <button
                    type="button"
                    onClick={() => setListGroupBy("phase")}
                    className={cn(
                      "rounded-[4px] px-2 py-0.5 text-xs font-medium transition cursor-pointer",
                      listGroupBy === "phase"
                        ? "bg-brand text-white font-semibold"
                        : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
                    )}
                  >
                    Giai đoạn
                  </button>
                </div>
              </div>
            )}

            {/* Quick toggle: Việc của tôi */}
            <button
              type="button"
              onClick={() =>
                setAssigneeFilter((prev) =>
                  prev === currentUser.id ? "all" : currentUser.id
                )
              }
              className={cn(
                "inline-flex items-center gap-1 rounded-[6px] border px-2.5 py-1 text-xs font-medium transition cursor-pointer",
                assigneeFilter === currentUser.id
                  ? "border-brand bg-brand-soft text-brand font-semibold dark:border-brand dark:bg-brand/20"
                  : "border-[#d9d9d9] bg-white text-slate-700 hover:bg-slate-50 dark:border-[#3a3a3a] dark:bg-[#1f1f1f] dark:text-slate-200"
              )}
            >
              <Filter className="h-3 w-3" />
              <span>Việc của tôi</span>
            </button>

            {/* Quick toggle: Quá hạn */}
            <button
              type="button"
              onClick={() => setOverdueOnly((prev) => !prev)}
              className={cn(
                "inline-flex items-center gap-1 rounded-[6px] border px-2.5 py-1 text-xs font-medium transition cursor-pointer",
                overdueOnly
                  ? "border-red-300 bg-red-50 text-red-700 font-semibold dark:border-red-800 dark:bg-red-950/50 dark:text-red-300"
                  : "border-[#d9d9d9] bg-white text-slate-700 hover:bg-slate-50 dark:border-[#3a3a3a] dark:bg-[#1f1f1f] dark:text-slate-200"
              )}
            >
              <AlertTriangle className="h-3 w-3" />
              <span>Quá hạn</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Assignee Filter Dropdown */}
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              aria-label="Lọc theo người phụ trách"
              className="rounded-[6px] border border-[#d9d9d9] bg-white px-2 py-1 text-xs text-slate-700 focus:border-brand focus:outline-none dark:border-[#3a3a3a] dark:bg-[#1f1f1f] dark:text-slate-200"
            >
              <option value="all">Mọi người phụ trách</option>
              <option value={currentUser.id}>Chỉ việc của tôi</option>
              <option value="unassigned">Chưa giao ai</option>
              {assignableProfiles
                .filter((p) => p.id !== currentUser.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
            </select>

            {/* Phase Filter Dropdown */}
            {phases.length > 0 && (
              <select
                value={phaseFilter}
                onChange={(e) => setPhaseFilter(e.target.value)}
                aria-label="Lọc theo giai đoạn"
                className="rounded-[6px] border border-[#d9d9d9] bg-white px-2 py-1 text-xs text-slate-700 focus:border-brand focus:outline-none dark:border-[#3a3a3a] dark:bg-[#1f1f1f] dark:text-slate-200"
              >
                <option value="all">Mọi giai đoạn</option>
                <option value="unassigned">Chưa phân giai đoạn</option>
                {phases.map((ph) => (
                  <option key={ph.id} value={ph.id}>
                    {ph.name}
                  </option>
                ))}
              </select>
            )}

            {/* Priority Filter Dropdown */}
            <select
              value={priorityFilter}
              onChange={(e) =>
                setPriorityFilter(e.target.value as "all" | TaskPriority)
              }
              aria-label="Lọc theo ưu tiên"
              className="rounded-[6px] border border-[#d9d9d9] bg-white px-2 py-1 text-xs text-slate-700 focus:border-brand focus:outline-none dark:border-[#3a3a3a] dark:bg-[#1f1f1f] dark:text-slate-200"
            >
              <option value="all">Mọi ưu tiên</option>
              <option value="urgent">Khẩn cấp</option>
              <option value="high">Cao</option>
              <option value="medium">Trung bình</option>
              <option value="low">Thấp</option>
            </select>

            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm công việc..."
                className="w-44 rounded-[6px] border border-[#d9d9d9] bg-white py-1 pl-8 pr-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none dark:border-[#3a3a3a] dark:bg-[#1f1f1f] dark:text-slate-100"
              />
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setPriorityFilter("all");
                  setAssigneeFilter("all");
                  setPhaseFilter("all");
                  setOverdueOnly(false);
                }}
                className="inline-flex items-center gap-1 rounded-[6px] border border-[#d9d9d9] bg-white px-2 py-1 text-xs font-medium text-brand hover:bg-brand-soft dark:border-[#3a3a3a] dark:bg-[#1f1f1f] cursor-pointer"
                title="Đặt lại toàn bộ bộ lọc"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Xóa lọc</span>
              </button>
            )}

            {/* Column Visibility Selector */}
            {viewMode === "list" && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowColumnPicker((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#d9d9d9] bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-brand dark:border-[#3a3a3a] dark:bg-[#1f1f1f] dark:text-slate-200 cursor-pointer"
                  title="Tùy chỉnh ẩn/hiện cột"
                >
                  <Columns3 className="h-3.5 w-3.5 text-slate-500" />
                  <span>
                    Cột (
                    {visibleCustomFields.length +
                      (visibleStdColumns.priority ? 1 : 0) +
                      (visibleStdColumns.due_date ? 1 : 0) +
                      (visibleStdColumns.assignees ? 1 : 0)}
                    )
                  </span>
                </button>

                {showColumnPicker && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setShowColumnPicker(false)}
                    />
                    <div className="absolute right-0 top-full mt-1.5 z-40 w-64 rounded-[8px] border border-[#e8e8e8] bg-white p-3 shadow-xl dark:border-[#303030] dark:bg-[#1f1f1f] space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          Tùy chọn hiển thị cột
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setShowColumnPicker(false);
                            setShowCustomFieldsModal(true);
                          }}
                          className="text-[11px] font-semibold text-brand hover:underline cursor-pointer"
                        >
                          + Thêm cột mới
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Cột mặc định
                        </span>
                        <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 p-1 rounded">
                          <input
                            type="checkbox"
                            checked={visibleStdColumns.priority}
                            onChange={(e) =>
                              setVisibleStdColumns((prev) => ({
                                ...prev,
                                priority: e.target.checked,
                              }))
                            }
                            className="rounded border-slate-300 text-brand focus:ring-brand accent-brand"
                          />
                          <span>Mức ưu tiên</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 p-1 rounded">
                          <input
                            type="checkbox"
                            checked={visibleStdColumns.due_date}
                            onChange={(e) =>
                              setVisibleStdColumns((prev) => ({
                                ...prev,
                                due_date: e.target.checked,
                              }))
                            }
                            className="rounded border-slate-300 text-brand focus:ring-brand accent-brand"
                          />
                          <span>Hạn chót (Deadline)</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 p-1 rounded">
                          <input
                            type="checkbox"
                            checked={visibleStdColumns.assignees}
                            onChange={(e) =>
                              setVisibleStdColumns((prev) => ({
                                ...prev,
                                assignees: e.target.checked,
                              }))
                            }
                            className="rounded border-slate-300 text-brand focus:ring-brand accent-brand"
                          />
                          <span>Người thực hiện</span>
                        </label>
                      </div>

                      <div className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Trường tùy biến ({customFields.length})
                        </span>
                        {customFields.length === 0 ? (
                          <p className="text-[11px] text-slate-400 italic">
                            Chưa có trường tùy biến nào.
                          </p>
                        ) : (
                          <div className="max-h-48 overflow-y-auto space-y-1">
                            {customFields.map((f) => {
                              const isChecked = visibleColumnIds.has(f.id);
                              return (
                                <label
                                  key={f.id}
                                  className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 p-1 rounded"
                                >
                                  <span className="flex items-center gap-2 truncate">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={(e) => {
                                        const next = new Set(visibleColumnIds);
                                        if (e.target.checked) next.add(f.id);
                                        else next.delete(f.id);
                                        setVisibleColumnIds(next);
                                      }}
                                      className="rounded border-slate-300 text-brand focus:ring-brand accent-brand"
                                    />
                                    <span className="truncate">{f.name}</span>
                                  </span>
                                  <span className="text-[10px] text-slate-400 uppercase ml-1">
                                    {f.field_type}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================
       * VIEW 1: LIST VIEW
       * ============================================================== */}
      {viewMode === "list" && (
        <div className="space-y-4">
          {listGroupBy === "phase" ? (
            <div className="space-y-4">
              {phases.map((phase, idx) => {
                const groupTasks = filteredTasks.filter(
                  (t) => t.phase_id === phase.id
                );
                const collapsed = !!collapsedPhaseIds[phase.id];
                const quickVal = phaseQuickAdd[phase.id] ?? "";
                const isAllGroupSelected =
                  groupTasks.length > 0 &&
                  groupTasks.every((t) => selectedTaskIds.has(t.id));
                const isSomeGroupSelected =
                  groupTasks.some((t) => selectedTaskIds.has(t.id));
                const doneCount = groupTasks.filter(
                  (t) =>
                    Boolean(t.completed_at) ||
                    (doneStatus && t.status_id === doneStatus.id)
                ).length;
                const progress =
                  groupTasks.length > 0
                    ? Math.round((doneCount / groupTasks.length) * 100)
                    : 0;

                return (
                  <div
                    key={phase.id}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setCollapsedPhaseIds((prev) => ({
                          ...prev,
                          [phase.id]: !prev[phase.id],
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
                            title="Chọn tất cả công việc trong giai đoạn này"
                            className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand/40 dark:border-slate-700 dark:bg-slate-800 cursor-pointer mr-0.5"
                          />
                        )}
                        {collapsed ? (
                          <ChevronDown className="h-4 w-4 text-slate-400" />
                        ) : (
                          <ChevronUp className="h-4 w-4 text-slate-400" />
                        )}
                        <span
                          className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-2xs"
                          style={{ backgroundColor: phase.color || "#F26522" }}
                        >
                          {idx + 1}
                        </span>
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {phase.name}
                        </span>
                        <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                          {doneCount}/{groupTasks.length} việc ({progress}%)
                        </span>
                        {phase.assignee_id && profilesMap.get(phase.assignee_id) && (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand-soft/60 px-2 py-0.5 text-[11px] font-medium text-brand dark:border-brand/30 dark:bg-brand/15">
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand text-[8px] font-bold text-white">
                              {getInitials(profilesMap.get(phase.assignee_id)!.full_name)}
                            </span>
                            <span>
                              Phụ trách: {profilesMap.get(phase.assignee_id)!.full_name}
                            </span>
                          </span>
                        )}
                      </div>
                    </button>

                    {!collapsed && (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {groupTasks.length > 0 && (
                          <TaskListTableHeader
                            visibleCustomFields={visibleCustomFields}
                            visibleStdColumns={visibleStdColumns}
                          />
                        )}
                        {groupTasks.map((task) => {
                          const isDone =
                            Boolean(task.completed_at) ||
                            (doneStatus && task.status_id === doneStatus.id);
                          const pCfg =
                            PRIORITY_CONFIG[task.priority] ??
                            PRIORITY_CONFIG.medium;
                          const overdue = isOverdue(
                            task.due_date,
                            task.completed_at
                          );
                          const st = statuses.find(
                            (s) => s.id === task.status_id
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
                                      if (next.has(task.id))
                                        next.delete(task.id);
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

                                {st && (
                                  <span
                                    className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                                    style={{
                                      backgroundColor: `${st.color || "#94A3B8"}20`,
                                      color: st.color || "#64748B",
                                    }}
                                  >
                                    {st.name}
                                  </span>
                                )}

                                {(task.subtasks_count ?? 0) > 0 && (
                                  <span className="inline-flex shrink-0 items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                    <CheckSquare className="h-3 w-3" />
                                    {task.subtasks_done ?? 0}/
                                    {task.subtasks_count}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-3">
                                <TaskCustomCells
                                  task={task}
                                  customFields={visibleCustomFields}
                                  customValuesMap={customValuesMap}
                                  profilesMap={profilesMap}
                                  onOpenDrawer={openTaskDrawer}
                                />

                                {visibleStdColumns.priority && (
                                  <select
                                    value={task.priority}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) =>
                                      handleInlinePriorityChange(
                                        task,
                                        e.target.value as TaskPriority
                                      )
                                    }
                                    className={cn(
                                      "rounded-[4px] border px-1.5 py-0.5 text-[11px] font-medium focus:outline-none cursor-pointer",
                                      pCfg.bg,
                                      pCfg.color
                                    )}
                                  >
                                    <option value="low">Thấp</option>
                                    <option value="medium">Trung bình</option>
                                    <option value="high">Cao</option>
                                    <option value="urgent">Khẩn cấp</option>
                                  </select>
                                )}

                                {visibleStdColumns.due_date && (
                                  <input
                                    type="date"
                                    value={
                                      task.due_date
                                        ? task.due_date.slice(0, 10)
                                        : ""
                                    }
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) =>
                                      handleInlineDueDateChange(
                                        task,
                                        e.target.value || null
                                      )
                                    }
                                    className={cn(
                                      "w-28 rounded-[4px] border border-transparent hover:border-[#d9d9d9] dark:hover:border-[#3a3a3a] bg-transparent px-1 py-0.5 text-right font-mono text-[11.5px] focus:border-brand focus:outline-none cursor-pointer",
                                      overdue
                                        ? "font-semibold text-red-600 dark:text-red-400"
                                        : "text-slate-500 dark:text-slate-400"
                                    )}
                                  />
                                )}

                                {visibleStdColumns.assignees && (
                                  <div className="flex w-16 justify-end -space-x-1.5">
                                    {task.assignees &&
                                    task.assignees.length > 0 ? (
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
                                )}
                              </div>
                            </div>
                          );
                        })}

                        {/* Inline Quick-add per phase */}
                        {canCreateTasks && (
                          <form
                            onSubmit={async (e) => {
                              e.preventDefault();
                              if (!quickVal.trim()) return;
                              await handleQuickAddTaskToPhase(
                                phase.id,
                                quickVal
                              );
                              setPhaseQuickAdd((prev) => ({
                                ...prev,
                                [phase.id]: "",
                              }));
                            }}
                            className="flex items-center gap-2 px-4 py-2"
                          >
                            <Plus className="h-4 w-4 text-slate-400" />
                            <input
                              type="text"
                              value={quickVal}
                              onChange={(e) =>
                                setPhaseQuickAdd((prev) => ({
                                  ...prev,
                                  [phase.id]: e.target.value,
                                }))
                              }
                              placeholder={`Thêm công việc vào giai đoạn "${phase.name}"...`}
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
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Group: Chưa phân giai đoạn */}
              {(() => {
                const unassigned = filteredTasks.filter((t) => !t.phase_id);
                if (unassigned.length === 0) return null;
                const collapsed = !!collapsedPhaseIds["unassigned"];
                const quickVal = phaseQuickAdd["unassigned"] ?? "";
                const isAllSelected =
                  unassigned.length > 0 &&
                  unassigned.every((t) => selectedTaskIds.has(t.id));
                const isSomeSelected = unassigned.some((t) =>
                  selectedTaskIds.has(t.id)
                );

                return (
                  <div className="overflow-hidden rounded-xl border border-dashed border-slate-300 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
                    <button
                      type="button"
                      onClick={() =>
                        setCollapsedPhaseIds((prev) => ({
                          ...prev,
                          unassigned: !prev["unassigned"],
                        }))
                      }
                      className="flex w-full items-center justify-between bg-slate-100/80 px-4 py-2.5 text-left dark:bg-slate-800/60 cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={isAllSelected}
                          ref={(el) => {
                            if (el) {
                              el.indeterminate =
                                isSomeSelected && !isAllSelected;
                            }
                          }}
                          onChange={(e) => {
                            e.stopPropagation();
                            setSelectedTaskIds((prev) => {
                              const next = new Set(prev);
                              for (const t of unassigned) {
                                if (isAllSelected) next.delete(t.id);
                                else next.add(t.id);
                              }
                              return next;
                            });
                          }}
                          onClick={(e) => e.stopPropagation()}
                          title="Chọn tất cả việc chưa phân giai đoạn"
                          className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand/40 dark:border-slate-700 dark:bg-slate-800 cursor-pointer mr-0.5"
                        />
                        {collapsed ? (
                          <ChevronDown className="h-4 w-4 text-slate-400" />
                        ) : (
                          <ChevronUp className="h-4 w-4 text-slate-400" />
                        )}
                        <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                          Chưa phân giai đoạn
                        </span>
                        <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                          {unassigned.length}
                        </span>
                      </div>
                    </button>

                    {!collapsed && (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {unassigned.length > 0 && (
                          <TaskListTableHeader
                            visibleCustomFields={visibleCustomFields}
                            visibleStdColumns={visibleStdColumns}
                          />
                        )}
                        {unassigned.map((task) => {
                          const isDone =
                            Boolean(task.completed_at) ||
                            (doneStatus && task.status_id === doneStatus.id);
                          const pCfg =
                            PRIORITY_CONFIG[task.priority] ??
                            PRIORITY_CONFIG.medium;
                          const overdue = isOverdue(
                            task.due_date,
                            task.completed_at
                          );
                          const st = statuses.find(
                            (s) => s.id === task.status_id
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
                                      if (next.has(task.id))
                                        next.delete(task.id);
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

                                {st && (
                                  <span
                                    className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                                    style={{
                                      backgroundColor: `${st.color || "#94A3B8"}20`,
                                      color: st.color || "#64748B",
                                    }}
                                  >
                                    {st.name}
                                  </span>
                                )}

                                {(task.subtasks_count ?? 0) > 0 && (
                                  <span className="inline-flex shrink-0 items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                    <CheckSquare className="h-3 w-3" />
                                    {task.subtasks_done ?? 0}/
                                    {task.subtasks_count}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-3">
                                <TaskCustomCells
                                  task={task}
                                  customFields={visibleCustomFields}
                                  customValuesMap={customValuesMap}
                                  profilesMap={profilesMap}
                                  onOpenDrawer={openTaskDrawer}
                                />

                                {visibleStdColumns.priority && (
                                  <select
                                    value={task.priority}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) =>
                                      handleInlinePriorityChange(
                                        task,
                                        e.target.value as TaskPriority
                                      )
                                    }
                                    className={cn(
                                      "rounded-[4px] border px-1.5 py-0.5 text-[11px] font-medium focus:outline-none cursor-pointer",
                                      pCfg.bg,
                                      pCfg.color
                                    )}
                                  >
                                    <option value="low">Thấp</option>
                                    <option value="medium">Trung bình</option>
                                    <option value="high">Cao</option>
                                    <option value="urgent">Khẩn cấp</option>
                                  </select>
                                )}

                                {visibleStdColumns.due_date && (
                                  <input
                                    type="date"
                                    value={
                                      task.due_date
                                        ? task.due_date.slice(0, 10)
                                        : ""
                                    }
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) =>
                                      handleInlineDueDateChange(
                                        task,
                                        e.target.value || null
                                      )
                                    }
                                    className={cn(
                                      "w-28 rounded-[4px] border border-transparent hover:border-[#d9d9d9] dark:hover:border-[#3a3a3a] bg-transparent px-1 py-0.5 text-right font-mono text-[11.5px] focus:border-brand focus:outline-none cursor-pointer",
                                      overdue
                                        ? "font-semibold text-red-600 dark:text-red-400"
                                        : "text-slate-500 dark:text-slate-400"
                                    )}
                                  />
                                )}

                                {visibleStdColumns.assignees && (
                                  <div className="flex w-16 justify-end -space-x-1.5">
                                    {task.assignees &&
                                    task.assignees.length > 0 ? (
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
                                )}
                              </div>
                            </div>
                          );
                        })}

                        {/* Inline Quick-add for unassigned */}
                        {canCreateTasks && (
                          <form
                            onSubmit={async (e) => {
                              e.preventDefault();
                              if (!quickVal.trim()) return;
                              await handleQuickAddTaskToPhase(null, quickVal);
                              setPhaseQuickAdd((prev) => ({
                                ...prev,
                                unassigned: "",
                              }));
                            }}
                            className="flex items-center gap-2 px-4 py-2"
                          >
                            <Plus className="h-4 w-4 text-slate-400" />
                            <input
                              type="text"
                              value={quickVal}
                              onChange={(e) =>
                                setPhaseQuickAdd((prev) => ({
                                  ...prev,
                                  unassigned: e.target.value,
                                }))
                              }
                              placeholder="Thêm công việc chưa phân giai đoạn..."
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
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : (
            statuses.map((st) => {
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
                    {groupTasks.length > 0 && (
                      <TaskListTableHeader
                        visibleCustomFields={visibleCustomFields}
                        visibleStdColumns={visibleStdColumns}
                      />
                    )}
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
                            <TaskCustomCells
                              task={task}
                              customFields={visibleCustomFields}
                              customValuesMap={customValuesMap}
                              profilesMap={profilesMap}
                              onOpenDrawer={openTaskDrawer}
                            />

                            {visibleStdColumns.priority && (
                              <select
                                value={task.priority}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) =>
                                  handleInlinePriorityChange(
                                    task,
                                    e.target.value as TaskPriority
                                  )
                                }
                                className={cn(
                                  "rounded-[4px] border px-1.5 py-0.5 text-[11px] font-medium focus:outline-none cursor-pointer",
                                  pCfg.bg,
                                  pCfg.color
                                )}
                              >
                                <option value="low">Thấp</option>
                                <option value="medium">Trung bình</option>
                                <option value="high">Cao</option>
                                <option value="urgent">Khẩn cấp</option>
                              </select>
                            )}

                            {visibleStdColumns.due_date && (
                              <input
                                type="date"
                                value={
                                  task.due_date
                                    ? task.due_date.slice(0, 10)
                                    : ""
                                }
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) =>
                                  handleInlineDueDateChange(
                                    task,
                                    e.target.value || null
                                  )
                                }
                                className={cn(
                                  "w-28 rounded-[4px] border border-transparent hover:border-[#d9d9d9] dark:hover:border-[#3a3a3a] bg-transparent px-1 py-0.5 text-right font-mono text-[11.5px] focus:border-brand focus:outline-none cursor-pointer",
                                  overdue
                                    ? "font-semibold text-red-600 dark:text-red-400"
                                    : "text-slate-500 dark:text-slate-400"
                                )}
                              />
                            )}

                            {visibleStdColumns.assignees && (
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
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Inline Quick-add */}
                    {canCreateTasks && (
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
                    )}
                  </div>
                )}
              </div>
            );
          })
          )}
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
                canChangeStatus={canChangeStatus}
                canCreateTasks={canCreateTasks}
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
          canPostUpdates={permissionsMap.canPostUpdates}
        />
      )}

      {/* ================================================================
       * VIEW 5: PROJECT PHASES ROADMAP
       * ============================================================== */}
      {viewMode === "phases" && (
        <ProjectPhasesTab
          projectId={project.id}
          projectName={project.name}
          project={project}
          phases={phases}
          tasks={tasks}
          statuses={statuses}
          members={allProfiles}
          currentUser={currentUser}
          canManagePhases={permissionsMap.canManagePhases}
          canCreateTasks={permissionsMap.canCreateTasks}
          onSelectTask={openTaskDrawer}
          onPhasesUpdated={fetchPhases}
          onTasksUpdated={fetchTasks}
          onProjectUpdated={(updated) => setProject(updated)}
        />
      )}

      {/* ================================================================
       * VIEW 6: PROJECT FILES & LINKS HUB
       * ============================================================== */}
      {viewMode === "files" && (
        <ProjectFilesTab
          projectId={project.id}
          projectName={project.name}
          tasks={tasks}
          currentUser={currentUser}
          canManageFiles={permissionsMap.canManageFiles}
          onOpenTask={openTaskDrawer}
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

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Giai đoạn xuất bản
                </label>
                <select
                  value={newTaskPhaseId}
                  onChange={(e) => setNewTaskPhaseId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 cursor-pointer"
                >
                  <option value="">— Chưa phân giai đoạn —</option>
                  {phases.map((ph) => (
                    <option key={ph.id} value={ph.id}>
                      {ph.name}
                    </option>
                  ))}
                </select>
              </div>

              {canAssignTasks && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Người phụ trách ({newTaskAssigneeIds.length})
                  </label>
                  <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/60 p-2 space-y-1 dark:border-slate-700 dark:bg-slate-800/60">
                    {assignableProfiles.map((prof) => {
                      const checked = newTaskAssigneeIds.includes(prof.id);
                      return (
                        <label
                          key={prof.id}
                          className="flex items-center gap-2 rounded-md px-2 py-1 text-xs text-slate-700 hover:bg-white dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setNewTaskAssigneeIds((prev) =>
                                e.target.checked
                                  ? [...prev, prof.id]
                                  : prev.filter((id) => id !== prof.id)
                              );
                            }}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-brand focus:ring-brand accent-brand"
                          />
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[9px] font-bold text-brand dark:bg-brand/20">
                            {getInitials(prof.full_name)}
                          </span>
                          <span className="truncate font-medium">
                            {prof.full_name}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

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

            {!canManageMembers && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300 flex items-center gap-2">
                <Lock className="h-4 w-4 shrink-0" />
                <span>Chế độ chỉ xem. Bạn không có quyền thêm hoặc gỡ thành viên dự án này.</span>
              </div>
            )}

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
                        disabled={busy || !canManageMembers}
                        onClick={() => handleRemoveMember(p.id)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed dark:border-red-900 dark:bg-slate-900 dark:text-red-400 cursor-pointer"
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
                        disabled={busy || !canManageMembers}
                        onClick={() => handleAddMember(p)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-hover disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
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

            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setShowMembersModal(false);
                  setShowProjectRolesModal(true);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline cursor-pointer"
              >
                <ShieldCheck className="h-4 w-4" />
                <span>Cấu hình vai trò & phân quyền dự án &rarr;</span>
              </button>
              <button
                type="button"
                onClick={() => setShowMembersModal(false)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================
       * PROJECT ROLES & PERMISSIONS MODAL
       * ============================================================== */}
      {showProjectRolesModal && (
        <ProjectRolesManagerModal
          project={project}
          members={members}
          currentUser={currentUser}
          canManageMembers={canManageMembers}
          onClose={() => setShowProjectRolesModal(false)}
          onMembersUpdated={(updated) => setMembers(updated)}
        />
      )}

      {/* ================================================================
       * TASK DETAIL SLIDE-OVER DRAWER
       * ============================================================== */}
      {selectedTaskId && (
        <TaskDrawer
          taskId={selectedTaskId}
          projectId={project.id}
          project={project}
          currentMember={currentMember}
          permissions={permissionsMap}
          statuses={statuses}
          members={assignableProfiles}
          allProfiles={allProfiles}
          currentUser={currentUser}
          onClose={closeTaskDrawer}
          onOpenTask={openTaskDrawer}
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
        projectId={project.id}
        project={project}
        permissions={permissionsMap}
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

      {/* ================================================================
       * PROJECT SETTINGS MODAL
       * ============================================================== */}
      {showSettingsModal && (
        <ProjectSettingsModal
          project={project}
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          departments={departments}
          profiles={allProfiles}
          onProjectUpdated={(updated) => setProject(updated)}
        />
      )}
    </div>
  );
}
