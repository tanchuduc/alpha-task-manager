"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Profile,
  Project,
  MessageType,
  ConversationType,
  DirectMessage,
  ProjectMessage,
} from "@/types/database";
import { toast } from "sonner";
import {
  createGroupConversation,
  addGroupMembers,
  removeGroupMember,
} from "@/lib/chat/group-actions";
import { removeVietnameseTones } from "@/lib/utils";

export interface UnifiedConversationItem {
  id: string; // e.g. "dm:userId" or "proj:projectId" or uuid
  type: ConversationType;
  title: string;
  avatarUrl: string | null;
  description: string | null;
  projectId?: string | null;
  partnerId?: string | null; // for direct chat
  partnerProfile?: Profile;
  memberIds?: string[];
  ownerId?: string;
  lastMessage?: {
    content: string;
    createdAt: string;
    senderId: string;
    isDeleted?: boolean;
  };
  unreadCount: number;
  isPinned: boolean;
  isMuted: boolean;
  updatedAt: string;
  memberCount?: number;
}

export interface UnifiedMessageItem {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  senderJobTitle: string | null;
  sender?: Profile;
  content: string;
  messageType: MessageType;
  metadata?: Record<string, any>;
  replyToId: string | null;
  replyToMessage?: {
    id: string;
    senderName: string;
    content: string;
  } | null;
  isPinned: boolean;
  isDeleted: boolean;
  isMine: boolean;
  editedAt: string | null;
  reactions: Record<string, string[]>;
  attachmentUrl: string | null;
  attachmentName: string | null;
  createdAt: string;
}

export type ConversationFilter = "all" | "unread" | "direct" | "group" | "project";

interface UseUnifiedChatOptions {
  currentUser: Profile;
  allProfiles: Profile[];
  allProjects?: Project[];
  initialUserId?: string | null;
  initialProjectId?: string | null;
  initialConvId?: string | null;
}

