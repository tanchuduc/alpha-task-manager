"use client";

import { useState, useMemo } from "react";
import {
  CheckCircle2,
  Users,
  Calendar,
  Flag,
  Trash2,
  X,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { logTaskActivity } from "@/lib/activity-logger";
import { PRIORITY_CONFIG } from "@/lib/utils";
import type { Profile, Task, TaskPriority, TaskStatus } from "@/types/database";

interface BulkActionBarProps {
  selectedTaskIds: string[];
  selectedTasks: Task[];
  statuses: TaskStatus[];
  profiles: Profile[];
  currentUser: Profile;
  onClearSelection: () => void;
  onTasksUpdated: () => void;
}

export default function BulkActionBar({
  selectedTaskIds,
  selectedTasks,
  statuses,
  profiles,
  currentUser,
  onClearSelection,
  onTasksUpdated,
}: BulkActionBarProps) {
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [activeMenu, setActiveMenu] = useState<
    "status" | "assignee" | "date" | "priority" | "delete" | null
  >(null);
  const [newDueDate, setNewDueDate] = useState("");

  const count = selectedTaskIds.length;
  if (count === 0) return null;

  // 1. Đổi trạng thái hàng loạt
  async function handleBulkStatusChange(statusId: string) {
    const targetStatus = statuses.find((s) => s.id === statusId);
    if (!targetStatus) return;

    setBusy(true);
    setActiveMenu(null);
    try {
      const isDone = targetStatus.category === "done";
      const completedAt = isDone ? new Date().toISOString() : null;

      const { error } = await supabase
        .from("tasks")
        .update({
          status_id: statusId,
          completed_at: completedAt,
        })
        .in("id", selectedTaskIds);

      if (error) throw error;

      // Log activities
      await Promise.all(
        selectedTasks.map((t) => {
          const oldStatus = statuses.find((s) => s.id === t.status_id)?.name;
          return logTaskActivity(supabase, {
            taskId: t.id,
            actorId: currentUser.id,
            action: "status_changed",
            details: {
              old_value: oldStatus,
              new_value: targetStatus.name,
              description: `Đổi trạng thái hàng loạt sang "${targetStatus.name}"`,
            },
          });
        })
      );

      toast.success(`Đã đổi trạng thái ${count} công việc sang "${targetStatus.name}"`);
      onTasksUpdated();
      onClearSelection();
    } catch {
      toast.error("Không thể cập nhật trạng thái hàng loạt");
    } finally {
      setBusy(false);
    }
  }

  // 2. Gán người phụ trách hàng loạt
  async function handleBulkAssign(profileId: string) {
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) return;

    setBusy(true);
    setActiveMenu(null);
    try {
      // Upsert into task_assignees
      const rowsToInsert = selectedTaskIds.map((taskId) => ({
        task_id: taskId,
        user_id: profileId,
      }));

      // In Postgres, upsert with ignoreDuplicates or insert
      const { error } = await supabase
        .from("task_assignees")
        .upsert(rowsToInsert, { onConflict: "task_id,user_id" });

      if (error) throw error;

      // Log activity
      await Promise.all(
        selectedTaskIds.map((taskId) =>
          logTaskActivity(supabase, {
            taskId,
            actorId: currentUser.id,
            action: "assignee_added",
            details: {
              new_value: profile.full_name,
              description: `Gán hàng loạt cho ${profile.full_name}`,
            },
          })
        )
      );

      toast.success(`Đã gán ${profile.full_name} phụ trách ${count} công việc`);
      onTasksUpdated();
      onClearSelection();
    } catch {
      toast.error("Không thể gán người phụ trách hàng loạt");
    } finally {
      setBusy(false);
    }
  }

  // 3. Dời hạn hoàn thành hàng loạt
  async function handleBulkDueDateChange() {
    setBusy(true);
    setActiveMenu(null);
    try {
      const dateVal = newDueDate || null;
      const { error } = await supabase
        .from("tasks")
        .update({ due_date: dateVal })
        .in("id", selectedTaskIds);

      if (error) throw error;

      await Promise.all(
        selectedTaskIds.map((taskId) =>
          logTaskActivity(supabase, {
            taskId,
            actorId: currentUser.id,
            action: "due_date_changed",
            details: {
              new_value: dateVal,
              description: dateVal
                ? `Cập nhật hạn hoàn thành hàng loạt thành ${dateVal}`
                : "Xóa hạn hoàn thành hàng loạt",
            },
          })
        )
      );

      toast.success(
        dateVal
          ? `Đã dời hạn hoàn thành ${count} công việc sang ${dateVal}`
          : `Đã xóa hạn chót của ${count} công việc`
      );
      onTasksUpdated();
      onClearSelection();
    } catch {
      toast.error("Không thể cập nhật hạn hoàn thành hàng loạt");
    } finally {
      setBusy(false);
    }
  }

  // 4. Đổi mức ưu tiên hàng loạt
  async function handleBulkPriorityChange(priority: TaskPriority) {
    setBusy(true);
    setActiveMenu(null);
    try {
      const pLabel = PRIORITY_CONFIG[priority]?.label || priority;
      const { error } = await supabase
        .from("tasks")
        .update({ priority })
        .in("id", selectedTaskIds);

      if (error) throw error;

      await Promise.all(
        selectedTaskIds.map((taskId) =>
          logTaskActivity(supabase, {
            taskId,
            actorId: currentUser.id,
            action: "priority_changed",
            details: {
              new_value: priority,
              description: `Đổi mức ưu tiên hàng loạt sang "${pLabel}"`,
            },
          })
        )
      );

      toast.success(`Đã đổi mức ưu tiên ${count} công việc sang "${pLabel}"`);
      onTasksUpdated();
      onClearSelection();
    } catch {
      toast.error("Không thể đổi mức ưu tiên hàng loạt");
    } finally {
      setBusy(false);
    }
  }

  // 5. Xóa hàng loạt
  async function handleBulkDelete() {
    setBusy(true);
    setActiveMenu(null);
    try {
      const { error } = await supabase
        .from("tasks")
        .delete()
        .in("id", selectedTaskIds);

      if (error) throw error;

      toast.success(`Đã xóa ${count} công việc`);
      onTasksUpdated();
      onClearSelection();
    } catch {
      toast.error("Không thể xóa các công việc đã chọn");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-4xl w-[92%] sm:w-auto animate-in fade-in slide-in-from-bottom-4 duration-200">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/95 px-4 py-2.5 shadow-2xl backdrop-blur-md text-white dark:border-slate-800 dark:bg-slate-950/95">
        {/* Count badge */}
        <div className="flex items-center gap-2 pr-2 border-r border-slate-700">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
            {count}
          </span>
          <span className="text-xs font-medium text-slate-200 whitespace-nowrap">
            Đã chọn {count} việc
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 relative">
          {/* Status Dropdown */}
          <div className="relative">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                setActiveMenu((prev) => (prev === "status" ? null : "status"))
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white cursor-pointer"
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-blue-400" />
              Đổi trạng thái
              <ChevronDown className="h-3 w-3 text-slate-400" />
            </button>

            {activeMenu === "status" && (
              <div className="absolute bottom-full left-0 mb-2 w-48 rounded-xl border border-slate-700 bg-slate-800 p-1 shadow-xl">
                {statuses.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => handleBulkStatusChange(st.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-slate-200 hover:bg-slate-700 cursor-pointer"
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: st.color || "#94A3B8" }}
                    />
                    {st.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Assignee Dropdown */}
          <div className="relative">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                setActiveMenu((prev) =>
                  prev === "assignee" ? null : "assignee"
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white cursor-pointer"
            >
              <Users className="h-3.5 w-3.5 text-brand" />
              Gán phụ trách
              <ChevronDown className="h-3 w-3 text-slate-400" />
            </button>

            {activeMenu === "assignee" && (
              <div className="absolute bottom-full left-0 mb-2 max-h-56 w-56 overflow-y-auto rounded-xl border border-slate-700 bg-slate-800 p-1 shadow-xl">
                {profiles.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleBulkAssign(p.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-700 cursor-pointer"
                  >
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand/20 text-[10px] font-bold text-brand">
                      {p.full_name.slice(0, 1).toUpperCase()}
                    </div>
                    <span className="truncate">{p.full_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Date Picker Popover */}
          <div className="relative">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                setActiveMenu((prev) => (prev === "date" ? null : "date"))
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white cursor-pointer"
            >
              <Calendar className="h-3.5 w-3.5 text-amber-400" />
              Dời hạn chót
              <ChevronDown className="h-3 w-3 text-slate-400" />
            </button>

            {activeMenu === "date" && (
              <div className="absolute bottom-full left-0 mb-2 w-60 rounded-xl border border-slate-700 bg-slate-800 p-3 shadow-xl space-y-2.5">
                <label className="block text-xs font-medium text-slate-300">
                  Chọn hạn hoàn thành mới:
                </label>
                <input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-xs text-white focus:border-brand focus:outline-none"
                />
                <div className="flex items-center justify-between gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setNewDueDate("");
                      handleBulkDueDateChange();
                    }}
                    className="text-[11px] text-slate-400 hover:text-rose-400 cursor-pointer"
                  >
                    Xóa hạn chót
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkDueDateChange}
                    className="rounded bg-brand px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-hover cursor-pointer"
                  >
                    Áp dụng
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Priority Dropdown */}
          <div className="relative">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                setActiveMenu((prev) =>
                  prev === "priority" ? null : "priority"
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white cursor-pointer"
            >
              <Flag className="h-3.5 w-3.5 text-rose-400" />
              Đổi ưu tiên
              <ChevronDown className="h-3 w-3 text-slate-400" />
            </button>

            {activeMenu === "priority" && (
              <div className="absolute bottom-full left-0 mb-2 w-44 rounded-xl border border-slate-700 bg-slate-800 p-1 shadow-xl">
                {(Object.keys(PRIORITY_CONFIG) as TaskPriority[]).map((p) => {
                  const cfg = PRIORITY_CONFIG[p];
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => handleBulkPriorityChange(p)}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-slate-200 hover:bg-slate-700 cursor-pointer"
                    >
                      <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Delete Button */}
          <div className="relative">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                setActiveMenu((prev) => (prev === "delete" ? null : "delete"))
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-950/60 border border-red-900/60 px-2.5 py-1.5 text-xs font-medium text-red-300 hover:bg-red-900/80 hover:text-white cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Xóa
            </button>

            {activeMenu === "delete" && (
              <div className="absolute bottom-full right-0 mb-2 w-56 rounded-xl border border-red-900 bg-slate-900 p-3 shadow-xl space-y-2">
                <p className="text-xs font-medium text-red-300">
                  Xác nhận xóa {count} công việc đã chọn?
                </p>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setActiveMenu(null)}
                    className="rounded px-2 py-1 text-xs text-slate-400 hover:text-white cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkDelete}
                    className="rounded bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 cursor-pointer"
                  >
                    Xóa ngay
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Clear selection */}
        <div className="pl-2 border-l border-slate-700 flex items-center">
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin text-brand" />
          ) : (
            <button
              type="button"
              onClick={onClearSelection}
              title="Bỏ chọn tất cả"
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
