import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import ProjectDetailClient from "@/components/projects/ProjectDetailClient";
import {
  hasProjectPermission,
  PROJECT_PERMISSIONS,
  shouldRestrictTasksToAssignee,
} from "@/lib/permissions";
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

  const project = projectData as Project;
  const members = (membersData ?? []) as ProjectMember[];
  const currentMember = members.find((m) => m.user_id === currentUser.id);

  // Enforce VIEW_PROJECT permission
  const canViewProject = hasProjectPermission(
    currentUser,
    project,
    currentMember,
    PROJECT_PERMISSIONS.VIEW_PROJECT
  );

  if (!canViewProject) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <div className="rounded-2xl border border-red-200 bg-white p-8 text-center shadow-xs dark:border-red-900/50 dark:bg-slate-900">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400">
            <Lock className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-lg font-bold text-slate-900 dark:text-slate-100">
            Bạn không có quyền truy cập dự án này
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Dự án <strong>[{project.code}] {project.name}</strong> đang ở chế độ riêng tư hoặc vai trò của bạn đã bị thu hồi quyền xem dự án (<code>view_project</code>). Vui lòng liên hệ Trưởng dự án hoặc Quản trị viên để được thêm vào dự án.
          </p>
          <div className="mt-6">
            <Link
              href="/projects"
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-brand-hover"
            >
              <ArrowLeft className="h-4 w-4" />
              Quay về danh sách dự án
            </Link>
          </div>
        </div>
      </div>
    );
  }

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

  const restrictToAssignee = shouldRestrictTasksToAssignee(
    currentUser,
    project,
    currentMember
  );

  // Build parent IDs of subtasks assigned to currentUser (TVR-19 subtask parent visibility)
  const parentIdsWithAssignedSubtask = new Set<string>();
  const subtaskCountMap = new Map<string, { total: number; done: number }>();

  for (const r of rawTasks) {
    if (r.parent_id) {
      const entry = subtaskCountMap.get(r.parent_id) ?? { total: 0, done: 0 };
      entry.total += 1;
      if (r.completed_at || (doneStatus && r.status_id === doneStatus.id)) {
        entry.done += 1;
      }
      subtaskCountMap.set(r.parent_id, entry);

      const isSubAssignedToMe =
        r.created_by === currentUser.id ||
        (r.task_assignees ?? []).some((a) => a.user_id === currentUser.id);
      if (isSubAssignedToMe) {
        parentIdsWithAssignedSubtask.add(r.parent_id);
      }
    }
  }

  const topLevelTasks: Task[] = rawTasks
    .filter((r) => {
      if (r.parent_id) return false;
      if (!restrictToAssignee) return true;
      const isAssignedToMe = (r.task_assignees ?? []).some(
        (a) => a.user_id === currentUser.id
      );
      const isCreatedByMe = r.created_by === currentUser.id;
      const hasMySubtask = parentIdsWithAssignedSubtask.has(r.id);
      return isAssignedToMe || isCreatedByMe || hasMySubtask;
    })
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
      initialProject={project}
      initialStatuses={statuses}
      initialTasks={topLevelTasks}
      initialMembers={members}
      allProfiles={allProfiles}
      currentUser={currentUser}
      departments={(departmentsData ?? []) as Department[]}
    />
  );
}
