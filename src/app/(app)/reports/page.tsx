import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  ReportsClient,
  type TaskAssigneeRow,
} from "@/components/reports/ReportsClient";
import type {
  Department,
  Profile,
  Project,
  Task,
  TaskStatus,
} from "@/types/database";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [
    projectsRes,
    departmentsRes,
    profilesRes,
    statusesRes,
    tasksRes,
    assigneesRes,
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false }),
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
      .from("tasks")
      .select("*")
      .is("parent_id", null)
      .order("created_at", { ascending: false }),
    supabase.from("task_assignees").select("task_id, user_id"),
  ]);

  return (
    <ReportsClient
      projects={(projectsRes.data ?? []) as Project[]}
      departments={(departmentsRes.data ?? []) as Department[]}
      profiles={(profilesRes.data ?? []) as Profile[]}
      taskStatuses={(statusesRes.data ?? []) as TaskStatus[]}
      tasks={(tasksRes.data ?? []) as Task[]}
      taskAssignees={(assigneesRes.data ?? []) as TaskAssigneeRow[]}
    />
  );
}
