"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
  User,
  List,
  LayoutGrid,
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { hasSystemPermission, SYSTEM_PERMISSIONS } from "@/lib/permissions";
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

type DisplayMode = "table" | "group" | "grid";
type GroupByField = "category" | "department" | "confidence" | "status";
type SortField = "name" | "due_date" | "progress" | "created_at";

const PROJECT_COLORS = [
  "#F47830",
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
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const [projects, setProjects] = useState<ProjectWithStats[]>(initialProjects);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ProjectStatus>(
    "active"
  );
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [confidenceFilter, setConfidenceFilter] = useState<string>("all");

  // Display mode synced with Left NavRail (?view=all | grouped | archived)
  const [displayMode, setDisplayMode] = useState<DisplayMode>("table");
  const [groupBy, setGroupBy] = useState<GroupByField>("category");
  const [collapsedGroups, setCollapsedGroups] = useState<
    Record<string, boolean>
  >({});
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    const viewParam = searchParams.get("view");
    if (viewParam === "grouped") {
      setDisplayMode("group");
      if (statusFilter === "archived") setStatusFilter("all");
    } else if (viewParam === "archived") {
      setStatusFilter("archived");
      setDisplayMode("table");
    } else if (viewParam === "all") {
      if (statusFilter === "archived") setStatusFilter("active");
      setDisplayMode("table");
    }
  }, [searchParams]);

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
  const [color, setColor] = useState("#F47830");
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

  const canCreateProjects = useMemo(
    () =>
      hasSystemPermission(currentUser, SYSTEM_PERMISSIONS.CREATE_PROJECTS),
    [currentUser]
  );

  function canEditProjectSettings(proj: Project): boolean {
    if (currentUser.role === "admin") return true;
    if (proj.created_by === currentUser.id) return true;
    if (proj.project_manager_id === currentUser.id) return true;
    return hasSystemPermission(currentUser, SYSTEM_PERMISSIONS.MANAGE_SETTINGS);
  }

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId]
  );

  function getProjectProgress(p: ProjectWithStats): number {
    if (p.progress_mode === "manual") return p.manual_progress ?? 0;
    return p.total_tasks > 0
      ? Math.round((p.completed_tasks / p.total_tasks) * 100)
      : 0;
  }

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = projects.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (departmentFilter !== "all" && p.department_id !== departmentFilter)
        return false;
      if (
        categoryFilter !== "all" &&
        (p.category || "Dự án Chung") !== categoryFilter
      )
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

    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === "name") {
        cmp = a.name.localeCompare(b.name, "vi");
      } else if (sortField === "due_date") {
        const da = a.due_date || "9999-12-31";
        const db = b.due_date || "9999-12-31";
        cmp = da.localeCompare(db);
      } else if (sortField === "progress") {
        cmp = getProjectProgress(a) - getProjectProgress(b);
      } else {
        cmp = (a.created_at || "").localeCompare(b.created_at || "");
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [
    projects,
    search,
    statusFilter,
    departmentFilter,
    categoryFilter,
    confidenceFilter,
    sortField,
    sortAsc,
  ]);

  const groupedProjects = useMemo(() => {
    const map = new Map<
      string,
      { key: string; label: string; items: ProjectWithStats[] }
    >();

    for (const p of filteredProjects) {
      let key = "default";
      let label = "Chưa phân nhóm";

      if (groupBy === "category") {
        key = p.category || "Dự án Chung";
        label = p.category || "Dự án Chung";
      } else if (groupBy === "department") {
        key = p.department?.id || "unassigned";
        label = p.department?.name || "Liên phòng ban / Chung";
      } else if (groupBy === "confidence") {
        const cKey = p.delivery_confidence || "on_track";
        key = cKey;
        label = CONFIDENCE_CONFIG[cKey]?.label || "Đúng tiến độ";
      } else if (groupBy === "status") {
        key = p.status;
        label = STATUS_META[p.status]?.label || p.status;
      }

      const existing = map.get(key) ?? { key, label, items: [] };
      existing.items.push(p);
      map.set(key, existing);
    }

    return Array.from(map.values());
  }, [filteredProjects, groupBy]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortAsc((prev) => !prev);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  }

  function resetForm() {
    setSelectedTemplateId("");
    setName("");
    setCode("");
    setCodeManuallyEdited(false);
    setCategory("Sách Quản trị & Kinh doanh");
    setClientName("");
    setDeliveryConfidence("on_track");
    setDescription("");
    setColor("#F47830");
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
      setColor(tpl.color || "#F47830");
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
    if (!canCreateProjects) {
      toast.error("Tài khoản của bạn không có quyền tạo dự án mới.");
      return;
    }
    const trimmedName = name.trim();
    const trimmedCode = (
      code.trim() || generateProjectCode(trimmedName)
    ).toUpperCase();

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

      await supabase.from("project_members").upsert(
        {
          project_id: newProject.id,
          user_id: currentUser.id,
          role: "owner",
        },
        { onConflict: "project_id,user_id" }
      );

      let createdTaskCount = 0;

      if (
        selectedTemplate &&
        selectedTemplate.tasks &&
        selectedTemplate.tasks.length > 0
      ) {
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
      const msg =
        err instanceof Error ? err.message : "Đã xảy ra lỗi khi tạo dự án";
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

  // Render a single high-density project table row (Worklenz project-list.tsx)
  function renderProjectRow(project: ProjectWithStats) {
    const pct = getProjectProgress(project);
    const statusInfo = STATUS_META[project.status] ?? STATUS_META.active;
    const conf =
      CONFIDENCE_CONFIG[project.delivery_confidence || "on_track"] ??
      CONFIDENCE_CONFIG.on_track;
    const overdue =
      project.status === "active" && isOverdue(project.due_date, null);

    return (
      <tr
        key={project.id}
        onClick={() => router.push(`/projects/${project.id}`)}
        className="group border-b border-[#f0f0f0] dark:border-[#262626] hover:bg-[#f8f9fa] dark:hover:bg-[#242424] transition cursor-pointer"
      >
        {/* Col 1: Color Dot + Code + Project Name */}
        <td className="px-3.5 py-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: project.color || "#F47830" }}
            />
            <span className="shrink-0 rounded-[4px] bg-slate-100 dark:bg-[#2a2a2a] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-300">
              {project.code}
            </span>
            <span className="truncate text-[13.5px] font-semibold text-slate-900 dark:text-slate-100 group-hover:text-brand">
              {project.name}
            </span>
          </div>
        </td>

        {/* Col 2: Category */}
        <td className="px-3 py-2.5">
          <span className="inline-flex items-center rounded-[4px] bg-orange-50/80 dark:bg-orange-950/40 px-2 py-0.5 text-[11px] font-medium text-orange-700 dark:text-orange-300 truncate max-w-[180px]">
            {project.category || "Dự án Chung"}
          </span>
        </td>

        {/* Col 3: Health / Delivery Confidence */}
        <td className="px-3 py-2.5">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[4px] border px-2 py-0.5 text-[11px] font-medium",
              conf.badgeClass
            )}
            title={project.confidence_note || conf.desc}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", conf.dotClass)} />
            {conf.label.split(" (")[0]}
          </span>
        </td>

        {/* Col 4: Progress Bar + Tasks Ratio */}
        <td className="px-3 py-2.5 min-w-[160px]">
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-[#2c2c2c]">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${pct}%`,
                  backgroundColor: project.color || "#F47830",
                }}
              />
            </div>
            <span className="shrink-0 font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-200 w-16 text-right">
              {pct}% ({project.completed_tasks}/{project.total_tasks})
            </span>
          </div>
        </td>

        {/* Col 5: Client / Author */}
        <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300">
          {project.client_name ? (
            <span className="truncate block max-w-[150px]">
              {project.client_name}
            </span>
          ) : (
            <span className="text-slate-300 dark:text-slate-600">—</span>
          )}
        </td>

        {/* Col 6: Department */}
        <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300">
          {project.department?.name || "Chung"}
        </td>

        {/* Col 7: Status */}
        <td className="px-3 py-2.5">
          <span
            className={cn(
              "inline-flex items-center rounded-[4px] border px-2 py-0.5 text-[11px] font-medium",
              statusInfo.badgeClass
            )}
          >
            {statusInfo.label}
          </span>
        </td>

        {/* Col 8: Due Date */}
        <td className="px-3 py-2.5 text-right font-mono text-xs">
          <span
            className={cn(
              overdue
                ? "font-semibold text-red-600 dark:text-red-400"
                : "text-slate-600 dark:text-slate-400"
            )}
          >
            {project.due_date ? formatDateVi(project.due_date) : "—"}
          </span>
        </td>

        {/* Col 9: Actions */}
        <td
          className="px-3 py-2.5 text-right"
          onClick={(e) => e.stopPropagation()}
        >
          {canEditProjectSettings(project) && (
            <button
              type="button"
              onClick={() => setEditingProject(project)}
              className="rounded-[4px] p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-[#333333] dark:hover:text-slate-200 transition cursor-pointer"
              title="Cài đặt dự án"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
          )}
        </td>
      </tr>
    );
  }

  return (
    <div className="space-y-4">
      {/* Compact Header Row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#e8e8e8] dark:border-[#303030] pb-3">
        <div className="flex items-baseline gap-2.5">
          <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Dự án & Xuất bản ({filteredProjects.length})
          </h1>
          <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:inline">
            Danh mục đầu sách, tiến độ và sức khỏe dự án Alpha Books
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canCreateProjects && (
            <>
              <Link
                href="/projects/templates"
                className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#d9d9d9] bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-brand dark:border-[#3a3a3a] dark:bg-[#1f1f1f] dark:text-slate-200"
              >
                <Layers className="h-3.5 w-3.5 text-brand" />
                <span>Mẫu quy trình</span>
              </Link>
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-1.5 rounded-[6px] bg-brand px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs transition hover:bg-brand-hover cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Tạo dự án</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Worklenz Single-Line ProjectListToolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-[8px] border border-[#e8e8e8] dark:border-[#303030] bg-[#fafafa] dark:bg-[#181818] px-3.5 py-2">
        {/* Left: Status Segment Pills (Active | All | Completed | Archived) */}
        <div className="flex flex-wrap items-center gap-1">
          {(
            [
              { key: "active", label: "Đang hoạt động" },
              { key: "all", label: "Tất cả" },
              { key: "completed", label: "Hoàn thành" },
              { key: "archived", label: "Lưu trữ" },
            ] as const
          ).map((seg) => (
            <button
              key={seg.key}
              type="button"
              onClick={() => setStatusFilter(seg.key)}
              className={cn(
                "rounded-[6px] px-2.5 py-1 text-xs font-medium transition cursor-pointer",
                statusFilter === seg.key
                  ? "bg-brand text-white font-semibold"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-[#2a2a2a]"
              )}
            >
              {seg.label}
            </button>
          ))}
        </div>

        {/* Right: Filters + View Mode Switcher (Table | Group | Grid) */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Group By selector when in Group mode */}
          {displayMode === "group" && (
            <div className="inline-flex items-center gap-1 text-xs text-slate-500">
              <span>Nhóm theo:</span>
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as GroupByField)}
                className="rounded-[6px] border border-[#d9d9d9] dark:border-[#3a3a3a] bg-white dark:bg-[#1f1f1f] px-2 py-1 text-xs font-medium text-brand focus:border-brand focus:outline-none cursor-pointer"
              >
                <option value="category">Danh mục sách</option>
                <option value="department">Phòng ban</option>
                <option value="confidence">Sức khỏe dự án</option>
                <option value="status">Trạng thái</option>
              </select>
            </div>
          )}

          {/* Confidence Filter */}
          <select
            value={confidenceFilter}
            onChange={(e) => setConfidenceFilter(e.target.value)}
            aria-label="Lọc theo sức khỏe"
            className="rounded-[6px] border border-[#d9d9d9] bg-white px-2.5 py-1 text-xs font-medium text-slate-700 focus:border-brand focus:outline-none dark:border-[#3a3a3a] dark:bg-[#1f1f1f] dark:text-slate-200 cursor-pointer"
          >
            <option value="all">Mọi sức khỏe</option>
            <option value="on_track">🟢 Đúng tiến độ</option>
            <option value="at_risk">🟡 Có rủi ro</option>
            <option value="off_track">🔴 Trễ hạn</option>
          </select>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Lọc theo danh mục"
            className="max-w-[155px] rounded-[6px] border border-[#d9d9d9] bg-white px-2.5 py-1 text-xs font-medium text-slate-700 focus:border-brand focus:outline-none dark:border-[#3a3a3a] dark:bg-[#1f1f1f] dark:text-slate-200 cursor-pointer"
          >
            <option value="all">Mọi danh mục</option>
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
            className="max-w-[150px] rounded-[6px] border border-[#d9d9d9] bg-white px-2.5 py-1 text-xs font-medium text-slate-700 focus:border-brand focus:outline-none dark:border-[#3a3a3a] dark:bg-[#1f1f1f] dark:text-slate-200 cursor-pointer"
          >
            <option value="all">Mọi phòng ban</option>
            {departments.map((dept) => (
              <option key={dept.id} value={dept.id}>
                {getDepartmentDisplayName(dept, departments)}
              </option>
            ))}
          </select>

          {/* Search input */}
          <div className="relative w-48 sm:w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm tên sách, mã, tác giả..."
              className="w-full rounded-[6px] border border-[#d9d9d9] bg-white py-1 pl-8 pr-6 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none dark:border-[#3a3a3a] dark:bg-[#1f1f1f] dark:text-slate-100"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Mode Toggle: Table (List) | Group | Grid */}
          <div className="inline-flex rounded-[6px] border border-[#d9d9d9] dark:border-[#3a3a3a] bg-white dark:bg-[#1f1f1f] p-0.5">
            <button
              type="button"
              onClick={() => setDisplayMode("table")}
              className={cn(
                "inline-flex items-center gap-1 rounded-[4px] px-2 py-1 text-xs font-medium transition cursor-pointer",
                displayMode === "table"
                  ? "bg-brand text-white"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              )}
              title="Chế độ Bảng dữ liệu (Table)"
            >
              <List className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Bảng</span>
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode("group")}
              className={cn(
                "inline-flex items-center gap-1 rounded-[4px] px-2 py-1 text-xs font-medium transition cursor-pointer",
                displayMode === "group"
                  ? "bg-brand text-white"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              )}
              title="Chế độ Gom nhóm (Group)"
            >
              <FolderKanban className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Nhóm</span>
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode("grid")}
              className={cn(
                "inline-flex items-center gap-1 rounded-[4px] px-2 py-1 text-xs font-medium transition cursor-pointer",
                displayMode === "grid"
                  ? "bg-brand text-white"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              )}
              title="Chế độ Lưới thẻ (Cards)"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Empty State */}
      {filteredProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[8px] border border-dashed border-[#d9d9d9] bg-white px-6 py-14 text-center dark:border-[#303030] dark:bg-[#1f1f1f]">
          <FolderKanban className="h-8 w-8 text-brand" />
          <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
            Không tìm thấy dự án nào phù hợp
          </h3>
          <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
            Thử đổi bộ lọc trạng thái sang &ldquo;Tất cả&rdquo; hoặc tạo dự án mới.
          </p>
        </div>
      ) : displayMode === "table" ? (
        /* ==================================================================
         * VIEW 1: WORKLENZ HIGH-DENSITY DATA TABLE (DEFAULT)
         * ================================================================ */
        <div className="overflow-x-auto rounded-[8px] border border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f]">
          <table className="w-full min-w-[960px] text-left border-collapse">
            <thead>
              <tr className="border-b border-[#e8e8e8] dark:border-[#303030] bg-[#fafafa] dark:bg-[#181818] text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="px-3.5 py-2.5">
                  <button
                    type="button"
                    onClick={() => handleSort("name")}
                    className="inline-flex items-center gap-1 hover:text-brand cursor-pointer"
                  >
                    <span>Mã & Tên dự án</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-3 py-2.5">Danh mục</th>
                <th className="px-3 py-2.5">Sức khỏe</th>
                <th className="px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => handleSort("progress")}
                    className="inline-flex items-center gap-1 hover:text-brand cursor-pointer"
                  >
                    <span>Tiến độ</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-3 py-2.5">Tác giả / Đối tác</th>
                <th className="px-3 py-2.5">Phòng ban</th>
                <th className="px-3 py-2.5">Trạng thái</th>
                <th className="px-3 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() => handleSort("due_date")}
                    className="inline-flex items-center gap-1 hover:text-brand cursor-pointer ml-auto"
                  >
                    <span>Hạn chót</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-3 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody>{filteredProjects.map(renderProjectRow)}</tbody>
          </table>
        </div>
      ) : displayMode === "group" ? (
        /* ==================================================================
         * VIEW 2: WORKLENZ GROUPED PROJECTS VIEW (ProjectGroupList)
         * ================================================================ */
        <div className="space-y-3">
          {groupedProjects.map((grp) => {
            const isCollapsed = !!collapsedGroups[grp.key];
            return (
              <div
                key={grp.key}
                className="overflow-hidden rounded-[8px] border border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f]"
              >
                <button
                  type="button"
                  onClick={() =>
                    setCollapsedGroups((prev) => ({
                      ...prev,
                      [grp.key]: !prev[grp.key],
                    }))
                  }
                  className="flex w-full items-center justify-between bg-[#fafafa] dark:bg-[#181818] px-4 py-2 text-left hover:bg-slate-100/80 dark:hover:bg-[#222222] transition cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    )}
                    <span className="text-[13px] font-bold text-slate-800 dark:text-slate-100">
                      {grp.label}
                    </span>
                    <span className="rounded bg-brand-soft dark:bg-brand-soft-dark px-2 py-0.5 text-[11px] font-bold text-brand">
                      {grp.items.length} dự án
                    </span>
                  </div>
                </button>

                {!isCollapsed && (
                  <div className="overflow-x-auto border-t border-[#e8e8e8] dark:border-[#303030]">
                    <table className="w-full min-w-[960px] text-left border-collapse">
                      <tbody>{grp.items.map(renderProjectRow)}</tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* ==================================================================
         * VIEW 3: COMPACT GRID CARDS
         * ================================================================ */
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
          {filteredProjects.map((project) => {
            const pct = getProjectProgress(project);
            const statusInfo =
              STATUS_META[project.status] ?? STATUS_META.active;
            const conf =
              CONFIDENCE_CONFIG[project.delivery_confidence || "on_track"] ??
              CONFIDENCE_CONFIG.on_track;
            const overdue =
              project.status === "active" && isOverdue(project.due_date, null);

            return (
              <div
                key={project.id}
                className="group relative flex flex-col overflow-hidden rounded-[8px] border border-[#e8e8e8] bg-white transition hover:border-brand/60 hover:shadow-sm dark:border-[#303030] dark:bg-[#1f1f1f]"
              >
                <div
                  className="h-1 w-full"
                  style={{ backgroundColor: project.color || "#F47830" }}
                />

                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="inline-flex items-center rounded-[4px] bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700 dark:bg-[#2a2a2a] dark:text-slate-300">
                        {project.code}
                      </span>
                      {project.category && (
                        <span className="truncate rounded-[4px] bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
                          {project.category}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-[4px] border px-2 py-0.5 text-[10px] font-medium",
                          statusInfo.badgeClass
                        )}
                      >
                        {statusInfo.label}
                      </span>
                      {canEditProjectSettings(project) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setEditingProject(project);
                          }}
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 cursor-pointer"
                          title="Cài đặt dự án"
                        >
                          <Settings className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <Link
                    href={`/projects/${project.id}`}
                    className="mt-2.5 block group-hover:text-brand"
                  >
                    <h2 className="line-clamp-1 text-sm font-bold text-slate-900 transition dark:text-slate-100">
                      {project.name}
                    </h2>
                  </Link>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-[4px] border px-2 py-0.5 text-[11px] font-medium",
                        conf.badgeClass
                      )}
                    >
                      <span
                        className={cn("h-1.5 w-1.5 rounded-full", conf.dotClass)}
                      />
                      {conf.label.split(" (")[0]}
                    </span>

                    {project.client_name && (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                        <User className="h-3 w-3 text-slate-400" />
                        {project.client_name}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5 text-slate-400" />
                      {project.department?.name || "Chung"}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 font-mono",
                        overdue && "font-semibold text-red-600 dark:text-red-400"
                      )}
                    >
                      <Calendar className="h-3.5 w-3.5" />
                      {project.due_date
                        ? formatDateVi(project.due_date)
                        : "Chưa đặt hạn"}
                    </span>
                  </div>

                  <div className="mt-auto pt-3">
                    <div className="mb-1 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">Tiến độ</span>
                      <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                        {project.completed_tasks}/{project.total_tasks} ({pct}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: project.color || "#F47830",
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          onClick={() => !submitting && setShowCreateModal(false)}
        >
          <div
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-[8px] border border-[#e8e8e8] bg-white p-5 shadow-xl dark:border-[#303030] dark:bg-[#1f1f1f]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#e8e8e8] dark:border-[#303030] pb-3">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Tạo dự án mới
              </h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="mt-4 space-y-3.5">
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <Sparkles className="h-3.5 w-3.5 text-brand" />
                  Chọn mẫu quy trình (tùy chọn)
                </label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                  className="w-full rounded-[6px] border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-brand focus:outline-none dark:border-[#3a3a3a] dark:bg-[#141414] dark:text-slate-100"
                >
                  <option value="">— Dự án trống (không dùng mẫu) —</option>
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      [{tpl.category}] {tpl.name} ({tpl.tasks?.length ?? 0} công việc)
                    </option>
                  ))}
                </select>
                {selectedTemplate && (
                  <p className="mt-1.5 rounded-[6px] bg-brand-soft px-3 py-1.5 text-xs text-brand dark:bg-brand/15">
                    Sẽ tự động tạo{" "}
                    <strong>{selectedTemplate.tasks?.length ?? 0} công việc</strong>{" "}
                    mẫu với hạn hoàn thành tính từ ngày bắt đầu dự án.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Tên dự án / Đầu sách <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="VD: Ra mắt sách Tư Duy Nhanh & Chậm"
                    className="w-full rounded-[6px] border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-brand focus:outline-none dark:border-[#3a3a3a] dark:bg-[#141414] dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
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
                    className="w-full rounded-[6px] border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs uppercase text-slate-900 focus:border-brand focus:outline-none dark:border-[#3a3a3a] dark:bg-[#141414] dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Phân loại danh mục
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-[6px] border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-brand focus:outline-none dark:border-[#3a3a3a] dark:bg-[#141414] dark:text-slate-100"
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
                    className="w-full rounded-[6px] border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-brand focus:outline-none dark:border-[#3a3a3a] dark:bg-[#141414] dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Sức khỏe dự án ban đầu
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    ["on_track", "at_risk", "off_track"] as DeliveryConfidence[]
                  ).map((key) => {
                    const cfg = CONFIDENCE_CONFIG[key];
                    const selected = deliveryConfidence === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setDeliveryConfidence(key)}
                        className={cn(
                          "rounded-[6px] border p-2 text-left text-xs font-medium transition cursor-pointer",
                          selected
                            ? "border-brand bg-brand-soft/30 text-brand ring-1 ring-brand font-semibold"
                            : "border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#141414] text-slate-600 dark:text-slate-300"
                        )}
                      >
                        <span
                          className={cn(
                            "inline-block h-2 w-2 rounded-full mr-1.5",
                            cfg.dotClass
                          )}
                        />
                        {cfg.label.split(" (")[0]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Mô tả ngắn
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Mục tiêu, phạm vi hoặc ghi chú quan trọng..."
                  className="w-full rounded-[6px] border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-brand focus:outline-none dark:border-[#3a3a3a] dark:bg-[#141414] dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Phòng ban phụ trách
                  </label>
                  <select
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    className="w-full rounded-[6px] border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-brand focus:outline-none dark:border-[#3a3a3a] dark:bg-[#141414] dark:text-slate-100"
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
                  <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Màu nhận diện
                  </label>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {PROJECT_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        className={cn(
                          "h-5 w-5 rounded-full transition cursor-pointer",
                          color === c
                            ? "ring-2 ring-slate-900 ring-offset-2 dark:ring-white"
                            : "hover:scale-110"
                        )}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Ngày bắt đầu
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-[6px] border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-brand focus:outline-none dark:border-[#3a3a3a] dark:bg-[#141414] dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Hạn hoàn thành
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full rounded-[6px] border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-brand focus:outline-none dark:border-[#3a3a3a] dark:bg-[#141414] dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-[#e8e8e8] pt-3 dark:border-[#303030]">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={submitting}
                  className="rounded-[6px] border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-[#3a3a3a] dark:text-slate-300 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 rounded-[6px] bg-brand px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60 cursor-pointer"
                >
                  {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
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
