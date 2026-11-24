import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { HomeDashboard, type ExecutiveStats } from "@/components/home/HomeDashboard";
import { canUserViewProject, isDirectorOrAdmin } from "@/lib/permissions";
import type {
  PersonalTodo,
  Profile,
  Project,
  Task,
  TaskStatus,
} from "@/types/database";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [
    { data: profileData },
    { data: assigneeRows },
    { data: delegatedRows },
    { data: createdRows },
    { data: todosData },
    { data: projectsData },
    { data: myMembershipsData },
    { data: allProfilesData },
    { data: allStatusesData },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("*, custom_role:roles(*)")
      .eq("id", user.id)
      .single(),
    supabase.from("task_assignees").select("task_id").eq("user_id", user.id),
    supabase
      .from("task_assignees")
      .select("task_id, user_id")
      .eq("assigned_by", user.id)
      .neq("user_id", user.id),
    supabase.from("tasks").select("id").eq("created_by", user.id),
    supabase
      .from("personal_todos")
      .select("*")
      .eq("user_id", user.id)
      .order("is_done", { ascending: true })
      .order("created_at", { ascending: false }),
    supabase
      .from("projects")
      .select("id, name, code, color, created_by, project_manager_id, is_private, status")
      .order("name", { ascending: true }),
    supabase
      .from("project_members")
      .select("project_id")
      .eq("user_id", user.id),
    supabase
      .from("profiles")
      .select("*")
      .eq("is_active", true)
      .order("full_name", { ascending: true }),
    supabase
      .from("task_statuses")
      .select("*")
      .order("position", { ascending: true }),
  ]);

  const profile: Profile = (profileData as Profile | null) ?? {
    id: user.id,
    email: user.email ?? "",
    full_name:
      (user.user_metadata?.full_name as string | undefined) ??
      user.email?.split("@")[0] ??
      "Nhân viên Alpha",
    avatar_url: null,
    role: "member",
    job_title: null,
    department_id: null,
    telegram_chat_id: null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const myProjectIds = new Set(
    (myMembershipsData ?? []).map((m) => m.project_id as string)
  );
  const visibleProjects = ((projectsData ?? []) as Project[]).filter((p) =>
    canUserViewProject(profile, p, myProjectIds.has(p.id))
  );

  const assignedTaskIds = (assigneeRows ?? []).map((r) => r.task_id as string);
  const explicitlyDelegatedTaskIds = (delegatedRows ?? []).map(
    (r) => r.task_id as string
  );
  const createdTaskIds = (createdRows ?? []).map((r) => r.id as string);
  const allTaskIds = Array.from(
    new Set([
      ...assignedTaskIds,
      ...explicitlyDelegatedTaskIds,
      ...createdTaskIds,
    ])
  );

  let tasks: Task[] = [];
  if (allTaskIds.length > 0) {
    const { data: tasksData } = await supabase
      .from("tasks")
      .select(`
        *,
        status:task_statuses(*),
        project:projects(id, name, code, color),
        task_assignees(
          user_id,
          assigned_by,
          profile:profiles!task_assignees_user_id_fkey(id, full_name, email, avatar_url, job_title)
        )
      `)
      .in("id", allTaskIds)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("updated_at", { ascending: false });

    type RawTask = Omit<Task, "status" | "project" | "assignees"> & {
      status: Task["status"] | Array<NonNullable<Task["status"]>>;
      project: Task["project"] | Array<NonNullable<Task["project"]>>;
      task_assignees?: Array<{
        user_id: string;
        assigned_by?: string | null;
        profile?: Profile | Profile[];
      }>;
    };

    const raw = (tasksData ?? []) as unknown as RawTask[];

    tasks = raw.map((t) => {
      const assignees: Profile[] = (t.task_assignees ?? [])
        .map((ta) => (Array.isArray(ta.profile) ? ta.profile[0] : ta.profile))
        .filter((p): p is Profile => Boolean(p));

      return {
        ...t,
        status: Array.isArray(t.status) ? t.status[0] ?? null : t.status,
        project: Array.isArray(t.project) ? t.project[0] ?? null : t.project,
        assignees,
      };
    });
  }

  // Nếu người dùng là Ban Giám Đốc (BOD) hoặc Quản trị viên (Admin), tải thêm dữ liệu điều hành toàn công ty
  const isExecutive = isDirectorOrAdmin(profile);
  let executiveStats: ExecutiveStats | undefined;

  if (isExecutive) {
    const [allCompanyTasksRes, urgentTasksRes] = await Promise.all([
      supabase
        .from("tasks")
        .select("id, project_id, completed_at, due_date, status:task_statuses(category)")
        .is("parent_id", null),
      supabase
        .from("tasks")
        .select(`
          *,
          status:task_statuses(*),
          project:projects(id, name, code, color),
          task_assignees(
            user_id,
            profile:profiles!task_assignees_user_id_fkey(id, full_name, email, avatar_url, job_title)
          )
        `)
        .in("priority", ["urgent", "high"])
        .is("completed_at", null)
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(6),
    ]);

    type CompanyTaskRow = {
      id: string;
      project_id: string;
      completed_at: string | null;
      due_date: string | null;
      status: { category: string } | { category: string }[] | null;
    };

    const companyTasks = (allCompanyTasksRes.data ?? []) as CompanyTaskRow[];
    const todayStr = new Date().toISOString().slice(0, 10);

    const projectTaskMap = new Map<
      string,
      { total: number; completed: number; overdue: number }
    >();
    const totalCompanyTasks = companyTasks.length;
    let completedCompanyTasks = 0;
    let overdueCompanyTasks = 0;

    for (const ct of companyTasks) {
      const statusCat = Array.isArray(ct.status)
        ? ct.status[0]?.category
        : ct.status?.category;
      const isDone = Boolean(ct.completed_at) || statusCat === "done";
      const isOverdue =
        !isDone && Boolean(ct.due_date && ct.due_date < todayStr);

      if (isDone) completedCompanyTasks += 1;
      if (isOverdue) overdueCompanyTasks += 1;

      const pEntry = projectTaskMap.get(ct.project_id) ?? {
        total: 0,
        completed: 0,
        overdue: 0,
      };
      pEntry.total += 1;
      if (isDone) pEntry.completed += 1;
      if (isOverdue) pEntry.overdue += 1;
      projectTaskMap.set(ct.project_id, pEntry);
    }

    const projectsSummary = visibleProjects.map((p) => {
      const pStats = projectTaskMap.get(p.id) ?? {
        total: 0,
        completed: 0,
        overdue: 0,
      };
      const rate =
        pStats.total > 0
          ? Math.round((pStats.completed / pStats.total) * 100)
          : 0;
      return {
        id: p.id,
        name: p.name,
        code: p.code,
        color: p.color,
        totalTasks: pStats.total,
        completedTasks: pStats.completed,
        overdueTasks: pStats.overdue,
        completionRate: rate,
      };
    });

    type RawUrgent = Omit<Task, "status" | "project" | "assignees"> & {
      status: Task["status"] | Array<NonNullable<Task["status"]>>;
      project: Task["project"] | Array<NonNullable<Task["project"]>>;
      task_assignees?: Array<{
        user_id: string;
        profile?: Profile | Profile[];
      }>;
    };
    const rawUrgent = (urgentTasksRes.data ?? []) as unknown as RawUrgent[];
    const urgentTasks: Task[] = rawUrgent.map((t) => {
      const assignees: Profile[] = (t.task_assignees ?? [])
        .map((ta) => (Array.isArray(ta.profile) ? ta.profile[0] : ta.profile))
        .filter((p): p is Profile => Boolean(p));
      return {
        ...t,
        status: Array.isArray(t.status) ? t.status[0] ?? null : t.status,
        project: Array.isArray(t.project) ? t.project[0] ?? null : t.project,
        assignees,
      };
    });

    executiveStats = {
      totalProjects: visibleProjects.length,
      activeProjects: visibleProjects.filter((p) => p.status === "active")
        .length,
      totalCompanyTasks,
      completedCompanyTasks,
      overdueCompanyTasks,
      urgentTasks,
      projectsSummary,
    };
  }

  return (
    <Suspense fallback={null}>
      <HomeDashboard
        profile={profile}
        initialTasks={tasks}
        explicitlyDelegatedTaskIds={explicitlyDelegatedTaskIds}
        initialTodos={(todosData as PersonalTodo[]) ?? []}
        projects={visibleProjects}
        allProfiles={(allProfilesData as Profile[]) ?? []}
        allStatuses={(allStatusesData as TaskStatus[]) ?? []}
        executiveStats={executiveStats}
      />
    </Suspense>
  );
}