export function useUnifiedChat({
  currentUser,
  allProfiles,
  allProjects = [],
  initialUserId,
  initialProjectId,
  initialConvId,
}: UseUnifiedChatOptions) {
  const supabase = useMemo(() => createClient(), []);

  // Filter out current user for DM targets
  const otherProfiles = useMemo(
    () => allProfiles.filter((p) => p.id !== currentUser.id),
    [allProfiles, currentUser.id]
  );

  // Core state
  const [activeFilter, setActiveFilter] = useState<ConversationFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  // Conversations & raw message states
  const [conversations, setConversations] = useState<UnifiedConversationItem[]>([]);
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);
  const [projectMessages, setProjectMessages] = useState<ProjectMessage[]>([]);
  const [customGroupMessages, setCustomGroupMessages] = useState<any[]>([]);

  // Pinned & Muted persistence in localStorage (per user)
  const [pinnedConvIds, setPinnedConvIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const saved = localStorage.getItem(`pinned_convs_${currentUser.id}`);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const [mutedConvIds, setMutedConvIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const saved = localStorage.getItem(`muted_convs_${currentUser.id}`);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Presence & Typing state
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(
    () => new Set([currentUser.id])
  );
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const typingTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({});
  const lastTypingBroadcastRef = useRef<number>(0);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Helper to persist pins/mutes
  const togglePinConversation = useCallback(
    (convId: string) => {
      setPinnedConvIds((prev) => {
        const next = new Set(prev);
        if (next.has(convId)) next.delete(convId);
        else next.add(convId);
        try {
          localStorage.setItem(
            `pinned_convs_${currentUser.id}`,
            JSON.stringify(Array.from(next))
          );
        } catch {}
        return next;
      });
    },
    [currentUser.id]
  );

  const toggleMuteConversation = useCallback(
    (convId: string) => {
      setMutedConvIds((prev) => {
        const next = new Set(prev);
        if (next.has(convId)) next.delete(convId);
        else next.add(convId);
        try {
          localStorage.setItem(
            `muted_convs_${currentUser.id}`,
            JSON.stringify(Array.from(next))
          );
        } catch {}
        return next;
      });
    },
    [currentUser.id]
  );

  // 1. Build initial conversation list (Direct + Projects + Groups)
  const refreshConversations = useCallback(async () => {
    setLoadingConversations(true);
    try {
      // 1.1 Direct Messages Summary
      const { data: dmData } = await supabase
        .from("direct_messages")
        .select("id, sender_id, receiver_id, content, is_read, is_deleted, created_at")
        .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
        .order("created_at", { ascending: false })
        .limit(300);

      const dmUnreadCounts: Record<string, number> = {};
      const dmLastMsgMap: Record<string, any> = {};

      if (dmData) {
        dmData.forEach((dm) => {
          const partnerId = dm.sender_id === currentUser.id ? dm.receiver_id : dm.sender_id;
          if (!dmLastMsgMap[partnerId]) {
            dmLastMsgMap[partnerId] = {
              content: dm.is_deleted ? "Tin nhắn đã thu hồi" : dm.content || "[Tệp đính kèm]",
              createdAt: dm.created_at,
              senderId: dm.sender_id,
              isDeleted: dm.is_deleted,
            };
          }
          if (dm.receiver_id === currentUser.id && !dm.is_read) {
            dmUnreadCounts[dm.sender_id] = (dmUnreadCounts[dm.sender_id] || 0) + 1;
          }
        });
      }

      // 1.2 Project Messages Summary
      const [pmRes, projReadRes] = await Promise.all([
        supabase
          .from("project_messages")
          .select("id, project_id, author_id, content, is_deleted, created_at")
          .order("created_at", { ascending: false })
          .limit(300),
        supabase
          .from("project_chat_read_states")
          .select("project_id, last_read_at")
          .eq("user_id", currentUser.id),
      ]);

      const projReadMap: Record<string, number> = {};
      if (projReadRes.data) {
        projReadRes.data.forEach((rs) => {
          projReadMap[rs.project_id] = new Date(rs.last_read_at).getTime();
        });
      }

      const pmLastMsgMap: Record<string, any> = {};
      const pmUnreadCounts: Record<string, number> = {};

      if (pmRes.data) {
        pmRes.data.forEach((pm) => {
          if (!pmLastMsgMap[pm.project_id]) {
            pmLastMsgMap[pm.project_id] = {
              content: pm.is_deleted ? "Tin nhắn đã thu hồi" : pm.content || "[Tệp đính kèm]",
              createdAt: pm.created_at,
              senderId: pm.author_id,
              isDeleted: pm.is_deleted,
            };
          }
          const lastReadMs = projReadMap[pm.project_id] || 0;
          const msgMs = new Date(pm.created_at).getTime();
          if (pm.author_id !== currentUser.id && lastReadMs > 0 && msgMs > lastReadMs) {
            pmUnreadCounts[pm.project_id] = (pmUnreadCounts[pm.project_id] || 0) + 1;
          }
        });
      }

      // Assemble unified list
      const directItems: UnifiedConversationItem[] = otherProfiles.map((partner) => {
        const convId = `dm:${partner.id}`;
        return {
          id: convId,
          type: "direct",
          title: partner.full_name || "Đồng nghiệp",
          avatarUrl: partner.avatar_url,
          description: partner.job_title || partner.department?.name || null,
          partnerId: partner.id,
          partnerProfile: partner,
          lastMessage: dmLastMsgMap[partner.id],
          unreadCount: dmUnreadCounts[partner.id] || 0,
          isPinned: pinnedConvIds.has(convId),
          isMuted: mutedConvIds.has(convId),
          updatedAt: dmLastMsgMap[partner.id]?.createdAt || partner.created_at,
        };
      });

      const projectItems: UnifiedConversationItem[] = allProjects
        .filter((proj) => proj.status === "active")
        .map((proj) => {
          const convId = `proj:${proj.id}`;
          return {
            id: convId,
            type: "project",
            title: proj.name,
            avatarUrl: null,
            description: proj.description || null,
            projectId: proj.id,
            lastMessage: pmLastMsgMap[proj.id],
            unreadCount: pmUnreadCounts[proj.id] || 0,
            isPinned: pinnedConvIds.has(convId),
            isMuted: mutedConvIds.has(convId),
            updatedAt: pmLastMsgMap[proj.id]?.createdAt || proj.updated_at,
          };
        });

      // 1.3 Custom Groups (Support both remote Supabase conversations and local fallback)
      let groupItems: UnifiedConversationItem[] = [];
      const remoteGroupIds = new Set<string>();

      try {
        const { data: remoteGroups } = await supabase
          .from("conversations")
          .select("id, title, description, avatar_url, created_by, updated_at, created_at, members:conversation_members(user_id, role)")
          .eq("type", "group");

        if (remoteGroups && remoteGroups.length > 0) {
          remoteGroups.forEach((g: any) => {
            const memberList: string[] = (g.members || []).map((m: any) => m.user_id);
            // Show only if current user is member or creator
            if (memberList.includes(currentUser.id) || g.created_by === currentUser.id) {
              remoteGroupIds.add(g.id);
              groupItems.push({
                id: g.id,
                type: "group",
                title: g.title,
                avatarUrl: g.avatar_url || null,
                description: g.description || `${memberList.length || 1} thành viên`,
                isPinned: pinnedConvIds.has(g.id),
                isMuted: mutedConvIds.has(g.id),
                unreadCount: 0,
                updatedAt: g.updated_at || g.created_at || new Date().toISOString(),
                memberCount: memberList.length || 1,
                memberIds: memberList,
                ownerId: g.created_by,
              });
            }
          });
        }
      } catch {}

      try {
        const localGroups = JSON.parse(
          localStorage.getItem(`alpha_custom_groups_${currentUser.id}`) || "[]"
        );
        localGroups.forEach((g: any) => {
          if (!remoteGroupIds.has(g.id)) {
            const lastMsg = g.lastMessage;
            groupItems.push({
              id: g.id,
              type: "group" as const,
              title: g.title,
              avatarUrl: g.avatarUrl || null,
              description: g.description || `${g.memberIds?.length || 1} thành viên`,
              isPinned: pinnedConvIds.has(g.id),
              isMuted: mutedConvIds.has(g.id),
              unreadCount: 0,
              updatedAt: lastMsg?.createdAt || g.createdAt || new Date().toISOString(),
              memberCount: g.memberIds?.length || 1,
              memberIds: g.memberIds || [currentUser.id],
              ownerId: g.createdBy || currentUser.id,
              lastMessage: lastMsg,
            });
          }
        });
      } catch {}

      const allItems = [...directItems, ...projectItems, ...groupItems];
      setConversations(allItems);
    } catch (err) {
      console.error("Lỗi nạp danh sách hội thoại:", err);
    } finally {
      setLoadingConversations(false);
    }
  }, [
    currentUser.id,
    otherProfiles,
    allProjects,
    pinnedConvIds,
    mutedConvIds,
    supabase,
  ]);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  // Set initial active conversation
  useEffect(() => {
    if (activeConversationId) return;

    if (initialConvId) {
      setActiveConversationId(initialConvId);
    } else if (initialProjectId) {
      setActiveConversationId(`proj:${initialProjectId}`);
    } else if (initialUserId) {
      setActiveConversationId(`dm:${initialUserId}`);
    } else if (conversations.length > 0) {
      setActiveConversationId(conversations[0].id);
    }
  }, [
    initialConvId,
    initialProjectId,
    initialUserId,
    conversations,
    activeConversationId,
  ]);

  // Active conversation object
  const activeConversation = useMemo(() => {
    return conversations.find((c) => c.id === activeConversationId) || null;
  }, [conversations, activeConversationId]);

  const activeConversationRef = useRef<UnifiedConversationItem | null>(null);
  activeConversationRef.current = activeConversation;

  // 2. Load Messages for Active Conversation
  const loadMessages = useCallback(
    async (forcedConvId?: string) => {
      const targetConvId = forcedConvId || activeConversationId;
      if (!targetConvId) return;

      const targetConv =
        conversations.find((c) => c.id === targetConvId) ||
        activeConversationRef.current;
      if (!targetConv || targetConv.id !== targetConvId) return;

      setLoadingMessages(true);

      try {
        if (targetConv.type === "direct" && targetConv.partnerId) {
          const partnerId = targetConv.partnerId;
          const { data, error } = await supabase
            .from("direct_messages")
            .select(
              "*, sender:profiles!direct_messages_sender_id_fkey(*), receiver:profiles!direct_messages_receiver_id_fkey(*)"
            )
            .or(
              `and(sender_id.eq.${currentUser.id},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${currentUser.id})`
            )
            .order("created_at", { ascending: false })
            .limit(200);

          if (!error && data) {
            const uniqueMap = new Map<string, DirectMessage>();
            (data as DirectMessage[]).reverse().forEach((m) => uniqueMap.set(m.id, m));
            setDirectMessages(Array.from(uniqueMap.values()));
          }

          // Mark read
          await supabase
            .from("direct_messages")
            .update({ is_read: true })
            .eq("sender_id", partnerId)
            .eq("receiver_id", currentUser.id)
            .eq("is_read", false);

          setConversations((prev) => {
            const item = prev.find((c) => c.id === targetConvId);
            if (!item || item.unreadCount === 0) return prev;
            return prev.map((c) =>
              c.id === targetConvId ? { ...c, unreadCount: 0 } : c
            );
          });
        } else if (
          targetConv.type === "project" &&
          targetConv.projectId
        ) {
          const projId = targetConv.projectId;
          const { data, error } = await supabase
            .from("project_messages")
            .select("*, author:profiles!project_messages_author_id_fkey(*)")
            .eq("project_id", projId)
            .order("created_at", { ascending: false })
            .limit(200);

          if (!error && data) {
            const uniqueMap = new Map<string, ProjectMessage>();
            (data as ProjectMessage[]).reverse().forEach((m) => uniqueMap.set(m.id, m));
            setProjectMessages(Array.from(uniqueMap.values()));
          }

          // Mark read in project_chat_read_states
          await supabase.from("project_chat_read_states").upsert(
            {
              project_id: projId,
              user_id: currentUser.id,
              last_read_at: new Date().toISOString(),
            },
            { onConflict: "user_id,project_id" }
          );

          setConversations((prev) => {
            const item = prev.find((c) => c.id === targetConvId);
            if (!item || item.unreadCount === 0) return prev;
            return prev.map((c) =>
              c.id === targetConvId ? { ...c, unreadCount: 0 } : c
            );
          });
        } else if (targetConv.type === "group") {
          let loadedMsgs: any[] = [];
          try {
            const { data, error } = await supabase
              .from("messages")
              .select("*, sender:profiles!messages_sender_id_fkey(*)")
              .eq("conversation_id", targetConv.id)
              .order("created_at", { ascending: true })
              .limit(200);

            if (!error && data && data.length > 0) {
              loadedMsgs = data;
            }
          } catch {}

          if (loadedMsgs.length === 0) {
            try {
              const saved = JSON.parse(
                localStorage.getItem(`alpha_group_msgs_${targetConv.id}`) || "[]"
              );
              loadedMsgs = saved;
            } catch {}
          }

          setCustomGroupMessages(loadedMsgs);
        }
      } catch (err) {
        console.error("Lỗi nạp tin nhắn:", err);
      } finally {
        setLoadingMessages(false);
      }
    },
    [activeConversationId, conversations, currentUser.id, supabase]
  );

  useEffect(() => {
    if (activeConversationId) {
      loadMessages(activeConversationId);
    }
  }, [activeConversationId]);

  // 3. Transform to unified messages array
  const unifiedMessages: UnifiedMessageItem[] = useMemo(() => {
    if (!activeConversation) return [];

    if (activeConversation.type === "direct") {
      return directMessages.map((dm) => {
        const sender =
          dm.sender || allProfiles.find((p) => p.id === dm.sender_id);
        const isMine = dm.sender_id === currentUser.id;
        const replyTo = dm.reply_to_id
          ? directMessages.find((m) => m.id === dm.reply_to_id)
          : null;

        return {
          id: dm.id,
          conversationId: activeConversation.id,
          senderId: dm.sender_id,
          senderName: isMine ? "Bạn" : sender?.full_name || "Đồng nghiệp",
          senderAvatar: sender?.avatar_url || null,
          senderJobTitle: sender?.job_title || null,
          sender,
          content: dm.content || "",
          messageType: "text",
          replyToId: dm.reply_to_id || null,
          replyToMessage: replyTo
            ? {
                id: replyTo.id,
                senderName:
                  replyTo.sender_id === currentUser.id
                    ? "Bạn"
                    : replyTo.sender?.full_name || "Đồng nghiệp",
                content: replyTo.content,
              }
            : null,
          isPinned: !!dm.is_pinned,
          isDeleted: !!dm.is_deleted,
          isMine,
          editedAt: dm.edited_at || null,
          reactions: dm.reactions || {},
          attachmentUrl: dm.attachment_url,
          attachmentName: dm.attachment_name,
          createdAt: dm.created_at,
        };
      });
    }

    if (activeConversation.type === "project") {
      return projectMessages.map((pm) => {
        const author =
          pm.author || allProfiles.find((p) => p.id === pm.author_id);
        const isMine = pm.author_id === currentUser.id;
        const replyTo = pm.reply_to_id
          ? projectMessages.find((m) => m.id === pm.reply_to_id)
          : null;

        return {
          id: pm.id,
          conversationId: activeConversation.id,
          senderId: pm.author_id,
          senderName: isMine ? "Bạn" : author?.full_name || "Thành viên",
          senderAvatar: author?.avatar_url || null,
          senderJobTitle: author?.job_title || null,
          sender: author,
          content: pm.content || "",
          messageType: "text",
          replyToId: pm.reply_to_id || null,
          replyToMessage: replyTo
            ? {
                id: replyTo.id,
                senderName:
                  replyTo.author_id === currentUser.id
                    ? "Bạn"
                    : replyTo.author?.full_name || "Thành viên",
                content: replyTo.content,
              }
            : null,
          isPinned: !!pm.is_pinned,
          isDeleted: !!pm.is_deleted,
          isMine,
          editedAt: pm.edited_at || null,
          reactions: pm.reactions || {},
          attachmentUrl: pm.attachment_url,
          attachmentName: pm.attachment_name,
          createdAt: pm.created_at,
        };
      });
    }

    if (activeConversation.type === "group") {
      return customGroupMessages.map((gm: any) => {
        const sender =
          gm.sender || allProfiles.find((p) => p.id === (gm.sender_id || gm.senderId));
        const isMine = (gm.sender_id || gm.senderId) === currentUser.id;
        const replyTo = gm.reply_to_id
          ? customGroupMessages.find((m: any) => m.id === gm.reply_to_id)
          : null;

        return {
          id: gm.id,
          conversationId: activeConversation.id,
          senderId: gm.sender_id || gm.senderId || currentUser.id,
          senderName: isMine ? "Bạn" : sender?.full_name || "Thành viên nhóm",
          senderAvatar: sender?.avatar_url || null,
          senderJobTitle: sender?.job_title || null,
          sender,
          content: gm.content || "",
          messageType: (gm.message_type || gm.messageType || "text") as MessageType,
          metadata: gm.metadata,
          replyToId: gm.reply_to_id || null,
          replyToMessage: replyTo
            ? {
                id: replyTo.id,
                senderName:
                  (replyTo.sender_id || replyTo.senderId) === currentUser.id
                    ? "Bạn"
                    : replyTo.sender?.full_name || "Thành viên nhóm",
                content: replyTo.content,
              }
            : null,
          isPinned: !!gm.is_pinned,
          isDeleted: !!gm.is_deleted,
          isMine,
          editedAt: gm.edited_at || null,
          reactions: gm.reactions || {},
          attachmentUrl: gm.attachment_url || null,
          attachmentName: gm.attachment_name || null,
          createdAt: gm.created_at || gm.createdAt || new Date().toISOString(),
        };
      });
    }

    return [];
  }, [
    activeConversation,
    directMessages,
    projectMessages,
    customGroupMessages,
    allProfiles,
    currentUser.id,
  ]);

  // 4. Presence & Realtime Subscriptions
  useEffect(() => {
    const channelSuffix = `${currentUser.id}-${Date.now()}`;
    const presenceChannel = supabase.channel("alpha-unified-presence", {
      config: { presence: { key: currentUser.id } },
    });

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const activeIds = new Set<string>([currentUser.id]);
        Object.keys(state).forEach((uid) => activeIds.add(uid));
        setOnlineUserIds(activeIds);
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (!payload || payload.userId === currentUser.id) return;
        const targetConvId = payload.targetConvId as string;
        const userName = payload.userName as string;
        if (!targetConvId || !userName) return;

        setTypingUsers((prev) => ({ ...prev, [targetConvId]: userName }));
        if (typingTimeoutRef.current[targetConvId]) {
          clearTimeout(typingTimeoutRef.current[targetConvId]);
        }
        typingTimeoutRef.current[targetConvId] = setTimeout(() => {
          setTypingUsers((prev) => {
            const next = { ...prev };
            delete next[targetConvId];
            return next;
          });
        }, 3000);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({
            user_id: currentUser.id,
            full_name: currentUser.full_name,
            online_at: new Date().toISOString(),
          });
        }
      });

    presenceChannelRef.current = presenceChannel;

    // Realtime Direct Messages
    const dmChannel = supabase
      .channel(`unified-dm-${channelSuffix}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "alpha_lite", table: "direct_messages" },
        (payload) => {
          const newDM = payload.new as DirectMessage;
          const isRelated =
            newDM.sender_id === currentUser.id ||
            newDM.receiver_id === currentUser.id;
          if (!isRelated) return;

          const partnerId =
            newDM.sender_id === currentUser.id
              ? newDM.receiver_id
              : newDM.sender_id;
          const convId = `dm:${partnerId}`;

          setConversations((prev) =>
            prev.map((c) =>
              c.id === convId
                ? {
                    ...c,
                    lastMessage: {
                      content: newDM.is_deleted
                        ? "Tin nhắn đã thu hồi"
                        : newDM.content || "[Tệp đính kèm]",
                      createdAt: newDM.created_at,
                      senderId: newDM.sender_id,
                      isDeleted: newDM.is_deleted,
                    },
                    unreadCount:
                      c.id === activeConversationId ||
                      newDM.sender_id === currentUser.id
                        ? 0
                        : c.unreadCount + 1,
                    updatedAt: newDM.created_at,
                  }
                : c
            )
          );

          // Browser Notification
          if (newDM.sender_id !== currentUser.id) {
            const senderProfile = allProfiles.find(
              (p) => p.id === newDM.sender_id
            );
            const senderName = senderProfile?.full_name || "Đồng nghiệp";
            if (
              typeof window !== "undefined" &&
              "Notification" in window &&
              Notification.permission === "granted" &&
              (document.hidden || activeConversationId !== convId)
            ) {
              const notif = new Notification(senderName, {
                body: newDM.content || "[Tệp đính kèm]",
                icon: senderProfile?.avatar_url || undefined,
                tag: `dm-${newDM.id}`,
              });
              notif.onclick = () => {
                window.focus();
                setActiveConversationId(convId);
              };
            }
          }

          if (activeConversationId === convId) {
            const senderProfile = allProfiles.find(
              (p) => p.id === newDM.sender_id
            );
            const enriched: DirectMessage = { ...newDM, sender: senderProfile };
            setDirectMessages((prev) => {
              if (prev.some((m) => m.id === enriched.id)) return prev;
              return [...prev, enriched];
            });
            if (newDM.receiver_id === currentUser.id) {
              supabase
                .from("direct_messages")
                .update({ is_read: true })
                .eq("id", newDM.id);
            }
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "alpha_lite", table: "direct_messages" },
        (payload) => {
          const updated = payload.new as DirectMessage;
          setDirectMessages((prev) =>
            prev.map((m) =>
              m.id === updated.id
                ? {
                    ...m,
                    content: updated.content,
                    is_read: updated.is_read,
                    is_pinned: updated.is_pinned,
                    is_deleted: updated.is_deleted,
                    edited_at: updated.edited_at,
                    reactions: updated.reactions,
                  }
                : m
            )
          );
        }
      )
      .subscribe();

    // Realtime Project Messages
    const pmChannel = supabase
      .channel(`unified-pm-${channelSuffix}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "alpha_lite", table: "project_messages" },
        (payload) => {
          const newPM = payload.new as ProjectMessage;
          const convId = `proj:${newPM.project_id}`;

          setConversations((prev) =>
            prev.map((c) =>
              c.id === convId
                ? {
                    ...c,
                    lastMessage: {
                      content: newPM.is_deleted
                        ? "Tin nhắn đã thu hồi"
                        : newPM.content || "[Tệp đính kèm]",
                      createdAt: newPM.created_at,
                      senderId: newPM.author_id,
                      isDeleted: newPM.is_deleted,
                    },
                    unreadCount:
                      c.id === activeConversationId ||
                      newPM.author_id === currentUser.id
                        ? 0
                        : c.unreadCount + 1,
                    updatedAt: newPM.created_at,
                  }
                : c
            )
          );

          // Browser Notification for Project Message
          if (newPM.author_id !== currentUser.id) {
            const author = allProfiles.find((p) => p.id === newPM.author_id);
            const authorName = author?.full_name || "Thành viên dự án";
            if (
              typeof window !== "undefined" &&
              "Notification" in window &&
              Notification.permission === "granted" &&
              (document.hidden || activeConversationId !== convId)
            ) {
              const notif = new Notification(`Dự án • ${authorName}`, {
                body: newPM.content || "[Tệp đính kèm]",
                icon: author?.avatar_url || undefined,
                tag: `pm-${newPM.id}`,
              });
              notif.onclick = () => {
                window.focus();
                setActiveConversationId(convId);
              };
            }
          }

          if (activeConversationId === convId) {
            const author = allProfiles.find((p) => p.id === newPM.author_id);
            const enriched: ProjectMessage = { ...newPM, author };
            setProjectMessages((prev) => {
              if (prev.some((m) => m.id === enriched.id)) return prev;
              return [...prev, enriched];
            });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "alpha_lite", table: "project_messages" },
        (payload) => {
          const updated = payload.new as ProjectMessage;
          setProjectMessages((prev) =>
            prev.map((m) =>
              m.id === updated.id
                ? {
                    ...m,
                    content: updated.content,
                    is_pinned: updated.is_pinned,
                    is_deleted: updated.is_deleted,
                    edited_at: updated.edited_at,
                    reactions: updated.reactions,
                  }
                : m
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(presenceChannel);
      supabase.removeChannel(dmChannel);
      supabase.removeChannel(pmChannel);
      presenceChannelRef.current = null;
    };
  }, [
    currentUser.id,
    currentUser.full_name,
    activeConversationId,
    allProfiles,
    supabase,
  ]);

  // 5. Actions: Send, Edit, Unsend, Reactions, Pins, Typing
  const broadcastTyping = useCallback(() => {
    if (!activeConversationId || !presenceChannelRef.current) return;
    const now = Date.now();
    if (now - lastTypingBroadcastRef.current < 1800) return;
    lastTypingBroadcastRef.current = now;

    presenceChannelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: {
        userId: currentUser.id,
        userName: currentUser.full_name,
        targetConvId: activeConversationId,
      },
    });
  }, [activeConversationId, currentUser.id, currentUser.full_name]);

  const sendMessage = useCallback(
    async (
      content: string,
      options?: {
        attachmentUrl?: string | null;
        attachmentName?: string | null;
        replyToId?: string | null;
        messageType?: MessageType;
      }
    ) => {
      if (!activeConversation) return;
      const trimmed = content.trim();
      const hasAttachment = Boolean(options?.attachmentUrl);
      if (!trimmed && !hasAttachment) return;

      const finalContent =
        trimmed ||
        (options?.attachmentName
          ? `[Đã gửi tệp: ${options.attachmentName}]`
          : "[Tệp đính kèm]");

      try {
        if (
          activeConversation.type === "direct" &&
          activeConversation.partnerId
        ) {
          const partnerId = activeConversation.partnerId;
          const { data, error } = await supabase
            .from("direct_messages")
            .insert({
              sender_id: currentUser.id,
              receiver_id: partnerId,
              content: finalContent,
              attachment_url: options?.attachmentUrl || null,
              attachment_name: options?.attachmentName || null,
              reply_to_id: options?.replyToId || null,
              is_read: false,
            })
            .select(
              "*, sender:profiles!direct_messages_sender_id_fkey(*), receiver:profiles!direct_messages_receiver_id_fkey(*)"
            )
            .single();

          if (error) throw error;
          if (data) {
            setDirectMessages((prev) => {
              if (prev.some((m) => m.id === data.id)) return prev;
              return [...prev, data as DirectMessage];
            });
          }

          // Trigger in-app notification
          await supabase.from("notifications").insert({
            user_id: partnerId,
            actor_id: currentUser.id,
            type: "task_mentioned", // Safe constraint fallback
            title: `${currentUser.full_name} đã gửi tin nhắn cho bạn`,
            body: finalContent.slice(0, 100),
            link: `/chat?user=${currentUser.id}`,
            is_read: false,
          });
        } else if (
          activeConversation.type === "project" &&
          activeConversation.projectId
        ) {
          const projId = activeConversation.projectId;
          const { data, error } = await supabase
            .from("project_messages")
            .insert({
              project_id: projId,
              author_id: currentUser.id,
              content: finalContent,
              attachment_url: options?.attachmentUrl || null,
              attachment_name: options?.attachmentName || null,
              reply_to_id: options?.replyToId || null,
            })
            .select("*, author:profiles!project_messages_author_id_fkey(*)")
            .single();

          if (error) throw error;
          if (data) {
            setProjectMessages((prev) => {
              if (prev.some((m) => m.id === data.id)) return prev;
              return [...prev, data as ProjectMessage];
            });
          }
        } else if (activeConversation.type === "group") {
          const convId = activeConversation.id;
          let sentMessage: any = null;

          try {
            const { data, error } = await supabase
              .from("messages")
              .insert({
                conversation_id: convId,
                sender_id: currentUser.id,
                content: finalContent,
                attachment_url: options?.attachmentUrl || null,
                attachment_name: options?.attachmentName || null,
                reply_to_id: options?.replyToId || null,
                message_type: options?.messageType || "text",
              })
              .select("*, sender:profiles!messages_sender_id_fkey(*)")
              .single();

            if (!error && data) {
              sentMessage = data;
            }
          } catch {}

          if (!sentMessage) {
            sentMessage = {
              id: `gmsg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              conversation_id: convId,
              sender_id: currentUser.id,
              sender: currentUser,
              content: finalContent,
              attachment_url: options?.attachmentUrl || null,
              attachment_name: options?.attachmentName || null,
              reply_to_id: options?.replyToId || null,
              message_type: options?.messageType || "text",
              is_pinned: false,
              is_deleted: false,
              reactions: {},
              created_at: new Date().toISOString(),
            };

            const existing = JSON.parse(
              localStorage.getItem(`alpha_group_msgs_${convId}`) || "[]"
            );
            existing.push(sentMessage);
            localStorage.setItem(
              `alpha_group_msgs_${convId}`,
              JSON.stringify(existing)
            );
          }

          setCustomGroupMessages((prev) => {
            if (prev.some((m: any) => m.id === sentMessage.id)) return prev;
            return [...prev, sentMessage];
          });

          // Update conversation lastMessage & savedGroups
          setConversations((prev) =>
            prev.map((c) =>
              c.id === convId
                ? {
                    ...c,
                    lastMessage: {
                      content: finalContent,
                      createdAt: sentMessage.created_at || new Date().toISOString(),
                      senderId: currentUser.id,
                      isDeleted: false,
                    },
                    updatedAt: sentMessage.created_at || new Date().toISOString(),
                  }
                : c
            )
          );

          try {
            const localGroups = JSON.parse(
              localStorage.getItem(`alpha_custom_groups_${currentUser.id}`) || "[]"
            );
            const updated = localGroups.map((g: any) =>
              g.id === convId
                ? {
                    ...g,
                    lastMessage: {
                      content: finalContent,
                      createdAt: sentMessage.created_at || new Date().toISOString(),
                      senderId: currentUser.id,
                      isDeleted: false,
                    },
                  }
                : g
            );
            localStorage.setItem(
              `alpha_custom_groups_${currentUser.id}`,
              JSON.stringify(updated)
            );
          } catch {}
        }
      } catch (err) {
        console.error("Lỗi gửi tin nhắn:", err);
        toast.error("Không thể gửi tin nhắn. Vui lòng thử lại.");
        throw err;
      }
    },
    [activeConversation, currentUser.id, currentUser.full_name, supabase]
  );

  const editMessage = useCallback(
    async (messageId: string, newContent: string) => {
      const trimmed = newContent.trim();
      if (!trimmed || !activeConversation) return;

      const nowIso = new Date().toISOString();

      if (activeConversation.type === "group") {
        setCustomGroupMessages((prev) =>
          prev.map((m: any) =>
            m.id === messageId ? { ...m, content: trimmed, edited_at: nowIso } : m
          )
        );
        try {
          const convId = activeConversation.id;
          const saved = JSON.parse(
            localStorage.getItem(`alpha_group_msgs_${convId}`) || "[]"
          );
          const updated = saved.map((m: any) =>
            m.id === messageId ? { ...m, content: trimmed, edited_at: nowIso } : m
          );
          localStorage.setItem(`alpha_group_msgs_${convId}`, JSON.stringify(updated));
        } catch {}
        try {
          await supabase
            .from("messages")
            .update({ content: trimmed, edited_at: nowIso })
            .eq("id", messageId);
        } catch {}
        toast.success("Đã chỉnh sửa tin nhắn");
        return;
      }

      const table =
        activeConversation.type === "direct"
          ? "direct_messages"
          : "project_messages";

      try {
        const { error } = await supabase
          .from(table)
          .update({ content: trimmed, edited_at: nowIso })
          .eq("id", messageId);

        if (error) throw error;

        if (activeConversation.type === "direct") {
          setDirectMessages((prev) =>
            prev.map((m) =>
              m.id === messageId
                ? { ...m, content: trimmed, edited_at: nowIso }
                : m
            )
          );
        } else {
          setProjectMessages((prev) =>
            prev.map((m) =>
              m.id === messageId
                ? { ...m, content: trimmed, edited_at: nowIso }
                : m
            )
          );
        }
        toast.success("Đã chỉnh sửa tin nhắn");
      } catch (err) {
        console.error("Lỗi sửa tin:", err);
        toast.error("Không thể cập nhật tin nhắn.");
      }
    },
    [activeConversation, supabase]
  );

  const unsendMessage = useCallback(
    async (messageId: string) => {
      if (!activeConversation) return;

      if (activeConversation.type === "group") {
        setCustomGroupMessages((prev) =>
          prev.map((m: any) =>
            m.id === messageId ? { ...m, is_deleted: true, is_pinned: false } : m
          )
        );
        try {
          const convId = activeConversation.id;
          const saved = JSON.parse(
            localStorage.getItem(`alpha_group_msgs_${convId}`) || "[]"
          );
          const updated = saved.map((m: any) =>
            m.id === messageId ? { ...m, is_deleted: true, is_pinned: false } : m
          );
          localStorage.setItem(`alpha_group_msgs_${convId}`, JSON.stringify(updated));
        } catch {}
        try {
          await supabase
            .from("messages")
            .update({ is_deleted: true, is_pinned: false })
            .eq("id", messageId);
        } catch {}
        toast.info("Đã thu hồi tin nhắn");
        return;
      }

      const table =
        activeConversation.type === "direct"
          ? "direct_messages"
          : "project_messages";

      try {
        const { error } = await supabase
          .from(table)
          .update({ is_deleted: true, is_pinned: false })
          .eq("id", messageId);

        if (error) throw error;

        if (activeConversation.type === "direct") {
          setDirectMessages((prev) =>
            prev.map((m) =>
              m.id === messageId
                ? { ...m, is_deleted: true, is_pinned: false }
                : m
            )
          );
        } else {
          setProjectMessages((prev) =>
            prev.map((m) =>
              m.id === messageId
                ? { ...m, is_deleted: true, is_pinned: false }
                : m
            )
          );
        }
        toast.info("Đã thu hồi tin nhắn");
      } catch (err) {
        console.error("Lỗi thu hồi tin:", err);
        toast.error("Không thể thu hồi tin nhắn.");
      }
    },
    [activeConversation, supabase]
  );

  const toggleReaction = useCallback(
    async (msg: UnifiedMessageItem, emoji: string) => {
      if (!activeConversation) return;
      const current = { ...(msg.reactions || {}) };
      const users = current[emoji] || [];
      const hasReacted = users.includes(currentUser.id);

      const nextUsers = hasReacted
        ? users.filter((id) => id !== currentUser.id)
        : [...users, currentUser.id];

      if (nextUsers.length > 0) current[emoji] = nextUsers;
      else delete current[emoji];

      if (activeConversation.type === "group") {
        setCustomGroupMessages((prev) =>
          prev.map((m: any) =>
            m.id === msg.id ? { ...m, reactions: current } : m
          )
        );
        try {
          const convId = activeConversation.id;
          const saved = JSON.parse(
            localStorage.getItem(`alpha_group_msgs_${convId}`) || "[]"
          );
          const updated = saved.map((m: any) =>
            m.id === msg.id ? { ...m, reactions: current } : m
          );
          localStorage.setItem(`alpha_group_msgs_${convId}`, JSON.stringify(updated));
        } catch {}
        try {
          await supabase
            .from("messages")
            .update({ reactions: current })
            .eq("id", msg.id);
        } catch {}
        return;
      }

      const table =
        activeConversation.type === "direct"
          ? "direct_messages"
          : "project_messages";

      // Optimistic update
      if (activeConversation.type === "direct") {
        setDirectMessages((prev) =>
          prev.map((m) =>
            m.id === msg.id ? { ...m, reactions: current } : m
          )
        );
      } else {
        setProjectMessages((prev) =>
          prev.map((m) =>
            m.id === msg.id ? { ...m, reactions: current } : m
          )
        );
      }

      await supabase.from(table).update({ reactions: current }).eq("id", msg.id);
    },
    [activeConversation, currentUser.id, supabase]
  );

  const togglePin = useCallback(
    async (msg: UnifiedMessageItem) => {
      if (!activeConversation) return;
      const nextPinned = !msg.isPinned;

      if (activeConversation.type === "group") {
        setCustomGroupMessages((prev) =>
          prev.map((m: any) =>
            m.id === msg.id ? { ...m, is_pinned: nextPinned } : m
          )
        );
        try {
          const convId = activeConversation.id;
          const saved = JSON.parse(
            localStorage.getItem(`alpha_group_msgs_${convId}`) || "[]"
          );
          const updated = saved.map((m: any) =>
            m.id === msg.id ? { ...m, is_pinned: nextPinned } : m
          );
          localStorage.setItem(`alpha_group_msgs_${convId}`, JSON.stringify(updated));
        } catch {}
        try {
          await supabase
            .from("messages")
            .update({ is_pinned: nextPinned })
            .eq("id", msg.id);
        } catch {}
        toast.success(nextPinned ? "Đã ghim tin nhắn" : "Đã bỏ ghim tin nhắn");
        return;
      }

      const table =
        activeConversation.type === "direct"
          ? "direct_messages"
          : "project_messages";

      if (activeConversation.type === "direct") {
        setDirectMessages((prev) =>
          prev.map((m) =>
            m.id === msg.id ? { ...m, is_pinned: nextPinned } : m
          )
        );
      } else {
        setProjectMessages((prev) =>
          prev.map((m) =>
            m.id === msg.id ? { ...m, is_pinned: nextPinned } : m
          )
        );
      }

      await supabase
        .from(table)
        .update({ is_pinned: nextPinned })
        .eq("id", msg.id);
      toast.success(nextPinned ? "Đã ghim tin nhắn" : "Đã bỏ ghim tin nhắn");
    },
    [activeConversation, supabase]
  );

  const createGroup = useCallback(
    async (data: {
      title: string;
      description?: string;
      memberIds: string[];
    }): Promise<string> => {
      const res = await createGroupConversation({
        ...data,
        currentUser,
      });
      await refreshConversations();
      setActiveConversationId(res.id);
      toast.success(`Đã tạo nhóm "${res.title}" thành công!`);
      return res.id;
    },
    [currentUser, refreshConversations]
  );

  const addMembersToGroup = useCallback(
    async (convId: string, memberIds: string[]) => {
      try {
        await addGroupMembers(convId, memberIds, currentUser.full_name);
      } catch {}

      // Update local storage group
      try {
        const localGroups = JSON.parse(
          localStorage.getItem(`alpha_custom_groups_${currentUser.id}`) || "[]"
        );
        const updated = localGroups.map((g: any) => {
          if (g.id === convId) {
            const merged = Array.from(new Set([...(g.memberIds || []), ...memberIds]));
            return { ...g, memberIds: merged, memberCount: merged.length };
          }
          return g;
        });
        localStorage.setItem(
          `alpha_custom_groups_${currentUser.id}`,
          JSON.stringify(updated)
        );
      } catch {}

      await refreshConversations();
      toast.success("Đã thêm thành viên vào nhóm!");
    },
    [currentUser, refreshConversations]
  );

  const leaveGroup = useCallback(
    async (convId: string) => {
      try {
        await removeGroupMember(convId, currentUser.id);
      } catch {}

      try {
        const localGroups = JSON.parse(
          localStorage.getItem(`alpha_custom_groups_${currentUser.id}`) || "[]"
        );
        const filtered = localGroups.filter((g: any) => g.id !== convId);
        localStorage.setItem(
          `alpha_custom_groups_${currentUser.id}`,
          JSON.stringify(filtered)
        );
      } catch {}

      await refreshConversations();
      if (activeConversationId === convId) {
        setActiveConversationId(null);
      }
      toast.info("Bạn đã rời khỏi nhóm.");
    },
    [currentUser.id, refreshConversations, activeConversationId]
  );

  // Filtered & Sorted conversations
  const filteredConversations = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    let list = conversations;

    // Filter by type
    if (activeFilter === "unread") {
      list = list.filter((c) => c.unreadCount > 0);
    } else if (activeFilter === "direct") {
      list = list.filter((c) => c.type === "direct");
    } else if (activeFilter === "group") {
      list = list.filter((c) => c.type === "group");
    } else if (activeFilter === "project") {
      list = list.filter((c) => c.type === "project");
    }

    // Filter by search query (Vietnamese tone-insensitive)
    if (q) {
      list = list.filter((c) => {
        const title = removeVietnameseTones(c.title || "");
        const desc = removeVietnameseTones(c.description || "");
        return title.includes(q) || desc.includes(q);
      });
    }

    // Sort: Pinned first -> Unread -> Most recent updatedAt
    return [...list].sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
      const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return timeB - timeA;
    });
  }, [conversations, activeFilter, searchQuery]);

  // Overall unread badge count
  const totalUnreadCount = useMemo(() => {
    return conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
  }, [conversations]);

  const selectConversation = useCallback((convId: string) => {
    setActiveConversationId(convId);
  }, []);

  const selectByUserId = useCallback((userId: string) => {
    setActiveConversationId(`dm:${userId}`);
  }, []);

  const selectByProjectId = useCallback((projectId: string) => {
    setActiveConversationId(`proj:${projectId}`);
  }, []);

  const requestBrowserNotificationPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      toast.error("Trình duyệt không hỗ trợ thông báo.");
      return "unsupported";
    }
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      toast.success("Đã bật thông báo trên trình duyệt!");
    } else {
      toast.info("Chưa cấp quyền thông báo trình duyệt.");
    }
    return perm;
  }, []);

  return {
    currentUser,
    allProfiles,
    allProjects,
    otherProfiles,
    conversations: filteredConversations,
    rawConversations: conversations,
    activeConversationId,
    activeConversation,
    messages: unifiedMessages,
    loadingConversations,
    loadingMessages,
    activeFilter,
    setActiveFilter,
    searchQuery,
    setSearchQuery,
    onlineUserIds,
    typingUsers,
    currentTypingUser: activeConversationId
      ? typingUsers[activeConversationId]
      : null,
    totalUnreadCount,
    selectConversation,
    selectByUserId,
    selectByProjectId,
    sendMessage,
    editMessage,
    unsendMessage,
    toggleReaction,
    togglePin,
    togglePinConversation,
    toggleMuteConversation,
    createGroup,
    addMembersToGroup,
    leaveGroup,
    requestBrowserNotificationPermission,
    broadcastTyping,
    refreshConversations,
    loadMessages,
  };
}
