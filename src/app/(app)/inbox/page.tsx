import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { InboxClient } from "@/components/inbox/InboxClient";
import type { Notification } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data } = await supabase
    .from("notifications")
    .select(
      `
      id,
      user_id,
      actor_id,
      type,
      title,
      body,
      link,
      is_read,
      created_at,
      actor:actor_id (
        id,
        full_name,
        avatar_url
      )
    `
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const initialNotifications: Notification[] = (data ?? []).map((row) => {
    const rawActor = row.actor as
      | { id: string; full_name: string; avatar_url: string | null }
      | { id: string; full_name: string; avatar_url: string | null }[]
      | null;
    const actor = Array.isArray(rawActor) ? rawActor[0] ?? null : rawActor;

    return {
      id: row.id,
      user_id: row.user_id,
      actor_id: row.actor_id,
      type: row.type,
      title: row.title,
      body: row.body,
      link: row.link,
      is_read: row.is_read,
      created_at: row.created_at,
      actor,
    };
  });

  return (
    <InboxClient
      initialNotifications={initialNotifications}
      currentUserId={user.id}
    />
  );
}
