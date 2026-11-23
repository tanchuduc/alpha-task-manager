"use client";

import { useState, useEffect } from "react";
import {
  X,
  Sliders,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Building2,
  Calendar,
  User,
  Tag,
  FileText,
  Loader2,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type {
  Department,
  DeliveryConfidence,
  Profile,
  Project,
  ProgressMode,
  ProjectStatus,
} from "@/types/database";

export const PROJECT_CATEGORIES = [
  "Sách Quản trị & Kinh doanh",
  "Sách Kỹ năng & Phát triển bản thân",
  "Sách Kinh tế & Đầu tư",
  "Sách Tâm lý & Giáo dục",
  "Sách Khoa học & Lịch sử",
  "Sách Thiếu nhi & Tương tác",
  "Sách Văn học & Nghệ thuật",
  "Sách Tái bản & Chỉnh sửa",
  "Dự án Chiến dịch Marketing",
  "Dự án Chung",
];

export const CONFIDENCE_CONFIG: Record<
  DeliveryConfidence,
  { label: string; badgeClass: string; dotClass: string; desc: string }
> = {
  on_track: {
    label: "Đúng tiến độ (On Track)",
    badgeClass:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800",
    dotClass: "bg-emerald-500",
    desc: "Mọi khâu đang diễn ra suôn sẻ, đúng kế hoạch dự kiến.",
  },
  at_risk: {
    label: "Có nguy cơ trễ (At Risk)",
    badgeClass:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800",
    dotClass: "bg-amber-500",
    desc: "Đang có vướng mắc nhẹ (bản thảo nộp chậm, chờ duyệt bìa...) có thể ảnh hưởng hạn nộp.",
  },
  off_track: {
    label: "Trễ hạn / Vướng mắc (Off Track)",
    badgeClass:
      "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800",
    dotClass: "bg-rose-500",
    desc: "Đã quá hạn hoặc gặp vấn đề lớn cần can thiệp xử lý ngay.",
  },
};

const PROJECT_COLORS = [
  "#F26522",
  "#2563EB",
  "#10B981",
  "#8B5CF6",
  "#EC4899",
  "#F59E0B",
  "#06B6D4",
  "#64748B",
];

interface ProjectSettingsModalProps {
  project: Project;
  isOpen: boolean;
  onClose: () => void;
  departments: Department[];
  profiles: Profile[];
  onProjectUpdated: (updatedProject: Project) => void;
}

type TabKey = "general" | "advanced" | "danger";

export default function ProjectSettingsModal({
  project,
  isOpen,
  onClose,
  departments,
  profiles,
  onProjectUpdated,
}: ProjectSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [name, setName] = useState(project.name);
  const [code, setCode] = useState(project.code);
  const [color, setColor] = useState(project.color || "#F26522");
  const [category, setCategory] = useState(project.category || "Dự án Chung");
  const [customCategory, setCustomCategory] = useState("");
  const [isCustomCategory, setIsCustomCategory] = useState(false);

  const [deliveryConfidence, setDeliveryConfidence] =
    useState<DeliveryConfidence>(project.delivery_confidence || "on_track");
  const [confidenceNote, setConfidenceNote] = useState(
    project.confidence_note || ""
  );
  const [clientName, setClientName] = useState(project.client_name || "");
  const [projectManagerId, setProjectManagerId] = useState(
    project.project_manager_id || ""
  );
  const [departmentId, setDepartmentId] = useState(
    project.department_id || ""
  );
  const [startDate, setStartDate] = useState(project.start_date || "");
  const [dueDate, setDueDate] = useState(project.due_date || "");
  const [description, setDescription] = useState(project.description || "");
  const [status, setStatus] = useState<ProjectStatus>(project.status || "active");

  // Advanced progress & pipeline states
  const [progressMode, setProgressMode] = useState<ProgressMode>(
    project.progress_mode || "auto"
  );
  const [manualProgress, setManualProgress] = useState<number>(
    project.manual_progress ?? 0
  );
  const [enablePhaseAssignees, setEnablePhaseAssignees] = useState<boolean>(
    Boolean(project.enable_phase_assignees)
  );
  const [autoAssignSubtaskPhase, setAutoAssignSubtaskPhase] = useState<boolean>(
    project.auto_assign_subtask_phase !== false
  );
  const [assignTasksToCreator, setAssignTasksToCreator] = useState<boolean>(
    Boolean(project.assign_tasks_to_creator)
  );
  const [restrictTaskAssignment, setRestrictTaskAssignment] = useState<boolean>(
    Boolean(project.restrict_task_assignment)
  );
  const [restrictTasksToAssignee, setRestrictTasksToAssignee] = useState<boolean>(
    Boolean(project.restrict_tasks_to_assignee)
  );
  const [isPrivate, setIsPrivate] = useState<boolean>(
    Boolean(project.is_private)
  );

  useEffect(() => {
    if (isOpen) {
      setName(project.name);
      setCode(project.code);
      setColor(project.color || "#F26522");
      const currentCat = project.category || "Dự án Chung";
      if (PROJECT_CATEGORIES.includes(currentCat)) {
        setCategory(currentCat);
        setIsCustomCategory(false);
      } else {
        setCategory("__custom__");
        setCustomCategory(currentCat);
        setIsCustomCategory(true);
      }
      setDeliveryConfidence(project.delivery_confidence || "on_track");
      setConfidenceNote(project.confidence_note || "");
      setClientName(project.client_name || "");
      setProjectManagerId(project.project_manager_id || "");
      setDepartmentId(project.department_id || "");
      setStartDate(project.start_date || "");
      setDueDate(project.due_date || "");
      setDescription(project.description || "");
      setStatus(project.status || "active");
      setProgressMode(project.progress_mode || "auto");
      setManualProgress(project.manual_progress ?? 0);
      setEnablePhaseAssignees(Boolean(project.enable_phase_assignees));
      setAutoAssignSubtaskPhase(project.auto_assign_subtask_phase !== false);
      setAssignTasksToCreator(Boolean(project.assign_tasks_to_creator));
      setRestrictTaskAssignment(Boolean(project.restrict_task_assignment));
      setRestrictTasksToAssignee(Boolean(project.restrict_tasks_to_assignee));
      setIsPrivate(Boolean(project.is_private));
    }
  }, [isOpen, project]);

  if (!isOpen) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Vui lòng nhập tên dự án");
      return;
    }

    const finalCategory = isCustomCategory
      ? customCategory.trim() || "Dự án Chung"
      : category;

    setSubmitting(true);
    try {
      const supabase = createClient();
      const payload = {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        color,
        category: finalCategory,
        delivery_confidence: deliveryConfidence,
        confidence_note: confidenceNote.trim() || null,
        client_name: clientName.trim() || null,
        project_manager_id: projectManagerId || null,
        department_id: departmentId || null,
        start_date: startDate || null,
        due_date: dueDate || null,
        description: description.trim() || null,
        status,
        progress_mode: progressMode,
        manual_progress: Math.min(100, Math.max(0, Number(manualProgress) || 0)),
        enable_phase_assignees: enablePhaseAssignees,
        auto_assign_subtask_phase: autoAssignSubtaskPhase,
        assign_tasks_to_creator: assignTasksToCreator,
        restrict_task_assignment: restrictTaskAssignment,
        restrict_tasks_to_assignee: restrictTasksToAssignee,
        is_private: isPrivate,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("projects")
        .update(payload)
        .eq("id", project.id)
        .select("*, department:departments(id, name, code)")
        .single();

      if (error) throw error;

      toast.success("Đã cập nhật cài đặt dự án thành công!");
      onProjectUpdated(data as Project);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Không thể cập nhật dự án";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <span
              className="h-4 w-4 rounded-full"
              style={{ backgroundColor: color }}
            />
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {project.name}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Cài đặt & Sức khỏe dự án (Project Settings)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Header */}
        <div className="flex border-b border-slate-100 px-6 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
          <button
            type="button"
            onClick={() => setActiveTab("general")}
            className={cn(
              "border-b-2 py-3 px-4 text-xs font-semibold transition cursor-pointer",
              activeTab === "general"
                ? "border-brand text-brand"
                : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            )}
          >
            Thông tin chung & Sức khỏe
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("advanced")}
            className={cn(
              "border-b-2 py-3 px-4 text-xs font-semibold transition cursor-pointer",
              activeTab === "advanced"
                ? "border-brand text-brand"
                : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            )}
          >
            Cài đặt nâng cao & Tiến độ
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("danger")}
            className={cn(
              "border-b-2 py-3 px-4 text-xs font-semibold transition cursor-pointer",
              activeTab === "danger"
                ? "border-red-500 text-red-600"
                : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            )}
          >
            Khu vực nguy hiểm
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === "general" && (
            <div className="space-y-5">
              {/* Sức khỏe dự án (Delivery Confidence) */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-800/40 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <ShieldAlert className="h-4 w-4 text-brand" />
                    Độ tin cậy giao hàng / Sức khỏe dự án
                  </label>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                      CONFIDENCE_CONFIG[deliveryConfidence].badgeClass
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        CONFIDENCE_CONFIG[deliveryConfidence].dotClass
                      )}
                    />
                    {CONFIDENCE_CONFIG[deliveryConfidence].label}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {(["on_track", "at_risk", "off_track"] as DeliveryConfidence[]).map(
                    (key) => {
                      const cfg = CONFIDENCE_CONFIG[key];
                      const selected = deliveryConfidence === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setDeliveryConfidence(key)}
                          className={cn(
                            "rounded-lg border p-2.5 text-left transition cursor-pointer",
                            selected
                              ? "border-brand bg-white dark:bg-slate-900 ring-2 ring-brand/30 shadow-xs"
                              : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300"
                          )}
                        >
                          <div className="flex items-center gap-1.5 font-semibold text-xs text-slate-900 dark:text-slate-100">
                            <span className={cn("h-2 w-2 rounded-full", cfg.dotClass)} />
                            <span>{cfg.label.split(" (")[0]}</span>
                          </div>
                          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
                            {cfg.desc}
                          </p>
                        </button>
                      );
                    }
                  )}
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">
                    Ghi chú sức khỏe / Rủi ro hiện tại:
                  </label>
                  <input
                    type="text"
                    value={confidenceNote}
                    onChange={(e) => setConfidenceNote(e.target.value)}
                    maxLength={280}
                    placeholder="VD: Đang chờ tác giả phản hồi chương 4; Bản dịch đang trễ 3 ngày..."
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                  <div className="mt-1 text-right text-[10px] text-slate-400">
                    {confidenceNote.length}/280 ký tự
                  </div>
                </div>
              </div>

              {/* Tên & Mã dự án */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Tên dự án / Đầu sách <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Mã dự án (Code)
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono font-semibold uppercase text-slate-900 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              {/* Phân loại Category & Đối tác / Tác giả */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5 text-slate-400" />
                    Phân loại danh mục (Category)
                  </label>
                  <select
                    value={isCustomCategory ? "__custom__" : category}
                    onChange={(e) => {
                      if (e.target.value === "__custom__") {
                        setIsCustomCategory(true);
                      } else {
                        setIsCustomCategory(false);
                        setCategory(e.target.value);
                      }
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {PROJECT_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                    <option value="__custom__">+ Nhập danh mục khác...</option>
                  </select>

                  {isCustomCategory && (
                    <input
                      type="text"
                      value={customCategory}
                      onChange={(e) => setCustomCategory(e.target.value)}
                      placeholder="Nhập tên phân loại mới..."
                      className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-slate-400" />
                    Tác giả / Đối tác giữ bản quyền (Client/Partner)
                  </label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="VD: James Clear, NXB McGraw-Hill, Đơn vị liên kết..."
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              {/* Quản lý dự án (Project Manager) & Phòng ban */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Trưởng dự án phụ trách (Project Manager)
                  </label>
                  <select
                    value={projectManagerId}
                    onChange={(e) => setProjectManagerId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="">-- Chưa chỉ định --</option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name} {p.job_title ? `(${p.job_title})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Phòng ban chủ trì
                  </label>
                  <select
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="">Chung (Toàn công ty)</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Màu đại diện & Thời gian */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
                    Màu nhận diện
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    {PROJECT_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        className={cn(
                          "h-6 w-6 rounded-full transition cursor-pointer",
                          color === c && "ring-2 ring-brand ring-offset-2"
                        )}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Ngày bắt đầu
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-900 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Hạn hoàn thành (Deadline)
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-900 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              {/* Mô tả */}
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Mô tả & Ghi chú dự án
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Thông tin tóm tắt về cuốn sách, mục tiêu phát hành, ghi chú bản quyền..."
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>
          )}

          {activeTab === "advanced" && (
            <div className="space-y-6">
              {/* Progress Settings */}
              <div className="rounded-xl border border-slate-200 p-5 dark:border-slate-800 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Cấu hình tính tiến độ dự án (Progress Settings)
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Chọn cách tính toán thanh % tiến độ của dự án hiển thị trên toàn hệ thống.
                  </p>
                </div>

                <div className="space-y-3">
                  <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <input
                      type="radio"
                      name="progress_mode"
                      value="auto"
                      checked={progressMode === "auto"}
                      onChange={() => setProgressMode("auto")}
                      className="mt-0.5 text-brand focus:ring-brand"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        Tự động theo % công việc hoàn thành (Khuyên dùng)
                      </span>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        Hệ thống tự động tính: <code>(Số việc xong / Tổng số việc) × 100%</code>.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <input
                      type="radio"
                      name="progress_mode"
                      value="manual"
                      checked={progressMode === "manual"}
                      onChange={() => setProgressMode("manual")}
                      className="mt-0.5 text-brand focus:ring-brand"
                    />
                    <div className="flex-1">
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        Tiến độ nhập thủ công (Manual Progress)
                      </span>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        Trưởng dự án tự kéo thanh % theo nghiệm thu thực tế của từng giai đoạn.
                      </p>

                      {progressMode === "manual" && (
                        <div className="mt-3 flex items-center gap-4 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={manualProgress}
                            onChange={(e) => setManualProgress(Number(e.target.value))}
                            className="flex-1 accent-brand cursor-pointer"
                          />
                          <div className="flex items-center gap-1 font-mono font-bold text-sm text-brand min-w-[50px] justify-end">
                            <span>{manualProgress}%</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </label>
                </div>
              </div>

              {/* Phase Pipeline Settings */}
              <div className="rounded-xl border border-slate-200 p-5 dark:border-slate-800 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Cấu hình Quy trình Giai đoạn (Phases Pipeline)
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Kiểm soát phân công và kế thừa giai đoạn xuất bản sách giữa việc cha và việc con.
                  </p>
                </div>

                <div className="space-y-3 divide-y divide-slate-100 dark:divide-slate-800">
                  <label className="flex items-center justify-between gap-4 pt-1 cursor-pointer">
                    <div>
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                        Bật Người phụ trách Giai đoạn (Enable Phase Assignees)
                      </span>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        Khi bật, mỗi giai đoạn có thể gán 1 người chịu trách nhiệm chính. Chỉ người phụ trách giai đoạn đó (hoặc Quản trị viên / Trưởng dự án) mới được chuyển trạng thái công việc trong giai đoạn đó.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={enablePhaseAssignees}
                      onChange={(e) => setEnablePhaseAssignees(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand/40 cursor-pointer shrink-0"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-4 pt-3 cursor-pointer">
                    <div>
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                        Tự động gán giai đoạn của việc cha cho việc con (Auto-assign parent phase to subtasks)
                      </span>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        Các công việc phụ (subtasks) sẽ tự động kế thừa giai đoạn xuất bản của công việc cha khi tạo mới hoặc khi việc cha chuyển giai đoạn.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={autoAssignSubtaskPhase}
                      onChange={(e) => setAutoAssignSubtaskPhase(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand/40 cursor-pointer shrink-0"
                    />
                  </label>
                </div>
              </div>

              {/* Task Settings & Access Control */}
              <div className="rounded-xl border border-slate-200 p-5 dark:border-slate-800 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Quy tắc Giao việc & Quyền riêng tư (Task & Access Control)
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Thiết lập hành vi mặc định khi tạo việc mới và phạm vi truy cập dự án.
                  </p>
                </div>

                <div className="space-y-3 divide-y divide-slate-100 dark:divide-slate-800">
                  <label className="flex items-center justify-between gap-4 pt-1 cursor-pointer">
                    <div>
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                        Tự động giao việc cho người tạo (Assign Tasks to Creator)
                      </span>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        Khi thêm nhanh công việc mới mà chưa chọn người thực hiện, hệ thống tự động gán cho chính người tạo.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={assignTasksToCreator}
                      onChange={(e) => setAssignTasksToCreator(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand/40 cursor-pointer shrink-0"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-4 pt-3 cursor-pointer">
                    <div>
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                        Giới hạn phân công việc cho Quản lý & Trưởng nhóm (Restrict Task Assignment)
                      </span>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        Chỉ Quản trị viên, Trưởng phòng và Trưởng dự án mới được thay đổi người phụ trách công việc.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={restrictTaskAssignment}
                      onChange={(e) => setRestrictTaskAssignment(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand/40 cursor-pointer shrink-0"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-4 pt-3 cursor-pointer">
                    <div>
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                        Giới hạn Cộng tác viên / Thành viên chỉ xem việc được giao (Restrict Tasks to Assignee)
                      </span>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        Khi bật, thành viên thường và CTV chỉ nhìn thấy các công việc họ được giao hoặc tự tạo (Quản trị viên, Trưởng phòng và Trưởng dự án vẫn thấy toàn bộ).
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={restrictTasksToAssignee}
                      onChange={(e) => setRestrictTasksToAssignee(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand/40 cursor-pointer shrink-0"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-4 pt-3 cursor-pointer">
                    <div>
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                        Dự án nội bộ riêng tư (Project Privacy)
                      </span>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        Đánh dấu dự án ở chế độ riêng tư (chỉ thành viên được thêm vào dự án và Ban Giám đốc mới theo dõi chi tiết).
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={isPrivate}
                      onChange={(e) => setIsPrivate(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand/40 cursor-pointer shrink-0"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeTab === "danger" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-red-200 bg-red-50/40 p-4 dark:border-red-900/50 dark:bg-red-950/20">
                <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-bold text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  Trạng thái vận hành của dự án
                </div>
                <p className="mt-1 text-xs text-red-600/90 dark:text-red-400/80">
                  Thay đổi trạng thái để lưu trữ hoặc đóng dự án khi sách đã phát hành xong.
                </p>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setStatus("active")}
                    className={cn(
                      "rounded-lg border p-2.5 text-xs font-semibold transition cursor-pointer text-center",
                      status === "active"
                        ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                        : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900"
                    )}
                  >
                    Đang hoạt động
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatus("completed")}
                    className={cn(
                      "rounded-lg border p-2.5 text-xs font-semibold transition cursor-pointer text-center",
                      status === "completed"
                        ? "border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
                        : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900"
                    )}
                  >
                    Đã hoàn thành
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatus("archived")}
                    className={cn(
                      "rounded-lg border p-2.5 text-xs font-semibold transition cursor-pointer text-center",
                      status === "archived"
                        ? "border-slate-600 bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                        : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900"
                    )}
                  >
                    Lưu trữ (Archived)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
            >
              Đóng
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-brand-hover disabled:opacity-50 cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Đang lưu...
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" />
                  Lưu thay đổi
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
