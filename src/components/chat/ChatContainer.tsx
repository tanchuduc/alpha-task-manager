"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn, getInitials } from "@/lib/utils";
import type {
  Profile,
  Department,
  DirectMessage,
  ChannelMessage,
} from "@/types/database";
import {
  MentionTextarea,
  renderContentWithMentions,
  extractMentionedUserIds,
} from "@/components/common/MentionAutocomplete";
import {
  Search,
  MessageSquare,
  Hash,
  Send,
  Paperclip,
  X,
  FileText,
  Image as ImageIcon,
  Check,
  CheckCheck,
  Building,
  AtSign,
  ArrowLeft,
  Download,
  Smile,
  Info,
} from "lucide-react";
import { toast } from "sonner";

interface ChatContainerProps {
  currentUser: Profile;
  allProfiles: Profile[];
  allDepartments: Department[];
}

type ChatMode = "direct" | "channel";

interface PendingAttachment {
  file: File;
  previewUrl: string;
  isImage: boolean;
}

export function ChatContainer({
  currentUser,
  allProfiles,
  allDepartments,
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

  // Messages state
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);
  const [channelMessages, setChannelMessages] = useState<ChannelMessage[]>([]);
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Input state
  const [inputText, setInputText] = useState("");
  const [pendingAttachment, setPendingAttachment] =
    useState<PendingAttachment | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // UI state
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileShowSidebar, setMobileShowSidebar] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Initialize selection from query params or defaults
  useEffect(() => {
    const userParam = searchParams.get("user");
    const deptParam = searchParams.get("dept");

    if (deptParam && allDepartments.some((d) => d.id === deptParam)) {
      setActiveTab("channel");
      setSelectedDeptId(deptParam);
      setSelectedUserId(null);
      setMobileShowSidebar(false);
    } else if (userParam && otherProfiles.some((p) => p.id === userParam)) {
      setActiveTab("direct");
      setSelectedUserId(userParam);
      setSelectedDeptId(null);
      setMobileShowSidebar(false);
    } else if (!selectedUserId && !selectedDeptId) {
      if (otherProfiles.length > 0) {
        setSelectedUserId(otherProfiles[0].id);
      } else if (allDepartments.length > 0) {
        setActiveTab("channel");
        setSelectedDeptId(allDepartments[0].id);
      }
    }
  }, [searchParams, otherProfiles, allDepartments, selectedUserId, selectedDeptId]);

  // Fetch unread count for direct messages
  useEffect(() => {
    async function fetchUnreadCounts() {
      const { data, error } = await supabase
        .from("direct_messages")
        .select("sender_id")
        .eq("receiver_id", currentUser.id)
        .eq("is_read", false);

      if (!error && data) {
        const counts: Record<string, number> = {};
        data.forEach((dm) => {
          counts[dm.sender_id] = (counts[dm.sender_id] || 0) + 1;
        });
        setUnreadMap(counts);
      }
    }
    fetchUnreadCounts();
  }, [currentUser.id, supabase]);

  // Load Direct Messages when selectedUserId changes
  useEffect(() => {
    if (activeTab !== "direct" || !selectedUserId) return;

    let isMounted = true;
    async function loadDMs() {
      setLoadingMessages(true);
      const { data, error } = await supabase
        .from("direct_messages")
        .select("*, sender:profiles!direct_messages_sender_id_fkey(*), receiver:profiles!direct_messages_receiver_id_fkey(*)")
        .or(
          `and(sender_id.eq.${currentUser.id},receiver_id.eq.${selectedUserId}),and(sender_id.eq.${selectedUserId},receiver_id.eq.${currentUser.id})`
        )
        .order("created_at", { ascending: true })
        .limit(200);

      if (isMounted) {
        if (!error && data) {
          setDirectMessages(data as DirectMessage[]);
        }
        setLoadingMessages(false);
      }

      // Mark received unread messages as read
      await supabase
        .from("direct_messages")
        .update({ is_read: true })
        .eq("sender_id", selectedUserId)
        .eq("receiver_id", currentUser.id)
        .eq("is_read", false);

      // Decrement unread map
      setUnreadMap((prev) => {
        const next = { ...prev };
        delete next[selectedUserId];
        return next;
      });
    }

    loadDMs();
    return () => {
      isMounted = false;
    };
  }, [activeTab, selectedUserId, currentUser.id, supabase]);

  // Load Channel Messages when selectedDeptId changes
  useEffect(() => {
    if (activeTab !== "channel" || !selectedDeptId) return;

    let isMounted = true;
    async function loadCMs() {
      setLoadingMessages(true);
      const { data, error } = await supabase
        .from("channel_messages")
        .select("*, author:profiles!channel_messages_author_id_fkey(*)")
        .eq("department_id", selectedDeptId)
        .order("created_at", { ascending: true })
        .limit(200);

      if (isMounted) {
        if (!error && data) {
          setChannelMessages(data as ChannelMessage[]);
        }
        setLoadingMessages(false);
      }
    }

    loadCMs();
    return () => {
      isMounted = false;
    };
  }, [activeTab, selectedDeptId, supabase]);

  // Realtime Subscriptions
  useEffect(() => {
    // 1. Direct Messages subscription
    const dmChannel = supabase
      .channel("chat-direct-messages")
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

          // If current conversation is open with this user
          if (
            (newDM.sender_id === selectedUserId && newDM.receiver_id === currentUser.id) ||
            (newDM.sender_id === currentUser.id && newDM.receiver_id === selectedUserId)
          ) {
            // Find sender profile
            const senderProfile = allProfiles.find((p) => p.id === newDM.sender_id);
            const enrichedDM: DirectMessage = {
              ...newDM,
              sender: senderProfile,
            };
            setDirectMessages((prev) => [...prev, enrichedDM]);

            if (newDM.receiver_id === currentUser.id) {
              await supabase
                .from("direct_messages")
                .update({ is_read: true })
                .eq("id", newDM.id);
            }
          } else if (newDM.receiver_id === currentUser.id) {
            // Unread message from someone else
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
      .subscribe();

    // 2. Channel Messages subscription
    const cmChannel = supabase
      .channel("chat-channel-messages")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "alpha_lite",
          table: "channel_messages",
        },
        (payload) => {
          const newCM = payload.new as ChannelMessage;
          if (selectedDeptId && newCM.department_id === selectedDeptId) {
            const author = allProfiles.find((p) => p.id === newCM.author_id);
            const enrichedCM: ChannelMessage = {
              ...newCM,
              author,
            };
            setChannelMessages((prev) => [...prev, enrichedCM]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(dmChannel);
      supabase.removeChannel(cmChannel);
    };
  }, [currentUser.id, selectedUserId, selectedDeptId, allProfiles, supabase]);

  // Auto-scroll to bottom on message list update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [directMessages, channelMessages, loadingMessages]);

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      toast.error("Tệp quá lớn. Vui lòng chọn tệp nhỏ hơn 25MB.");
      return;
    }

    const isImage = file.type.startsWith("image/");
    const previewUrl = URL.createObjectURL(file);
    setPendingAttachment({ file, previewUrl, isImage });
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

  // Upload attachment to Supabase Storage
  const uploadAttachment = async (
    file: File
  ): Promise<{ url: string; name: string } | null> => {
    try {
      setIsUploading(true);
      const ext = file.name.split(".").pop() || "bin";
      const sanitized = file.name
        .replace(/[^\w.-]/g, "_")
        .substring(0, 30);
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

  // Send Message
  const handleSendMessage = async () => {
    const trimmed = inputText.trim();
    if (!trimmed && !pendingAttachment) return;

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
        const receiver = otherProfiles.find((p) => p.id === selectedUserId);
        const { data: insertedDM, error } = await supabase
          .from("direct_messages")
          .insert({
            sender_id: currentUser.id,
            receiver_id: selectedUserId,
            content: trimmed || (attachmentName ? `[Đã gửi tệp: ${attachmentName}]` : ""),
            attachment_url: attachmentUrl,
            attachment_name: attachmentName,
            is_read: false,
          })
          .select("*, sender:profiles!direct_messages_sender_id_fkey(*), receiver:profiles!direct_messages_receiver_id_fkey(*)")
          .single();

        if (error) throw error;

        // Optimistically update message list if not already added by realtime
        if (insertedDM) {
          setDirectMessages((prev) => {
            if (prev.some((m) => m.id === insertedDM.id)) return prev;
            return [...prev, insertedDM as DirectMessage];
          });
        }

        // Create notification for receiver
        await supabase.from("notifications").insert({
          user_id: selectedUserId,
          actor_id: currentUser.id,
          type: "direct_message",
          title: `${currentUser.full_name} đã gửi tin nhắn cho bạn`,
          body: (trimmed || attachmentName || "Tin nhắn mới").slice(0, 100),
          link: `/chat?user=${currentUser.id}`,
          is_read: false,
        });

        // Trigger webhook dispatch
        fetch("/api/webhooks/dispatch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "direct_message",
            title: `Tin nhắn từ ${currentUser.full_name}`,
            body: trimmed || attachmentName || "Tin nhắn mới",
            link: `/chat?user=${currentUser.id}`,
          }),
        }).catch(() => {
          // Ignore webhook error
        });
      } else if (activeTab === "channel" && selectedDeptId) {
        const dept = allDepartments.find((d) => d.id === selectedDeptId);
        const { data: insertedCM, error } = await supabase
          .from("channel_messages")
          .insert({
            department_id: selectedDeptId,
            author_id: currentUser.id,
            content: trimmed || (attachmentName ? `[Đã gửi tệp: ${attachmentName}]` : ""),
            attachment_url: attachmentUrl,
            attachment_name: attachmentName,
          })
          .select("*, author:profiles!channel_messages_author_id_fkey(*)")
          .single();

        if (error) throw error;

        if (insertedCM) {
          setChannelMessages((prev) => {
            if (prev.some((m) => m.id === insertedCM.id)) return prev;
            return [...prev, insertedCM as ChannelMessage];
          });
        }

        // Notify mentioned users
        const mentionedIds = extractMentionedUserIds(trimmed, allProfiles).filter(
          (id) => id !== currentUser.id
        );
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
      }

      setInputText("");
    } catch (err) {
      console.error("Lỗi gửi tin nhắn:", err);
      toast.error("Không thể gửi tin nhắn. Vui lòng thử lại.");
    } finally {
      setIsSending(false);
    }
  };

  // Switch conversation
  const handleSelectUser = (userId: string) => {
    setActiveTab("direct");
    setSelectedUserId(userId);
    setSelectedDeptId(null);
    setMobileShowSidebar(false);
    router.replace(`/chat?user=${userId}`);
  };

  const handleSelectDept = (deptId: string) => {
    setActiveTab("channel");
    setSelectedDeptId(deptId);
    setSelectedUserId(null);
    setMobileShowSidebar(false);
    router.replace(`/chat?dept=${deptId}`);
  };

  // Filtered lists for sidebar
  const filteredProfiles = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return otherProfiles;
    return otherProfiles.filter(
      (p) =>
        p.full_name?.toLowerCase().includes(q) ||
        p.job_title?.toLowerCase().includes(q) ||
        p.department?.name?.toLowerCase().includes(q)
    );
  }, [otherProfiles, searchQuery]);

  const filteredDepartments = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return allDepartments;
    return allDepartments.filter(
      (d) =>
        d.name?.toLowerCase().includes(q) ||
        d.code?.toLowerCase().includes(q) ||
        d.description?.toLowerCase().includes(q)
    );
  }, [allDepartments, searchQuery]);

  // Current active entity info
  const activeUser = otherProfiles.find((p) => p.id === selectedUserId);
  const activeDept = allDepartments.find((d) => d.id === selectedDeptId);

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const list =
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
          }))
        : channelMessages.map((m) => ({
            id: m.id,
            authorId: m.author_id,
            author: m.author || allProfiles.find((p) => p.id === m.author_id),
            content: m.content,
            attachmentUrl: m.attachment_url,
            attachmentName: m.attachment_name,
            createdAt: m.created_at,
            isMine: m.author_id === currentUser.id,
            isRead: true,
          }));

    const groups: { dateLabel: string; items: typeof list }[] = [];
    const todayStr = new Date().toDateString();
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toDateString();

    list.forEach((msg) => {
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
  }, [
    activeTab,
    directMessages,
    channelMessages,
    allProfiles,
    currentUser.id,
  ]);

  return (
    <div className="flex h-[calc(100vh-6.5rem)] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
      {/* ====================================================================
       * LEFT SIDEBAR: LIST OF 1-1 PROFILES & DEPARTMENTS
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
                  Realtime chat & phòng ban
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
              placeholder="Tìm đồng nghiệp, phòng ban..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          {/* Section Tabs */}
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-200/70 p-1 dark:bg-slate-800/80">
            <button
              type="button"
              onClick={() => setActiveTab("direct")}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition cursor-pointer",
                activeTab === "direct"
                  ? "bg-white text-brand shadow-xs dark:bg-slate-900 dark:text-brand"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              )}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Tin nhắn 1-1</span>
              {Object.keys(unreadMap).length > 0 && (
                <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                  {Object.values(unreadMap).reduce((a, b) => a + b, 0)}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("channel")}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition cursor-pointer",
                activeTab === "channel"
                  ? "bg-white text-brand shadow-xs dark:bg-slate-900 dark:text-brand"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              )}
            >
              <Hash className="h-3.5 w-3.5" />
              <span>Phòng ban</span>
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
                    {/* Avatar with active green dot */}
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
                      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {p.full_name}
                        </p>
                        {unread > 0 && (
                          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                            {unread}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {p.job_title || p.department?.name || "Nhân viên"}
                      </p>
                    </div>
                  </button>
                );
              })
            )
          ) : (
            filteredDepartments.map((dept) => {
              const isSelected = selectedDeptId === dept.id;

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
                    <div className="flex items-center justify-between">
                      <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {dept.name}
                      </p>
                      {dept.code && (
                        <span className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5 text-[10px] font-mono text-slate-500">
                          {dept.code}
                        </span>
                      )}
                    </div>
                    {dept.description && (
                      <p className="truncate text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                        {dept.description}
                      </p>
                    )}
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
          "flex-1 flex flex-col bg-white dark:bg-slate-900 min-w-0",
          mobileShowSidebar && "hidden md:flex"
        )}
      >
        {/* Chat Pane Header */}
        <div className="h-16 border-b border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between shrink-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xs">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile back button */}
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
                  <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                    {activeUser.full_name}
                  </h2>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {activeUser.job_title || "Thành viên"} • {activeUser.email}
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
                    {activeDept.description || "Kênh trao đổi phòng ban"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400">Chọn cuộc trò chuyện</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Supabase Realtime
            </span>
          </div>
        </div>

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
                ) : (
                  <Hash className="h-6 w-6" />
                )}
              </div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                {activeTab === "direct"
                  ? `Bắt đầu cuộc trò chuyện với ${activeUser?.full_name || "đồng nghiệp"}`
                  : `Chào mừng đến với kênh ${activeDept?.name || "phòng ban"}`}
              </h3>
              <p className="mt-1 text-xs text-slate-400 max-w-sm">
                Gõ tin nhắn, chia sẻ tệp hoặc nhắc tên đồng nghiệp bằng cú pháp @
                để cộng tác nhanh chóng.
              </p>
            </div>
          ) : (
            groupedMessages.map((group, groupIdx) => (
              <div key={groupIdx} className="space-y-3">
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
                {group.items.map((msg) => {
                  const timeStr = new Date(msg.createdAt).toLocaleTimeString(
                    "vi-VN",
                    {
                      hour: "2-digit",
                      minute: "2-digit",
                    }
                  );

                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex gap-2.5 max-w-[85%] sm:max-w-[75%]",
                        msg.isMine ? "ml-auto flex-row-reverse" : "mr-auto"
                      )}
                    >
                      {/* Avatar for other people */}
                      {!msg.isMine && (
                        <div className="shrink-0 mt-1">
                          {msg.author?.avatar_url ? (
                            <img
                              src={msg.author.avatar_url}
                              alt={msg.author.full_name}
                              className="h-7 w-7 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">
                              {getInitials(msg.author?.full_name || "AB")}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex flex-col min-w-0">
                        {/* Author name for received messages */}
                        {!msg.isMine && (
                          <div className="flex items-center gap-1.5 mb-1 pl-1">
                            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                              {msg.author?.full_name || "Đồng nghiệp"}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {timeStr}
                            </span>
                          </div>
                        )}

                        {/* Bubble */}
                        <div
                          className={cn(
                            "rounded-2xl px-3.5 py-2.5 text-xs shadow-xs break-words",
                            msg.isMine
                              ? "bg-brand text-white rounded-tr-xs"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-tl-xs"
                          )}
                        >
                          {/* Text content with mentions */}
                          <div className="whitespace-pre-wrap leading-relaxed">
                            {renderContentWithMentions(msg.content, allProfiles)}
                          </div>

                          {/* Attachment preview if exists */}
                          {msg.attachmentUrl && (
                            <div className="mt-2.5 pt-2 border-t border-black/10 dark:border-white/10">
                              {msg.attachmentUrl.match(/\.(jpeg|jpg|png|gif|webp)$/i) ? (
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

                        {/* Time & Read check for sent messages */}
                        {msg.isMine && (
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

        {/* Input Bar */}
        <div className="border-t border-slate-200 dark:border-slate-800 p-3 bg-white dark:bg-slate-900 shrink-0">
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
            {/* Hidden file input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* Attachment Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isSending}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 transition cursor-pointer"
              title="Đính kèm tệp hoặc ảnh"
            >
              <Paperclip className="h-4 w-4" />
            </button>

            {/* Mention Textarea */}
            <div className="flex-1 min-w-0">
              <MentionTextarea
                profiles={allProfiles}
                value={inputText}
                onChange={setInputText}
                placeholder={
                  activeTab === "direct"
                    ? `Gửi tin nhắn cho ${activeUser?.full_name || "đồng nghiệp"}... (@ để nhắc tên)`
                    : `Nhắn vào kênh ${activeDept?.name || "phòng ban"}... (@ để nhắc tên)`
                }
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:bg-slate-900"
              />
            </div>

            {/* Send Button */}
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
              title="Gửi (Enter)"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
