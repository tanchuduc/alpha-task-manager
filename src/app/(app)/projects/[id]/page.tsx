import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import ProjectDetailClient from "@/components/projects/ProjectDetailClient";
import type {
  Department,
  Profile,
  Project,
  ProjectMember,
  Task,
  TaskStatus,
} from "@/types/database";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [
    { data: profileData },
    { data: projectData, error: projectErr },
    { data: statusesData },
    { data: allTasksData },
    { data: membersData },
    { data: allProfilesData },
    { data: departmentsData },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("*, custom_role:roles(*)")
      .eq("id", user.id)
      .single(),
    supabase
      .from("projects")
      .select("*, department:departments(id, name, code)")
      .eq("id", id)
      .single(),
    supabase
      .from("task_statuses")
      .select("*")
      .eq("project_id", id)
      .order("position", { ascending: true }),
    supabase
      .from("tasks")
      .select("*, task_assignees(user_id)")
      .eq("project_id", id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("project_members")
      .select("*, profile:profiles(*), project_role:project_roles(*)")
      .eq("project_id", id),
    supabase
      .from("profiles")
      .select("*")
      .eq("is_active", true)
      .order("full_name", { ascending: true }),
    supabase
      .from("departments")
      .select("*")
      .order("name", { ascending: true }),
  ]);

  if (projectErr || !projectData) {
    notFound();
  }

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

  const statuses = (statusesData ?? []) as TaskStatus[];
  const doneStatus = statuses.find((s) => s.category === "done") ?? null;
  const allProfiles = (allProfilesData ?? []) as Profile[];
  const profilesMap = new Map<string, Profile>(
    allProfiles.map((p) => [p.id, p])
  );

  type RawTaskRow = Task & {
    task_assignees?: { user_id: string }[];
  };
  const rawTasks = (allTasksData ?? []) as RawTaskRow[];

  const subtaskCountMap = new Map<string, { total: number; done: number }>();
  for (const r of rawTasks) {
    if (r.parent_id) {
      const entry = subtaskCountMap.get(r.parent_id) ?? { total: 0, done: 0 };
      entry.total += 1;
      if (r.completed_at || (doneStatus && r.status_id === doneStatus.id)) {
        entry.done += 1;
      }
      subtaskCountMap.set(r.parent_id, entry);
    }
  }

  const topLevelTasks: Task[] = rawTasks
    .filter((r) => !r.parent_id)
    .map((r) => {
      const sub = subtaskCountMap.get(r.id) ?? { total: 0, done: 0 };
      const assignees: Profile[] = (r.task_assignees ?? [])
        .map((a) => profilesMap.get(a.user_id))
        .filter((p): p is Profile => Boolean(p));
      return {
        ...r,
        assignees,
        subtasks_count: sub.total,
        subtasks_done: sub.done,
      };
    });

  return (
    <ProjectDetailClient
      initialProject={projectData as Project}
      initialStatuses={statuses}
      initialTasks={topLevelTasks}
      initialMembers={(membersData ?? []) as ProjectMember[]}
      allProfiles={allProfiles}
      currentUser={currentUser}
      departments={(departmentsData ?? []) as Department[]}
    />
  );
}
