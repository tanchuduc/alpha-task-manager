import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import type { Profile } from "@/types/database";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: profileData }, { count: unreadCount }] = await Promise.all([
    supabase
      .from("profiles")
      .select("*, department:departments(*)")
      .eq("id", user.id)
      .single(),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false),
  ]);

  const profile: Profile = (profileData as Profile | null) ?? {
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
    telegram_chat_id: null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    department: null,
  };

  return (
    <AppShell profile={profile} initialUnreadCount={unreadCount ?? 0}>
      {children}
    </AppShell>
  );
}
