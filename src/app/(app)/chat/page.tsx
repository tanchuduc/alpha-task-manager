import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ChatContainer } from "@/components/chat/ChatContainer";
import type { Profile, Department, Project } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch current user profile, all profiles, all departments, and active projects in parallel
  const [
    currentProfileRes,
    allProfilesRes,
    allDepartmentsRes,
    allProjectsRes,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single(),
    supabase
      .from("profiles")
      .select("*")
      .order("full_name", { ascending: true }),
    supabase
      .from("departments")
      .select("*")
      .order("name", { ascending: true }),
    supabase
      .from("projects")
      .select("*")
      .order("updated_at", { ascending: false }),
  ]);

  const allDepartments: Department[] =
    (allDepartmentsRes.data as Department[] | null) ?? [];
  const allProjects: Project[] =
    (allProjectsRes.data as Project[] | null) ?? [];

  const deptMap = new Map(allDepartments.map((d) => [d.id, d]));

  const rawProfiles = (allProfilesRes.data as Profile[] | null) ?? [];
  const allProfiles: Profile[] = rawProfiles.map((p) => ({
    ...p,
    department: p.department_id ? deptMap.get(p.department_id) || null : null,
  }));

  const rawCurrent = currentProfileRes.data as Profile | null;
  const currentUser: Profile = rawCurrent
    ? {
        ...rawCurrent,
        department: rawCurrent.department_id
          ? deptMap.get(rawCurrent.department_id) || null
          : null,
      }
    : {
        id: user.id,
        email: user.email ?? "",
        full_name:
          (user.user_metadata?.full_name as string | undefined) ??
          user.email?.split("@")[0] ??
          "Nhân viên Alpha",
        avatar_url: (user.user_metadata?.avatar_url as string | null) ?? null,
        role: "member",
        job_title: null,
        department_id: null,
        manager_id: null,
        telegram_chat_id: null,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        department: null,
        manager: null,
      };

  return (
    <div className="h-[calc(100vh-6rem)]">
      <ChatContainer
        currentUser={currentUser}
        allProfiles={allProfiles}
        allDepartments={allDepartments}
        allProjects={allProjects}
      />
    </div>
  );
}
