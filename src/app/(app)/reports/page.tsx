import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  ReportsClient,
  type TaskAssigneeRow,
} from "@/components/reports/ReportsClient";
import { hasSystemPermission, SYSTEM_PERMISSIONS } from "@/lib/permissions";
import type {
  Department,
  Profile,
  Project,
  Task,
  TaskStatus,
} from "@/types/database";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: currentProfileData } = await supabase
    .from("profiles")
    .select("*, custom_role:roles(*)")
    .eq("id", user.id)
    .single();

  const currentUser: Profile = (currentProfileData as Profile | null) ?? {
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

  const canViewReports = hasSystemPermission(
    currentUser,
    SYSTEM_PERMISSIONS.VIEW_REPORTS
  );

  if (!canViewReports) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <div className="rounded-2xl border border-amber-200 bg-white p-8 text-center shadow-xs dark:border-amber-900/50 dark:bg-slate-900">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-lg font-bold text-slate-900 dark:text-slate-100">
            Giới hạn quyền truy cập Báo cáo
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Tài khoản của bạn ({currentUser.custom_role?.name || currentUser.role}) chưa được cấp quyền{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] dark:bg-slate-800">
              view_reports
            </code>{" "}
            để xem bảng tổng hợp hiệu suất và xuất dữ liệu toàn công ty. Vui lòng liên hệ Ban Giám đốc hoặc Quản trị viên hệ thống nếu cần cấp quyền.
          </p>
          <div className="mt-6">
            <Link
              href="/home"
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-brand-hover"
            >
              <ArrowLeft className="h-4 w-4" />
              Quay về Trang chủ của tôi
            </Link>
          </div>
        </div>
      </div>
    );
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
    <Suspense fallback={null}>
      <ReportsClient
        projects={(projectsRes.data ?? []) as Project[]}
        departments={(departmentsRes.data ?? []) as Department[]}
        profiles={(profilesRes.data ?? []) as Profile[]}
        taskStatuses={(statusesRes.data ?? []) as TaskStatus[]}
        tasks={(tasksRes.data ?? []) as Task[]}
        taskAssignees={(assigneesRes.data ?? []) as TaskAssigneeRow[]}
      />
    </Suspense>
  );
}
