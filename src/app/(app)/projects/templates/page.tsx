import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import TemplatesManagerClient from "@/components/projects/TemplatesManagerClient";
import type { Department, Profile, ProjectTemplate } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function ProjectTemplatesPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: profileData }, { data: templatesData }, { data: departmentsData }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase
        .from("project_templates")
        .select("*, tasks:project_template_tasks(*)")
        .order("created_at", { ascending: false }),
      supabase.from("departments").select("*").order("name", { ascending: true }),
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

  return (
    <TemplatesManagerClient
      initialTemplates={(templatesData ?? []) as ProjectTemplate[]}
      departments={(departmentsData ?? []) as Department[]}
      currentUser={currentUser}
    />
  );
}
