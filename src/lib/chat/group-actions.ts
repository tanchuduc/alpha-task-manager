import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";

export interface CreateGroupInput {
  title: string;
  description?: string;
  memberIds: string[];
  currentUser: Profile;
}

export async function createGroupConversation({
  title,
  description,
  memberIds,
  currentUser,
}: CreateGroupInput): Promise<{ id: string; title: string }> {
  const supabase = createClient();

  try {
    // 1. Try inserting into alpha_lite.conversations
    const { data: convData, error: convError } = await supabase
      .from("conversations")
      .insert({
        type: "group",
        title,
        description: description || null,
        created_by: currentUser.id,
      })
      .select("id, title")
      .single();

    if (!convError && convData) {
      const convId = convData.id;

      // 2. Add creator as Owner
      const membersToInsert = [
        {
          conversation_id: convId,
          user_id: currentUser.id,
          role: "owner" as const,
          last_read_at: new Date().toISOString(),
          joined_at: new Date().toISOString(),
        },
        ...memberIds.map((uid) => ({
          conversation_id: convId,
          user_id: uid,
          role: "member" as const,
          last_read_at: new Date().toISOString(),
          joined_at: new Date().toISOString(),
        })),
      ];

      await supabase.from("conversation_members").insert(membersToInsert);

      // 3. Post a welcome system event message
      await supabase.from("messages").insert({
        conversation_id: convId,
        sender_id: currentUser.id,
        content: `🎉 Nhóm "${title}" đã được tạo bởi ${currentUser.full_name}. Mọi người hãy bắt đầu trao đổi!`,
        message_type: "system_event",
      });

      return { id: convId, title: convData.title || title };
    }
  } catch (err) {
    console.warn("Chưa áp dụng bảng conversations trên database, sử dụng storage fallback:", err);
  }

  // Fallback: Local group persistence in user's browser
  const fallbackId = `group:${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const savedGroups = JSON.parse(
    localStorage.getItem(`alpha_custom_groups_${currentUser.id}`) || "[]"
  );
  savedGroups.unshift({
    id: fallbackId,
    type: "group",
    title,
    description: description || null,
    memberIds: [currentUser.id, ...memberIds],
    createdBy: currentUser.id,
    createdAt: new Date().toISOString(),
  });
  localStorage.setItem(
    `alpha_custom_groups_${currentUser.id}`,
    JSON.stringify(savedGroups)
  );

  return { id: fallbackId, title };
}

export async function addGroupMembers(
  conversationId: string,
  newMemberIds: string[],
  addedByName: string
): Promise<void> {
  const supabase = createClient();
  try {
    const rows = newMemberIds.map((uid) => ({
      conversation_id: conversationId,
      user_id: uid,
      role: "member" as const,
      last_read_at: new Date().toISOString(),
      joined_at: new Date().toISOString(),
    }));
    await supabase.from("conversation_members").insert(rows);
  } catch (err) {
    console.error("Lỗi thêm thành viên:", err);
  }
}

export async function removeGroupMember(
  conversationId: string,
  targetUserId: string
): Promise<void> {
  const supabase = createClient();
  try {
    await supabase
      .from("conversation_members")
      .delete()
      .eq("conversation_id", conversationId)
      .eq("user_id", targetUserId);
  } catch (err) {
    console.error("Lỗi xóa thành viên:", err);
  }
}
