"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  FolderKanban,
  Calendar,
  Building2,
  Layers,
  X,
  CheckCircle2,
  Sparkles,
  Loader2,
  Settings,
  ShieldAlert,
  Tag,
  User,
  Sliders,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  cn,
  formatDateVi,
  isOverdue,
  generateProjectCode,
  getDepartmentDisplayName,
} from "@/lib/utils";
import type {
  Department,
  DeliveryConfidence,
  Profile,
  Project,
  ProjectStatus,
  ProjectTemplate,
  TaskStatus,
} from "@/types/database";
import ProjectSettingsModal, {
  CONFIDENCE_CONFIG,
  PROJECT_CATEGORIES,
} from "./ProjectSettingsModal";

export interface ProjectWithStats extends Project {
  total_tasks: number;
  completed_tasks: number;
}

interface ProjectsListClientProps {
  initialProjects: ProjectWithStats[];
  departments: Department[];
  templates: ProjectTemplate[];
  currentUser: Profile;
  profiles?: Profile[];
}

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

const STATUS_META: Record<
  ProjectStatus,
  { label: string; badgeClass: string }
> = {
  active: {
    label: "Đang hoạt động",
    badgeClass:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900",
  },
  completed: {
    label: "Hoàn thành",
    badgeClass:
      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-900",
  },
  archived: {
    label: "Lưu trữ",
    badgeClass:
      "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
  },
};

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

