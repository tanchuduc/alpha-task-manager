import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { canUserViewProject } from "@/lib/permissions";
import type {
  Department,
  PersonalTodo,
  Profile,
  Project,
  Task,
  TaskStatus,
} from "@/types/database";
import CalendarClient from "@/components/calendar/CalendarClient";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
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
    { data: myMembershipsData },
    { data: departmentsData },
    { data: allProfilesData },
    { data: allStatusesData },
    { data: todosData },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("*, custom_role:roles(*), department:departments(*)")
      .eq("id", user.id)
      .single(),
    supabase
      .from("projects")
      .select("id, name, code, color, created_by, project_manager_id, is_private, status, department_id")
      .order("name", { ascending: true }),
    supabase
      .from("project_members")
      .select("project_id")
      .eq("user_id", user.id),
    supabase
      .from("departments")
      .select("*")
      .order("name", { ascending: true }),
    supabase
      .from("profiles")
      .select("*")
      .eq("is_active", true)
      .order("full_name", { ascending: true }),
    supabase
      .from("task_statuses")
      .select("*")
      .order("position", { ascending: true }),
    supabase
      .from("personal_todos")
      .select("*")
      .eq("user_id", user.id)
      .order("is_done", { ascending: true })
      .order("created_at", { ascending: false }),
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

  const visibleProjectIds = visibleProjects.map((p) => p.id);

  let tasks: Task[] = [];
  if (visibleProjectIds.length > 0) {
    const { data: tasksData } = await supabase
      .from("tasks")
      .select(`
        *,
        status:task_statuses(*),
        project:projects(id, name, code, color, department_id),
        task_assignees(
          user_id,
          assigned_by,
          profile:profiles!task_assignees_user_id_fkey(id, full_name, email, avatar_url, job_title)
        )
      `)
      .in("project_id", visibleProjectIds)
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

  return (
    <CalendarClient
      profile={profile}
      initialTasks={tasks}
      initialTodos={(todosData ?? []) as PersonalTodo[]}
      projects={visibleProjects}
      departments={(departmentsData ?? []) as Department[]}
      allProfiles={(allProfilesData ?? []) as Profile[]}
      allStatuses={(allStatusesData ?? []) as TaskStatus[]}
    />
  );
}
