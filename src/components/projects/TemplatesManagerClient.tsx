"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Layers,
  Calendar,
  X,
  Loader2,
  Play,
  ListChecks,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  cn,
  PRIORITY_CONFIG,
  generateProjectCode,
  getDepartmentDisplayName,
} from "@/lib/utils";
import { isTeamLeadOrManager } from "@/lib/permissions";
import type {
  Department,
  Profile,
  ProjectTemplate,
  ProjectTemplateTask,
  TaskPriority,
  TaskStatus,
} from "@/types/database";

interface TemplatesManagerClientProps {
  initialTemplates: ProjectTemplate[];
  departments: Department[];
  currentUser: Profile;
}

interface DraftTemplateTask {
  key: string;
  title: string;
  priority: TaskPriority;
  offset_days: number;
}

const TEMPLATE_COLORS = [
  "#F26522",
  "#2563EB",
  "#10B981",
  "#8B5CF6",
  "#EC4899",
  "#F59E0B",
  "#06B6D4",
];

const TEMPLATE_CATEGORIES = [
  "Xuất bản",
  "Marketing",
  "Sự kiện",
  "Bản quyền",
  "Kinh doanh",
  "Vận hành",
  "Chung",
];

function addDaysToDate(baseDateStr: string, offsetDays: number): string {
  const base = baseDateStr ? new Date(baseDateStr + "T00:00:00") : new Date();
  if (Number.isNaN(base.getTime())) {
    const now = new Date();
    now.setDate(now.getDate() + offsetDays);
    return now.toISOString().slice(0, 10);
  }
  base.setDate(base.getDate() + offsetDays);
  const yyyy = base.getFullYear();
  const mm = String(base.getMonth() + 1).padStart(2, "0");
  const dd = String(base.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function TemplatesManagerClient({
  initialTemplates,
  departments,
  currentUser,
}: TemplatesManagerClientProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const canDelete = isTeamLeadOrManager(currentUser);

  const [templates, setTemplates] =
    useState<ProjectTemplate[]>(initialTemplates);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    if (initialTemplates[0]) init[initialTemplates[0].id] = true;
    return init;
  });

  // Create template modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [tplName, setTplName] = useState("");
  const [tplCategory, setTplCategory] = useState("Xuất bản");
  const [tplDescription, setTplDescription] = useState("");
  const [tplColor, setTplColor] = useState("#F26522");
  const [draftTasks, setDraftTasks] = useState<DraftTemplateTask[]>([
    { key: "t-1", title: "", priority: "medium", offset_days: 3 },
  ]);
  const [creatingTpl, setCreatingTpl] = useState(false);

  // Use template modal
  const [useTemplate, setUseTemplate] = useState<ProjectTemplate | null>(null);
  const [projName, setProjName] = useState("");
  const [projCode, setProjCode] = useState("");
  const [projCodeEdited, setProjCodeEdited] = useState(false);
  const [projDeptId, setProjDeptId] = useState(currentUser.department_id ?? "");
  const [projStartDate, setProjStartDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [projDueDate, setProjDueDate] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function addDraftTaskRow() {
    setDraftTasks((prev) => {
      const lastOffset = prev.length > 0 ? prev[prev.length - 1].offset_days : 0;
      return [
        ...prev,
        {
          key: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title: "",
          priority: "medium",
          offset_days: lastOffset + 3,
        },
      ];
    });
  }

  function updateDraftTask(
    key: string,
    patch: Partial<Omit<DraftTemplateTask, "key">>
  ) {
    setDraftTasks((prev) =>
      prev.map((item) => (item.key === key ? { ...item, ...patch } : item))
    );
  }

  function removeDraftTask(key: string) {
    setDraftTasks((prev) =>
      prev.length <= 1 ? prev : prev.filter((item) => item.key !== key)
    );
  }

  function resetCreateModal() {
    setTplName("");
    setTplCategory("Xuất bản");
    setTplDescription("");
    setTplColor("#F26522");
    setDraftTasks([
      { key: `t-${Date.now()}`, title: "", priority: "medium", offset_days: 3 },
    ]);
  }

  async function handleCreateTemplate(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = tplName.trim();
    if (!trimmedName) {
      toast.error("Vui lòng nhập tên mẫu quy trình");
      return;
    }

    const validTasks = draftTasks
      .map((t) => ({ ...t, title: t.title.trim() }))
      .filter((t) => t.title.length > 0);

    setCreatingTpl(true);
    try {
      const { data: newTpl, error: tplErr } = await supabase
        .from("project_templates")
        .insert({
          name: trimmedName,
          category: tplCategory,
          description: tplDescription.trim() || null,
          color: tplColor,
          created_by: currentUser.id,
        })
        .select("*")
        .single();

      if (tplErr || !newTpl) {
        throw new Error(tplErr?.message || "Không thể tạo mẫu quy trình");
      }

      let insertedTasks: ProjectTemplateTask[] = [];
      if (validTasks.length > 0) {
        const { data: tasksRes, error: tasksErr } = await supabase
          .from("project_template_tasks")
          .insert(
            validTasks.map((t, idx) => ({
              template_id: newTpl.id,
              title: t.title,
              description: null,
              priority: t.priority,
              status_category: "todo",
              offset_days: Number.isFinite(t.offset_days) ? t.offset_days : 0,
              position: idx,
            }))
          )
          .select("*");

        if (tasksErr) {
          throw new Error(tasksErr.message);
        }
        insertedTasks = (tasksRes ?? []) as ProjectTemplateTask[];
      }

      const fullTemplate: ProjectTemplate = {
        ...(newTpl as ProjectTemplate),
        tasks: insertedTasks,
      };
      setTemplates((prev) => [fullTemplate, ...prev]);
      setExpandedIds((prev) => ({ ...prev, [newTpl.id]: true }));
      toast.success(`Đã tạo mẫu "${trimmedName}" thành công!`);
      setShowCreateModal(false);
      resetCreateModal();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Đã xảy ra lỗi khi tạo mẫu"
      );
    } finally {
      setCreatingTpl(false);
    }
  }

  async function handleDeleteTemplate(tpl: ProjectTemplate) {
    if (!canDelete) {
      toast.error("Chỉ Quản trị viên hoặc Quản lý mới có quyền xóa mẫu");
      return;
    }
    setDeletingId(tpl.id);
    try {
      const { error } = await supabase
        .from("project_templates")
        .delete()
        .eq("id", tpl.id);
      if (error) throw new Error(error.message);

      setTemplates((prev) => prev.filter((item) => item.id !== tpl.id));
      toast.success(`Đã xóa mẫu "${tpl.name}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không thể xóa mẫu");
    } finally {
      setDeletingId(null);
    }
  }

  function openUseTemplateModal(tpl: ProjectTemplate) {
    setUseTemplate(tpl);
    setProjName("");
    setProjCode("");
    setProjCodeEdited(false);
    setProjDeptId(currentUser.department_id ?? "");
    const today = new Date().toISOString().slice(0, 10);
    setProjStartDate(today);
    // Suggest due date from max offset_days
    const maxOffset = Math.max(
      0,
      ...(tpl.tasks ?? []).map((t) => t.offset_days ?? 0)
    );
    setProjDueDate(maxOffset > 0 ? addDaysToDate(today, maxOffset) : "");
  }

  async function handleCreateProjectFromTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!useTemplate) return;
    const trimmedName = projName.trim();
    if (!trimmedName) {
      toast.error("Vui lòng nhập tên dự án mới");
      return;
    }
    const trimmedCode = (
      projCode.trim() || generateProjectCode(trimmedName)
    ).toUpperCase();

    setCreatingProject(true);
    try {
      const { data: newProj, error: projErr } = await supabase
        .from("projects")
        .insert({
          name: trimmedName,
          code: trimmedCode,
          description: useTemplate.description,
          color: useTemplate.color || "#F26522",
          status: "active",
          department_id: projDeptId || null,
          start_date: projStartDate || null,
          due_date: projDueDate || null,
          created_by: currentUser.id,
        })
        .select("*")
        .single();

      if (projErr || !newProj) {
        throw new Error(projErr?.message || "Không thể tạo dự án từ mẫu");
      }

      await supabase.from("project_members").upsert(
        {
          project_id: newProj.id,
          user_id: currentUser.id,
          role: "owner",
        },
        { onConflict: "project_id,user_id" }
      );

      const tplTasks = [...(useTemplate.tasks ?? [])].sort(
        (a, b) => a.position - b.position
      );

      if (tplTasks.length > 0) {
        const { data: statusesData } = await supabase
          .from("task_statuses")
          .select("*")
          .eq("project_id", newProj.id)
          .order("position", { ascending: true });

        const statuses = (statusesData ?? []) as TaskStatus[];
        const todoStatus =
          statuses.find((s) => s.category === "todo") ?? statuses[0] ?? null;

        if (todoStatus) {
          const baseStart =
            projStartDate || new Date().toISOString().slice(0, 10);
          await supabase.from("tasks").insert(
            tplTasks.map((t, idx) => {
              const matchedStatus =
                statuses.find((s) => s.category === t.status_category) ??
                todoStatus;
              return {
                project_id: newProj.id,
                status_id: matchedStatus.id,
                title: t.title,
                description: t.description,
                priority: t.priority,
                start_date: baseStart,
                due_date: addDaysToDate(baseStart, t.offset_days ?? 0),
                position: idx,
                created_by: currentUser.id,
              };
            })
          );
        }
      }

      toast.success(
        `Đã khởi tạo dự án "${trimmedName}" từ mẫu "${useTemplate.name}"!`
      );
      setUseTemplate(null);
      router.push(`/projects/${newProj.id}`);
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Đã xảy ra lỗi khi tạo dự án"
      );
    } finally {
      setCreatingProject(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/projects"
            className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-brand dark:text-slate-400"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Quay lại danh sách Dự án
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Mẫu quy trình dự án
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Chuẩn hóa quy trình xuất bản, marketing và sự kiện Alpha Books để tái sử dụng nhanh.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-brand-hover cursor-pointer self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          Tạo mẫu mới
        </button>
      </div>

      {/* Templates List */}
      {templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center dark:border-slate-700 dark:bg-slate-900/60">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand dark:bg-brand/15">
            <Layers className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
            Chưa có mẫu quy trình nào
          </h3>
          <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
            Tạo mẫu đầu tiên với danh sách đầu việc chuẩn để tiết kiệm thời gian khởi tạo dự án.
          </p>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Tạo mẫu mới
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {templates.map((tpl) => {
            const sortedTasks = [...(tpl.tasks ?? [])].sort(
              (a, b) => a.position - b.position
            );
            const isExpanded = !!expandedIds[tpl.id];

            return (
              <div
                key={tpl.id}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3.5">
                    <div
                      className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-xs"
                      style={{ backgroundColor: tpl.color || "#F26522" }}
                    >
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                          {tpl.name}
                        </h2>
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {tpl.category}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                          <ListChecks className="h-3.5 w-3.5" />
                          {sortedTasks.length} công việc
                        </span>
                      </div>
                      {tpl.description && (
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          {tpl.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openUseTemplateModal(tpl)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-brand-hover cursor-pointer"
                    >
                      <Play className="h-3.5 w-3.5" />
                      Dùng mẫu này
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleExpand(tpl.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      {isExpanded ? (
                        <>
                          Ẩn đầu việc <ChevronUp className="h-3.5 w-3.5" />
                        </>
                      ) : (
                        <>
                          Xem đầu việc <ChevronDown className="h-3.5 w-3.5" />
                        </>
                      )}
                    </button>

                    {canDelete && (
                      <button
                        type="button"
                        disabled={deletingId === tpl.id}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Bạn có chắc muốn xóa mẫu "${tpl.name}"?`
                            )
                          ) {
                            handleDeleteTemplate(tpl);
                          }
                        }}
                        title="Xóa mẫu"
                        className="rounded-lg border border-slate-200 p-2 text-slate-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-slate-700 dark:hover:border-red-900 dark:hover:bg-red-950/40 dark:hover:text-red-400 cursor-pointer"
                      >
                        {deletingId === tpl.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expandable task preview */}
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-950/40">
                    {sortedTasks.length === 0 ? (
                      <p className="text-xs italic text-slate-400">
                        Mẫu này chưa có công việc mẫu nào.
                      </p>
                    ) : (
                      <ol className="divide-y divide-slate-200/70 dark:divide-slate-800">
                        {sortedTasks.map((task, idx) => {
                          const pCfg =
                            PRIORITY_CONFIG[task.priority] ??
                            PRIORITY_CONFIG.medium;
                          return (
                            <li
                              key={task.id}
                              className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
                            >
                              <div className="flex items-center gap-2.5">
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                  {idx + 1}
                                </span>
                                <span className="font-medium text-slate-800 dark:text-slate-200">
                                  {task.title}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
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
                                <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-xs text-slate-500 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-700">
                                  <Calendar className="h-3 w-3" />+
                                  {task.offset_days} ngày
                                </span>
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Template Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs"
          onClick={() => !creatingTpl && setShowCreateModal(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Tạo mẫu quy trình mới
              </h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTemplate} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Tên mẫu <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={tplName}
                    onChange={(e) => setTplName(e.target.value)}
                    placeholder="VD: Quy trình Xuất bản Sách Mới (Tiêu chuẩn)"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Phân loại
                  </label>
                  <select
                    value={tplCategory}
                    onChange={(e) => setTplCategory(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {TEMPLATE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Mô tả
                  </label>
                  <input
                    type="text"
                    value={tplDescription}
                    onChange={(e) => setTplDescription(e.target.value)}
                    placeholder="Mô tả ngắn gọn mục đích quy trình..."
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Màu sắc
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5 pt-2">
                    {TEMPLATE_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setTplColor(c)}
                        className={cn(
                          "h-5 w-5 rounded-full transition cursor-pointer",
                          tplColor === c
                            ? "ring-2 ring-slate-900 ring-offset-2 dark:ring-white dark:ring-offset-slate-900"
                            : "hover:scale-110"
                        )}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Dynamic tasks list */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Danh sách công việc mẫu
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Số ngày (+ngày) sẽ được cộng vào ngày bắt đầu dự án để tự động tính hạn hoàn thành.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addDraftTaskRow}
                    className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-brand ring-1 ring-slate-200 hover:bg-brand-soft dark:bg-slate-800 dark:ring-slate-700 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Thêm việc
                  </button>
                </div>

                <div className="space-y-2.5">
                  {draftTasks.map((task, idx) => (
                    <div
                      key={task.key}
                      className="grid grid-cols-12 items-center gap-2"
                    >
                      <span className="col-span-1 text-center text-xs font-semibold text-slate-400">
                        {idx + 1}.
                      </span>
                      <input
                        type="text"
                        value={task.title}
                        onChange={(e) =>
                          updateDraftTask(task.key, { title: e.target.value })
                        }
                        placeholder="Tên đầu việc..."
                        className="col-span-11 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 sm:col-span-6"
                      />
                      <select
                        value={task.priority}
                        onChange={(e) =>
                          updateDraftTask(task.key, {
                            priority: e.target.value as TaskPriority,
                          })
                        }
                        className="col-span-6 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 sm:col-span-2"
                      >
                        <option value="low">Thấp</option>
                        <option value="medium">Trung bình</option>
                        <option value="high">Cao</option>
                        <option value="urgent">Khẩn cấp</option>
                      </select>
                      <div className="col-span-4 flex items-center gap-1 sm:col-span-2">
                        <span className="text-xs text-slate-400">+</span>
                        <input
                          type="number"
                          min={0}
                          max={365}
                          value={task.offset_days}
                          onChange={(e) =>
                            updateDraftTask(task.key, {
                              offset_days: parseInt(e.target.value || "0", 10),
                            })
                          }
                          title="Số ngày kể từ ngày bắt đầu dự án"
                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        />
                        <span className="text-xs text-slate-400">ng</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeDraftTask(task.key)}
                        disabled={draftTasks.length <= 1}
                        className="col-span-2 flex justify-center rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-30 dark:hover:bg-red-950/40 sm:col-span-1 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={creatingTpl}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={creatingTpl}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60 cursor-pointer"
                >
                  {creatingTpl && <Loader2 className="h-4 w-4 animate-spin" />}
                  {creatingTpl ? "Đang lưu..." : "Lưu mẫu quy trình"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Use Template -> Create Project Modal */}
      {useTemplate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs"
          onClick={() => !creatingProject && setUseTemplate(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Khởi tạo dự án từ mẫu
                </h2>
                <p className="text-xs text-brand font-medium mt-0.5">
                  Mẫu: {useTemplate.name} ({useTemplate.tasks?.length ?? 0} việc)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setUseTemplate(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={handleCreateProjectFromTemplate}
              className="mt-5 space-y-4"
            >
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Tên dự án mới <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={projName}
                  onChange={(e) => {
                    setProjName(e.target.value);
                    if (!projCodeEdited) {
                      setProjCode(generateProjectCode(e.target.value));
                    }
                  }}
                  placeholder="VD: Xuất bản sách Đắc Nhân Tâm 2026"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Mã dự án
                  </label>
                  <input
                    type="text"
                    value={projCode}
                    onChange={(e) => {
                      setProjCode(e.target.value.toUpperCase());
                      setProjCodeEdited(true);
                    }}
                    maxLength={12}
                    placeholder="DNT26"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm uppercase text-slate-900 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Phòng ban
                  </label>
                  <select
                    value={projDeptId}
                    onChange={(e) => setProjDeptId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="">Chung</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {getDepartmentDisplayName(d, departments)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Ngày bắt đầu
                  </label>
                  <input
                    type="date"
                    value={projStartDate}
                    onChange={(e) => setProjStartDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Hạn hoàn thành
                  </label>
                  <input
                    type="date"
                    value={projDueDate}
                    onChange={(e) => setProjDueDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setUseTemplate(null)}
                  disabled={creatingProject}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={creatingProject}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60 cursor-pointer"
                >
                  {creatingProject && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {creatingProject ? "Đang tạo..." : "Tạo dự án ngay"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