export default function ProjectsListClient({
  initialProjects,
  departments,
  templates,
  currentUser,
  profiles = [],
}: ProjectsListClientProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [projects, setProjects] = useState<ProjectWithStats[]>(initialProjects);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ProjectStatus>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [confidenceFilter, setConfidenceFilter] = useState<string>("all");

  // Modal create state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);
  const [category, setCategory] = useState("Sách Quản trị & Kinh doanh");
  const [clientName, setClientName] = useState("");
  const [deliveryConfidence, setDeliveryConfidence] =
    useState<DeliveryConfidence>("on_track");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#F26522");
  const [departmentId, setDepartmentId] = useState<string>(
    currentUser.department_id ?? ""
  );
  const [startDate, setStartDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [dueDate, setDueDate] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Modal settings state
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId]
  );

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (departmentFilter !== "all" && p.department_id !== departmentFilter)
        return false;
      if (categoryFilter !== "all" && (p.category || "Dự án Chung") !== categoryFilter)
        return false;
      if (
        confidenceFilter !== "all" &&
        (p.delivery_confidence || "on_track") !== confidenceFilter
      )
        return false;

      if (q) {
        const matchName = p.name.toLowerCase().includes(q);
        const matchCode = p.code.toLowerCase().includes(q);
        const matchClient = (p.client_name || "").toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchClient) return false;
      }
      return true;
    });
  }, [projects, search, statusFilter, departmentFilter, categoryFilter, confidenceFilter]);

  function resetForm() {
    setSelectedTemplateId("");
    setName("");
    setCode("");
    setCodeManuallyEdited(false);
    setCategory("Sách Quản trị & Kinh doanh");
    setClientName("");
    setDeliveryConfidence("on_track");
    setDescription("");
    setColor("#F26522");
    setDepartmentId(currentUser.department_id ?? "");
    setStartDate(new Date().toISOString().slice(0, 10));
    setDueDate("");
  }

  function handleNameChange(val: string) {
    setName(val);
    if (!codeManuallyEdited) {
      setCode(generateProjectCode(val));
    }
  }

  function handleTemplateChange(tplId: string) {
    setSelectedTemplateId(tplId);
    const tpl = templates.find((t) => t.id === tplId);
    if (tpl) {
      setColor(tpl.color || "#F26522");
      if (!description && tpl.description) {
        setDescription(tpl.description);
      }
      if (tpl.category) {
        setCategory(tpl.category);
      }
    }
  }

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedCode = (code.trim() || generateProjectCode(trimmedName)).toUpperCase();

    if (!trimmedName) {
      toast.error("Vui lòng nhập tên dự án");
      return;
    }

    setSubmitting(true);
    try {
      const { data: newProject, error: projError } = await supabase
        .from("projects")
        .insert({
          name: trimmedName,
          code: trimmedCode,
          category,
          client_name: clientName.trim() || null,
          delivery_confidence: deliveryConfidence,
          description: description.trim() || null,
          color,
          status: "active",
          department_id: departmentId || null,
          start_date: startDate || null,
          due_date: dueDate || null,
          created_by: currentUser.id,
        })
        .select("*, department:departments(id, name, code)")
        .single();

      if (projError || !newProject) {
        throw new Error(projError?.message || "Không thể tạo dự án");
      }

      // Ensure creator is added as owner
      await supabase.from("project_members").upsert(
        {
          project_id: newProject.id,
          user_id: currentUser.id,
          role: "owner",
        },
        { onConflict: "project_id,user_id" }
      );

      let createdTaskCount = 0;

      // If a template is selected, bulk-insert template tasks
      if (selectedTemplate && selectedTemplate.tasks && selectedTemplate.tasks.length > 0) {
        const { data: statusesData } = await supabase
          .from("task_statuses")
          .select("*")
          .eq("project_id", newProject.id)
          .order("position", { ascending: true });

        const statuses = (statusesData ?? []) as TaskStatus[];
        const todoStatus =
          statuses.find((s) => s.category === "todo") ?? statuses[0] ?? null;

        if (todoStatus) {
          const baseStart = startDate || new Date().toISOString().slice(0, 10);
          const sortedTplTasks = [...selectedTemplate.tasks].sort(
            (a, b) => a.position - b.position
          );

          const tasksPayload = sortedTplTasks.map((tplTask, idx) => {
            const matchedStatus =
              statuses.find((s) => s.category === tplTask.status_category) ??
              todoStatus;
            return {
              project_id: newProject.id,
              status_id: matchedStatus.id,
              title: tplTask.title,
              description: tplTask.description,
              priority: tplTask.priority,
              start_date: baseStart,
              due_date: addDaysToDate(baseStart, tplTask.offset_days ?? 0),
              position: idx,
              created_by: currentUser.id,
            };
          });

          const { error: tasksError } = await supabase
            .from("tasks")
            .insert(tasksPayload);

          if (tasksError) {
            toast.error("Đã tạo dự án nhưng lỗi khi tạo công việc từ mẫu");
          } else {
            createdTaskCount = tasksPayload.length;
          }
        }
      }

      const projectWithStats: ProjectWithStats = {
        ...(newProject as Project),
        total_tasks: createdTaskCount,
        completed_tasks: 0,
      };
      setProjects((prev) => [projectWithStats, ...prev]);

      toast.success(
        createdTaskCount > 0
          ? `Đã tạo dự án "${trimmedName}" với ${createdTaskCount} công việc từ mẫu!`
          : `Đã tạo dự án "${trimmedName}" thành công!`
      );

      setShowCreateModal(false);
      resetForm();
      router.push(`/projects/${newProject.id}`);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Đã xảy ra lỗi khi tạo dự án";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function handleProjectUpdated(updated: Project) {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === updated.id
          ? {
              ...p,
              ...updated,
              total_tasks: p.total_tasks,
              completed_tasks: p.completed_tasks,
            }
          : p
      )
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Dự án & Xuất bản ({filteredProjects.length})
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Theo dõi tiến độ, sức khỏe dự án và danh mục xuất bản của Alpha Books.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/projects/templates"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Layers className="h-4 w-4 text-brand" />
            Mẫu quy trình
          </Link>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-brand-hover cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Tạo dự án mới
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên sách, mã dự án hoặc tác giả..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as "all" | ProjectStatus)
              }
              aria-label="Lọc theo trạng thái"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="active">Đang hoạt động</option>
              <option value="completed">Hoàn thành</option>
              <option value="archived">Lưu trữ</option>
            </select>

            {/* Confidence Filter */}
            <select
              value={confidenceFilter}
              onChange={(e) => setConfidenceFilter(e.target.value)}
              aria-label="Lọc theo sức khỏe"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
            >
              <option value="all">Tất cả sức khỏe</option>
              <option value="on_track">🟢 Đúng tiến độ (On track)</option>
              <option value="at_risk">🟡 Có rủi ro (At risk)</option>
              <option value="off_track">🔴 Trễ hạn (Off track)</option>
            </select>

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="Lọc theo phân loại"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer max-w-[170px]"
            >
              <option value="all">Tất cả danh mục</option>
              {PROJECT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            {/* Department Filter */}
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              aria-label="Lọc theo phòng ban"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
            >
              <option value="all">Tất cả phòng ban</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {getDepartmentDisplayName(dept, departments)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Projects Grid */}
      {filteredProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center dark:border-slate-700 dark:bg-slate-900/60">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand dark:bg-brand/15">
            <FolderKanban className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
            Chưa có dự án nào phù hợp
          </h3>
          <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
            {projects.length === 0
              ? "Hãy tạo dự án đầu tiên hoặc áp dụng Mẫu quy trình có sẵn để bắt đầu ngay."
              : "Thử thay đổi từ khóa tìm kiếm hoặc bộ lọc trạng thái, danh mục, sức khỏe."}
          </p>
          {projects.length === 0 && (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Tạo dự án mới
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredProjects.map((project) => {
            const isManual = project.progress_mode === "manual";
            const autoPct =
              project.total_tasks > 0
                ? Math.round((project.completed_tasks / project.total_tasks) * 100)
                : 0;
            const pct = isManual ? (project.manual_progress ?? 0) : autoPct;

            const statusInfo = STATUS_META[project.status] ?? STATUS_META.active;
            const conf =
              CONFIDENCE_CONFIG[project.delivery_confidence || "on_track"] ??
              CONFIDENCE_CONFIG.on_track;

            const overdue =
              project.status === "active" && isOverdue(project.due_date, null);

            return (
              <div
                key={project.id}
                className="group relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs transition hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand/50"
              >
                {/* Top color bar */}
                <div
                  className="h-1.5 w-full"
                  style={{ backgroundColor: project.color || "#F26522" }}
                />

                <div className="flex flex-1 flex-col p-5">
                  {/* Top Badges Row */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {project.code}
                      </span>
                      {project.category && (
                        <span className="truncate rounded-md bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
                          {project.category}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                          statusInfo.badgeClass
                        )}
                      >
                        {statusInfo.label}
                      </span>

                      {/* Settings cog button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setEditingProject(project);
                        }}
                        className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition cursor-pointer"
                        title="Cài đặt dự án"
                      >
                        <Settings className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Project Title */}
                  <Link
                    href={`/projects/${project.id}`}
                    className="mt-3 block group-hover:text-brand"
                  >
                    <h2 className="line-clamp-1 text-base font-bold text-slate-900 transition dark:text-slate-100">
                      {project.name}
                    </h2>
                  </Link>

                  {/* Client / Author & Delivery Confidence */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    {/* Delivery confidence badge */}
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                        conf.badgeClass
                      )}
                      title={project.confidence_note || conf.desc}
                    >
                      <span className={cn("h-1.5 w-1.5 rounded-full", conf.dotClass)} />
                      {conf.label.split(" (")[0]}
                    </span>

                    {/* Client / Author */}
                    {project.client_name && (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400 font-medium">
                        <User className="h-3 w-3 text-slate-400" />
                        {project.client_name}
                      </span>
                    )}
                  </div>

                  {/* Confidence note preview if available */}
                  {project.confidence_note && (
                    <p className="mt-2 text-[11px] italic text-slate-500 dark:text-slate-400 line-clamp-1 bg-slate-50 dark:bg-slate-800/40 px-2 py-1 rounded">
                      &quot;{project.confidence_note}&quot;
                    </p>
                  )}

                  {/* Description */}
                  {project.description ? (
                    <p className="mt-2 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                      {project.description}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs italic text-slate-400 dark:text-slate-500">
                      Chưa có mô tả dự án
                    </p>
                  )}

                  {/* Metadata: Department & Deadline */}
                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-slate-400" />
                      {project.department?.name || "Chung"}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5",
                        overdue && "font-medium text-red-600 dark:text-red-400"
                      )}
                    >
                      <Calendar className="h-3.5 w-3.5" />
                      {project.due_date
                        ? `Hạn: ${formatDateVi(project.due_date)}`
                        : "Chưa đặt hạn"}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-auto pt-4">
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1 font-medium text-slate-600 dark:text-slate-300">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        Tiến độ {isManual ? "(Thủ công)" : "công việc"}
                      </span>
                      <span className="font-semibold text-slate-700 dark:text-slate-200">
                        {isManual
                          ? `${pct}%`
                          : `${project.completed_tasks}/${project.total_tasks} (${pct}%)`}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: project.color || "#F26522",
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Project Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs"
          onClick={() => !submitting && setShowCreateModal(false)}
        >
          <div
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Tạo dự án mới
              </h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="mt-5 space-y-4">
              {/* Template selector */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                  <Sparkles className="h-4 w-4 text-brand" />
                  Chọn mẫu quy trình (tùy chọn)
                </label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="">— Dự án trống (không dùng mẫu) —</option>
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      [{tpl.category}] {tpl.name} ({tpl.tasks?.length ?? 0} công việc)
                    </option>
                  ))}
                </select>
                {selectedTemplate && (
                  <p className="mt-1.5 rounded-lg bg-brand-soft px-3 py-2 text-xs text-brand dark:bg-brand/15">
                    Sẽ tự động tạo{" "}
                    <strong>{selectedTemplate.tasks?.length ?? 0} công việc</strong>{" "}
                    mẫu với hạn hoàn thành tính từ ngày bắt đầu dự án.
                  </p>
                )}
              </div>

              {/* Name & Code */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Tên dự án / Đầu sách <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="VD: Ra mắt sách Tư Duy Nhanh & Chậm"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Mã dự án
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value.toUpperCase());
                      setCodeManuallyEdited(true);
                    }}
                    maxLength={12}
                    placeholder="VD: TDNC"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm uppercase text-slate-900 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              {/* Category & Client */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Phân loại danh mục
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {PROJECT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Tác giả / Đối tác giữ bản quyền
                  </label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="VD: Daniel Kahneman"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              {/* Delivery Confidence */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Sức khỏe dự án ban đầu
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["on_track", "at_risk", "off_track"] as DeliveryConfidence[]).map((key) => {
                    const cfg = CONFIDENCE_CONFIG[key];
                    const selected = deliveryConfidence === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setDeliveryConfidence(key)}
                        className={cn(
                          "rounded-lg border p-2 text-left text-xs font-medium transition cursor-pointer",
                          selected
                            ? "border-brand bg-brand-soft/30 text-brand ring-1 ring-brand font-semibold"
                            : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                        )}
                      >
                        <span className={cn("inline-block h-2 w-2 rounded-full mr-1.5", cfg.dotClass)} />
                        {cfg.label.split(" (")[0]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Mô tả ngắn
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Mục tiêu, phạm vi hoặc ghi chú quan trọng..."
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              {/* Department & Color */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Phòng ban phụ trách
                  </label>
                  <select
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="">Chung / Liên phòng ban</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {getDepartmentDisplayName(d, departments)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Màu nhận diện
                  </label>
                  <div className="flex flex-wrap items-center gap-2 pt-1.5">
                    {PROJECT_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        aria-label={`Chọn màu ${c}`}
                        className={cn(
                          "h-6 w-6 rounded-full transition cursor-pointer",
                          color === c
                            ? "ring-2 ring-slate-900 ring-offset-2 dark:ring-white dark:ring-offset-slate-900"
                            : "hover:scale-110"
                        )}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Ngày bắt đầu
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Hạn hoàn thành
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={submitting}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60 cursor-pointer"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submitting ? "Đang tạo..." : "Tạo dự án"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Project Settings Modal */}
      {editingProject && (
        <ProjectSettingsModal
          project={editingProject}
          isOpen={Boolean(editingProject)}
          onClose={() => setEditingProject(null)}
          departments={departments}
          profiles={profiles}
          onProjectUpdated={handleProjectUpdated}
        />
      )}
    </div>
  );
}
