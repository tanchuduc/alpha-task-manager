"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Building2,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  FolderKanban,
  RotateCcw,
  Search,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  cn,
  formatDateVi,
  getDepartmentDisplayName,
  getInitials,
  isOverdue,
  PRIORITY_CONFIG,
  ROLE_LABELS,
} from "@/lib/utils";
import type {
  Department,
  Profile,
  Project,
  Task,
  TaskPriority,
  TaskStatus,
  TaskStatusCategory,
} from "@/types/database";

export interface TaskAssigneeRow {
  task_id: string;
  user_id: string;
}

interface ReportsClientProps {
  projects: Project[];
  departments: Department[];
  profiles: Profile[];
  taskStatuses: TaskStatus[];
  tasks: Task[];
  taskAssignees: TaskAssigneeRow[];
}

type ReportTab = "executive" | "team" | "explorer";

type ProjectHealth = "on_track" | "at_risk" | "delayed";

const PROJECT_HEALTH_META: Record<
  ProjectHealth,
  { label: string; badgeClass: string; dotClass: string }
> = {
  on_track: {
    label: "Đúng tiến độ",
    badgeClass:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900",
    dotClass: "bg-emerald-500",
  },
  at_risk: {
    label: "Có rủi ro",
    badgeClass:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900",
    dotClass: "bg-amber-500",
  },
  delayed: {
    label: "Chậm tiến độ",
    badgeClass:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-900",
    dotClass: "bg-red-500",
  },
};

const CATEGORY_LABELS: Record<TaskStatusCategory, string> = {
  todo: "Cần làm",
  doing: "Đang làm",
  done: "Hoàn thành",
};

const PROJECT_STATUS_LABELS: Record<Project["status"], string> = {
  active: "Đang chạy",
  completed: "Hoàn thành",
  archived: "Lưu trữ",
};

