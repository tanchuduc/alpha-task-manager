import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SettingsView } from "@/components/settings/SettingsView";
import type { Department, Profile, SystemRole } from "@/types/database";

export default async function SettingsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [
    { data: currentProfileData },
    { data: departmentsData },
    { data: profilesData },
    { data: projectsData },
    { data: rolesData },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "*, department:departments(*), manager:profiles!manager_id(id, full_name, email, avatar_url, job_title), custom_role:roles(*)"
      )
      .eq("id", user.id)
      .single(),
    supabase
      .from("departments")
      .select("*, parent:departments!parent_id(id, name, code)")
      .order("name", { ascending: true }),
    supabase
      .from("profiles")
      .select(
        "*, department:departments(*), manager:profiles!manager_id(id, full_name, email, avatar_url, job_title), custom_role:roles(*)"
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("projects")
      .select("id, name, code")
      .order("name", { ascending: true }),
    supabase
      .from("roles")
      .select("*")
      .order("created_at", { ascending: true }),
  ]);

  const currentProfile: Profile = (currentProfileData as Profile | null) ?? {
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
    manager_id: null,
    telegram_chat_id: null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    department: null,
    manager: null,
    custom_role: null,
  };

  return (
    <SettingsView
      currentProfile={currentProfile}
      initialDepartments={(departmentsData as Department[]) ?? []}
      initialProfiles={(profilesData as Profile[]) ?? []}
      projects={
        (projectsData as Array<{ id: string; name: string; code: string }>) ?? []
      }
      initialRoles={(rolesData as SystemRole[]) ?? []}
    />
  );
}
