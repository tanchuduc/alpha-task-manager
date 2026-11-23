"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Link2,
  AlertTriangle,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldAlert,
  Loader2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type {
  DependencyType,
  Profile,
  Task,
  TaskDependency,
  TaskStatus,
} from "@/types/database";

export interface ResolvedDependency {
  id: string; // dependency row id
  relation: "blocked_by" | "blocking" | "relates_to";
  targetTaskId: string;
  targetTask: Task | null;
  createdAt: string;
}

interface TaskDependenciesSectionProps {
  taskId: string;
  projectId: string;
  currentUser: Profile;
  statuses: TaskStatus[];
  canEditTask?: boolean;
  onOpenTask?: (taskId: string) => void;
  onBlockersChange?: (hasBlockers: boolean, blockerTasks: Task[]) => void;
}

export default function TaskDependenciesSection({
  taskId,
  projectId,
  statuses,
  canEditTask = true,
  onOpenTask,
  onBlockersChange,
}: TaskDependenciesSectionProps) {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [dependencies, setDependencies] = useState<ResolvedDependency[]>([]);
  const [projectTasks, setProjectTasks] = useState<Task[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedRelType, setSelectedRelType] = useState<
    "blocked_by" | "blocking" | "relates_to"
  >("blocked_by");
  const [selectedTargetTaskId, setSelectedTargetTaskId] = useState<string>("");
  const [savingDep, setSavingDep] = useState(false);

  const statusesMap = useMemo(() => {
    const map = new Map<string, TaskStatus>();
    for (const s of statuses) map.set(s.id, s);
    return map;
  }, [statuses]);

  // Load project tasks & dependencies
  const loadDependencies = useCallback(async () => {
    setLoading(true);
    try {
      const [
        { data: allTasksData, error: tasksErr },
        { data: outgoingDeps, error: outErr },
        { data: incomingDeps, error: inErr },
      ] = await Promise.all([
        supabase
          .from("tasks")
          .select("id, project_id, title, status_id, priority, due_date, completed_at")
          .eq("project_id", projectId)
          .neq("id", taskId)
          .order("title", { ascending: true }),
        supabase
          .from("task_dependencies")
          .select("*")
          .eq("task_id", taskId),
        supabase
          .from("task_dependencies")
          .select("*")
          .eq("depends_on_task_id", taskId),
      ]);

      if (tasksErr || outErr || inErr) {
        throw new Error("Lỗi khi tải dữ liệu phụ thuộc");
      }

      const tasksList = (allTasksData ?? []) as Task[];
      const taskLookup = new Map<string, Task>();
      for (const t of tasksList) taskLookup.set(t.id, t);
      setProjectTasks(tasksList);

      const resolved: ResolvedDependency[] = [];

      // 1. Outgoing dependencies (task_id = current task)
      for (const row of (outgoingDeps ?? []) as TaskDependency[]) {
        const target = taskLookup.get(row.depends_on_task_id) ?? null;
        if (row.dependency_type === "blocked_by") {
          resolved.push({
            id: row.id,
            relation: "blocked_by",
            targetTaskId: row.depends_on_task_id,
            targetTask: target,
            createdAt: row.created_at,
          });
        } else if (row.dependency_type === "blocking") {
          resolved.push({
            id: row.id,
            relation: "blocking",
            targetTaskId: row.depends_on_task_id,
            targetTask: target,
            createdAt: row.created_at,
          });
        } else if (row.dependency_type === "relates_to") {
          resolved.push({
            id: row.id,
            relation: "relates_to",
            targetTaskId: row.depends_on_task_id,
            targetTask: target,
            createdAt: row.created_at,
          });
        }
      }

      // 2. Incoming dependencies (depends_on_task_id = current task)
      for (const row of (incomingDeps ?? []) as TaskDependency[]) {
        const source = taskLookup.get(row.task_id) ?? null;
        if (row.dependency_type === "blocked_by") {
          // Task X is blocked by current task => Current task is blocking Task X
          resolved.push({
            id: row.id,
            relation: "blocking",
            targetTaskId: row.task_id,
            targetTask: source,
            createdAt: row.created_at,
          });
        } else if (row.dependency_type === "blocking") {
          // Task X is blocking current task => Current task is blocked by Task X
          resolved.push({
            id: row.id,
            relation: "blocked_by",
            targetTaskId: row.task_id,
            targetTask: source,
            createdAt: row.created_at,
          });
        } else if (row.dependency_type === "relates_to") {
          resolved.push({
            id: row.id,
            relation: "relates_to",
            targetTaskId: row.task_id,
            targetTask: source,
            createdAt: row.created_at,
          });
        }
      }

      setDependencies(resolved);
    } catch {
      toast.error("Không thể tải danh sách quan hệ phụ thuộc");
    } finally {
      setLoading(false);
    }
  }, [supabase, projectId, taskId]);

  useEffect(() => {
    loadDependencies();
  }, [loadDependencies]);

  // Check unresolved blockers: Tasks that BLOCK current task and are NOT done
  const unresolvedBlockers = useMemo(() => {
    return dependencies
      .filter((d) => d.relation === "blocked_by")
      .map((d) => d.targetTask)
      .filter((t): t is Task => {
        if (!t) return false;
        if (t.completed_at) return false;
        const st = t.status_id ? statusesMap.get(t.status_id) : null;
        return st?.category !== "done";
      });
  }, [dependencies, statusesMap]);

  // Notify parent of unresolved blockers
  useEffect(() => {
    if (onBlockersChange) {
      onBlockersChange(unresolvedBlockers.length > 0, unresolvedBlockers);
    }
  }, [unresolvedBlockers, onBlockersChange]);

  // Add a new dependency
  async function handleAddDependency(e: React.FormEvent) {
    e.preventDefault();
    if (!canEditTask) {
      toast.error("Bạn không có quyền chỉnh sửa công việc này.");
      return;
    }
    if (!selectedTargetTaskId) {
      toast.error("Vui lòng chọn công việc liên kết");
      return;
    }
    if (connectedTaskIds.has(selectedTargetTaskId)) {
      toast.error("Công việc này đã được liên kết phụ thuộc với việc hiện tại.");
      return;
    }

    setSavingDep(true);
    try {
      const depType: DependencyType = selectedRelType;

      const { error } = await supabase.from("task_dependencies").insert({
        task_id: taskId,
        depends_on_task_id: selectedTargetTaskId,
        dependency_type: depType,
      });

      if (error) {
        if (error.code === "23505") {
          toast.error("Mối quan hệ này đã tồn tại");
        } else {
          throw error;
        }
        return;
      }

      toast.success("Đã thiết lập mối quan hệ phụ thuộc!");
      setSelectedTargetTaskId("");
      setShowAddForm(false);
      await loadDependencies();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? `Lỗi: ${err.message}` : "Không thể tạo quan hệ phụ thuộc"
      );
    } finally {
      setSavingDep(false);
    }
  }

  // Delete a dependency
  async function handleDeleteDependency(depId: string) {
    if (!canEditTask) {
      toast.error("Bạn không có quyền gỡ bỏ quan hệ phụ thuộc này.");
      return;
    }
    try {
      const { error } = await supabase
        .from("task_dependencies")
        .delete()
        .eq("id", depId);

      if (error) throw error;
      toast.success("Đã gỡ bỏ quan hệ phụ thuộc");
      setDependencies((prev) => prev.filter((d) => d.id !== depId));
    } catch {
      toast.error("Không thể gỡ bỏ quan hệ phụ thuộc");
    }
  }

  // Available tasks to connect (exclude self and already connected tasks)
  const connectedTaskIds = useMemo(
    () => new Set(dependencies.map((d) => d.targetTaskId)),
    [dependencies]
  );
  const eligibleTasks = useMemo(
    () => projectTasks.filter((t) => !connectedTaskIds.has(t.id)),
    [projectTasks, connectedTaskIds]
  );

  const blockedByList = dependencies.filter((d) => d.relation === "blocked_by");
  const blockingList = dependencies.filter((d) => d.relation === "blocking");
  const relatesToList = dependencies.filter((d) => d.relation === "relates_to");

  return (
    <div className="space-y-3.5">
      {/* Red Alert Banner if task is blocked by incomplete tasks */}
      {unresolvedBlockers.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50/90 p-3.5 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
          <div className="space-y-1">
            <p className="font-bold">
              ⚠️ Công việc này đang bị chặn ({unresolvedBlockers.length} việc chưa hoàn thành):
            </p>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {unresolvedBlockers.map((b) => {
                const st = b.status_id ? statusesMap.get(b.status_id) : null;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onOpenTask?.(b.id)}
                    className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 font-medium text-red-700 shadow-2xs hover:underline dark:bg-red-900/60 dark:text-red-200 cursor-pointer"
                  >
                    <span>{b.title}</span>
                    <span className="text-[10px] opacity-75">
                      ({st?.name || "Đang thực hiện"})
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-red-600/80 dark:text-red-400/80">
              Khuyến nghị hoàn thành các công việc trên trước khi chuyển việc này sang Hoàn thành.
            </p>
          </div>
        </div>
      )}

      {/* Section Header */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-200">
          <Link2 className="h-4 w-4 text-brand" />
          Công việc phụ thuộc ({dependencies.length})
        </span>

        {canEditTask && (
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-soft dark:hover:bg-brand/15 cursor-pointer"
          >
            {showAddForm ? (
              <>
                <X className="h-3.5 w-3.5" />
                Đóng
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" />
                Thêm phụ thuộc
              </>
            )}
          </button>
        )}
      </div>

      {/* Add Dependency Form */}
      {showAddForm && (
        <form
          onSubmit={handleAddDependency}
          className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-3 dark:border-slate-800 dark:bg-slate-950/40"
        >
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Thiết lập mối liên kết công việc:
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-500">
                Loại quan hệ
              </label>
              <select
                value={selectedRelType}
                onChange={(e) =>
                  setSelectedRelType(
                    e.target.value as "blocked_by" | "blocking" | "relates_to"
                  )
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="blocked_by">Bị chặn bởi (Blocked by)</option>
                <option value="blocking">Chặn công việc (Blocking)</option>
                <option value="relates_to">Liên quan tới (Relates to)</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-500">
                Chọn công việc trong dự án
              </label>
              <select
                value={selectedTargetTaskId}
                onChange={(e) => setSelectedTargetTaskId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="">— Chọn công việc —</option>
                {eligibleTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={savingDep || !selectedTargetTaskId}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-hover disabled:opacity-40 cursor-pointer"
            >
              {savingDep ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Lưu liên kết
            </button>
          </div>
        </form>
      )}

      {/* Dependencies List */}
      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-brand" />
        </div>
      ) : dependencies.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-3.5 text-center text-xs text-slate-400 dark:border-slate-800">
          Chưa thiết lập công việc phụ thuộc nào
        </div>
      ) : (
        <div className="space-y-3">
          {/* Group 1: Bị chặn bởi (Blocked by) */}
          {blockedByList.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                ⛔ Bị chặn bởi ({blockedByList.length})
              </span>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                {blockedByList.map((dep) => {
                  const target = dep.targetTask;
                  const isDone =
                    target?.completed_at ||
                    (target?.status_id &&
                      statusesMap.get(target.status_id)?.category === "done");
                  const st = target?.status_id ? statusesMap.get(target.status_id) : null;

                  return (
                    <div
                      key={dep.id}
                      className="group flex items-center justify-between gap-2.5 px-3.5 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isDone ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                        )}
                        <button
                          type="button"
                          onClick={() => onOpenTask?.(dep.targetTaskId)}
                          className={cn(
                            "truncate text-left font-medium hover:text-brand cursor-pointer",
                            isDone ? "text-slate-400 line-through" : "text-slate-800 dark:text-slate-200"
                          )}
                        >
                          {target?.title || "(Công việc không tồn tại)"}
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
                      </div>

                      {canEditTask && (
                        <button
                          type="button"
                          onClick={() => handleDeleteDependency(dep.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition cursor-pointer"
                          title="Xóa liên kết phụ thuộc"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Group 2: Chặn công việc khác (Blocking) */}
          {blockingList.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
                🛑 Đang chặn ({blockingList.length})
              </span>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                {blockingList.map((dep) => {
                  const target = dep.targetTask;
                  const isDone =
                    target?.completed_at ||
                    (target?.status_id &&
                      statusesMap.get(target.status_id)?.category === "done");
                  const st = target?.status_id ? statusesMap.get(target.status_id) : null;

                  return (
                    <div
                      key={dep.id}
                      className="group flex items-center justify-between gap-2.5 px-3.5 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                        <button
                          type="button"
                          onClick={() => onOpenTask?.(dep.targetTaskId)}
                          className={cn(
                            "truncate text-left font-medium hover:text-brand cursor-pointer",
                            isDone ? "text-slate-400 line-through" : "text-slate-800 dark:text-slate-200"
                          )}
                        >
                          {target?.title || "(Công việc không tồn tại)"}
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
                      </div>

                      {canEditTask && (
                        <button
                          type="button"
                          onClick={() => handleDeleteDependency(dep.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition cursor-pointer"
                          title="Xóa liên kết phụ thuộc"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Group 3: Liên quan tới (Relates to) */}
          {relatesToList.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                🔗 Liên quan tới ({relatesToList.length})
              </span>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                {relatesToList.map((dep) => {
                  const target = dep.targetTask;
                  const isDone =
                    target?.completed_at ||
                    (target?.status_id &&
                      statusesMap.get(target.status_id)?.category === "done");
                  const st = target?.status_id
                    ? statusesMap.get(target.status_id)
                    : null;

                  return (
                    <div
                      key={dep.id}
                      className="group flex items-center justify-between gap-2.5 px-3.5 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Link2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <button
                          type="button"
                          onClick={() => onOpenTask?.(dep.targetTaskId)}
                          className={cn(
                            "truncate text-left font-medium hover:text-brand cursor-pointer",
                            isDone
                              ? "text-slate-400 line-through"
                              : "text-slate-800 dark:text-slate-200"
                          )}
                        >
                          {target?.title || "(Công việc không tồn tại)"}
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
                      </div>

                      {canEditTask && (
                        <button
                          type="button"
                          onClick={() => handleDeleteDependency(dep.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition cursor-pointer"
                          title="Xóa liên kết phụ thuộc"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
