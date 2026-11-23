"use client";

import { useState, useEffect } from "react";
import {
  X,
  Plus,
  Trash2,
  Edit2,
  Check,
  Sparkles,
  Loader2,
  Calendar,
  Layers,
  ArrowUp,
  ArrowDown,
  UserCheck,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { cn, getInitials } from "@/lib/utils";
import type { PhaseStatus, Profile, Project, ProjectPhase } from "@/types/database";

interface ProjectPhasesManagerModalProps {
  projectId: string;
  projectName: string;
  isOpen: boolean;
  onClose: () => void;
  phases: ProjectPhase[];
  members?: Profile[];
  project?: Project;
  onPhasesUpdated: () => void;
  onProjectUpdated?: (updated: Project) => void;
}

export const ALPHA_STANDARD_PHASES = [
  {
    name: "Bản quyền & Dịch thuật",
    description: "Ký kết hợp đồng bản quyền, dịch thuật bản thảo, thẩm định chuyên môn",
    color: "#3B82F6",
    status: "in_progress" as PhaseStatus,
  },
  {
    name: "Biên tập & Hiệu đính",
    description: "Biên tập nội dung thô, hiệu đính học thuật, rà soát thuật ngữ, đọc bông 1 & 2",
    color: "#8B5CF6",
    status: "pending" as PhaseStatus,
  },
  {
    name: "Thiết kế bìa & Dàn trang ruột",
    description: "Thiết kế market bìa, minh họa, dàn layout trang ruột (InDesign), kiểm morasse",
    color: "#EC4899",
    status: "pending" as PhaseStatus,
  },
  {
    name: "Xin phép xuất bản & In ấn",
    description: "Xin giấy phép xuất bản, nộp lưu chiểu, chế bản kẽm và in ấn tại xưởng in",
    color: "#EAB308",
    status: "pending" as PhaseStatus,
  },
  {
    name: "Marketing & Phát hành",
    description: "Truyền thông ra mắt, phân phối hệ thống nhà sách, chiến dịch bán trước & sự kiện",
    color: "#10B981",
    status: "pending" as PhaseStatus,
  },
];

const COLOR_PALETTE = [
  "#F26522", // Alpha Books Orange
  "#3B82F6", // Blue
  "#8B5CF6", // Purple
  "#EC4899", // Pink
  "#EAB308", // Amber
  "#10B981", // Emerald
  "#06B6D4", // Cyan
  "#64748B", // Slate
];

const STATUS_LABELS: Record<PhaseStatus, { label: string; badge: string }> = {
  pending: {
    label: "Chờ thực hiện",
    badge: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  },
  in_progress: {
    label: "Đang diễn ra",
    badge: "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-900",
  },
  completed: {
    label: "Đã hoàn thành",
    badge: "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900",
  },
};

export default function ProjectPhasesManagerModal({
  projectId,
  projectName,
  isOpen,
  onClose,
  phases,
  members = [],
  project,
  onPhasesUpdated,
  onProjectUpdated,
}: ProjectPhasesManagerModalProps) {
  const supabase = createClient();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null);

  // Project-level Phase Pipeline toggles
  const [enablePhaseAssignees, setEnablePhaseAssignees] = useState<boolean>(
    Boolean(project?.enable_phase_assignees)
  );
  const [autoAssignSubtaskPhase, setAutoAssignSubtaskPhase] = useState<boolean>(
    project?.auto_assign_subtask_phase !== false
  );

  useEffect(() => {
    if (project) {
      setEnablePhaseAssignees(Boolean(project.enable_phase_assignees));
      setAutoAssignSubtaskPhase(project.auto_assign_subtask_phase !== false);
    }
  }, [project]);

  // Form State
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formColor, setFormColor] = useState("#F26522");
  const [formStatus, setFormStatus] = useState<PhaseStatus>("pending");
  const [formAssigneeId, setFormAssigneeId] = useState<string>("");
  const [formStartDate, setFormStartDate] = useState("");
  const [formDueDate, setFormDueDate] = useState("");

  if (!isOpen) return null;

  function resetForm() {
    setEditingPhaseId(null);
    setFormName("");
    setFormDescription("");
    setFormColor("#F26522");
    setFormStatus("pending");
    setFormAssigneeId("");
    setFormStartDate("");
    setFormDueDate("");
  }

  function handleStartEdit(phase: ProjectPhase) {
    setEditingPhaseId(phase.id);
    setFormName(phase.name);
    setFormDescription(phase.description || "");
    setFormColor(phase.color || "#F26522");
    setFormStatus(phase.status || "pending");
    setFormAssigneeId(phase.assignee_id || "");
    setFormStartDate(phase.start_date || "");
    setFormDueDate(phase.due_date || "");
  }

  async function handleTogglePipelineSetting(
    field: "enable_phase_assignees" | "auto_assign_subtask_phase",
    nextVal: boolean
  ) {
    if (field === "enable_phase_assignees") {
      setEnablePhaseAssignees(nextVal);
    } else {
      setAutoAssignSubtaskPhase(nextVal);
    }

    try {
      const { data, error } = await supabase
        .from("projects")
        .update({
          [field]: nextVal,
          updated_at: new Date().toISOString(),
        })
        .eq("id", projectId)
        .select("*, department:departments(id, name, code)")
        .single();

      if (error) throw error;
      if (data && onProjectUpdated) {
        onProjectUpdated(data as Project);
      }
      toast.success("Đã lưu cấu hình quy trình giai đoạn.");
    } catch {
      toast.error("Không thể cập nhật cấu hình giai đoạn.");
    }
  }

  async function handleQuickAssignPhaseOwner(
    phaseId: string,
    assigneeId: string | null
  ) {
    try {
      const { error } = await supabase
        .from("project_phases")
        .update({ assignee_id: assigneeId || null })
        .eq("id", phaseId);
      if (error) throw error;
      toast.success("Đã cập nhật người phụ trách giai đoạn!");
      onPhasesUpdated();
    } catch {
      toast.error("Không thể gán người phụ trách giai đoạn.");
    }
  }

  async function handleSeedStandardPhases() {
    if (
      phases.length > 0 &&
      !confirm(
        "Dự án đã có một số giai đoạn. Bạn có muốn thêm trọn bộ 5 giai đoạn chuẩn xuất bản của Alpha Books vào không?"
      )
    ) {
      return;
    }

    setIsSubmitting(true);
    try {
      const startPos = phases.length;
      const rowsToInsert = ALPHA_STANDARD_PHASES.map((p, idx) => ({
        project_id: projectId,
        name: p.name,
        description: p.description,
        color: p.color,
        status: p.status,
        position: startPos + idx,
      }));

      const { error } = await supabase.from("project_phases").insert(rowsToInsert);
      if (error) throw error;

      toast.success("Đã khởi tạo thành công 5 giai đoạn xuất bản Alpha Books!");
      onPhasesUpdated();
      resetForm();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error
          ? `Lỗi: ${err.message}`
          : "Không thể khởi tạo giai đoạn xuất bản"
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmitPhase(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = formName.trim();
    if (!trimmedName) {
      toast.error("Vui lòng nhập tên giai đoạn");
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingPhaseId) {
        // Cập nhật phase
        const { error } = await supabase
          .from("project_phases")
          .update({
            name: trimmedName,
            description: formDescription.trim() || null,
            color: formColor,
            status: formStatus,
            assignee_id: formAssigneeId || null,
            start_date: formStartDate || null,
            due_date: formDueDate || null,
          })
          .eq("id", editingPhaseId);

        if (error) throw error;
        toast.success(`Đã cập nhật giai đoạn "${trimmedName}"`);
      } else {
        // Tạo phase mới
        const maxPos =
          phases.length > 0
            ? Math.max(...phases.map((p) => p.position ?? 0)) + 1
            : 0;

        const { error } = await supabase.from("project_phases").insert({
          project_id: projectId,
          name: trimmedName,
          description: formDescription.trim() || null,
          color: formColor,
          status: formStatus,
          assignee_id: formAssigneeId || null,
          start_date: formStartDate || null,
          due_date: formDueDate || null,
          position: maxPos,
        });

        if (error) throw error;
        toast.success(`Đã thêm giai đoạn "${trimmedName}"`);
      }

      onPhasesUpdated();
      resetForm();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error
          ? `Lỗi: ${err.message}`
          : "Không thể lưu giai đoạn"
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeletePhase(phase: ProjectPhase) {
    if (
      !confirm(
        `Bạn có chắc muốn xóa giai đoạn "${phase.name}"? Các công việc thuộc giai đoạn này sẽ chuyển về trạng thái Chưa phân giai đoạn.`
      )
    ) {
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("project_phases")
        .delete()
        .eq("id", phase.id);

      if (error) throw error;
      toast.success(`Đã xóa giai đoạn "${phase.name}"`);
      if (editingPhaseId === phase.id) resetForm();
      onPhasesUpdated();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error
          ? `Lỗi: ${err.message}`
          : "Không thể xóa giai đoạn"
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleMovePosition(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= phases.length) return;

    const currentItem = phases[index];
    const targetItem = phases[targetIndex];

    setIsSubmitting(true);
    try {
      await Promise.all([
        supabase
          .from("project_phases")
          .update({ position: targetItem.position })
          .eq("id", currentItem.id),
        supabase
          .from("project_phases")
          .update({ position: currentItem.position })
          .eq("id", targetItem.id),
      ]);

      onPhasesUpdated();
    } catch {
      toast.error("Không thể thay đổi thứ tự giai đoạn");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4.5 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand dark:bg-brand/20">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Quản lý Giai đoạn Xuất bản Sách
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Dự án: <span className="font-semibold">{projectName}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSeedStandardPhases}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand hover:bg-brand hover:text-white transition cursor-pointer dark:bg-brand/10 dark:hover:bg-brand"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Khởi tạo 5 giai đoạn chuẩn
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Pipeline Settings Banner (matching Worklenz Phases Settings) */}
        <div className="grid grid-cols-1 gap-3 border-b border-slate-100 bg-slate-50/70 px-6 py-3.5 dark:border-slate-800 dark:bg-slate-800/40 sm:grid-cols-2">
          <label className="flex items-start justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs dark:border-slate-800 dark:bg-slate-900 cursor-pointer">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-100">
                <ShieldCheck className="h-3.5 w-3.5 text-brand" />
                <span>Người phụ trách giai đoạn (Phase Assignees)</span>
              </div>
              <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                Khi bật, chỉ người phụ trách giai đoạn (hoặc Quản trị viên / Trưởng dự án) mới được chuyển trạng thái công việc trong giai đoạn đó.
              </p>
            </div>
            <input
              type="checkbox"
              checked={enablePhaseAssignees}
              onChange={(e) =>
                handleTogglePipelineSetting("enable_phase_assignees", e.target.checked)
              }
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand focus:ring-brand/40 cursor-pointer"
            />
          </label>

          <label className="flex items-start justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs dark:border-slate-800 dark:bg-slate-900 cursor-pointer">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-100">
                <Layers className="h-3.5 w-3.5 text-brand" />
                <span>Tự động gán giai đoạn cho việc con (Auto-assign Subtasks)</span>
              </div>
              <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                Các công việc phụ (subtasks) sẽ tự động kế thừa giai đoạn xuất bản từ công việc cha khi tạo mới hoặc khi việc cha chuyển giai đoạn.
              </p>
            </div>
            <input
              type="checkbox"
              checked={autoAssignSubtaskPhase}
              onChange={(e) =>
                handleTogglePipelineSetting("auto_assign_subtask_phase", e.target.checked)
              }
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand focus:ring-brand/40 cursor-pointer"
            />
          </label>
        </div>

        {/* Content Body: Two columns */}
        <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-12">
          {/* Left Column: Form */}
          <div className="overflow-y-auto border-b border-slate-100 p-6 dark:border-slate-800 md:col-span-5 md:border-b-0 md:border-r">
            <form onSubmit={handleSubmitPhase} className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {editingPhaseId ? "Chỉnh sửa giai đoạn" : "Thêm giai đoạn mới"}
                </span>
                {editingPhaseId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="text-xs font-medium text-slate-500 hover:text-brand underline cursor-pointer"
                  >
                    Hủy sửa
                  </button>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Tên giai đoạn <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="VD: Biên tập & Hiệu đính"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Mô tả / Mục tiêu giai đoạn
                </label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Ghi chú các đầu việc cốt lõi của giai đoạn này..."
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                  <UserCheck className="h-3.5 w-3.5 text-brand" />
                  Người phụ trách giai đoạn (Phase Assignee)
                </label>
                <select
                  value={formAssigneeId}
                  onChange={(e) => setFormAssigneeId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="">— Chưa chỉ định người phụ trách —</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name} {m.job_title ? `(${m.job_title})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Màu sắc nhận diện
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {COLOR_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFormColor(c)}
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-full transition cursor-pointer",
                        formColor === c ? "ring-2 ring-brand ring-offset-2" : "hover:scale-105"
                      )}
                      style={{ backgroundColor: c }}
                    >
                      {formColor === c && <Check className="h-3.5 w-3.5 text-white" />}
                    </button>
                  ))}
                  <input
                    type="color"
                    value={formColor}
                    onChange={(e) => setFormColor(e.target.value)}
                    className="h-7 w-7 rounded-full border-0 p-0 cursor-pointer"
                    title="Tùy chọn mã màu"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Trạng thái giai đoạn
                </label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as PhaseStatus)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="pending">Chờ thực hiện (Pending)</option>
                  <option value="in_progress">Đang diễn ra (In Progress)</option>
                  <option value="completed">Đã hoàn thành (Completed)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                    <Calendar className="h-3 w-3 text-slate-400" />
                    Bắt đầu
                  </label>
                  <input
                    type="date"
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                    <Calendar className="h-3 w-3 text-slate-400" />
                    Hạn hoàn thành
                  </label>
                  <input
                    type="date"
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !formName.trim()}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-brand-hover disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : editingPhaseId ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {editingPhaseId ? "Lưu thay đổi" : "Thêm giai đoạn"}
              </button>
            </form>
          </div>

          {/* Right Column: Existing Phases List */}
          <div className="flex flex-col overflow-y-auto p-6 md:col-span-7">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Danh sách giai đoạn ({phases.length})
              </span>
              <span className="text-[11px] text-slate-400">
                Sắp xếp theo thứ tự quy trình
              </span>
            </div>

            {phases.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
                  <Layers className="h-6 w-6" />
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Chưa có giai đoạn xuất bản nào
                </p>
                <p className="mt-1 max-w-xs text-xs text-slate-400">
                  Bấm nút bên dưới để tự động tạo 5 giai đoạn chuẩn ngành xuất bản của Alpha Books.
                </p>
                <button
                  type="button"
                  onClick={handleSeedStandardPhases}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-hover cursor-pointer"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Khởi tạo 5 giai đoạn ngay
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {phases.map((phase, idx) => {
                  const isSelected = editingPhaseId === phase.id;
                  const stMeta = STATUS_LABELS[phase.status] || STATUS_LABELS.pending;
                  const assignedMember = phase.assignee_id
                    ? members.find((m) => m.id === phase.assignee_id)
                    : null;

                  return (
                    <div
                      key={phase.id}
                      className={cn(
                        "group flex items-start justify-between gap-3 rounded-xl border p-3.5 transition",
                        isSelected
                          ? "border-brand bg-brand-soft/30 dark:border-brand dark:bg-brand/10"
                          : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex flex-col items-center">
                          <span
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-xs"
                            style={{ backgroundColor: phase.color || "#F26522" }}
                          >
                            {idx + 1}
                          </span>
                        </div>

                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                              {phase.name}
                            </h4>
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                stMeta.badge
                              )}
                            >
                              {stMeta.label}
                            </span>
                          </div>

                          {phase.description && (
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                              {phase.description}
                            </p>
                          )}

                          <div className="mt-2 flex flex-wrap items-center gap-3">
                            {/* Phase Assignee inline selector */}
                            <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50 px-2 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-800/60">
                              {assignedMember ? (
                                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand text-[9px] font-bold text-white">
                                  {getInitials(assignedMember.full_name)}
                                </span>
                              ) : (
                                <UserCheck className="h-3 w-3 text-slate-400" />
                              )}
                              <select
                                value={phase.assignee_id || ""}
                                onChange={(e) =>
                                  handleQuickAssignPhaseOwner(
                                    phase.id,
                                    e.target.value || null
                                  )
                                }
                                className="bg-transparent font-medium text-slate-700 focus:outline-none dark:text-slate-200 cursor-pointer"
                              >
                                <option value="">+ Gán phụ trách giai đoạn</option>
                                {members.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    Phụ trách: {m.full_name}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {(phase.start_date || phase.due_date) && (
                              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                                <Calendar className="h-3 w-3" />
                                <span>
                                  {phase.start_date || "—"} đến {phase.due_date || "—"}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                        {/* Move Up / Down */}
                        <div className="flex flex-col">
                          <button
                            type="button"
                            disabled={idx === 0 || isSubmitting}
                            onClick={() => handleMovePosition(idx, "up")}
                            title="Di chuyển lên"
                            className="rounded p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-20 dark:hover:text-slate-200 cursor-pointer"
                          >
                            <ArrowUp className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === phases.length - 1 || isSubmitting}
                            onClick={() => handleMovePosition(idx, "down")}
                            title="Di chuyển xuống"
                            className="rounded p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-20 dark:hover:text-slate-200 cursor-pointer"
                          >
                            <ArrowDown className="h-3 w-3" />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleStartEdit(phase)}
                          title="Sửa giai đoạn"
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeletePhase(phase)}
                          title="Xóa giai đoạn"
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-slate-100 bg-slate-50 px-6 py-3.5 dark:border-slate-800 dark:bg-slate-900/60">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
