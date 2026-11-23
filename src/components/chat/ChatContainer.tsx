"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { cn, getInitials } from "@/lib/utils";
import type {
  Profile,
  Department,
  Project,
  DirectMessage,
  ChannelMessage,
  ProjectMessage,
} from "@/types/database";
import {
  MentionTextarea,
  renderContentWithMentions,
  extractMentionedUserIds,
} from "@/components/common/MentionAutocomplete";
import {
  ConvertMessageToTaskModal,
  type SourceChatMessage,
} from "@/components/chat/ConvertMessageToTaskModal";
import {
  Search,
  MessageSquare,
  Hash,
  FolderKanban,
  Send,
  Paperclip,
  X,
  FileText,
  Check,
  CheckCheck,
  ArrowLeft,
  Download,
  Reply,
  Pin,
  Pencil,
  Trash2,
  CheckSquare,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

interface ChatContainerProps {
  currentUser: Profile;
  allProfiles: Profile[];
  allDepartments: Department[];
  allProjects?: Project[];
}

type ChatMode = "direct" | "channel" | "project";

interface PendingAttachment {
  file: File;
  previewUrl: string;
  isImage: boolean;
}

interface UnifiedMessage {
  id: string;
  authorId: string;
  author?: Profile;
  content: string;
  attachmentUrl: string | null;
  attachmentName: string | null;
  createdAt: string;
  isMine: boolean;
  isRead: boolean;
  replyToId: string | null;
  isPinned: boolean;
  isDeleted: boolean;
  editedAt: string | null;
  reactions: Record<string, string[]>;
}

interface LastMessagePreview {
  content: string;
  createdAt: string;
  senderId: string;
  isDeleted?: boolean;
}

const QUICK_REACTIONS = [
  { emoji: "👍", label: "Đồng ý" },
  { emoji: "❤️", label: "Yêu thích" },
  { emoji: "😂", label: "Haha" },
  { emoji: "🎉", label: "Chúc mừng" },
  { emoji: "🔥", label: "Tuyệt vời" },
  { emoji: "👀", label: "Đang xem" },
];

function formatRelativeShort(isoStr?: string): string {
  if (!isoStr) return "";
  const diffSec = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (diffSec < 45) return "Vừa xong";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}p`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}ng`;
  return new Date(isoStr).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
  });
}

