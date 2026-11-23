import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import ProjectsListClient, {
  type ProjectWithStats,
} from "@/components/projects/ProjectsListClient";
import { canUserViewProject } from "@/lib/permissions";
import type {
  Department,
  Profile,
  Project,
  ProjectTemplate,
} from "@/types/database";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [
    { data: profileData },
    { data: projectsData },
    { data: tasksData },
    { data: departmentsData },
    { data: templatesData },
    { data: profilesData },
    { data: myMembershipsData },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("*, custom_role:roles(*)")
      .eq("id", user.id)
      .single(),
    supabase
      .from("projects")
      .select("*, department:departments(id, name, code)")
      .order("created_at", { ascending: false }),
    supabase
      .from("tasks")
      .select("id, project_id, completed_at, status:task_statuses(category)")
      .is("parent_id", null),
    supabase.from("departments").select("*").order("name", { ascending: true }),
    supabase
      .from("project_templates")
      .select("*, tasks:project_template_tasks(*)")
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("*")
      .eq("is_active", true)
      .order("full_name", { ascending: true }),
    supabase
      .from("project_members")
      .select("project_id")
      .eq("user_id", user.id),
  ]);

  const currentUser: Profile = (profileData as Profile | null) ?? {
    id: user.id,
    email: user.email ?? "",
    full_name: user.user_metadata?.full_name ?? "Thành viên",
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

  // Filter projects according to visibility & RBAC rules
  const visibleProjects = ((projectsData ?? []) as Project[]).filter((proj) =>
    canUserViewProject(currentUser, proj, myProjectIds.has(proj.id))
  );

  // Aggregate task stats per project
  const statsMap = new Map<string, { total: number; completed: number }>();
  type TaskStatRow = {
    id: string;
    project_id: string;
    completed_at: string | null;
    status: { category: string } | { category: string }[] | null;
  };
  for (const t of (tasksData ?? []) as TaskStatRow[]) {
    const entry = statsMap.get(t.project_id) ?? { total: 0, completed: 0 };
    entry.total += 1;
    const statusObj = Array.isArray(t.status) ? t.status[0] : t.status;
    if (t.completed_at || statusObj?.category === "done") {
      entry.completed += 1;
    }
    statsMap.set(t.project_id, entry);
  }

  const projectsWithStats: ProjectWithStats[] = visibleProjects.map((proj) => {
    const st = statsMap.get(proj.id) ?? { total: 0, completed: 0 };
    return {
      ...proj,
      total_tasks: st.total,
      completed_tasks: st.completed,
    };
  });

  return (
    <Suspense fallback={null}>
      <ProjectsListClient
        initialProjects={projectsWithStats}
        departments={(departmentsData ?? []) as Department[]}
        templates={(templatesData ?? []) as ProjectTemplate[]}
        currentUser={currentUser}
        profiles={(profilesData ?? []) as Profile[]}
      />
    </Suspense>
  );
}
