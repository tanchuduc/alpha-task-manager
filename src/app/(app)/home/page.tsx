import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { HomeDashboard } from "@/components/home/HomeDashboard";
import type { PersonalTodo, Profile, Task } from "@/types/database";

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
    { data: createdRows },
    { data: todosData },
    { data: projectsData },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("task_assignees").select("task_id").eq("user_id", user.id),
    supabase.from("tasks").select("id").eq("created_by", user.id),
    supabase
      .from("personal_todos")
      .select("*")
      .eq("user_id", user.id)
      .order("is_done", { ascending: true })
      .order("created_at", { ascending: false }),
    supabase
      .from("projects")
      .select("id, name, code, color")
      .order("name", { ascending: true }),
  ]);

  const assignedTaskIds = (assigneeRows ?? []).map((r) => r.task_id as string);
  const createdTaskIds = (createdRows ?? []).map((r) => r.id as string);
  const allTaskIds = Array.from(new Set([...assignedTaskIds, ...createdTaskIds]));

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
          profile:profiles(id, full_name, email, avatar_url, job_title)
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

  return (
    <HomeDashboard
      profile={profile}
      initialTasks={tasks}
      initialTodos={(todosData as PersonalTodo[]) ?? []}
      projects={projectsData ?? []}
    />
  );
}
