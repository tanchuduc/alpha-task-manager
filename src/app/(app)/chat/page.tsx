import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ChatContainer } from "@/components/chat/ChatContainer";
import type { Profile, Department } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch current user profile, all profiles, and all departments in parallel
  const [currentProfileRes, allProfilesRes, allDepartmentsRes] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("*, department:departments(*)")
        .eq("id", user.id)
        .single(),
      supabase
        .from("profiles")
        .select("*, department:departments(*)")
        .eq("is_active", true)
        .order("full_name", { ascending: true }),
      supabase
        .from("departments")
        .select("*")
        .order("name", { ascending: true }),
    ]);

  const currentUser: Profile = (currentProfileRes.data as Profile | null) ?? {
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

  const allProfiles: Profile[] = (allProfilesRes.data as Profile[] | null) ?? [];
  const allDepartments: Department[] =
    (allDepartmentsRes.data as Department[] | null) ?? [];

  return (
    <div className="h-[calc(100vh-6rem)]">
      <ChatContainer
        currentUser={currentUser}
        allProfiles={allProfiles}
        allDepartments={allDepartments}
      />
    </div>
  );
}