function escapeCsvCell(value: string | number | null | undefined): string {
  const str = value == null ? "" : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function ReportsClient({
  projects,
  departments,
  profiles,
  taskStatuses,
  tasks,
  taskAssignees,
}: ReportsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<ReportTab>("executive");

  useEffect(() => {
    const tabParam = searchParams.get("tab") as ReportTab | null;
    if (tabParam && ["executive", "team", "explorer"].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  // Tab 1 state
  const [projectStatusFilter, setProjectStatusFilter] = useState<
    "all" | Project["status"]
  >("all");

  // Tab 2 state
  const [selectedDeptTab2, setSelectedDeptTab2] = useState<string>("all");

  // Tab 3 state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDept, setFilterDept] = useState<string>("all");
  const [filterProject, setFilterProject] = useState<string>("all");
  const [filterAssignee, setFilterAssignee] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<"all" | TaskPriority>(
    "all"
  );
  const [filterCategory, setFilterCategory] = useState<
    "all" | TaskStatusCategory
  >("all");
  const [onlyOverdue, setOnlyOverdue] = useState(false);

  // Fast lookup maps
  const departmentMap = useMemo(() => {
    const map = new Map<string, Department>();
    for (const d of departments) map.set(d.id, d);
    return map;
  }, [departments]);

  const projectMap = useMemo(() => {
    const map = new Map<string, Project>();
    for (const p of projects) map.set(p.id, p);
    return map;
  }, [projects]);

  const profileMap = useMemo(() => {
    const map = new Map<string, Profile>();
    for (const pr of profiles) map.set(pr.id, pr);
    return map;
  }, [profiles]);

  const statusMap = useMemo(() => {
    const map = new Map<string, TaskStatus>();
    for (const s of taskStatuses) map.set(s.id, s);
    return map;
  }, [taskStatuses]);

  const assigneesByTask = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of taskAssignees) {
      const list = map.get(row.task_id) ?? [];
      list.push(row.user_id);
      map.set(row.task_id, list);
    }
    return map;
  }, [taskAssignees]);

  // Enriched top-level tasks
  const enrichedTasks = useMemo(() => {
    return tasks.map((task) => {
      const status = task.status_id ? statusMap.get(task.status_id) ?? null : null;
      const category: TaskStatusCategory =
        status?.category ?? (task.completed_at ? "done" : "todo");
      const isDone = category === "done" || Boolean(task.completed_at);
      const overdue = !isDone && isOverdue(task.due_date, task.completed_at);
      const project = projectMap.get(task.project_id) ?? null;
      const department = project?.department_id
        ? departmentMap.get(project.department_id) ?? null
        : null;
      const assigneeIds = assigneesByTask.get(task.id) ?? [];
      const assignees = assigneeIds
        .map((uid) => profileMap.get(uid))
        .filter((p): p is Profile => Boolean(p));

      return {
        task,
        status,
        category,
        isDone,
        overdue,
        project,
        department,
        assigneeIds,
        assignees,
      };
    });
  }, [tasks, statusMap, projectMap, departmentMap, assigneesByTask, profileMap]);

  // =========================================================================
  // TAB 1: Executive Project Overview Metrics
  // =========================================================================
  const executiveSummary = useMemo(() => {
    const activeProjectsCount = projects.filter(
      (p) => p.status === "active"
    ).length;
    const totalTasks = enrichedTasks.length;
    const doneTasks = enrichedTasks.filter((t) => t.isDone).length;
    const doingTasks = enrichedTasks.filter((t) => t.category === "doing").length;
    const overdueTasks = enrichedTasks.filter((t) => t.overdue).length;
    const completionRate =
      totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    return {
      activeProjectsCount,
      totalProjectsCount: projects.length,
      totalTasks,
      doneTasks,
      doingTasks,
      overdueTasks,
      completionRate,
    };
  }, [projects, enrichedTasks]);

  const projectRows = useMemo(() => {
    const byProject = new Map<
      string,
      { total: number; todo: number; doing: number; done: number; overdue: number }
    >();

    for (const item of enrichedTasks) {
      const stats = byProject.get(item.task.project_id) ?? {
        total: 0,
        todo: 0,
        doing: 0,
        done: 0,
        overdue: 0,
      };
      stats.total += 1;
      if (item.isDone) stats.done += 1;
      else if (item.category === "doing") stats.doing += 1;
      else stats.todo += 1;
      if (item.overdue) stats.overdue += 1;
      byProject.set(item.task.project_id, stats);
    }

    return projects
      .filter((p) =>
        projectStatusFilter === "all" ? true : p.status === projectStatusFilter
      )
      .map((project) => {
        const stats = byProject.get(project.id) ?? {
          total: 0,
          todo: 0,
          doing: 0,
          done: 0,
          overdue: 0,
        };
        const completionPct =
          stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;
        const department = project.department_id
          ? departmentMap.get(project.department_id) ?? null
          : null;

        const projectPastDue =
          project.status === "active" &&
          Boolean(project.due_date) &&
          isOverdue(project.due_date);

        let health: ProjectHealth = "on_track";
        if (
          projectPastDue ||
          (stats.overdue >= 3 ||
            (stats.total > 0 && stats.overdue / stats.total >= 0.25))
        ) {
          health = "delayed";
        } else if (stats.overdue > 0) {
          health = "at_risk";
        }

        return {
          project,
          department,
          ...stats,
          completionPct,
          health,
        };
      });
  }, [projects, enrichedTasks, departmentMap, projectStatusFilter]);

  // =========================================================================
  // TAB 2: Department & Staff Workload Metrics
  // =========================================================================
  const staffRows = useMemo(() => {
    const byUser = new Map<
      string,
      { total: number; doing: number; done: number; overdue: number }
    >();

    for (const item of enrichedTasks) {
      for (const uid of item.assigneeIds) {
        const stats = byUser.get(uid) ?? {
          total: 0,
          doing: 0,
          done: 0,
          overdue: 0,
        };
        stats.total += 1;
        if (item.isDone) stats.done += 1;
        else if (item.category === "doing") stats.doing += 1;
        if (item.overdue) stats.overdue += 1;
        byUser.set(uid, stats);
      }
    }

    return profiles.map((profile) => {
      const stats = byUser.get(profile.id) ?? {
        total: 0,
        doing: 0,
        done: 0,
        overdue: 0,
      };
      const completionPct =
        stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;
      const department = profile.department_id
        ? departmentMap.get(profile.department_id) ?? null
        : null;

      return {
        profile,
        department,
        ...stats,
        completionPct,
      };
    });
  }, [profiles, enrichedTasks, departmentMap]);

  const departmentSummaries = useMemo(() => {
    const summaries = departments.map((dept) => {
      const members = staffRows.filter((r) => r.profile.department_id === dept.id);
      const totalAssigned = members.reduce((sum, m) => sum + m.total, 0);
      const done = members.reduce((sum, m) => sum + m.done, 0);
      const doing = members.reduce((sum, m) => sum + m.doing, 0);
      const overdue = members.reduce((sum, m) => sum + m.overdue, 0);
      const completionPct =
        totalAssigned > 0 ? Math.round((done / totalAssigned) * 100) : 0;

      return {
        id: dept.id,
        name: dept.name,
        code: dept.code,
        memberCount: members.length,
        totalAssigned,
        doing,
        done,
        overdue,
        completionPct,
      };
    });

    const unassignedMembers = staffRows.filter((r) => !r.profile.department_id);
    if (unassignedMembers.length > 0) {
      const totalAssigned = unassignedMembers.reduce((sum, m) => sum + m.total, 0);
      const done = unassignedMembers.reduce((sum, m) => sum + m.done, 0);
      const doing = unassignedMembers.reduce((sum, m) => sum + m.doing, 0);
      const overdue = unassignedMembers.reduce((sum, m) => sum + m.overdue, 0);
      summaries.push({
        id: "__unassigned__",
        name: "Chưa phân phòng ban",
        code: null,
        memberCount: unassignedMembers.length,
        totalAssigned,
        doing,
        done,
        overdue,
        completionPct:
          totalAssigned > 0 ? Math.round((done / totalAssigned) * 100) : 0,
      });
    }

    return summaries;
  }, [departments, staffRows]);

  const filteredStaffRows = useMemo(() => {
    return staffRows
      .filter((row) => {
        if (selectedDeptTab2 === "all") return true;
        if (selectedDeptTab2 === "__unassigned__") {
          return !row.profile.department_id;
        }
        return row.profile.department_id === selectedDeptTab2;
      })
      .sort((a, b) => b.overdue - a.overdue || b.total - a.total);
  }, [staffRows, selectedDeptTab2]);

  // =========================================================================
  // TAB 3: Task Explorer & CSV Export
  // =========================================================================
  const availableProjectsTab3 = useMemo(() => {
    if (filterDept === "all") return projects;
    return projects.filter((p) => p.department_id === filterDept);
  }, [projects, filterDept]);

  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return enrichedTasks.filter((item) => {
      if (q && !item.task.title.toLowerCase().includes(q)) return false;
      if (filterDept !== "all" && item.project?.department_id !== filterDept) {
        return false;
      }
      if (filterProject !== "all" && item.task.project_id !== filterProject) {
        return false;
      }
      if (
        filterAssignee !== "all" &&
        !item.assigneeIds.includes(filterAssignee)
      ) {
        return false;
      }
      if (filterPriority !== "all" && item.task.priority !== filterPriority) {
        return false;
      }
      if (filterCategory !== "all" && item.category !== filterCategory) {
        return false;
      }
      if (onlyOverdue && !item.overdue) return false;
      return true;
    });
  }, [
    enrichedTasks,
    searchQuery,
    filterDept,
    filterProject,
    filterAssignee,
    filterPriority,
    filterCategory,
    onlyOverdue,
  ]);

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    filterDept !== "all" ||
    filterProject !== "all" ||
    filterAssignee !== "all" ||
    filterPriority !== "all" ||
    filterCategory !== "all" ||
    onlyOverdue;

  const resetTab3Filters = () => {
    setSearchQuery("");
    setFilterDept("all");
    setFilterProject("all");
    setFilterAssignee("all");
    setFilterPriority("all");
    setFilterCategory("all");
    setOnlyOverdue(false);
  };

  const handleExportCsv = () => {
    if (filteredTasks.length === 0) {
      toast.error("Không có dữ liệu công việc để xuất file.");
      return;
    }

    const headers = [
      "Mã dự án",
      "Tên dự án",
      "Phòng ban",
      "Tên công việc",
      "Trạng thái",
      "Nhóm trạng thái",
      "Độ ưu tiên",
      "Người thực hiện",
      "Ngày bắt đầu",
      "Hạn chót",
      "Tình trạng hạn",
      "Ngày hoàn thành",
    ];

    const rows = filteredTasks.map((item) => {
      const assigneeNames =
        item.assignees.length > 0
          ? item.assignees.map((a) => a.full_name).join("; ")
          : "Chưa phân công";
      const dueStatus = item.isDone
        ? "Đã hoàn thành"
        : item.overdue
          ? "Quá hạn"
          : item.task.due_date
            ? "Trong hạn"
            : "Không có hạn";

      return [
        item.project?.code ?? "",
        item.project?.name ?? "",
        item.department?.name ?? "Chưa phân phòng ban",
        item.task.title,
        item.status?.name ?? CATEGORY_LABELS[item.category],
        CATEGORY_LABELS[item.category],
        PRIORITY_CONFIG[item.task.priority]?.label ?? item.task.priority,
        assigneeNames,
        item.task.start_date ? formatDateVi(item.task.start_date) : "",
        item.task.due_date ? formatDateVi(item.task.due_date) : "",
        dueStatus,
        item.task.completed_at ? formatDateVi(item.task.completed_at) : "",
      ].map(escapeCsvCell);
    });

    // UTF-8 BOM (\uFEFF) ensures Vietnamese diacritics open cleanly in Microsoft Excel & Google Sheets
    const csvContent =
      "\uFEFF" +
      [headers.map(escapeCsvCell).join(","), ...rows.map((r) => r.join(","))].join(
        "\r\n"
      );

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const todayStr = new Date().toISOString().slice(0, 10);
    const link = document.createElement("a");
    link.href = url;
    link.download = `alpha-work-bao-cao-${todayStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(`Đã xuất ${filteredTasks.length} công việc ra file Excel/CSV!`);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            <BarChart3 className="h-6 w-6 text-brand" />
            Báo cáo &amp; Thống kê Hiệu suất
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Theo dõi tiến độ dự án toàn công ty, khối lượng công việc nhân sự và
            xuất báo cáo Excel/CSV.
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportCsv}
          className="inline-flex items-center gap-2 self-start rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-hover sm:self-auto"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Xuất Excel / CSV ({filteredTasks.length})
        </button>
      </div>

      {/* 3-Tab Underline Navigation (synced with Left NavRail) */}
      <div className="flex flex-wrap gap-1 border-b border-[#e8e8e8] dark:border-[#303030]">
        <button
          type="button"
          onClick={() => {
            setActiveTab("executive");
            router.push("/reports?tab=executive");
          }}
          className={cn(
            "inline-flex items-center gap-2 border-b-2 px-4 py-2 text-[13px] font-medium transition cursor-pointer",
            activeTab === "executive"
              ? "border-brand text-brand font-semibold"
              : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          )}
        >
          <FolderKanban className="h-4 w-4" />
          Tổng quan Dự án
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("team");
            router.push("/reports?tab=team");
          }}
          className={cn(
            "inline-flex items-center gap-2 border-b-2 px-4 py-2 text-[13px] font-medium transition cursor-pointer",
            activeTab === "team"
              ? "border-brand text-brand font-semibold"
              : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          )}
        >
          <Users className="h-4 w-4" />
          Hiệu suất Phòng ban &amp; Nhân sự
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("explorer");
            router.push("/reports?tab=explorer");
          }}
          className={cn(
            "inline-flex items-center gap-2 border-b-2 px-4 py-2 text-[13px] font-medium transition cursor-pointer",
            activeTab === "explorer"
              ? "border-brand text-brand font-semibold"
              : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          )}
        >
          <Download className="h-4 w-4" />
          Tra cứu Tổng hợp &amp; Xuất Excel
        </button>
      </div>

      {/* =================================================================== */}
      {/* TAB 1: TỔNG QUAN DỰ ÁN (BAN GIÁM ĐỐC)                               */}
      {/* =================================================================== */}
      {activeTab === "executive" && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Dự án đang chạy
                </span>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand dark:bg-brand-soft-dark">
                  <FolderKanban className="h-5 w-5" />
                </span>
              </div>
              <div className="mt-3 text-3xl font-bold text-slate-900 dark:text-white">
                {executiveSummary.activeProjectsCount}
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Trên tổng số {executiveSummary.totalProjectsCount} dự án
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Tổng công việc
                </span>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                  <Clock className="h-5 w-5" />
                </span>
              </div>
              <div className="mt-3 text-3xl font-bold text-slate-900 dark:text-white">
                {executiveSummary.totalTasks}
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {executiveSummary.doingTasks} việc đang triển khai
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Tỷ lệ hoàn thành
                </span>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-slate-900 dark:text-white">
                  {executiveSummary.completionRate}%
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  ({executiveSummary.doneTasks}/{executiveSummary.totalTasks})
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${executiveSummary.completionRate}%` }}
                />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Số việc quá hạn
                </span>
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg",
                    executiveSummary.overdueTasks > 0
                      ? "bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400"
                      : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                  )}
                >
                  <AlertTriangle className="h-5 w-5" />
                </span>
              </div>
              <div
                className={cn(
                  "mt-3 text-3xl font-bold",
                  executiveSummary.overdueTasks > 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-slate-900 dark:text-white"
                )}
              >
                {executiveSummary.overdueTasks}
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {executiveSummary.overdueTasks > 0
                  ? "Cần ưu tiên xử lý sớm"
                  : "Không có công việc quá hạn"}
              </p>
            </div>
          </div>

          {/* Project Health Table */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Tiến độ từng Dự án
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Tổng hợp tiến độ và cảnh báo rủi ro cho Ban Giám đốc.
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                {(["all", "active", "completed", "archived"] as const).map(
                  (st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setProjectStatusFilter(st)}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                        projectStatusFilter === st
                          ? "bg-brand-soft text-brand dark:bg-brand-soft-dark dark:text-orange-300"
                          : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                      )}
                    >
                      {st === "all" ? "Tất cả" : PROJECT_STATUS_LABELS[st]}
                    </button>
                  )
                )}
              </div>
            </div>

            {projectRows.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                Không có dự án nào phù hợp với bộ lọc hiện tại.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[780px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                      <th className="px-5 py-3">Dự án</th>
                      <th className="px-4 py-3">Phòng ban</th>
                      <th className="px-3 py-3 text-center">Tổng việc</th>
                      <th className="px-3 py-3 text-center">Đang làm</th>
                      <th className="px-3 py-3 text-center">Hoàn thành</th>
                      <th className="px-3 py-3 text-center">Quá hạn</th>
                      <th className="px-4 py-3">Tỷ lệ hoàn thành</th>
                      <th className="px-5 py-3 text-right">Đánh giá</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {projectRows.map((row) => {
                      const healthMeta = PROJECT_HEALTH_META[row.health];
                      return (
                        <tr
                          key={row.project.id}
                          className="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                        >
                          <td className="px-5 py-3.5">
                            <Link
                              href={`/projects/${row.project.id}`}
                              className="group flex items-center gap-2.5"
                            >
                              <span
                                className="h-3 w-3 shrink-0 rounded-full"
                                style={{
                                  backgroundColor:
                                    row.project.color || "#F26522",
                                }}
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 font-semibold text-slate-900 group-hover:text-brand dark:text-slate-100">
                                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                    {row.project.code}
                                  </span>
                                  <span className="truncate">
                                    {row.project.name}
                                  </span>
                                  <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" />
                                </div>
                                {row.project.due_date && (
                                  <div className="mt-0.5 text-xs text-slate-400">
                                    Hạn dự án: {formatDateVi(row.project.due_date)}
                                  </div>
                                )}
                              </div>
                            </Link>
                          </td>

                          <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300">
                            {row.department?.name ?? (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          <td className="px-3 py-3.5 text-center font-medium text-slate-900 dark:text-slate-100">
                            {row.total}
                          </td>

                          <td className="px-3 py-3.5 text-center text-blue-600 dark:text-blue-400">
                            {row.doing}
                          </td>

                          <td className="px-3 py-3.5 text-center text-emerald-600 dark:text-emerald-400">
                            {row.done}
                          </td>

                          <td className="px-3 py-3.5 text-center">
                            {row.overdue > 0 ? (
                              <span className="inline-flex min-w-[28px] items-center justify-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600 dark:bg-red-950/60 dark:text-red-400">
                                {row.overdue}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">0</span>
                            )}
                          </td>

                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                <div
                                  className="h-full rounded-full bg-brand transition-all"
                                  style={{ width: `${row.completionPct}%` }}
                                />
                              </div>
                              <span className="w-9 text-xs font-semibold text-slate-700 dark:text-slate-300">
                                {row.completionPct}%
                              </span>
                            </div>
                          </td>

                          <td className="px-5 py-3.5 text-right">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                                healthMeta.badgeClass
                              )}
                            >
                              <span
                                className={cn(
                                  "h-1.5 w-1.5 rounded-full",
                                  healthMeta.dotClass
                                )}
                              />
                              {healthMeta.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 2: HIỆU SUẤT PHÒNG BAN & NHÂN SỰ (TRƯỞNG PHÒNG / LEADER)        */}
      {/* =================================================================== */}
      {activeTab === "team" && (
        <div className="space-y-6">
          {/* Department Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {departmentSummaries.map((dept) => {
              const isSelected = selectedDeptTab2 === dept.id;
              return (
                <button
                  key={dept.id}
                  type="button"
                  onClick={() =>
                    setSelectedDeptTab2(isSelected ? "all" : dept.id)
                  }
                  className={cn(
                    "rounded-xl border p-4 text-left transition",
                    isSelected
                      ? "border-brand bg-brand-soft/60 ring-2 ring-brand/20 dark:bg-brand-soft-dark/40"
                      : "border-slate-200 bg-white hover:border-brand/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand/50"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="h-4 w-4 shrink-0 text-brand" />
                        <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {dept.name}
                        </h3>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {dept.memberCount} nhân sự · {dept.totalAssigned} việc
                        được giao
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-bold text-brand">
                      {dept.completionPct}%
                    </span>
                  </div>

                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-brand transition-all"
                      style={{ width: `${dept.completionPct}%` }}
                    />
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-400">
                      Đang làm: <strong className="text-blue-600 dark:text-blue-400">{dept.doing}</strong> · Xong:{" "}
                      <strong className="text-emerald-600 dark:text-emerald-400">{dept.done}</strong>
                    </span>
                    {dept.overdue > 0 ? (
                      <span className="font-semibold text-red-600 dark:text-red-400">
                        {dept.overdue} quá hạn
                      </span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        Đúng hạn
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Staff Workload Table */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Khối lượng &amp; Hiệu suất Nhân sự
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Hiển thị {filteredStaffRows.length} thành viên (sắp xếp theo
                  số việc quá hạn và tổng việc được giao).
                </p>
              </div>

              <div className="flex items-center gap-2">
                <label
                  htmlFor="dept-filter-tab2"
                  className="text-xs font-medium text-slate-500 dark:text-slate-400"
                >
                  Phòng ban:
                </label>
                <select
                  id="dept-filter-tab2"
                  value={selectedDeptTab2}
                  onChange={(e) => setSelectedDeptTab2(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="all">Tất cả phòng ban</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {getDepartmentDisplayName(d, departments)}
                    </option>
                  ))}
                  <option value="__unassigned__">Chưa phân phòng ban</option>
                </select>
              </div>
            </div>

            {filteredStaffRows.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                Không có nhân sự nào trong phòng ban này.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[780px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                      <th className="px-5 py-3">Nhân sự</th>
                      <th className="px-4 py-3">Phòng ban</th>
                      <th className="px-4 py-3">Vai trò</th>
                      <th className="px-3 py-3 text-center">Tổng được giao</th>
                      <th className="px-3 py-3 text-center">Đang làm</th>
                      <th className="px-3 py-3 text-center">Quá hạn</th>
                      <th className="px-3 py-3 text-center">Hoàn thành</th>
                      <th className="px-5 py-3">Tỷ lệ hoàn thành</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredStaffRows.map((row) => (
                      <tr
                        key={row.profile.id}
                        className="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand dark:bg-brand-soft-dark dark:text-orange-300">
                              {getInitials(row.profile.full_name)}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-slate-900 dark:text-slate-100">
                                {row.profile.full_name}
                              </div>
                              <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                                {row.profile.job_title || row.profile.email}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300">
                          {row.department?.name ?? (
                            <span className="text-slate-400">
                              Chưa phân phòng ban
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3.5">
                          <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {ROLE_LABELS[row.profile.role]}
                          </span>
                        </td>

                        <td className="px-3 py-3.5 text-center font-semibold text-slate-900 dark:text-slate-100">
                          {row.total}
                        </td>

                        <td className="px-3 py-3.5 text-center text-blue-600 dark:text-blue-400">
                          {row.doing}
                        </td>

                        <td className="px-3 py-3.5 text-center">
                          {row.overdue > 0 ? (
                            <span className="inline-flex min-w-[28px] items-center justify-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700 dark:bg-red-950/80 dark:text-red-300">
                              {row.overdue}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">0</span>
                          )}
                        </td>

                        <td className="px-3 py-3.5 text-center font-medium text-emerald-600 dark:text-emerald-400">
                          {row.done}
                        </td>

                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                              <div
                                className="h-full rounded-full bg-emerald-500 transition-all"
                                style={{ width: `${row.completionPct}%` }}
                              />
                            </div>
                            <span className="w-9 text-xs font-semibold text-slate-700 dark:text-slate-300">
                              {row.completionPct}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 3: TRA CỨU TỔNG HỢP & XUẤT EXCEL / CSV                          */}
      {/* =================================================================== */}
      {activeTab === "explorer" && (
        <div className="space-y-4">
          {/* Multi-filter Bar */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              {/* Search title */}
              <div className="relative sm:col-span-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm kiếm theo tên công việc..."
                  className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              {/* Department */}
              <select
                value={filterDept}
                onChange={(e) => {
                  setFilterDept(e.target.value);
                  setFilterProject("all");
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="all">Tất cả phòng ban</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {getDepartmentDisplayName(d, departments)}
                  </option>
                ))}
              </select>

              {/* Project */}
              <select
                value={filterProject}
                onChange={(e) => setFilterProject(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="all">Tất cả dự án</option>
                {availableProjectsTab3.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.code}] {p.name}
                  </option>
                ))}
              </select>

              {/* Assignee */}
              <select
                value={filterAssignee}
                onChange={(e) => setFilterAssignee(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="all">Tất cả nhân sự</option>
                {profiles.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.full_name}
                  </option>
                ))}
              </select>

              {/* Priority */}
              <select
                value={filterPriority}
                onChange={(e) =>
                  setFilterPriority(e.target.value as "all" | TaskPriority)
                }
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="all">Mọi độ ưu tiên</option>
                <option value="urgent">Khẩn cấp</option>
                <option value="high">Cao</option>
                <option value="medium">Trung bình</option>
                <option value="low">Thấp</option>
              </select>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
              <div className="flex flex-wrap items-center gap-3">
                {/* Status category */}
                <select
                  value={filterCategory}
                  onChange={(e) =>
                    setFilterCategory(
                      e.target.value as "all" | TaskStatusCategory
                    )
                  }
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="all">Mọi nhóm trạng thái</option>
                  <option value="todo">Cần làm (To-do)</option>
                  <option value="doing">Đang làm (Doing)</option>
                  <option value="done">Hoàn thành (Done)</option>
                </select>

                {/* Overdue checkbox */}
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                  <input
                    type="checkbox"
                    checked={onlyOverdue}
                    onChange={(e) => setOnlyOverdue(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 accent-brand"
                  />
                  <span>Chỉ hiện quá hạn</span>
                </label>

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={resetTab3Filters}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Xóa bộ lọc
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Tìm thấy{" "}
                  <strong className="font-semibold text-slate-900 dark:text-slate-100">
                    {filteredTasks.length}
                  </strong>{" "}
                  công việc
                </span>

                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-hover"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Xuất Excel / CSV
                </button>
              </div>
            </div>
          </div>

          {/* Filtered Tasks Table */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {filteredTasks.length === 0 ? (
              <div className="py-14 text-center text-sm text-slate-500 dark:text-slate-400">
                Không tìm thấy công việc nào phù hợp với bộ lọc.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                      <th className="px-5 py-3">Công việc</th>
                      <th className="px-4 py-3">Dự án</th>
                      <th className="px-4 py-3">Phòng ban</th>
                      <th className="px-4 py-3">Người thực hiện</th>
                      <th className="px-3 py-3">Độ ưu tiên</th>
                      <th className="px-3 py-3">Trạng thái</th>
                      <th className="px-5 py-3 text-right">Hạn chót</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredTasks.map((item) => {
                      const priorityMeta = PRIORITY_CONFIG[item.task.priority];
                      return (
                        <tr
                          key={item.task.id}
                          className="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                        >
                          <td className="max-w-xs px-5 py-3.5">
                            <Link
                              href={`/projects/${item.task.project_id}?task=${item.task.id}`}
                              className="group inline-flex items-start gap-1.5 font-medium text-slate-900 hover:text-brand dark:text-slate-100"
                            >
                              <span className="line-clamp-2">
                                {item.task.title}
                              </span>
                              <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-0 transition group-hover:opacity-100" />
                            </Link>
                          </td>

                          <td className="px-4 py-3.5">
                            {item.project ? (
                              <Link
                                href={`/projects/${item.project.id}`}
                                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-brand dark:text-slate-300"
                              >
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{
                                    backgroundColor:
                                      item.project.color || "#F26522",
                                  }}
                                />
                                <span className="font-mono font-semibold text-slate-500 dark:text-slate-400">
                                  {item.project.code}
                                </span>
                                <span className="max-w-[140px] truncate">
                                  {item.project.name}
                                </span>
                              </Link>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>

                          <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-400">
                            {item.department?.name ?? "—"}
                          </td>

                          <td className="px-4 py-3.5">
                            {item.assignees.length > 0 ? (
                              <div className="flex flex-wrap items-center gap-1">
                                {item.assignees.slice(0, 2).map((assignee) => (
                                  <span
                                    key={assignee.id}
                                    className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                  >
                                    <span className="font-semibold text-brand">
                                      {getInitials(assignee.full_name)}
                                    </span>
                                    <span className="max-w-[90px] truncate">
                                      {assignee.full_name}
                                    </span>
                                  </span>
                                ))}
                                {item.assignees.length > 2 && (
                                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                    +{item.assignees.length - 2}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs italic text-slate-400">
                                Chưa giao
                              </span>
                            )}
                          </td>

                          <td className="px-3 py-3.5">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
                                priorityMeta.bg,
                                priorityMeta.color
                              )}
                            >
                              <span
                                className={cn(
                                  "h-1.5 w-1.5 rounded-full",
                                  priorityMeta.dot
                                )}
                              />
                              {priorityMeta.label}
                            </span>
                          </td>

                          <td className="px-3 py-3.5">
                            <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{
                                  backgroundColor:
                                    item.status?.color || "#94A3B8",
                                }}
                              />
                              {item.status?.name ??
                                CATEGORY_LABELS[item.category]}
                            </span>
                          </td>

                          <td className="px-5 py-3.5 text-right text-xs">
                            {item.task.due_date ? (
                              <span
                                className={cn(
                                  "font-medium",
                                  item.overdue
                                    ? "rounded-md bg-red-50 px-2 py-0.5 font-semibold text-red-600 dark:bg-red-950/60 dark:text-red-400"
                                    : "text-slate-600 dark:text-slate-300"
                                )}
                              >
                                {formatDateVi(item.task.due_date)}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
