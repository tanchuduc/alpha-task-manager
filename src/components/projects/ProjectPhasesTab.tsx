"use client";

import { useState, useMemo } from "react";
import {
  Layers,
  Sparkles,
  Plus,
  Settings2,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Flag,
  User,
  CheckSquare,
  Square,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { cn, PRIORITY_CONFIG, formatDateVi, isOverdue, getInitials } from "@/lib/utils";
import ProjectPhasesManagerModal, {
  ALPHA_STANDARD_PHASES,
} from "./ProjectPhasesManagerModal";
import type {
  PhaseStatus,
  Profile,
  ProjectPhase,
  Task,
  TaskPriority,
  TaskStatus,
} from "@/types/database";

interface ProjectPhasesTabProps {
  projectId: string;
  projectName: string;
  phases: ProjectPhase[];
  tasks: Task[];
  statuses: TaskStatus[];
  members: Profile[];
  currentUser: Profile;
  onSelectTask: (taskId: string) => void;
  onPhasesUpdated: () => void;
  onTasksUpdated: () => void;
}

const STATUS_CONFIG: Record<
  PhaseStatus,
  { label: string; badge: string; icon: typeof Clock }
> = {
  pending: {
    label: "Chờ thực hiện",
    badge: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    icon: Clock,
  },
  in_progress: {
    label: "Đang diễn ra",
    badge:
      "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-900",
    icon: AlertCircle,
  },
  completed: {
    label: "Đã hoàn thành",
    badge:
      "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900",
    icon: CheckCircle2,
  },
};

export default function ProjectPhasesTab({
  projectId,
  projectName,
  phases,
  tasks,
  statuses,
  members,
  currentUser,
  onSelectTask,
  onPhasesUpdated,
  onTasksUpdated,
}: ProjectPhasesTabProps) {
  const supabase = createClient();
  const [showManagerModal, setShowManagerModal] = useState(false);
  const [collapsedPhaseIds, setCollapsedPhaseIds] = useState<Record<string, boolean>>({});
  const [quickAddTitles, setQuickAddTitles] = useState<Record<string, string>>({});
  const [addingTaskPhaseId, setAddingTaskPhaseId] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  // Status mapping
  const doneStatus = useMemo(
    () => statuses.find((s) => s.category === "done") ?? null,
    [statuses]
  );
  const defaultStatus = useMemo(
    () => statuses.find((s) => s.category === "todo") ?? statuses[0] ?? null,
    [statuses]
  );

  // Group tasks by phase_id
  const { tasksByPhase, unassignedTasks } = useMemo(() => {
    const map = new Map<string, Task[]>();
    const unassigned: Task[] = [];

    for (const t of tasks) {
      if (t.phase_id) {
        const list = map.get(t.phase_id) ?? [];
        list.push(t);
        map.set(t.phase_id, list);
      } else {
        unassigned.push(t);
      }
    }
    return { tasksByPhase: map, unassignedTasks: unassigned };
  }, [tasks]);

  // Overall project publishing completion stats
  const stats = useMemo(() => {
    const totalPhases = phases.length;
    const completedPhases = phases.filter((p) => p.status === "completed").length;
    const inProgressPhases = phases.filter((p) => p.status === "in_progress").length;

    const totalTasks = tasks.length;
    const doneTasks = tasks.filter(
      (t) => Boolean(t.completed_at) || (doneStatus && t.status_id === doneStatus.id)
    ).length;

    const phasePercent = totalPhases > 0 ? Math.round((completedPhases / totalPhases) * 100) : 0;
    const taskPercent = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    return {
      totalPhases,
      completedPhases,
      inProgressPhases,
      totalTasks,
      doneTasks,
      phasePercent,
      taskPercent,
    };
  }, [phases, tasks, doneStatus]);

  async function handleSeedStandardPhases() {
    setSeeding(true);
    try {
      const rows = ALPHA_STANDARD_PHASES.map((p, idx) => ({
        project_id: projectId,
        name: p.name,
        description: p.description,
        color: p.color,
        status: p.status,
        position: idx,
      }));

      const { error } = await supabase.from("project_phases").insert(rows);
      if (error) throw error;

      toast.success("Đã khởi tạo thành công 5 giai đoạn xuất bản sách chuẩn!");
      onPhasesUpdated();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error
          ? `Lỗi: ${err.message}`
          : "Không thể khởi tạo giai đoạn xuất bản"
      );
    } finally {
      setSeeding(false);
    }
  }

  async function handleUpdatePhaseStatus(phaseId: string, newStatus: PhaseStatus) {
    const { error } = await supabase
      .from("project_phases")
      .update({ status: newStatus })
      .eq("id", phaseId);

    if (error) {
      toast.error("Không thể cập nhật trạng thái giai đoạn");
      return;
    }
    toast.success("Đã cập nhật trạng thái giai đoạn");
    onPhasesUpdated();
  }

  async function handleQuickAddTaskToPhase(phaseId: string) {
    const title = quickAddTitles[phaseId]?.trim();
    if (!title) return;

    setAddingTaskPhaseId(phaseId);
    try {
      const { error } = await supabase.from("tasks").insert({
        project_id: projectId,
        phase_id: phaseId,
        status_id: defaultStatus?.id || null,
        title,
        priority: "medium",
        position: tasks.length,
        created_by: currentUser.id,
      });

      if (error) throw error;
      setQuickAddTitles((prev) => ({ ...prev, [phaseId]: "" }));
      toast.success(`Đã thêm việc mới vào giai đoạn!`);
      onTasksUpdated();
    } catch {
      toast.error("Không thể thêm công việc");
    } finally {
      setAddingTaskPhaseId(null);
    }
  }

  async function handleAssignPhaseToTask(taskId: string, targetPhaseId: string | null) {
    const { error } = await supabase
      .from("tasks")
      .update({ phase_id: targetPhaseId })
      .eq("id", taskId);

    if (error) {
      toast.error("Không thể gán giai đoạn cho việc này");
      return;
    }
    toast.success("Đã gán giai đoạn thành công!");
    onTasksUpdated();
  }

  return (
    <div className="space-y-6">
      {/* Top Banner: Progress Overview */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-linear-to-r from-orange-50 via-white to-amber-50 p-6 shadow-xs dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-850">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white shadow-xs">
                <Layers className="h-4 w-4" />
              </span>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Lộ trình Xuất bản Sách ({phases.length} giai đoạn)
              </h2>
            </div>
            <p className="max-w-2xl text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Quy trình sản xuất và xuất bản sách chuyên nghiệp từ Bản quyền, Biên dịch, Thiết kế,
              Xin phép in ấn tới Tiếp thị & Phát hành ra mắt công chúng.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {phases.length === 0 ? (
              <button
                type="button"
                onClick={handleSeedStandardPhases}
                disabled={seeding}
                className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-brand-hover transition cursor-pointer"
              >
                {seeding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Khởi tạo 5 giai đoạn Alpha Books
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowManagerModal(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-800 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
              >
                <Settings2 className="h-4 w-4 text-brand" />
                Cài đặt & Quản lý Giai đoạn
              </button>
            )}
          </div>
        </div>

        {/* Metric Cards */}
        {phases.length > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200/80 bg-white/80 p-3.5 backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/60">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Tiến độ Giai đoạn
              </span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-xl font-bold text-brand">
                  {stats.completedPhases}/{stats.totalPhases}
                </span>
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  ({stats.phasePercent}%)
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-brand transition-all duration-500"
                  style={{ width: `${stats.phasePercent}%` }}
                />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-white/80 p-3.5 backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/60">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Khối lượng Công việc
              </span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  {stats.doneTasks}/{stats.totalTasks}
                </span>
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  ({stats.taskPercent}%)
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${stats.taskPercent}%` }}
                />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-white/80 p-3.5 backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/60">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Đang triển khai
              </span>
              <p className="mt-1 text-xl font-bold text-blue-600 dark:text-blue-400">
                {stats.inProgressPhases} giai đoạn
              </p>
              <p className="mt-1 text-[11px] text-slate-400">Đang chạy thực tế</p>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-white/80 p-3.5 backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/60">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Việc chưa phân giai đoạn
              </span>
              <p className="mt-1 text-xl font-bold text-slate-700 dark:text-slate-200">
                {unassignedTasks.length} việc
              </p>
              <p className="mt-1 text-[11px] text-slate-400">Cần phân bổ vào Phase</p>
            </div>
          </div>
        )}
      </div>

      {/* Main Roadmap Phase Cards */}
      {phases.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-soft text-brand dark:bg-brand/20">
            <Layers className="h-8 w-8" />
          </div>
          <h3 className="mt-4 text-base font-bold text-slate-900 dark:text-slate-100">
            Dự án chưa có giai đoạn xuất bản
          </h3>
          <p className="mt-1.5 max-w-md text-xs text-slate-500 dark:text-slate-400">
            Chuẩn hóa quy trình làm sách theo 5 chặng kinh điển của Alpha Books giúp giám sát
            tiến độ bản quyền, biên tập, thiết kế, xin phép in ấn và ra mắt thị trường.
          </p>
          <button
            type="button"
            onClick={handleSeedStandardPhases}
            disabled={seeding}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-brand-hover cursor-pointer"
          >
            {seeding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Khởi tạo 5 giai đoạn ngay
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {phases.map((phase, idx) => {
            const phaseTasks = tasksByPhase.get(phase.id) ?? [];
            const isCollapsed = Boolean(collapsedPhaseIds[phase.id]);
            const doneCount = phaseTasks.filter(
              (t) => Boolean(t.completed_at) || (doneStatus && t.status_id === doneStatus.id)
            ).length;
            const progress =
              phaseTasks.length > 0 ? Math.round((doneCount / phaseTasks.length) * 100) : 0;
            const quickTitle = quickAddTitles[phase.id] ?? "";
            const isAdding = addingTaskPhaseId === phase.id;

            return (
              <div
                key={phase.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900"
              >
                {/* Phase Header Card */}
                <div className="p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="flex items-start gap-3.5">
                      {/* Step Number Circle */}
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-xs"
                        style={{ backgroundColor: phase.color || "#F26522" }}
                      >
                        {idx + 1}
                      </div>

                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                            {phase.name}
                          </h3>

                          {/* Quick Status Dropdown */}
                          <select
                            value={phase.status}
                            onChange={(e) =>
                              handleUpdatePhaseStatus(
                                phase.id,
                                e.target.value as PhaseStatus
                              )
                            }
                            aria-label="Cập nhật trạng thái giai đoạn"
                            className={cn(
                              "rounded-lg px-2.5 py-1 text-xs font-semibold outline-none cursor-pointer",
                              STATUS_CONFIG[phase.status]?.badge
                            )}
                          >
                            <option value="pending">Chờ thực hiện</option>
                            <option value="in_progress">Đang diễn ra</option>
                            <option value="completed">Đã hoàn thành</option>
                          </select>
                        </div>

                        {phase.description && (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {phase.description}
                          </p>
                        )}

                        {(phase.start_date || phase.due_date) && (
                          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                            <Calendar className="h-3 w-3" />
                            <span>
                              {formatDateVi(phase.start_date)} — {formatDateVi(phase.due_date)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar & Task Summary */}
                    <div className="flex min-w-56 flex-col items-end gap-1.5">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {doneCount}/{phaseTasks.length} việc hoàn thành
                        </span>
                        <span
                          className="font-bold"
                          style={{ color: phase.color || "#F26522" }}
                        >
                          ({progress}%)
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${progress}%`,
                            backgroundColor: phase.color || "#F26522",
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setCollapsedPhaseIds((prev) => ({
                            ...prev,
                            [phase.id]: !prev[phase.id],
                          }))
                        }
                        className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-brand cursor-pointer"
                      >
                        {isCollapsed ? (
                          <>
                            <ChevronDown className="h-3.5 w-3.5" />
                            Xem danh sách việc ({phaseTasks.length})
                          </>
                        ) : (
                          <>
                            <ChevronUp className="h-3.5 w-3.5" />
                            Thu gọn việc
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Collapsible Tasks in this Phase */}
                {!isCollapsed && (
                  <div className="border-t border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/30">
                    <div className="space-y-2">
                      {phaseTasks.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 py-4 text-center text-xs text-slate-400 dark:border-slate-800">
                          Chưa có công việc nào trong giai đoạn này
                        </div>
                      ) : (
                        phaseTasks.map((t) => {
                          const isDone =
                            Boolean(t.completed_at) ||
                            (doneStatus && t.status_id === doneStatus.id);
                          const pCfg = PRIORITY_CONFIG[t.priority] ?? PRIORITY_CONFIG.medium;
                          const overdue = isOverdue(t.due_date, t.completed_at);

                          return (
                            <div
                              key={t.id}
                              onClick={() => onSelectTask(t.id)}
                              className="group flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 transition hover:border-brand/40 hover:shadow-xs dark:border-slate-800 dark:bg-slate-900 cursor-pointer"
                            >
                              <div className="flex items-center gap-2.5">
                                {isDone ? (
                                  <CheckSquare className="h-4 w-4 shrink-0 text-emerald-500" />
                                ) : (
                                  <Square className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
                                )}
                                <span
                                  className={cn(
                                    "text-sm font-medium",
                                    isDone
                                      ? "text-slate-400 line-through"
                                      : "text-slate-800 dark:text-slate-100"
                                  )}
                                >
                                  {t.title}
                                </span>
                              </div>

                              <div className="flex items-center gap-3">
                                {/* Priority badge */}
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                                    pCfg.bg,
                                    pCfg.color
                                  )}
                                >
                                  <span className={cn("h-1 w-1 rounded-full", pCfg.dot)} />
                                  {pCfg.label}
                                </span>

                                {/* Due Date */}
                                {t.due_date && (
                                  <span
                                    className={cn(
                                      "inline-flex items-center gap-1 text-xs",
                                      overdue
                                        ? "font-semibold text-red-600 dark:text-red-400"
                                        : "text-slate-500 dark:text-slate-400"
                                    )}
                                  >
                                    <Calendar className="h-3 w-3" />
                                    {formatDateVi(t.due_date)}
                                  </span>
                                )}

                                {/* Assignees */}
                                {(t.assignees ?? []).length > 0 && (
                                  <div className="flex -space-x-1.5">
                                    {(t.assignees ?? []).slice(0, 3).map((a) => (
                                      <span
                                        key={a.id}
                                        title={a.full_name}
                                        className="flex h-5 w-5 items-center justify-center rounded-full border border-white bg-brand-soft text-[9px] font-bold text-brand dark:border-slate-800"
                                      >
                                        {getInitials(a.full_name)}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}

                      {/* Quick Add Form in Phase */}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleQuickAddTaskToPhase(phase.id);
                        }}
                        className="mt-2 flex gap-2"
                      >
                        <input
                          type="text"
                          value={quickTitle}
                          onChange={(e) =>
                            setQuickAddTitles((prev) => ({
                              ...prev,
                              [phase.id]: e.target.value,
                            }))
                          }
                          placeholder={`+ Thêm công việc vào "${phase.name}"...`}
                          className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        />
                        <button
                          type="submit"
                          disabled={isAdding || !quickTitle.trim()}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40 dark:bg-slate-700 dark:hover:bg-slate-600 cursor-pointer"
                        >
                          {isAdding ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Plus className="h-3.5 w-3.5" />
                          )}
                          Thêm
                        </button>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Section: Unassigned tasks (if any) */}
          {unassignedTasks.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-5 dark:border-slate-700 dark:bg-slate-900/40">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Công việc chưa phân giai đoạn ({unassignedTasks.length})
                  </h4>
                  <p className="text-xs text-slate-500">
                    Gán các công việc này vào giai đoạn tương ứng để theo dõi chuẩn xác tiến độ
                  </p>
                </div>
              </div>

              <div className="mt-3 divide-y divide-slate-200/60 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                {unassignedTasks.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-xs"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectTask(t.id)}
                      className="text-left font-medium text-slate-800 hover:text-brand dark:text-slate-200 cursor-pointer"
                    >
                      {t.title}
                    </button>

                    <div className="flex items-center gap-2">
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) {
                            handleAssignPhaseToTask(t.id, e.target.value);
                          }
                        }}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
                      >
                        <option value="">+ Gán vào giai đoạn...</option>
                        {phases.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Manager */}
      <ProjectPhasesManagerModal
        projectId={projectId}
        projectName={projectName}
        isOpen={showManagerModal}
        onClose={() => setShowManagerModal(false)}
        phases={phases}
        onPhasesUpdated={onPhasesUpdated}
      />
    </div>
  );
}