export function ChatContainer({
  currentUser,
  allProfiles,
  allDepartments,
  allProjects = [],
}: ChatContainerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  // Filter out current user from target DM profiles
  const otherProfiles = useMemo(
    () => allProfiles.filter((p) => p.id !== currentUser.id),
    [allProfiles, currentUser.id]
  );

  // Active chat state
  const [activeTab, setActiveTab] = useState<ChatMode>("direct");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // Messages state
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);
  const [channelMessages, setChannelMessages] = useState<ChannelMessage[]>([]);
  const [projectMessages, setProjectMessages] = useState<ProjectMessage[]>([]);

  // Inbox counters and previews
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const [channelUnreadMap, setChannelUnreadMap] = useState<Record<string, number>>({});
  const [projectUnreadMap, setProjectUnreadMap] = useState<Record<string, number>>({});

  const [dmLastMsgMap, setDmLastMsgMap] = useState<Record<string, LastMessagePreview>>({});
  const [channelLastMsgMap, setChannelLastMsgMap] = useState<
    Record<string, LastMessagePreview>
  >({});
  const [projectLastMsgMap, setProjectLastMsgMap] = useState<
    Record<string, LastMessagePreview>
  >({});

  const [loadingMessages, setLoadingMessages] = useState(false);

  // Online Presence & Typing state
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(
    () => new Set([currentUser.id])
  );
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const typingTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({});
  const lastTypingBroadcastRef = useRef<number>(0);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(
    null
  );

  // Input & Action state
  const [inputText, setInputText] = useState("");
  const [pendingAttachment, setPendingAttachment] =
    useState<PendingAttachment | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Reply, Edit, Pin, Convert-to-Task state
  const [replyingTo, setReplyingTo] = useState<UnifiedMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<UnifiedMessage | null>(
    null
  );
  const [showPinnedDrawer, setShowPinnedDrawer] = useState(false);
  const [convertModalMessage, setConvertModalMessage] =
    useState<SourceChatMessage | null>(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);

  // UI state
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileShowSidebar, setMobileShowSidebar] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isSendingRef = useRef(false);

  // Clear reply/edit mode when switching conversations
  useEffect(() => {
    setReplyingTo(null);
    setEditingMessage(null);
    setShowPinnedDrawer(false);
  }, [activeTab, selectedUserId, selectedDeptId, selectedProjectId]);

  // Initialize selection from query params or defaults
  useEffect(() => {
    const userParam = searchParams.get("user");
    const deptParam = searchParams.get("dept");
    const projectParam = searchParams.get("project");

    if (projectParam && allProjects.some((p) => p.id === projectParam)) {
      setActiveTab("project");
      setSelectedProjectId(projectParam);
      setSelectedUserId(null);
      setSelectedDeptId(null);
      setMobileShowSidebar(false);
    } else if (deptParam && allDepartments.some((d) => d.id === deptParam)) {
      setActiveTab("channel");
      setSelectedDeptId(deptParam);
      setSelectedUserId(null);
      setSelectedProjectId(null);
      setMobileShowSidebar(false);
    } else if (userParam && otherProfiles.some((p) => p.id === userParam)) {
      setActiveTab("direct");
      setSelectedUserId(userParam);
      setSelectedDeptId(null);
      setSelectedProjectId(null);
      setMobileShowSidebar(false);
    } else if (!selectedUserId && !selectedDeptId && !selectedProjectId) {
      if (otherProfiles.length > 0) {
        setSelectedUserId(otherProfiles[0].id);
      } else if (allProjects.length > 0) {
        setActiveTab("project");
        setSelectedProjectId(allProjects[0].id);
      } else if (allDepartments.length > 0) {
        setActiveTab("channel");
        setSelectedDeptId(allDepartments[0].id);
      }
    }
  }, [
    searchParams,
    otherProfiles,
    allDepartments,
    allProjects,
    selectedUserId,
    selectedDeptId,
    selectedProjectId,
  ]);

  // Fetch initial Inbox metadata: unread counts & last messages per user, dept, project
  const fetchInboxSummaries = useCallback(async () => {
    // 1. Recent DMs
    const { data: dmData } = await supabase
      .from("direct_messages")
      .select("id, sender_id, receiver_id, content, is_read, is_deleted, created_at")
      .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
      .order("created_at", { ascending: false })
      .limit(300);

    if (dmData) {
      const counts: Record<string, number> = {};
      const previews: Record<string, LastMessagePreview> = {};

      dmData.forEach((dm) => {
        const partnerId =
          dm.sender_id === currentUser.id ? dm.receiver_id : dm.sender_id;

        if (!previews[partnerId]) {
          previews[partnerId] = {
            content: dm.is_deleted
              ? "Tin nhắn đã thu hồi"
              : dm.content || "[Tệp đính kèm]",
            createdAt: dm.created_at,
            senderId: dm.sender_id,
            isDeleted: dm.is_deleted,
          };
        }

        if (dm.receiver_id === currentUser.id && !dm.is_read) {
          counts[dm.sender_id] = (counts[dm.sender_id] || 0) + 1;
        }
      });

      setUnreadMap(counts);
      setDmLastMsgMap(previews);
    }

    // 2. Recent Channel messages & channel_read_states
    const [cmRes, deptReadRes] = await Promise.all([
      supabase
        .from("channel_messages")
        .select("id, department_id, author_id, content, is_deleted, created_at")
        .order("created_at", { ascending: false })
        .limit(300),
      supabase
        .from("channel_read_states")
        .select("department_id, last_read_at")
        .eq("user_id", currentUser.id),
    ]);

    const deptReadMap: Record<string, number> = {};
    if (deptReadRes.data) {
      deptReadRes.data.forEach((rs) => {
        deptReadMap[rs.department_id] = new Date(rs.last_read_at).getTime();
      });
    }

    if (cmRes.data) {
      const cmPreviews: Record<string, LastMessagePreview> = {};
      const cmUnreads: Record<string, number> = {};

      cmRes.data.forEach((cm) => {
        if (!cmPreviews[cm.department_id]) {
          cmPreviews[cm.department_id] = {
            content: cm.is_deleted
              ? "Tin nhắn đã thu hồi"
              : cm.content || "[Tệp đính kèm]",
            createdAt: cm.created_at,
            senderId: cm.author_id,
            isDeleted: cm.is_deleted,
          };
        }

        const lastReadMs = deptReadMap[cm.department_id] || 0;
        const msgMs = new Date(cm.created_at).getTime();
        if (
          cm.author_id !== currentUser.id &&
          lastReadMs > 0 &&
          msgMs > lastReadMs &&
          cm.department_id !== selectedDeptId
        ) {
          cmUnreads[cm.department_id] = (cmUnreads[cm.department_id] || 0) + 1;
        }
      });

      setChannelLastMsgMap(cmPreviews);
      setChannelUnreadMap(cmUnreads);
    }

    // 3. Recent Project messages & project_chat_read_states
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

    if (pmRes.data) {
      const pmPreviews: Record<string, LastMessagePreview> = {};
      const pmUnreads: Record<string, number> = {};

      pmRes.data.forEach((pm) => {
        if (!pmPreviews[pm.project_id]) {
          pmPreviews[pm.project_id] = {
            content: pm.is_deleted
              ? "Tin nhắn đã thu hồi"
              : pm.content || "[Tệp đính kèm]",
            createdAt: pm.created_at,
            senderId: pm.author_id,
            isDeleted: pm.is_deleted,
          };
        }

        const lastReadMs = projReadMap[pm.project_id] || 0;
        const msgMs = new Date(pm.created_at).getTime();
        if (
          pm.author_id !== currentUser.id &&
          lastReadMs > 0 &&
          msgMs > lastReadMs &&
          pm.project_id !== selectedProjectId
        ) {
          pmUnreads[pm.project_id] = (pmUnreads[pm.project_id] || 0) + 1;
        }
      });

      setProjectLastMsgMap(pmPreviews);
      setProjectUnreadMap(pmUnreads);
    }
  }, [currentUser.id, selectedDeptId, selectedProjectId, supabase]);

  useEffect(() => {
    fetchInboxSummaries();
  }, [fetchInboxSummaries]);

  // Mark channel or project as read helper
  const markChannelAsRead = useCallback(
    async (deptId: string) => {
      setChannelUnreadMap((prev) => {
        if (!prev[deptId]) return prev;
        const next = { ...prev };
        delete next[deptId];
        return next;
      });

      await supabase.from("channel_read_states").upsert(
        {
          user_id: currentUser.id,
          department_id: deptId,
          last_read_at: new Date().toISOString(),
        },
        { onConflict: "user_id,department_id" }
      );
    },
    [currentUser.id, supabase]
  );

  const markProjectAsRead = useCallback(
    async (projId: string) => {
      setProjectUnreadMap((prev) => {
        if (!prev[projId]) return prev;
        const next = { ...prev };
        delete next[projId];
        return next;
      });

      await supabase.from("project_chat_read_states").upsert(
        {
          user_id: currentUser.id,
          project_id: projId,
          last_read_at: new Date().toISOString(),
        },
        { onConflict: "user_id,project_id" }
      );
    },
    [currentUser.id, supabase]
  );

  // Supabase Presence & Typing Broadcast Channel
  useEffect(() => {
    const channel = supabase.channel("alpha-chat-presence", {
      config: {
        presence: {
          key: currentUser.id,
        },
      },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const activeIds = new Set<string>([currentUser.id]);
        Object.keys(state).forEach((uid) => activeIds.add(uid));
        setOnlineUserIds(activeIds);
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (!payload || payload.userId === currentUser.id) return;
        const targetKey = payload.targetKey as string;
        const userName = payload.userName as string;
        if (!targetKey || !userName) return;

        setTypingUsers((prev) => ({ ...prev, [targetKey]: userName }));

        if (typingTimeoutRef.current[targetKey]) {
          clearTimeout(typingTimeoutRef.current[targetKey]);
        }
        typingTimeoutRef.current[targetKey] = setTimeout(() => {
          setTypingUsers((prev) => {
            const next = { ...prev };
            delete next[targetKey];
            return next;
          });
        }, 3000);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: currentUser.id,
            full_name: currentUser.full_name,
            online_at: new Date().toISOString(),
          });
        }
      });

    presenceChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      presenceChannelRef.current = null;
    };
  }, [currentUser.id, currentUser.full_name, supabase]);

  // Broadcast typing signal
  const broadcastTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingBroadcastRef.current < 1800) return;
    lastTypingBroadcastRef.current = now;

    if (!presenceChannelRef.current) return;
    const targetKey =
      activeTab === "direct" && selectedUserId
        ? `dm:${[currentUser.id, selectedUserId].sort().join("_")}`
        : activeTab === "channel" && selectedDeptId
          ? `dept:${selectedDeptId}`
          : activeTab === "project" && selectedProjectId
            ? `proj:${selectedProjectId}`
            : null;

    if (!targetKey) return;

    presenceChannelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: {
        userId: currentUser.id,
        userName: currentUser.full_name,
        targetKey,
      },
    });
  }, [
    activeTab,
    selectedUserId,
    selectedDeptId,
    selectedProjectId,
    currentUser.id,
    currentUser.full_name,
  ]);

  // Load Direct Messages
  useEffect(() => {
    if (activeTab !== "direct" || !selectedUserId) return;

    let isMounted = true;
    async function loadDMs() {
      setLoadingMessages(true);
      const { data, error } = await supabase
        .from("direct_messages")
        .select(
          "*, sender:profiles!direct_messages_sender_id_fkey(*), receiver:profiles!direct_messages_receiver_id_fkey(*)"
        )
        .or(
          `and(sender_id.eq.${currentUser.id},receiver_id.eq.${selectedUserId}),and(sender_id.eq.${selectedUserId},receiver_id.eq.${currentUser.id})`
        )
        .order("created_at", { ascending: false })
        .limit(200);

      if (isMounted) {
        if (!error && data) {
          const uniqueMap = new Map<string, DirectMessage>();
          (data as DirectMessage[])
            .reverse()
            .forEach((m) => uniqueMap.set(m.id, m));
          setDirectMessages(Array.from(uniqueMap.values()));
        }
        setLoadingMessages(false);
      }

      await supabase
        .from("direct_messages")
        .update({ is_read: true })
        .eq("sender_id", selectedUserId)
        .eq("receiver_id", currentUser.id)
        .eq("is_read", false);

      if (selectedUserId) {
        setUnreadMap((prev) => {
          const next = { ...prev };
          delete next[selectedUserId];
          return next;
        });
      }
    }

    loadDMs();
    return () => {
      isMounted = false;
    };
  }, [activeTab, selectedUserId, currentUser.id, supabase]);

  // Load Channel Messages
  useEffect(() => {
    if (activeTab !== "channel" || !selectedDeptId) return;

    let isMounted = true;
    async function loadCMs() {
      setLoadingMessages(true);
      const { data, error } = await supabase
        .from("channel_messages")
        .select("*, author:profiles!channel_messages_author_id_fkey(*)")
        .eq("department_id", selectedDeptId)
        .order("created_at", { ascending: false })
        .limit(200);

      if (isMounted) {
        if (!error && data) {
          const uniqueMap = new Map<string, ChannelMessage>();
          (data as ChannelMessage[])
            .reverse()
            .forEach((m) => uniqueMap.set(m.id, m));
          setChannelMessages(Array.from(uniqueMap.values()));
        }
        setLoadingMessages(false);
      }

      if (selectedDeptId) {
        markChannelAsRead(selectedDeptId);
      }
    }

    loadCMs();
    return () => {
      isMounted = false;
    };
  }, [activeTab, selectedDeptId, markChannelAsRead, supabase]);

  // Load Project Messages
  useEffect(() => {
    if (activeTab !== "project" || !selectedProjectId) return;

    let isMounted = true;
    async function loadPMs() {
      setLoadingMessages(true);
      const { data, error } = await supabase
        .from("project_messages")
        .select("*, author:profiles!project_messages_author_id_fkey(*)")
        .eq("project_id", selectedProjectId)
        .order("created_at", { ascending: false })
        .limit(200);

      if (isMounted) {
        if (!error && data) {
          const uniqueMap = new Map<string, ProjectMessage>();
          (data as ProjectMessage[])
            .reverse()
            .forEach((m) => uniqueMap.set(m.id, m));
          setProjectMessages(Array.from(uniqueMap.values()));
        }
        setLoadingMessages(false);
      }

      if (selectedProjectId) {
        markProjectAsRead(selectedProjectId);
      }
    }

    loadPMs();
    return () => {
      isMounted = false;
    };
  }, [activeTab, selectedProjectId, markProjectAsRead, supabase]);

  // Realtime Subscriptions (Direct, Channel, Project)
  useEffect(() => {
    const channelSuffix = `${currentUser.id}-${Date.now()}`;

    // 1. Direct Messages
    const dmChannel = supabase
      .channel(`chat-direct-messages-${channelSuffix}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "alpha_lite",
          table: "direct_messages",
        },
        async (payload) => {
          const newDM = payload.new as DirectMessage;
          const isRelated =
            newDM.sender_id === currentUser.id ||
            newDM.receiver_id === currentUser.id;

          if (!isRelated) return;

          const partnerId =
            newDM.sender_id === currentUser.id
              ? newDM.receiver_id
              : newDM.sender_id;

          setDmLastMsgMap((prev) => ({
            ...prev,
            [partnerId]: {
              content: newDM.is_deleted
                ? "Tin nhắn đã thu hồi"
                : newDM.content || "[Tệp đính kèm]",
              createdAt: newDM.created_at,
              senderId: newDM.sender_id,
              isDeleted: newDM.is_deleted,
            },
          }));

          if (
            activeTab === "direct" &&
            ((newDM.sender_id === selectedUserId &&
              newDM.receiver_id === currentUser.id) ||
              (newDM.sender_id === currentUser.id &&
                newDM.receiver_id === selectedUserId))
          ) {
            const senderProfile = allProfiles.find(
              (p) => p.id === newDM.sender_id
            );
            const enrichedDM: DirectMessage = {
              ...newDM,
              sender: senderProfile,
            };
            setDirectMessages((prev) => {
              if (prev.some((m) => m.id === enrichedDM.id)) return prev;
              return [...prev, enrichedDM];
            });

            if (newDM.receiver_id === currentUser.id) {
              await supabase
                .from("direct_messages")
                .update({ is_read: true })
                .eq("id", newDM.id);
            }
          } else if (newDM.receiver_id === currentUser.id) {
            setUnreadMap((prev) => ({
              ...prev,
              [newDM.sender_id]: (prev[newDM.sender_id] || 0) + 1,
            }));
            const sender = allProfiles.find((p) => p.id === newDM.sender_id);
            toast.info(`Tin nhắn mới từ ${sender?.full_name || "đồng nghiệp"}`, {
              description: newDM.content.slice(0, 60),
            });
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "alpha_lite",
          table: "direct_messages",
        },
        (payload) => {
          const updatedDM = payload.new as DirectMessage;
          setDirectMessages((prev) =>
            prev.map((m) =>
              m.id === updatedDM.id
                ? {
                    ...m,
                    content: updatedDM.content,
                    is_read: updatedDM.is_read,
                    is_pinned: updatedDM.is_pinned,
                    is_deleted: updatedDM.is_deleted,
                    edited_at: updatedDM.edited_at,
                    reactions: updatedDM.reactions,
                  }
                : m
            )
          );
        }
      )
      .subscribe();

    // 2. Channel Messages
    const cmChannel = supabase
      .channel(`chat-channel-messages-${channelSuffix}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "alpha_lite",
          table: "channel_messages",
        },
        (payload) => {
          const newCM = payload.new as ChannelMessage;

          setChannelLastMsgMap((prev) => ({
            ...prev,
            [newCM.department_id]: {
              content: newCM.is_deleted
                ? "Tin nhắn đã thu hồi"
                : newCM.content || "[Tệp đính kèm]",
              createdAt: newCM.created_at,
              senderId: newCM.author_id,
              isDeleted: newCM.is_deleted,
            },
          }));

          if (
            activeTab === "channel" &&
            selectedDeptId &&
            newCM.department_id === selectedDeptId
          ) {
            const author = allProfiles.find((p) => p.id === newCM.author_id);
            const enrichedCM: ChannelMessage = {
              ...newCM,
              author,
            };
            setChannelMessages((prev) => {
              if (prev.some((m) => m.id === enrichedCM.id)) return prev;
              return [...prev, enrichedCM];
            });
            markChannelAsRead(selectedDeptId);
          } else if (newCM.author_id !== currentUser.id) {
            setChannelUnreadMap((prev) => ({
              ...prev,
              [newCM.department_id]: (prev[newCM.department_id] || 0) + 1,
            }));
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "alpha_lite",
          table: "channel_messages",
        },
        (payload) => {
          const updatedCM = payload.new as ChannelMessage;
          setChannelMessages((prev) =>
            prev.map((m) =>
              m.id === updatedCM.id
                ? {
                    ...m,
                    content: updatedCM.content,
                    is_pinned: updatedCM.is_pinned,
                    is_deleted: updatedCM.is_deleted,
                    edited_at: updatedCM.edited_at,
                    reactions: updatedCM.reactions,
                  }
                : m
            )
          );
        }
      )
      .subscribe();

    // 3. Project Messages
    const pmChannel = supabase
      .channel(`chat-project-messages-${channelSuffix}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "alpha_lite",
          table: "project_messages",
        },
        (payload) => {
          const newPM = payload.new as ProjectMessage;

          setProjectLastMsgMap((prev) => ({
            ...prev,
            [newPM.project_id]: {
              content: newPM.is_deleted
                ? "Tin nhắn đã thu hồi"
                : newPM.content || "[Tệp đính kèm]",
              createdAt: newPM.created_at,
              senderId: newPM.author_id,
              isDeleted: newPM.is_deleted,
            },
          }));

          if (
            activeTab === "project" &&
            selectedProjectId &&
            newPM.project_id === selectedProjectId
          ) {
            const author = allProfiles.find((p) => p.id === newPM.author_id);
            const enrichedPM: ProjectMessage = {
              ...newPM,
              author,
            };
            setProjectMessages((prev) => {
              if (prev.some((m) => m.id === enrichedPM.id)) return prev;
              return [...prev, enrichedPM];
            });
            markProjectAsRead(selectedProjectId);
          } else if (newPM.author_id !== currentUser.id) {
            setProjectUnreadMap((prev) => ({
              ...prev,
              [newPM.project_id]: (prev[newPM.project_id] || 0) + 1,
            }));
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "alpha_lite",
          table: "project_messages",
        },
        (payload) => {
          const updatedPM = payload.new as ProjectMessage;
          setProjectMessages((prev) =>
            prev.map((m) =>
              m.id === updatedPM.id
                ? {
                    ...m,
                    content: updatedPM.content,
                    is_pinned: updatedPM.is_pinned,
                    is_deleted: updatedPM.is_deleted,
                    edited_at: updatedPM.edited_at,
                    reactions: updatedPM.reactions,
                  }
                : m
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(dmChannel);
      supabase.removeChannel(cmChannel);
      supabase.removeChannel(pmChannel);
    };
  }, [
    currentUser.id,
    activeTab,
    selectedUserId,
    selectedDeptId,
    selectedProjectId,
    allProfiles,
    markChannelAsRead,
    markProjectAsRead,
    supabase,
  ]);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [
    directMessages.length,
    channelMessages.length,
    projectMessages.length,
    loadingMessages,
  ]);

  // File attachment helpers
  const attachFile = (file: File) => {
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Tệp quá lớn. Vui lòng chọn tệp nhỏ hơn 25MB.");
      return;
    }

    if (pendingAttachment?.previewUrl) {
      URL.revokeObjectURL(pendingAttachment.previewUrl);
    }

    const isImage = file.type.startsWith("image/");
    const previewUrl = URL.createObjectURL(file);
    setPendingAttachment({ file, previewUrl, isImage });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    attachFile(file);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file") {
        const blob = item.getAsFile();
        if (blob) {
          e.preventDefault();
          const ext = blob.type.split("/")[1] || "png";
          const fileName =
            blob.name && blob.name !== "image.png"
              ? blob.name
              : `pasted_image_${Date.now()}.${ext}`;
          const pastedFile = new File([blob], fileName, { type: blob.type });
          attachFile(pastedFile);
          toast.info("Đã đính kèm ảnh từ Clipboard");
          break;
        }
      }
    }
  };

  const removePendingAttachment = () => {
    if (pendingAttachment?.previewUrl) {
      URL.revokeObjectURL(pendingAttachment.previewUrl);
    }
    setPendingAttachment(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const uploadAttachment = async (
    file: File
  ): Promise<{ url: string; name: string } | null> => {
    try {
      setIsUploading(true);
      const ext = file.name.split(".").pop() || "bin";
      const sanitized = file.name.replace(/[^\w.-]/g, "_").substring(0, 30);
      const filePath = `chat/${Date.now()}_${sanitized}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("attachments")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("attachments")
        .getPublicUrl(filePath);

      return {
        url: publicUrlData.publicUrl,
        name: file.name,
      };
    } catch (err) {
      console.error("Lỗi tải tệp:", err);
      toast.error("Không thể tải tệp lên. Vui lòng thử lại.");
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  // Helper to send a raw text message
  const sendTextToCurrentConversation = useCallback(
    async (textContent: string) => {
      if (activeTab === "direct" && selectedUserId) {
        const { data: insertedDM, error } = await supabase
          .from("direct_messages")
          .insert({
            sender_id: currentUser.id,
            receiver_id: selectedUserId,
            content: textContent,
            is_read: false,
          })
          .select(
            "*, sender:profiles!direct_messages_sender_id_fkey(*), receiver:profiles!direct_messages_receiver_id_fkey(*)"
          )
          .single();

        if (!error && insertedDM) {
          setDirectMessages((prev) => {
            if (prev.some((m) => m.id === insertedDM.id)) return prev;
            return [...prev, insertedDM as DirectMessage];
          });
        }
      } else if (activeTab === "channel" && selectedDeptId) {
        const { data: insertedCM, error } = await supabase
          .from("channel_messages")
          .insert({
            department_id: selectedDeptId,
            author_id: currentUser.id,
            content: textContent,
          })
          .select("*, author:profiles!channel_messages_author_id_fkey(*)")
          .single();

        if (!error && insertedCM) {
          setChannelMessages((prev) => {
            if (prev.some((m) => m.id === insertedCM.id)) return prev;
            return [...prev, insertedCM as ChannelMessage];
          });
        }
      } else if (activeTab === "project" && selectedProjectId) {
        const { data: insertedPM, error } = await supabase
          .from("project_messages")
          .insert({
            project_id: selectedProjectId,
            author_id: currentUser.id,
            content: textContent,
          })
          .select("*, author:profiles!project_messages_author_id_fkey(*)")
          .single();

        if (!error && insertedPM) {
          setProjectMessages((prev) => {
            if (prev.some((m) => m.id === insertedPM.id)) return prev;
            return [...prev, insertedPM as ProjectMessage];
          });
        }
      }
    },
    [
      activeTab,
      selectedUserId,
      selectedDeptId,
      selectedProjectId,
      currentUser.id,
      supabase,
    ]
  );

  // Send or Edit Message
  const handleSendMessage = async () => {
    if (isSendingRef.current) return;
    const trimmed = inputText.trim();

    // Handle Edit Mode
    if (editingMessage) {
      if (!trimmed) {
        toast.error("Nội dung tin nhắn không được để trống.");
        return;
      }
      isSendingRef.current = true;
      setIsSending(true);
      try {
        const nowIso = new Date().toISOString();
        const table =
          activeTab === "direct"
            ? "direct_messages"
            : activeTab === "channel"
              ? "channel_messages"
              : "project_messages";

        const { error } = await supabase
          .from(table)
          .update({ content: trimmed, edited_at: nowIso })
          .eq("id", editingMessage.id);

        if (error) throw error;

        if (activeTab === "direct") {
          setDirectMessages((prev) =>
            prev.map((m) =>
              m.id === editingMessage.id
                ? { ...m, content: trimmed, edited_at: nowIso }
                : m
            )
          );
        } else if (activeTab === "channel") {
          setChannelMessages((prev) =>
            prev.map((m) =>
              m.id === editingMessage.id
                ? { ...m, content: trimmed, edited_at: nowIso }
                : m
            )
          );
        } else {
          setProjectMessages((prev) =>
            prev.map((m) =>
              m.id === editingMessage.id
                ? { ...m, content: trimmed, edited_at: nowIso }
                : m
            )
          );
        }

        setEditingMessage(null);
        setInputText("");
        toast.success("Đã cập nhật tin nhắn");
      } catch (err) {
        console.error("Lỗi sửa tin nhắn:", err);
        toast.error("Không thể cập nhật tin nhắn.");
      } finally {
        isSendingRef.current = false;
        setIsSending(false);
      }
      return;
    }

    if (!trimmed && !pendingAttachment) return;

    isSendingRef.current = true;
    setIsSending(true);

    try {
      let attachmentUrl: string | null = null;
      let attachmentName: string | null = null;

      if (pendingAttachment) {
        const uploadRes = await uploadAttachment(pendingAttachment.file);
        if (uploadRes) {
          attachmentUrl = uploadRes.url;
          attachmentName = uploadRes.name;
        }
        removePendingAttachment();
      }

      if (activeTab === "direct" && selectedUserId) {
        const { data: insertedDM, error } = await supabase
          .from("direct_messages")
          .insert({
            sender_id: currentUser.id,
            receiver_id: selectedUserId,
            content:
              trimmed ||
              (attachmentName ? `[Đã gửi tệp: ${attachmentName}]` : ""),
            attachment_url: attachmentUrl,
            attachment_name: attachmentName,
            reply_to_id: replyingTo?.id || null,
            is_read: false,
          })
          .select(
            "*, sender:profiles!direct_messages_sender_id_fkey(*), receiver:profiles!direct_messages_receiver_id_fkey(*)"
          )
          .single();

        if (error) throw error;

        if (insertedDM) {
          setDirectMessages((prev) => {
            if (prev.some((m) => m.id === insertedDM.id)) return prev;
            return [...prev, insertedDM as DirectMessage];
          });
          setDmLastMsgMap((prev) => ({
            ...prev,
            [selectedUserId]: {
              content: insertedDM.content,
              createdAt: insertedDM.created_at,
              senderId: currentUser.id,
            },
          }));
        }

        await supabase.from("notifications").insert({
          user_id: selectedUserId,
          actor_id: currentUser.id,
          type: "direct_message",
          title: `${currentUser.full_name} đã gửi tin nhắn cho bạn`,
          body: (trimmed || attachmentName || "Tin nhắn mới").slice(0, 100),
          link: `/chat?user=${currentUser.id}`,
          is_read: false,
        });

        fetch("/api/webhooks/dispatch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "direct_message",
            title: `Tin nhắn từ ${currentUser.full_name}`,
            body: trimmed || attachmentName || "Tin nhắn mới",
            link: `/chat?user=${currentUser.id}`,
          }),
        }).catch(() => {});
      } else if (activeTab === "channel" && selectedDeptId) {
        const dept = allDepartments.find((d) => d.id === selectedDeptId);
        const { data: insertedCM, error } = await supabase
          .from("channel_messages")
          .insert({
            department_id: selectedDeptId,
            author_id: currentUser.id,
            content:
              trimmed ||
              (attachmentName ? `[Đã gửi tệp: ${attachmentName}]` : ""),
            attachment_url: attachmentUrl,
            attachment_name: attachmentName,
            parent_id: replyingTo?.id || null,
          })
          .select("*, author:profiles!channel_messages_author_id_fkey(*)")
          .single();

        if (error) throw error;

        if (insertedCM) {
          setChannelMessages((prev) => {
            if (prev.some((m) => m.id === insertedCM.id)) return prev;
            return [...prev, insertedCM as ChannelMessage];
          });
          setChannelLastMsgMap((prev) => ({
            ...prev,
            [selectedDeptId]: {
              content: insertedCM.content,
              createdAt: insertedCM.created_at,
              senderId: currentUser.id,
            },
          }));
        }

        const mentionedIds = extractMentionedUserIds(
          trimmed,
          allProfiles
        ).filter((id) => id !== currentUser.id);
        if (mentionedIds.length > 0) {
          const notificationsToInsert = mentionedIds.map((uid) => ({
            user_id: uid,
            actor_id: currentUser.id,
            type: "task_mentioned" as const,
            title: `${currentUser.full_name} đã nhắc bạn trong kênh ${dept?.name || "phòng ban"}`,
            body: trimmed.slice(0, 100),
            link: `/chat?dept=${selectedDeptId}`,
            is_read: false,
          }));
          await supabase.from("notifications").insert(notificationsToInsert);
        }
      } else if (activeTab === "project" && selectedProjectId) {
        const projectObj = allProjects.find((p) => p.id === selectedProjectId);
        const { data: insertedPM, error } = await supabase
          .from("project_messages")
          .insert({
            project_id: selectedProjectId,
            author_id: currentUser.id,
            content:
              trimmed ||
              (attachmentName ? `[Đã gửi tệp: ${attachmentName}]` : ""),
            attachment_url: attachmentUrl,
            attachment_name: attachmentName,
            reply_to_id: replyingTo?.id || null,
          })
          .select("*, author:profiles!project_messages_author_id_fkey(*)")
          .single();

        if (error) throw error;

        if (insertedPM) {
          setProjectMessages((prev) => {
            if (prev.some((m) => m.id === insertedPM.id)) return prev;
            return [...prev, insertedPM as ProjectMessage];
          });
          setProjectLastMsgMap((prev) => ({
            ...prev,
            [selectedProjectId]: {
              content: insertedPM.content,
              createdAt: insertedPM.created_at,
              senderId: currentUser.id,
            },
          }));
        }

        // Notify mentioned users in project
        const mentionedIds = extractMentionedUserIds(
          trimmed,
          allProfiles
        ).filter((id) => id !== currentUser.id);
        if (mentionedIds.length > 0) {
          const notificationsToInsert = mentionedIds.map((uid) => ({
            user_id: uid,
            actor_id: currentUser.id,
            type: "task_mentioned" as const,
            title: `${currentUser.full_name} đã nhắc bạn trong dự án ${projectObj?.name || ""}`,
            body: trimmed.slice(0, 100),
            link: `/chat?project=${selectedProjectId}`,
            is_read: false,
          }));
          await supabase.from("notifications").insert(notificationsToInsert);
        }
      }

      setInputText("");
      setReplyingTo(null);
    } catch (err) {
      console.error("Lỗi gửi tin nhắn:", err);
      toast.error("Không thể gửi tin nhắn. Vui lòng thử lại.");
    } finally {
      isSendingRef.current = false;
      setIsSending(false);
    }
  };

  // Toggle Emoji Reaction on a message
  const handleToggleReaction = async (msg: UnifiedMessage, emoji: string) => {
    const currentReactions = { ...(msg.reactions || {}) };
    const usersForEmoji = currentReactions[emoji] || [];
    const hasReacted = usersForEmoji.includes(currentUser.id);

    const nextUsers = hasReacted
      ? usersForEmoji.filter((id) => id !== currentUser.id)
      : [...usersForEmoji, currentUser.id];

    if (nextUsers.length > 0) {
      currentReactions[emoji] = nextUsers;
    } else {
      delete currentReactions[emoji];
    }

    // Optimistic update
    if (activeTab === "direct") {
      setDirectMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id ? { ...m, reactions: currentReactions } : m
        )
      );
      await supabase
        .from("direct_messages")
        .update({ reactions: currentReactions })
        .eq("id", msg.id);
    } else if (activeTab === "channel") {
      setChannelMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id ? { ...m, reactions: currentReactions } : m
        )
      );
      await supabase
        .from("channel_messages")
        .update({ reactions: currentReactions })
        .eq("id", msg.id);
    } else {
      setProjectMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id ? { ...m, reactions: currentReactions } : m
        )
      );
      await supabase
        .from("project_messages")
        .update({ reactions: currentReactions })
        .eq("id", msg.id);
    }
  };

  // Toggle Pin on a message
  const handleTogglePin = async (msg: UnifiedMessage) => {
    const nextPinned = !msg.isPinned;
    if (activeTab === "direct") {
      setDirectMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id ? { ...m, is_pinned: nextPinned } : m
        )
      );
      await supabase
        .from("direct_messages")
        .update({ is_pinned: nextPinned })
        .eq("id", msg.id);
    } else if (activeTab === "channel") {
      setChannelMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id ? { ...m, is_pinned: nextPinned } : m
        )
      );
      await supabase
        .from("channel_messages")
        .update({ is_pinned: nextPinned })
        .eq("id", msg.id);
    } else {
      setProjectMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id ? { ...m, is_pinned: nextPinned } : m
        )
      );
      await supabase
        .from("project_messages")
        .update({ is_pinned: nextPinned })
        .eq("id", msg.id);
    }
    toast.success(nextPinned ? "Đã ghim tin nhắn" : "Đã bỏ ghim tin nhắn");
  };

  // Soft-delete / Unsend a message
  const handleUnsendMessage = async (msg: UnifiedMessage) => {
    if (!msg.isMine) return;
    if (activeTab === "direct") {
      setDirectMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id
            ? { ...m, is_deleted: true, is_pinned: false }
            : m
        )
      );
      await supabase
        .from("direct_messages")
        .update({ is_deleted: true, is_pinned: false })
        .eq("id", msg.id);
    } else if (activeTab === "channel") {
      setChannelMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id
            ? { ...m, is_deleted: true, is_pinned: false }
            : m
        )
      );
      await supabase
        .from("channel_messages")
        .update({ is_deleted: true, is_pinned: false })
        .eq("id", msg.id);
    } else {
      setProjectMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id
            ? { ...m, is_deleted: true, is_pinned: false }
            : m
        )
      );
      await supabase
        .from("project_messages")
        .update({ is_deleted: true, is_pinned: false })
        .eq("id", msg.id);
    }
    toast.info("Đã thu hồi tin nhắn");
  };

  // Scroll to a specific message by ID
  const scrollToMessage = (msgId: string) => {
    const el = document.getElementById(`chat-msg-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedMsgId(msgId);
      setTimeout(() => {
        setHighlightedMsgId((prev) => (prev === msgId ? null : prev));
      }, 2200);
    }
  };

  // Switch conversation
  const handleSelectUser = (userId: string) => {
    setActiveTab("direct");
    setSelectedUserId(userId);
    setSelectedDeptId(null);
    setSelectedProjectId(null);
    setMobileShowSidebar(false);
    router.replace(`/chat?user=${userId}`);
  };

  const handleSelectDept = (deptId: string) => {
    setActiveTab("channel");
    setSelectedDeptId(deptId);
    setSelectedUserId(null);
    setSelectedProjectId(null);
    setMobileShowSidebar(false);
    markChannelAsRead(deptId);
    router.replace(`/chat?dept=${deptId}`);
  };

  const handleSelectProject = (projId: string) => {
    setActiveTab("project");
    setSelectedProjectId(projId);
    setSelectedUserId(null);
    setSelectedDeptId(null);
    setMobileShowSidebar(false);
    markProjectAsRead(projId);
    router.replace(`/chat?project=${projId}`);
  };

  // Smart sorted & filtered profiles
  const filteredProfiles = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const base = !q
      ? otherProfiles
      : otherProfiles.filter(
          (p) =>
            p.full_name?.toLowerCase().includes(q) ||
            p.job_title?.toLowerCase().includes(q) ||
            p.department?.name?.toLowerCase().includes(q)
        );

    return [...base].sort((a, b) => {
      const unreadA = unreadMap[a.id] || 0;
      const unreadB = unreadMap[b.id] || 0;
      if (unreadA !== unreadB) return unreadB - unreadA;

      const lastA = dmLastMsgMap[a.id]?.createdAt
        ? new Date(dmLastMsgMap[a.id].createdAt).getTime()
        : 0;
      const lastB = dmLastMsgMap[b.id]?.createdAt
        ? new Date(dmLastMsgMap[b.id].createdAt).getTime()
        : 0;
      if (lastA !== lastB) return lastB - lastA;

      const onlineA = onlineUserIds.has(a.id) ? 1 : 0;
      const onlineB = onlineUserIds.has(b.id) ? 1 : 0;
      if (onlineA !== onlineB) return onlineB - onlineA;

      return (a.full_name || "").localeCompare(b.full_name || "", "vi");
    });
  }, [otherProfiles, searchQuery, unreadMap, dmLastMsgMap, onlineUserIds]);

  const filteredDepartments = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const base = !q
      ? allDepartments
      : allDepartments.filter(
          (d) =>
            d.name?.toLowerCase().includes(q) ||
            d.code?.toLowerCase().includes(q) ||
            d.description?.toLowerCase().includes(q)
        );

    return [...base].sort((a, b) => {
      const unreadA = channelUnreadMap[a.id] || 0;
      const unreadB = channelUnreadMap[b.id] || 0;
      if (unreadA !== unreadB) return unreadB - unreadA;

      const lastA = channelLastMsgMap[a.id]?.createdAt
        ? new Date(channelLastMsgMap[a.id].createdAt).getTime()
        : 0;
      const lastB = channelLastMsgMap[b.id]?.createdAt
        ? new Date(channelLastMsgMap[b.id].createdAt).getTime()
        : 0;
      if (lastA !== lastB) return lastB - lastA;

      return (a.name || "").localeCompare(b.name || "", "vi");
    });
  }, [allDepartments, searchQuery, channelUnreadMap, channelLastMsgMap]);

  const filteredProjects = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const base = !q
      ? allProjects
      : allProjects.filter(
          (p) =>
            p.name?.toLowerCase().includes(q) ||
            p.code?.toLowerCase().includes(q) ||
            p.description?.toLowerCase().includes(q)
        );

    return [...base].sort((a, b) => {
      const unreadA = projectUnreadMap[a.id] || 0;
      const unreadB = projectUnreadMap[b.id] || 0;
      if (unreadA !== unreadB) return unreadB - unreadA;

      const lastA = projectLastMsgMap[a.id]?.createdAt
        ? new Date(projectLastMsgMap[a.id].createdAt).getTime()
        : 0;
      const lastB = projectLastMsgMap[b.id]?.createdAt
        ? new Date(projectLastMsgMap[b.id].createdAt).getTime()
        : 0;
      if (lastA !== lastB) return lastB - lastA;

      return (a.name || "").localeCompare(b.name || "", "vi");
    });
  }, [allProjects, searchQuery, projectUnreadMap, projectLastMsgMap]);

  // Current active entity info
  const activeUser = otherProfiles.find((p) => p.id === selectedUserId);
  const activeDept = allDepartments.find((d) => d.id === selectedDeptId);
  const activeProject = allProjects.find((p) => p.id === selectedProjectId);

  // Unified messages list
  const unifiedMessages: UnifiedMessage[] = useMemo(() => {
    const rawList: UnifiedMessage[] =
      activeTab === "direct"
        ? directMessages.map((m) => ({
            id: m.id,
            authorId: m.sender_id,
            author: m.sender || allProfiles.find((p) => p.id === m.sender_id),
            content: m.content,
            attachmentUrl: m.attachment_url,
            attachmentName: m.attachment_name,
            createdAt: m.created_at,
            isMine: m.sender_id === currentUser.id,
            isRead: m.is_read,
            replyToId: m.reply_to_id || null,
            isPinned: !!m.is_pinned,
            isDeleted: !!m.is_deleted,
            editedAt: m.edited_at || null,
            reactions: m.reactions || {},
          }))
        : activeTab === "channel"
          ? channelMessages.map((m) => ({
              id: m.id,
              authorId: m.author_id,
              author: m.author || allProfiles.find((p) => p.id === m.author_id),
              content: m.content,
              attachmentUrl: m.attachment_url,
              attachmentName: m.attachment_name,
              createdAt: m.created_at,
              isMine: m.author_id === currentUser.id,
              isRead: true,
              replyToId: m.parent_id || null,
              isPinned: !!m.is_pinned,
              isDeleted: !!m.is_deleted,
              editedAt: m.edited_at || null,
              reactions: m.reactions || {},
            }))
          : projectMessages.map((m) => ({
              id: m.id,
              authorId: m.author_id,
              author: m.author || allProfiles.find((p) => p.id === m.author_id),
              content: m.content,
              attachmentUrl: m.attachment_url,
              attachmentName: m.attachment_name,
              createdAt: m.created_at,
              isMine: m.author_id === currentUser.id,
              isRead: true,
              replyToId: m.reply_to_id || null,
              isPinned: !!m.is_pinned,
              isDeleted: !!m.is_deleted,
              editedAt: m.edited_at || null,
              reactions: m.reactions || {},
            }));

    const seenIds = new Set<string>();
    return rawList.filter((msg) => {
      if (!msg.id || seenIds.has(msg.id)) return false;
      seenIds.add(msg.id);
      return true;
    });
  }, [
    activeTab,
    directMessages,
    channelMessages,
    projectMessages,
    allProfiles,
    currentUser.id,
  ]);

  const messageById = useMemo(() => {
    const map = new Map<string, UnifiedMessage>();
    unifiedMessages.forEach((m) => map.set(m.id, m));
    return map;
  }, [unifiedMessages]);

  const pinnedMessages = useMemo(
    () => unifiedMessages.filter((m) => m.isPinned && !m.isDeleted),
    [unifiedMessages]
  );

  const groupedMessages = useMemo(() => {
    const groups: { dateLabel: string; items: UnifiedMessage[] }[] = [];
    const todayStr = new Date().toDateString();
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toDateString();

    unifiedMessages.forEach((msg) => {
      const msgDate = new Date(msg.createdAt);
      const msgDateStr = msgDate.toDateString();

      let dateLabel = msgDate.toLocaleDateString("vi-VN", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });

      if (msgDateStr === todayStr) {
        dateLabel = "Hôm nay";
      } else if (msgDateStr === yesterdayStr) {
        dateLabel = "Hôm qua";
      }

      const existingGroup = groups.find((g) => g.dateLabel === dateLabel);
      if (existingGroup) {
        existingGroup.items.push(msg);
      } else {
        groups.push({ dateLabel, items: [msg] });
      }
    });

    return groups;
  }, [unifiedMessages]);

  const currentTypingUser = useMemo(() => {
    const key =
      activeTab === "direct" && selectedUserId
        ? `dm:${[currentUser.id, selectedUserId].sort().join("_")}`
        : activeTab === "channel" && selectedDeptId
          ? `dept:${selectedDeptId}`
          : activeTab === "project" && selectedProjectId
            ? `proj:${selectedProjectId}`
            : null;
    return key ? typingUsers[key] : null;
  }, [
    activeTab,
    selectedUserId,
    selectedDeptId,
    selectedProjectId,
    currentUser.id,
    typingUsers,
  ]);

  const totalDmUnread = Object.values(unreadMap).reduce((a, b) => a + b, 0);
  const totalChannelUnread = Object.values(channelUnreadMap).reduce(
    (a, b) => a + b,
    0
  );
  const totalProjectUnread = Object.values(projectUnreadMap).reduce(
    (a, b) => a + b,
    0
  );

  return (
    <div className="flex h-[calc(100vh-6.5rem)] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
      {/* ====================================================================
       * LEFT SIDEBAR: SMART INBOX (1-1 PROFILES, DEPARTMENTS, PROJECTS)
       * ==================================================================== */}
      <div
        className={cn(
          "w-full md:w-80 lg:w-88 flex flex-col border-r border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 shrink-0",
          !mobileShowSidebar && "hidden md:flex"
        )}
      >
        {/* Sidebar Header */}
        <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand text-white shadow-xs">
                <MessageSquare className="h-4 w-4" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Trò chuyện nội bộ
                </h1>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {onlineUserIds.size} người đang trực tuyến
                </p>
              </div>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm đồng nghiệp, phòng ban, dự án..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          {/* 3 Section Tabs: 1-1, Phòng ban, Dự án */}
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-200/70 p-1 dark:bg-slate-800/80">
            <button
              type="button"
              onClick={() => setActiveTab("direct")}
              className={cn(
                "flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold transition cursor-pointer",
                activeTab === "direct"
                  ? "bg-white text-brand shadow-xs dark:bg-slate-900 dark:text-brand"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              )}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>1-1</span>
              {totalDmUnread > 0 && (
                <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                  {totalDmUnread}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("channel")}
              className={cn(
                "flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold transition cursor-pointer",
                activeTab === "channel"
                  ? "bg-white text-brand shadow-xs dark:bg-slate-900 dark:text-brand"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              )}
            >
              <Hash className="h-3.5 w-3.5" />
              <span>Phòng ban</span>
              {totalChannelUnread > 0 && (
                <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                  {totalChannelUnread}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("project")}
              className={cn(
                "flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold transition cursor-pointer",
                activeTab === "project"
                  ? "bg-white text-brand shadow-xs dark:bg-slate-900 dark:text-brand"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              )}
            >
              <FolderKanban className="h-3.5 w-3.5" />
              <span>Dự án</span>
              {totalProjectUnread > 0 && (
                <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                  {totalProjectUnread}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Sidebar Item List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {activeTab === "direct" ? (
            filteredProfiles.length === 0 ? (
              <p className="text-center py-8 text-xs text-slate-400">
                Không tìm thấy nhân viên nào
              </p>
            ) : (
              filteredProfiles.map((p) => {
                const isSelected = selectedUserId === p.id;
                const unread = unreadMap[p.id] || 0;
                const isOnline = onlineUserIds.has(p.id);
                const lastMsg = dmLastMsgMap[p.id];

                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectUser(p.id)}
                    className={cn(
                      "w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition cursor-pointer relative",
                      isSelected
                        ? "bg-brand/10 dark:bg-brand/20 text-brand"
                        : "hover:bg-slate-200/50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-200"
                    )}
                  >
                    <div className="relative shrink-0">
                      {p.avatar_url ? (
                        <img
                          src={p.avatar_url}
                          alt={p.full_name}
                          className="h-9 w-9 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                          {getInitials(p.full_name)}
                        </div>
                      )}
                      <span
                        title={isOnline ? "Đang trực tuyến" : "Ngoại tuyến"}
                        className={cn(
                          "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-slate-900",
                          isOnline
                            ? "bg-emerald-500"
                            : "bg-slate-300 dark:bg-slate-600"
                        )}
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <p
                          className={cn(
                            "truncate text-xs text-slate-900 dark:text-slate-100",
                            unread > 0 ? "font-bold" : "font-semibold"
                          )}
                        >
                          {p.full_name}
                        </p>
                        <div className="flex items-center gap-1 shrink-0">
                          {lastMsg && (
                            <span className="text-[10px] text-slate-400">
                              {formatRelativeShort(lastMsg.createdAt)}
                            </span>
                          )}
                          {unread > 0 && (
                            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                              {unread}
                            </span>
                          )}
                        </div>
                      </div>
                      <p
                        className={cn(
                          "truncate text-[11px]",
                          unread > 0
                            ? "font-semibold text-slate-800 dark:text-slate-200"
                            : "text-slate-500 dark:text-slate-400"
                        )}
                      >
                        {lastMsg
                          ? `${lastMsg.senderId === currentUser.id ? "Bạn: " : ""}${lastMsg.content}`
                          : p.job_title || p.department?.name || "Nhân viên"}
                      </p>
                    </div>
                  </button>
                );
              })
            )
          ) : activeTab === "channel" ? (
            filteredDepartments.map((dept) => {
              const isSelected = selectedDeptId === dept.id;
              const unread = channelUnreadMap[dept.id] || 0;
              const lastMsg = channelLastMsgMap[dept.id];
              const lastSender = lastMsg
                ? allProfiles.find((p) => p.id === lastMsg.senderId)
                : null;

              return (
                <button
                  key={dept.id}
                  type="button"
                  onClick={() => handleSelectDept(dept.id)}
                  className={cn(
                    "w-full flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition cursor-pointer",
                    isSelected
                      ? "bg-brand/10 dark:bg-brand/20 text-brand"
                      : "hover:bg-slate-200/50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-200"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl font-bold text-xs",
                      isSelected
                        ? "bg-brand text-white"
                        : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                    )}
                  >
                    <Hash className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <p
                        className={cn(
                          "truncate text-xs text-slate-900 dark:text-slate-100",
                          unread > 0 ? "font-bold" : "font-semibold"
                        )}
                      >
                        {dept.name}
                      </p>
                      <div className="flex items-center gap-1 shrink-0">
                        {lastMsg && (
                          <span className="text-[10px] text-slate-400">
                            {formatRelativeShort(lastMsg.createdAt)}
                          </span>
                        )}
                        {unread > 0 ? (
                          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                            {unread}
                          </span>
                        ) : (
                          dept.code && (
                            <span className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5 text-[10px] font-mono text-slate-500">
                              {dept.code}
                            </span>
                          )
                        )}
                      </div>
                    </div>
                    <p
                      className={cn(
                        "truncate text-[11px] mt-0.5",
                        unread > 0
                          ? "font-semibold text-slate-800 dark:text-slate-200"
                          : "text-slate-400 dark:text-slate-500"
                      )}
                    >
                      {lastMsg
                        ? `${lastMsg.senderId === currentUser.id ? "Bạn" : lastSender?.full_name?.split(" ").pop() || "Đồng nghiệp"}: ${lastMsg.content}`
                        : dept.description || "Kênh trao đổi phòng ban"}
                    </p>
                  </div>
                </button>
              );
            })
          ) : (
            filteredProjects.map((project) => {
              const isSelected = selectedProjectId === project.id;
              const unread = projectUnreadMap[project.id] || 0;
              const lastMsg = projectLastMsgMap[project.id];
              const lastSender = lastMsg
                ? allProfiles.find((p) => p.id === lastMsg.senderId)
                : null;

              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => handleSelectProject(project.id)}
                  className={cn(
                    "w-full flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition cursor-pointer",
                    isSelected
                      ? "bg-brand/10 dark:bg-brand/20 text-brand"
                      : "hover:bg-slate-200/50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-200"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl font-bold text-xs",
                      isSelected
                        ? "bg-brand text-white"
                        : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                    )}
                    style={
                      !isSelected && project.color
                        ? { backgroundColor: `${project.color}20`, color: project.color }
                        : undefined
                    }
                  >
                    <FolderKanban className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <p
                        className={cn(
                          "truncate text-xs text-slate-900 dark:text-slate-100",
                          unread > 0 ? "font-bold" : "font-semibold"
                        )}
                      >
                        {project.name}
                      </p>
                      <div className="flex items-center gap-1 shrink-0">
                        {lastMsg && (
                          <span className="text-[10px] text-slate-400">
                            {formatRelativeShort(lastMsg.createdAt)}
                          </span>
                        )}
                        {unread > 0 ? (
                          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                            {unread}
                          </span>
                        ) : (
                          project.code && (
                            <span className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5 text-[10px] font-mono text-slate-500">
                              {project.code}
                            </span>
                          )
                        )}
                      </div>
                    </div>
                    <p
                      className={cn(
                        "truncate text-[11px] mt-0.5",
                        unread > 0
                          ? "font-semibold text-slate-800 dark:text-slate-200"
                          : "text-slate-400 dark:text-slate-500"
                      )}
                    >
                      {lastMsg
                        ? `${lastMsg.senderId === currentUser.id ? "Bạn" : lastSender?.full_name?.split(" ").pop() || "Đồng nghiệp"}: ${lastMsg.content}`
                        : project.description || "Luồng trao đổi dự án"}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ====================================================================
       * RIGHT MAIN PANE: CHAT STREAM & INPUT BAR
       * ==================================================================== */}
      <div
        className={cn(
          "flex-1 flex flex-col bg-white dark:bg-slate-900 min-w-0 relative",
          mobileShowSidebar && "hidden md:flex"
        )}
      >
        {/* Chat Pane Header */}
        <div className="h-16 border-b border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between shrink-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xs">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileShowSidebar(true)}
              className="md:hidden inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"
              title="Quay lại danh sách"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>

            {activeTab === "direct" && activeUser ? (
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="relative shrink-0">
                  {activeUser.avatar_url ? (
                    <img
                      src={activeUser.avatar_url}
                      alt={activeUser.full_name}
                      className="h-9 w-9 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                      {getInitials(activeUser.full_name)}
                    </div>
                  )}
                  <span
                    className={cn(
                      "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-slate-900",
                      onlineUserIds.has(activeUser.id)
                        ? "bg-emerald-500"
                        : "bg-slate-300 dark:bg-slate-600"
                    )}
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                      {activeUser.full_name}
                    </h2>
                    <span
                      className={cn(
                        "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                        onlineUserIds.has(activeUser.id)
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                          : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                      )}
                    >
                      {onlineUserIds.has(activeUser.id)
                        ? "Trực tuyến"
                        : "Ngoại tuyến"}
                    </span>
                  </div>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {currentTypingUser ? (
                      <span className="text-brand font-medium animate-pulse">
                        ✍️ {currentTypingUser} đang soạn tin nhắn...
                      </span>
                    ) : (
                      `${activeUser.job_title || "Thành viên"} • ${activeUser.email}`
                    )}
                  </p>
                </div>
              </div>
            ) : activeTab === "channel" && activeDept ? (
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand font-bold text-sm dark:bg-brand-soft-dark">
                  <Hash className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    {activeDept.name}
                    {activeDept.code && (
                      <span className="rounded bg-brand-soft px-1.5 py-0.5 text-[10px] font-mono font-medium text-brand dark:bg-brand-soft-dark">
                        {activeDept.code}
                      </span>
                    )}
                  </h2>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {currentTypingUser ? (
                      <span className="text-brand font-medium animate-pulse">
                        ✍️ {currentTypingUser} đang soạn tin nhắn...
                      </span>
                    ) : (
                      activeDept.description || "Kênh trao đổi phòng ban"
                    )}
                  </p>
                </div>
              </div>
            ) : activeTab === "project" && activeProject ? (
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-bold text-sm"
                  style={{
                    backgroundColor: `${activeProject.color || "#3b82f6"}20`,
                    color: activeProject.color || "#3b82f6",
                  }}
                >
                  <FolderKanban className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    {activeProject.name}
                    {activeProject.code && (
                      <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono font-medium text-slate-600 dark:text-slate-300">
                        {activeProject.code}
                      </span>
                    )}
                  </h2>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {currentTypingUser ? (
                      <span className="text-brand font-medium animate-pulse">
                        ✍️ {currentTypingUser} đang soạn tin nhắn...
                      </span>
                    ) : (
                      activeProject.description || "Trò chuyện & Trao đổi dự án"
                    )}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400">Chọn cuộc trò chuyện</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Quick Link to Project Page if on project tab */}
            {activeTab === "project" && activeProject && (
              <Link
                href={`/projects/${activeProject.id}`}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                title="Mở bảng công việc dự án"
              >
                <span>Xem dự án</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            )}

            {/* Pinned Messages Toggle Button */}
            <button
              type="button"
              onClick={() => setShowPinnedDrawer((prev) => !prev)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer",
                showPinnedDrawer || pinnedMessages.length > 0
                  ? "border-brand/30 bg-brand-soft/60 text-brand dark:bg-brand-soft-dark"
                  : "border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              )}
              title="Danh sách tin nhắn đã ghim"
            >
              <Pin className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Đã ghim</span>
              {pinnedMessages.length > 0 && (
                <span className="rounded-full bg-brand px-1.5 py-0.2 text-[10px] font-bold text-white">
                  {pinnedMessages.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Pinned Message Quick Banner */}
        {pinnedMessages.length > 0 && !showPinnedDrawer && (
          <div className="flex items-center justify-between gap-2 border-b border-brand/20 bg-brand-soft/30 px-4 py-2 text-xs dark:bg-brand-soft-dark/20 shrink-0">
            <button
              type="button"
              onClick={() =>
                scrollToMessage(pinnedMessages[pinnedMessages.length - 1].id)
              }
              className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
            >
              <Pin className="h-3.5 w-3.5 text-brand shrink-0 fill-brand" />
              <div className="min-w-0 flex-1">
                <span className="font-semibold text-brand mr-1.5">
                  Tin đã ghim ({pinnedMessages.length}):
                </span>
                <span className="truncate text-slate-700 dark:text-slate-300">
                  {pinnedMessages[pinnedMessages.length - 1].content}
                </span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setShowPinnedDrawer(true)}
              className="text-[11px] font-semibold text-brand hover:underline shrink-0 cursor-pointer"
            >
              Xem tất cả
            </button>
          </div>
        )}

        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Message Stream */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {loadingMessages ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-xs text-slate-400 animate-pulse">
                  Đang tải tin nhắn...
                </p>
              </div>
            ) : groupedMessages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center py-16">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand mb-3 dark:bg-brand-soft-dark">
                  {activeTab === "direct" ? (
                    <MessageSquare className="h-6 w-6" />
                  ) : activeTab === "channel" ? (
                    <Hash className="h-6 w-6" />
                  ) : (
                    <FolderKanban className="h-6 w-6" />
                  )}
                </div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  {activeTab === "direct"
                    ? `Bắt đầu cuộc trò chuyện với ${activeUser?.full_name || "đồng nghiệp"}`
                    : activeTab === "channel"
                      ? `Chào mừng đến với kênh ${activeDept?.name || "phòng ban"}`
                      : `Trao đổi về dự án ${activeProject?.name || ""}`}
                </h3>
                <p className="mt-1 text-xs text-slate-400 max-w-sm">
                  Gõ tin nhắn, dán ảnh trực tiếp (Ctrl+V), nhắc tên bằng @ hoặc
                  rê chuột vào tin nhắn để chuyển thành công việc trong 1 click.
                </p>
              </div>
            ) : (
              groupedMessages.map((group, groupIdx) => (
                <div
                  key={`${group.dateLabel}-${groupIdx}`}
                  className="space-y-1.5"
                >
                  {/* Date separator */}
                  <div className="relative flex items-center justify-center my-3">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-200 dark:border-slate-800" />
                    </div>
                    <span className="relative rounded-full bg-slate-100 px-3 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      {group.dateLabel}
                    </span>
                  </div>

                  {/* Messages in date group */}
                  {group.items.map((msg, msgIdx) => {
                    const prevMsg = msgIdx > 0 ? group.items[msgIdx - 1] : null;
                    const nextMsg =
                      msgIdx < group.items.length - 1
                        ? group.items[msgIdx + 1]
                        : null;

                    const isGroupedWithPrev =
                      !!prevMsg &&
                      prevMsg.authorId === msg.authorId &&
                      Math.abs(
                        new Date(msg.createdAt).getTime() -
                          new Date(prevMsg.createdAt).getTime()
                      ) <
                        2 * 60 * 1000;

                    const isGroupedWithNext =
                      !!nextMsg &&
                      nextMsg.authorId === msg.authorId &&
                      Math.abs(
                        new Date(nextMsg.createdAt).getTime() -
                          new Date(msg.createdAt).getTime()
                      ) <
                        2 * 60 * 1000;

                    const timeStr = new Date(msg.createdAt).toLocaleTimeString(
                      "vi-VN",
                      {
                        hour: "2-digit",
                        minute: "2-digit",
                      }
                    );

                    const repliedParent = msg.replyToId
                      ? messageById.get(msg.replyToId)
                      : null;

                    const reactionEntries = Object.entries(
                      msg.reactions || {}
                    ).filter(([, uids]) => Array.isArray(uids) && uids.length > 0);

                    return (
                      <div
                        id={`chat-msg-${msg.id}`}
                        key={msg.id}
                        className={cn(
                          "group/msg relative flex gap-2.5 max-w-[88%] sm:max-w-[75%] rounded-2xl transition-colors duration-500",
                          msg.isMine ? "ml-auto flex-row-reverse" : "mr-auto",
                          !isGroupedWithPrev && msgIdx > 0 && "mt-3",
                          highlightedMsgId === msg.id &&
                            "ring-2 ring-brand bg-brand-soft/30 p-1"
                        )}
                      >
                        {/* Avatar for other people */}
                        {!msg.isMine && (
                          <div className="w-7 shrink-0 mt-1">
                            {!isGroupedWithPrev &&
                              (msg.author?.avatar_url ? (
                                <img
                                  src={msg.author.avatar_url}
                                  alt={msg.author.full_name}
                                  className="h-7 w-7 rounded-full object-cover"
                                />
                              ) : (
                                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">
                                  {getInitials(msg.author?.full_name || "AB")}
                                </div>
                              ))}
                          </div>
                        )}

                        <div className="flex flex-col min-w-0 relative">
                          {/* Author name for received messages */}
                          {!msg.isMine && !isGroupedWithPrev && (
                            <div className="flex items-center gap-1.5 mb-1 pl-1">
                              <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                                {msg.author?.full_name || "Đồng nghiệp"}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {timeStr}
                              </span>
                            </div>
                          )}

                          {/* Floating Hover Toolbar */}
                          {!msg.isDeleted && (
                            <div
                              className={cn(
                                "hidden group-hover/msg:flex items-center gap-0.5 absolute -top-8 z-20 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-1 shadow-md",
                                msg.isMine ? "right-0" : "left-0"
                              )}
                            >
                              {/* Quick Emojis */}
                              {QUICK_REACTIONS.map(({ emoji, label }) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => handleToggleReaction(msg, emoji)}
                                  title={label}
                                  className="rounded-lg p-1 text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                                >
                                  {emoji}
                                </button>
                              ))}

                              <div className="mx-1 h-3.5 w-px bg-slate-200 dark:bg-slate-700" />

                              {/* Reply */}
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingMessage(null);
                                  setReplyingTo(msg);
                                }}
                                title="Trả lời tin nhắn"
                                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100 transition cursor-pointer"
                              >
                                <Reply className="h-3.5 w-3.5" />
                              </button>

                              {/* Convert to Task */}
                              <button
                                type="button"
                                onClick={() =>
                                  setConvertModalMessage({
                                    id: msg.id,
                                    content: msg.content,
                                    authorId: msg.authorId,
                                    authorName:
                                      msg.author?.full_name ||
                                      (msg.isMine
                                        ? currentUser.full_name
                                        : "Đồng nghiệp"),
                                    createdAt: msg.createdAt,
                                    attachmentUrl: msg.attachmentUrl,
                                    attachmentName: msg.attachmentName,
                                  })
                                }
                                title="Chuyển thành Công việc dự án"
                                className="rounded-lg p-1 text-slate-500 hover:bg-brand-soft hover:text-brand dark:hover:bg-slate-800 transition cursor-pointer"
                              >
                                <CheckSquare className="h-3.5 w-3.5" />
                              </button>

                              {/* Pin / Unpin */}
                              <button
                                type="button"
                                onClick={() => handleTogglePin(msg)}
                                title={
                                  msg.isPinned ? "Bỏ ghim tin nhắn" : "Ghim tin nhắn"
                                }
                                className={cn(
                                  "rounded-lg p-1 transition cursor-pointer",
                                  msg.isPinned
                                    ? "text-brand bg-brand-soft/60"
                                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800"
                                )}
                              >
                                <Pin className="h-3.5 w-3.5" />
                              </button>

                              {/* Edit & Unsend */}
                              {msg.isMine && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setReplyingTo(null);
                                      setEditingMessage(msg);
                                      setInputText(msg.content);
                                    }}
                                    title="Chỉnh sửa tin nhắn"
                                    className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 transition cursor-pointer"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleUnsendMessage(msg)}
                                    title="Thu hồi tin nhắn"
                                    className="rounded-lg p-1 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50 transition cursor-pointer"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          )}

                          {/* Bubble */}
                          <div
                            title={`Gửi lúc ${timeStr}`}
                            className={cn(
                              "rounded-2xl px-3.5 py-2.5 text-xs shadow-xs break-words relative",
                              msg.isDeleted
                                ? "border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-slate-400 italic"
                                : msg.isMine
                                  ? "bg-brand text-white rounded-tr-xs"
                                  : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-tl-xs"
                            )}
                          >
                            {msg.isPinned && !msg.isDeleted && (
                              <div
                                className={cn(
                                  "flex items-center gap-1 text-[10px] font-semibold mb-1",
                                  msg.isMine ? "text-white/80" : "text-brand"
                                )}
                              >
                                <Pin className="h-2.5 w-2.5 fill-current" />
                                <span>Đã ghim</span>
                              </div>
                            )}

                            {!msg.isDeleted && repliedParent && (
                              <button
                                type="button"
                                onClick={() => scrollToMessage(repliedParent.id)}
                                className={cn(
                                  "mb-2 w-full text-left rounded-lg border-l-2 px-2.5 py-1.5 text-[11px] transition cursor-pointer block",
                                  msg.isMine
                                    ? "border-white/80 bg-black/15 text-white/90 hover:bg-black/25"
                                    : "border-brand bg-white/80 dark:bg-slate-900/60 text-slate-600 dark:text-slate-300 hover:bg-white"
                                )}
                              >
                                <p className="font-bold truncate">
                                  {repliedParent.author?.full_name ||
                                    (repliedParent.isMine
                                      ? currentUser.full_name
                                      : "Đồng nghiệp")}
                                </p>
                                <p className="truncate opacity-85">
                                  {repliedParent.isDeleted
                                    ? "Tin nhắn đã thu hồi"
                                    : repliedParent.content}
                                </p>
                              </button>
                            )}

                            {msg.isDeleted ? (
                              <span>Tin nhắn đã được thu hồi</span>
                            ) : (
                              <div className="whitespace-pre-wrap leading-relaxed">
                                {renderContentWithMentions(
                                  msg.content,
                                  allProfiles,
                                  {
                                    isInverse: msg.isMine,
                                  }
                                )}
                                {msg.editedAt && (
                                  <span
                                    className={cn(
                                      "ml-1.5 text-[10px] italic",
                                      msg.isMine
                                        ? "text-white/75"
                                        : "text-slate-400"
                                    )}
                                  >
                                    (đã chỉnh sửa)
                                  </span>
                                )}
                              </div>
                            )}

                            {!msg.isDeleted && msg.attachmentUrl && (
                              <div className="mt-2.5 pt-2 border-t border-black/10 dark:border-white/10">
                                {msg.attachmentUrl.match(
                                  /\.(jpeg|jpg|png|gif|webp)$/i
                                ) ? (
                                  <a
                                    href={msg.attachmentUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block overflow-hidden rounded-lg group"
                                  >
                                    <img
                                      src={msg.attachmentUrl}
                                      alt={msg.attachmentName || "Ảnh đính kèm"}
                                      className="max-h-60 w-auto rounded-lg object-cover transition group-hover:opacity-90"
                                    />
                                  </a>
                                ) : (
                                  <a
                                    href={msg.attachmentUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    download={msg.attachmentName || "tep-tin"}
                                    className={cn(
                                      "flex items-center gap-2 rounded-lg p-2 text-xs transition",
                                      msg.isMine
                                        ? "bg-black/10 hover:bg-black/20 text-white"
                                        : "bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-50"
                                    )}
                                  >
                                    <FileText className="h-4 w-4 shrink-0" />
                                    <span className="truncate flex-1 font-medium">
                                      {msg.attachmentName || "Tải tệp đính kèm"}
                                    </span>
                                    <Download className="h-3.5 w-3.5 shrink-0 opacity-70" />
                                  </a>
                                )}
                              </div>
                            )}
                          </div>

                          {!msg.isDeleted && reactionEntries.length > 0 && (
                            <div
                              className={cn(
                                "flex flex-wrap items-center gap-1 mt-1",
                                msg.isMine ? "justify-end" : "justify-start"
                              )}
                            >
                              {reactionEntries.map(([emoji, uids]) => {
                                const hasReacted = uids.includes(currentUser.id);
                                const reactorNames = uids
                                  .map(
                                    (id) =>
                                      allProfiles.find((p) => p.id === id)
                                        ?.full_name || "Đồng nghiệp"
                                  )
                                  .join(", ");

                                return (
                                  <button
                                    key={emoji}
                                    type="button"
                                    onClick={() =>
                                      handleToggleReaction(msg, emoji)
                                    }
                                    title={reactorNames}
                                    className={cn(
                                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition cursor-pointer",
                                      hasReacted
                                        ? "border-brand/40 bg-brand-soft text-brand font-semibold dark:bg-brand-soft-dark"
                                        : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50"
                                    )}
                                  >
                                    <span>{emoji}</span>
                                    <span>{uids.length}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {msg.isMine && !isGroupedWithNext && (
                            <div className="flex items-center justify-end gap-1 mt-1 pr-1 text-[10px] text-slate-400">
                              <span>{timeStr}</span>
                              {activeTab === "direct" &&
                                (msg.isRead ? (
                                  <CheckCheck className="h-3 w-3 text-brand" />
                                ) : (
                                  <Check className="h-3 w-3 text-slate-400" />
                                ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* RIGHT DRAWER: PINNED MESSAGES PANEL */}
          {showPinnedDrawer && (
            <div className="w-72 border-l border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 flex flex-col shrink-0">
              <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-slate-100">
                  <Pin className="h-3.5 w-3.5 text-brand fill-brand" />
                  <span>Tin nhắn đã ghim ({pinnedMessages.length})</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPinnedDrawer(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                {pinnedMessages.length === 0 ? (
                  <p className="text-center py-8 text-xs text-slate-400">
                    Chưa có tin nhắn nào được ghim trong cuộc trò chuyện này.
                  </p>
                ) : (
                  pinnedMessages.map((pm) => (
                    <div
                      key={pm.id}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-xs shadow-2xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-900 dark:text-slate-100 truncate">
                          {pm.author?.full_name ||
                            (pm.isMine ? currentUser.full_name : "Đồng nghiệp")}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleTogglePin(pm)}
                          title="Bỏ ghim"
                          className="text-[10px] text-slate-400 hover:text-red-500 cursor-pointer"
                        >
                          Bỏ ghim
                        </button>
                      </div>
                      <p className="text-slate-600 dark:text-slate-300 line-clamp-3 break-words">
                        {pm.content}
                      </p>
                      <div className="flex items-center justify-between pt-1 text-[10px] text-slate-400">
                        <span>
                          {new Date(pm.createdAt).toLocaleString("vi-VN", {
                            hour: "2-digit",
                            minute: "2-digit",
                            day: "2-digit",
                            month: "2-digit",
                          })}
                        </span>
                        <button
                          type="button"
                          onClick={() => scrollToMessage(pm.id)}
                          className="font-semibold text-brand hover:underline cursor-pointer"
                        >
                          Đi tới tin nhắn →
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="border-t border-slate-200 dark:border-slate-800 p-3 bg-white dark:bg-slate-900 shrink-0">
          {/* Active Reply Banner */}
          {replyingTo && (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border-l-4 border-brand bg-slate-50 dark:bg-slate-800/80 px-3 py-2 text-xs">
              <div className="min-w-0 flex-1">
                <p className="font-bold text-brand flex items-center gap-1">
                  <Reply className="h-3 w-3" />
                  <span>
                    Đang trả lời{" "}
                    {replyingTo.author?.full_name ||
                      (replyingTo.isMine
                        ? currentUser.full_name
                        : "đồng nghiệp")}
                  </span>
                </p>
                <p className="truncate text-slate-600 dark:text-slate-300 mt-0.5">
                  {replyingTo.content}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReplyingTo(null)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Active Edit Banner */}
          {editingMessage && (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border-l-4 border-amber-500 bg-amber-50/70 dark:bg-amber-950/30 px-3 py-2 text-xs">
              <div className="min-w-0 flex-1">
                <p className="font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1">
                  <Pencil className="h-3 w-3" />
                  <span>Đang chỉnh sửa tin nhắn</span>
                </p>
                <p className="truncate text-slate-600 dark:text-slate-300 mt-0.5">
                  {editingMessage.content}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingMessage(null);
                  setInputText("");
                }}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Pending attachment preview */}
          {pendingAttachment && (
            <div className="mb-2 flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2 text-xs">
              {pendingAttachment.isImage ? (
                <img
                  src={pendingAttachment.previewUrl}
                  alt="Preview"
                  className="h-10 w-10 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-brand">
                  <FileText className="h-5 w-5" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-800 dark:text-slate-200">
                  {pendingAttachment.file.name}
                </p>
                <p className="text-[10px] text-slate-400">
                  {(pendingAttachment.file.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <button
                type="button"
                onClick={removePendingAttachment}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isSending || !!editingMessage}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 transition cursor-pointer disabled:opacity-50"
              title="Đính kèm tệp hoặc ảnh"
            >
              <Paperclip className="h-4 w-4" />
            </button>

            <div className="flex-1 min-w-0">
              <MentionTextarea
                profiles={allProfiles}
                value={inputText}
                onChange={(val) => {
                  setInputText(val);
                  broadcastTyping();
                }}
                onPaste={handlePaste}
                dropdownPlacement="top"
                placeholder={
                  editingMessage
                    ? "Nhập nội dung chỉnh sửa... (Enter để lưu, Esc để hủy)"
                    : activeTab === "direct"
                      ? `Gửi tin nhắn cho ${activeUser?.full_name || "đồng nghiệp"}... (@ nhắc tên, Ctrl+V dán ảnh)`
                      : activeTab === "channel"
                        ? `Nhắn vào kênh ${activeDept?.name || "phòng ban"}... (@ nhắc tên, Ctrl+V dán ảnh)`
                        : `Nhắn vào dự án ${activeProject?.name || ""}... (@ nhắc tên, Ctrl+V dán ảnh)`
                }
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && (editingMessage || replyingTo)) {
                    e.preventDefault();
                    setEditingMessage(null);
                    setReplyingTo(null);
                    setInputText("");
                    return;
                  }
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:bg-slate-900"
              />
            </div>

            <button
              type="button"
              onClick={handleSendMessage}
              disabled={
                isSending ||
                isUploading ||
                (!inputText.trim() && !pendingAttachment)
              }
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white shadow-xs transition hover:bg-brand-hover cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              )}
              title={editingMessage ? "Lưu chỉnh sửa (Enter)" : "Gửi (Enter)"}
            >
              {editingMessage ? (
                <Check className="h-4 w-4" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* MODAL: CONVERT CHAT MESSAGE TO PROJECT TASK */}
      <ConvertMessageToTaskModal
        message={convertModalMessage}
        currentUser={currentUser}
        allProfiles={allProfiles}
        projects={allProjects}
        defaultAssigneeId={activeTab === "direct" ? selectedUserId : null}
        onClose={() => setConvertModalMessage(null)}
        onTaskCreated={({ taskId, taskTitle, projectId, projectName }) => {
          const taskUrl = `${window.location.origin}/projects/${projectId}?task=${taskId}`;
          sendTextToCurrentConversation(
            `✅ Đã tạo công việc từ tin nhắn: "${taskTitle}" trong dự án [${projectName}] — ${taskUrl}`
          );
        }}
      />
    </div>
  );
}
