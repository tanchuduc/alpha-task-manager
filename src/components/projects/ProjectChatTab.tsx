"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Project, ProjectMessage } from "@/types/database";
import {
  MentionTextarea,
  renderContentWithMentions,
  extractMentionedUserIds,
} from "@/components/common/MentionAutocomplete";
import {
  ConvertMessageToTaskModal,
  type SourceChatMessage,
} from "@/components/chat/ConvertMessageToTaskModal";
import { TaskCardMessage } from "@/components/chat/TaskCardMessage";
import {
  Send,
  MessageSquare,
  Paperclip,
  Smile,
  Reply,
  Pin,
  Pencil,
  Trash2,
  CheckCheck,
  CheckSquare,
  X,
  FileText,
  Image as ImageIcon,
  Search,
  PinOff,
  CornerDownRight,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import { toast } from "sonner";

interface ProjectChatTabProps {
  project: Project;
  currentUser: Profile;
  allProfiles: Profile[];
  onTaskCreated?: () => void;
}

const QUICK_REACTIONS = [
  { emoji: "👍", label: "Đồng ý" },
  { emoji: "❤️", label: "Tuyệt vời" },
  { emoji: "🎉", label: "Chúc mừng" },
  { emoji: "🚀", label: "Triển khai" },
  { emoji: "👀", label: "Đã xem" },
];

export function ProjectChatTab({
  project,
  currentUser,
  allProfiles,
  onTaskCreated,
}: ProjectChatTabProps) {
  const supabase = useMemo(() => createClient(), []);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isSendingRef = useRef(false);

  // Messages state
  const [messages, setMessages] = useState<ProjectMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);

  // Input state
  const [inputText, setInputText] = useState("");
  const [pendingFile, setPendingFile] = useState<{
    file: File;
    previewUrl?: string;
    isImage: boolean;
  } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Action states
  const [replyingTo, setReplyingTo] = useState<ProjectMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ProjectMessage | null>(
    null
  );
  const [convertingMessage, setConvertingMessage] =
    useState<SourceChatMessage | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  // Load project messages
  useEffect(() => {
    let isMounted = true;
    async function loadMessages() {
      setLoading(true);
      const { data, error } = await supabase
        .from("project_messages")
        .select("*, author:profiles!project_messages_author_id_fkey(*)")
        .eq("project_id", project.id)
        .order("created_at", { ascending: false })
        .limit(200);

      if (isMounted) {
        if (!error && data) {
          const uniqueMap = new Map<string, ProjectMessage>();
          (data as ProjectMessage[])
            .reverse()
            .forEach((m) => uniqueMap.set(m.id, m));
          setMessages(Array.from(uniqueMap.values()));
        }
        setLoading(false);
      }

      // Mark read
      await supabase.from("project_chat_read_states").upsert(
        {
          project_id: project.id,
          user_id: currentUser.id,
          last_read_at: new Date().toISOString(),
        },
        { onConflict: "project_id,user_id" }
      );
    }

    loadMessages();
    return () => {
      isMounted = false;
    };
  }, [project.id, currentUser.id, supabase]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`project-chat-${project.id}-${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "alpha_lite",
          table: "project_messages",
          filter: `project_id=eq.${project.id}`,
        },
        (payload) => {
          const newPM = payload.new as ProjectMessage;
          const author = allProfiles.find((p) => p.id === newPM.author_id);
          const enriched: ProjectMessage = { ...newPM, author };

          setMessages((prev) => {
            if (prev.some((m) => m.id === enriched.id)) return prev;
            return [...prev, enriched];
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "alpha_lite",
          table: "project_messages",
          filter: `project_id=eq.${project.id}`,
        },
        (payload) => {
          const updated = payload.new as ProjectMessage;
          setMessages((prev) =>
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
      supabase.removeChannel(channel);
    };
  }, [project.id, allProfiles, supabase]);

  // Auto-scroll
  useEffect(() => {
    if (!loading) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, loading]);

  // Map by id for parent lookup
  const messageById = useMemo(() => {
    const map = new Map<string, ProjectMessage>();
    messages.forEach((m) => map.set(m.id, m));
    return map;
  }, [messages]);

  // Filtered messages
  const filteredMessages = useMemo(() => {
    return messages.filter((m) => {
      if (showPinnedOnly && !m.is_pinned) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const contentMatch = (m.content || "").toLowerCase().includes(q);
        const authorMatch = (m.author?.full_name || "")
          .toLowerCase()
          .includes(q);
        return contentMatch || authorMatch;
      }
      return true;
    });
  }, [messages, showPinnedOnly, searchQuery]);

  // File handling
  const handleAttach = (file: File) => {
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Tệp quá lớn. Vui lòng chọn tệp dưới 25MB.");
      return;
    }
    const isImage = file.type.startsWith("image/");
    const previewUrl = URL.createObjectURL(file);
    setPendingFile({ file, previewUrl, isImage });
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          handleAttach(file);
          toast.info("Đã dán ảnh đính kèm");
          break;
        }
      }
    }
  };

  const uploadFile = async (file: File) => {
    try {
      setIsUploading(true);
      const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `projects/${project.id}/${Date.now()}_${cleanName}`;
      const { error } = await supabase.storage
        .from("chat_attachments")
        .upload(path, file);
      if (error) throw error;
      const {
        data: { publicUrl },
      } = supabase.storage.from("chat_attachments").getPublicUrl(path);
      return { url: publicUrl, name: file.name };
    } catch {
      toast.error("Tải tệp lên thất bại.");
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  // Send message
  const handleSendMessage = async () => {
    if (isSendingRef.current) return;
    const trimmed = inputText.trim();

    if (editingMessage) {
      if (!trimmed) {
        toast.error("Nội dung không được để trống.");
        return;
      }
      isSendingRef.current = true;
      setIsSending(true);
      try {
        const nowIso = new Date().toISOString();
        const { error } = await supabase
          .from("project_messages")
          .update({ content: trimmed, edited_at: nowIso })
          .eq("id", editingMessage.id);
        if (error) throw error;

        setMessages((prev) =>
          prev.map((m) =>
            m.id === editingMessage.id
              ? { ...m, content: trimmed, edited_at: nowIso }
              : m
          )
        );
        setEditingMessage(null);
        setInputText("");
        toast.success("Đã cập nhật tin nhắn.");
      } catch {
        toast.error("Không thể sửa tin nhắn.");
      } finally {
        isSendingRef.current = false;
        setIsSending(false);
      }
      return;
    }

    if (!trimmed && !pendingFile) return;

    isSendingRef.current = true;
    setIsSending(true);

    try {
      let attachmentUrl: string | null = null;
      let attachmentName: string | null = null;

      if (pendingFile) {
        const res = await uploadFile(pendingFile.file);
        if (res) {
          attachmentUrl = res.url;
          attachmentName = res.name;
        }
        if (pendingFile.previewUrl) URL.revokeObjectURL(pendingFile.previewUrl);
        setPendingFile(null);
      }

      const { data: inserted, error } = await supabase
        .from("project_messages")
        .insert({
          project_id: project.id,
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

      if (inserted) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === inserted.id)) return prev;
          return [...prev, inserted as ProjectMessage];
        });
      }

      // Notify mentioned users
      const mentionedIds = extractMentionedUserIds(
        trimmed,
        allProfiles
      ).filter((id) => id !== currentUser.id);

      if (mentionedIds.length > 0) {
        const notifs = mentionedIds.map((uid) => ({
          user_id: uid,
          actor_id: currentUser.id,
          type: "task_mentioned" as const,
          title: `${currentUser.full_name} đã nhắc bạn trong trò chuyện dự án ${project.name}`,
          body: trimmed.slice(0, 100),
          link: `/projects/${project.id}?view=chat`,
          is_read: false,
        }));
        await supabase.from("notifications").insert(notifs);
      }

      setInputText("");
      setReplyingTo(null);
    } catch {
      toast.error("Không thể gửi tin nhắn.");
    } finally {
      isSendingRef.current = false;
      setIsSending(false);
    }
  };

  // Reactions
  const handleToggleReaction = async (msg: ProjectMessage, emoji: string) => {
    const reactions = { ...(msg.reactions || {}) };
    const userList = reactions[emoji] || [];
    const hasReacted = userList.includes(currentUser.id);

    if (hasReacted) {
      reactions[emoji] = userList.filter((id) => id !== currentUser.id);
      if (reactions[emoji].length === 0) delete reactions[emoji];
    } else {
      reactions[emoji] = [...userList, currentUser.id];
    }

    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, reactions } : m))
    );

    await supabase
      .from("project_messages")
      .update({ reactions })
      .eq("id", msg.id);
  };

  // Toggle Pin
  const handleTogglePin = async (msg: ProjectMessage) => {
    const nextPin = !msg.is_pinned;
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, is_pinned: nextPin } : m))
    );
    await supabase
      .from("project_messages")
      .update({ is_pinned: nextPin })
      .eq("id", msg.id);
    toast.info(nextPin ? "Đã ghim tin nhắn" : "Đã bỏ ghim");
  };

  // Unsend message
  const handleUnsend = async (msg: ProjectMessage) => {
    if (msg.author_id !== currentUser.id) return;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msg.id ? { ...m, is_deleted: true, is_pinned: false } : m
      )
    );
    await supabase
      .from("project_messages")
      .update({ is_deleted: true, is_pinned: false })
      .eq("id", msg.id);
    toast.success("Đã thu hồi tin nhắn.");
  };

  const jumpToMessage = (id: string) => {
    setHighlightedId(id);
    const el = document.getElementById(`proj-msg-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setTimeout(() => setHighlightedId(null), 2500);
  };

  return (
    <div className="flex h-[calc(100vh-220px)] min-h-[500px] flex-col rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-[#2a2a2a] dark:bg-[#181818] overflow-hidden">
      {/* 1. Header Toolbar */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 dark:border-[#2a2a2a] bg-slate-50/50 dark:bg-[#141414]/50">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-soft text-brand font-bold text-xs dark:bg-brand-soft-dark">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              Trò chuyện Dự án: {project.name}
              <span className="rounded-full bg-emerald-100 px-2 py-0.2 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                Live
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              {messages.length} tin nhắn trao đổi trong dự án
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm tin nhắn..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-44 sm:w-56 rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none dark:border-[#303030] dark:bg-[#202020] dark:text-slate-200"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowPinnedOnly((prev) => !prev)}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium transition cursor-pointer",
              showPinnedOnly
                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                : "border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-[#303030] dark:text-slate-300 dark:hover:bg-[#222]"
            )}
          >
            <Pin className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Đã ghim</span>
          </button>

          <Link
            href={`/chat?project=${project.id}`}
            title="Mở toàn màn hình trong Chat Center"
            className="flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium border border-slate-200 bg-white text-slate-700 hover:text-brand hover:border-brand/40 dark:border-[#303030] dark:bg-[#202020] dark:text-slate-300 dark:hover:text-brand transition shadow-2xs"
          >
            <MessageSquare className="h-3.5 w-3.5 text-brand" />
            <span className="hidden sm:inline">Chat Center</span>
            <ExternalLink className="h-3 w-3 opacity-60" />
          </Link>
        </div>
      </div>

      {/* 2. Messages Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex h-full items-center justify-center text-xs text-slate-400 animate-pulse">
            Đang tải dữ liệu trò chuyện...
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center p-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand mb-2 dark:bg-brand-soft-dark">
              <Sparkles className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Chưa có tin nhắn trong dự án
            </h4>
            <p className="mt-1 text-xs text-slate-400 max-w-sm">
              Hãy gửi tin nhắn đầu tiên, nhắc tên @đồng nghiệp hoặc dán ảnh
              (Ctrl+V) để trao đổi công việc nhanh.
            </p>
          </div>
        ) : (
          filteredMessages.map((msg) => {
            const isMine = msg.author_id === currentUser.id;
            const parentMsg = msg.reply_to_id
              ? messageById.get(msg.reply_to_id)
              : null;
            const reactionEntries = Object.entries(msg.reactions || {}).filter(
              ([, uids]) => Array.isArray(uids) && uids.length > 0
            );

            return (
              <div
                key={msg.id}
                id={`proj-msg-${msg.id}`}
                className={cn(
                  "group relative flex gap-2.5 max-w-[85%] rounded-2xl transition-colors duration-500",
                  isMine ? "ml-auto flex-row-reverse" : "mr-auto",
                  highlightedId === msg.id &&
                    "ring-2 ring-brand bg-brand-soft/30 p-1"
                )}
              >
                {/* Avatar */}
                {!isMine && (
                  <div className="w-7 shrink-0 mt-0.5">
                    {msg.author?.avatar_url ? (
                      <img
                        src={msg.author.avatar_url}
                        alt={msg.author.full_name}
                        className="h-7 w-7 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-300 text-[10px] font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                        {getInitials(msg.author?.full_name || "U")}
                      </div>
                    )}
                  </div>
                )}

                {/* Bubble */}
                <div className="min-w-0">
                  {!isMine && (
                    <p className="mb-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      {msg.author?.full_name || "Thành viên"}
                    </p>
                  )}

                  {/* Quoted parent */}
                  {parentMsg && (
                    <button
                      type="button"
                      onClick={() => jumpToMessage(parentMsg.id)}
                      className="mb-1 flex items-center gap-1.5 rounded-lg bg-slate-100/90 dark:bg-slate-800/90 px-2.5 py-1 text-[11px] text-slate-600 dark:text-slate-300 border-l-2 border-brand hover:opacity-80 transition cursor-pointer text-left w-full truncate"
                    >
                      <CornerDownRight className="h-3 w-3 text-brand shrink-0" />
                      <span className="font-semibold text-slate-700 dark:text-slate-200 shrink-0">
                        {parentMsg.author?.full_name || "Đồng nghiệp"}:
                      </span>
                      <span className="truncate">
                        {parentMsg.is_deleted
                          ? "Tin nhắn đã thu hồi"
                          : parentMsg.content}
                      </span>
                    </button>
                  )}

                  <div
                    className={cn(
                      "relative rounded-2xl px-3.5 py-2 text-xs leading-relaxed shadow-2xs break-words",
                      isMine
                        ? "bg-brand text-white rounded-tr-xs"
                        : "bg-slate-100 text-slate-900 dark:bg-[#222] dark:text-slate-100 rounded-tl-xs"
                    )}
                  >
                    {msg.is_pinned && (
                      <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-amber-500 dark:text-amber-400">
                        <Pin className="h-3 w-3 fill-amber-500" />
                        <span>Đã ghim</span>
                      </div>
                    )}

                    {msg.is_deleted ? (
                      <span className="italic opacity-60">
                        Tin nhắn này đã được thu hồi
                      </span>
                    ) : (
                      <>
                        {(() => {
                          const taskCardMatch = msg.content
                            ? msg.content.match(
                                /\[(Tạo việc thành công|Thẻ công việc):\s*([^\]]+)\]\(([^)]+)\)/
                              )
                            : null;

                          if (taskCardMatch) {
                            const [fullMatch, cardType, taskTitle, taskUrl] =
                              taskCardMatch;
                            const preText = msg.content
                              .replace(fullMatch, "")
                              .trim();
                            const urlMatch = taskUrl.match(
                              /\/projects\/([^?]+)\?task=([^&#]+)/
                            );
                            const projectId = urlMatch ? urlMatch[1] : project.id;
                            const taskId = urlMatch ? urlMatch[2] : "task";

                            return (
                              <div className="space-y-1.5 text-slate-800 dark:text-slate-100">
                                {preText && (
                                  <div className={cn(isMine && "text-white")}>
                                    {renderContentWithMentions(
                                      preText,
                                      allProfiles,
                                      { isInverse: isMine }
                                    )}
                                  </div>
                                )}
                                <TaskCardMessage
                                  task={{
                                    id: taskId,
                                    title: taskTitle,
                                    projectId,
                                    projectName: project.name,
                                    statusName:
                                      cardType === "Tạo việc thành công"
                                        ? "Mới tạo"
                                        : "Đang mở",
                                    statusCategory: "doing",
                                    taskUrl,
                                  }}
                                />
                              </div>
                            );
                          }

                          return (
                            <div className="whitespace-pre-wrap">
                              {renderContentWithMentions(msg.content, allProfiles, {
                                isInverse: isMine,
                              })}
                            </div>
                          );
                        })()}

                        {/* Attachment */}
                        {msg.attachment_url && (
                          <div className="mt-2">
                            {/\.(jpe?g|png|webp|gif)$/i.test(
                              msg.attachment_name || ""
                            ) ? (
                              <a
                                href={msg.attachment_url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <img
                                  src={msg.attachment_url}
                                  alt="Ảnh đính kèm"
                                  className="max-h-60 rounded-xl border border-white/20 object-cover hover:opacity-95 transition"
                                />
                              </a>
                            ) : (
                              <a
                                href={msg.attachment_url}
                                target="_blank"
                                rel="noreferrer"
                                className={cn(
                                  "inline-flex items-center gap-2 rounded-xl border p-2 text-xs transition",
                                  isMine
                                    ? "border-white/20 bg-white/10 text-white hover:bg-white/20"
                                    : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                )}
                              >
                                <FileText className="h-4 w-4 shrink-0" />
                                <span className="truncate max-w-[200px]">
                                  {msg.attachment_name || "Tệp đính kèm"}
                                </span>
                              </a>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    <div
                      className={cn(
                        "mt-1 flex items-center justify-end gap-1.5 text-[10px]",
                        isMine ? "text-white/75" : "text-slate-400"
                      )}
                    >
                      {msg.edited_at && <span>(đã sửa)</span>}
                      <span>
                        {new Date(msg.created_at).toLocaleTimeString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>

                  {/* Reactions Display */}
                  {reactionEntries.length > 0 && !msg.is_deleted && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {reactionEntries.map(([emoji, uids]) => {
                        const hasMine = uids.includes(currentUser.id);
                        return (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => handleToggleReaction(msg, emoji)}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border transition cursor-pointer",
                              hasMine
                                ? "border-brand bg-brand-soft text-brand dark:bg-brand-soft-dark"
                                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                            )}
                          >
                            <span>{emoji}</span>
                            <span>{uids.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Hover Toolbar */}
                {!msg.is_deleted && (
                  <div
                    className={cn(
                      "absolute top-0 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5 rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-800 z-10",
                      isMine ? "left-0 -translate-x-full mr-2" : "right-0 translate-x-full ml-2"
                    )}
                  >
                    {/* Reactions */}
                    {QUICK_REACTIONS.map(({ emoji, label }) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => handleToggleReaction(msg, emoji)}
                        title={label}
                        className="flex h-6 w-6 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-xs transition"
                      >
                        {emoji}
                      </button>
                    ))}

                    <div className="h-3 w-px bg-slate-200 dark:bg-slate-700 mx-0.5" />

                    {/* Reply */}
                    <button
                      type="button"
                      onClick={() => setReplyingTo(msg)}
                      title="Trả lời"
                      className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                    >
                      <Reply className="h-3.5 w-3.5" />
                    </button>

                    {/* Pin */}
                    <button
                      type="button"
                      onClick={() => handleTogglePin(msg)}
                      title={msg.is_pinned ? "Bỏ ghim" : "Ghim tin nhắn"}
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-lg transition",
                        msg.is_pinned
                          ? "text-amber-500 hover:bg-amber-50"
                          : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                      )}
                    >
                      {msg.is_pinned ? (
                        <PinOff className="h-3.5 w-3.5" />
                      ) : (
                        <Pin className="h-3.5 w-3.5" />
                      )}
                    </button>

                    {/* Convert to Task (1-click) */}
                    <button
                      type="button"
                      onClick={() =>
                        setConvertingMessage({
                          id: msg.id,
                          content: msg.content,
                          authorId: msg.author_id,
                          authorName: msg.author?.full_name || "Thành viên",
                          createdAt: msg.created_at,
                          attachmentUrl: msg.attachment_url,
                          attachmentName: msg.attachment_name,
                        })
                      }
                      title="Chuyển thành công việc"
                      className="flex h-6 w-6 items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50"
                    >
                      <CheckSquare className="h-3.5 w-3.5" />
                    </button>

                    {/* Edit & Unsend for author */}
                    {isMine && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingMessage(msg);
                            setInputText(msg.content);
                          }}
                          title="Sửa tin nhắn"
                          className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUnsend(msg)}
                          title="Thu hồi tin nhắn"
                          className="flex h-6 w-6 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 3. Input Action Container */}
      <div className="border-t border-slate-200 bg-slate-50/70 p-3 dark:border-[#2a2a2a] dark:bg-[#151515]">
        {/* Reply Preview */}
        {replyingTo && (
          <div className="mb-2 flex items-center justify-between rounded-xl bg-slate-200/70 px-3 py-1.5 text-xs dark:bg-slate-800">
            <div className="flex items-center gap-1.5 truncate">
              <Reply className="h-3.5 w-3.5 text-brand shrink-0" />
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Trả lời {replyingTo.author?.full_name || "đồng nghiệp"}:
              </span>
              <span className="truncate text-slate-500 dark:text-slate-400">
                {replyingTo.content}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Editing Preview */}
        {editingMessage && (
          <div className="mb-2 flex items-center justify-between rounded-xl bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50">
            <div className="flex items-center gap-1.5">
              <Pencil className="h-3.5 w-3.5 shrink-0" />
              <span className="font-semibold">Đang sửa tin nhắn</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingMessage(null);
                setInputText("");
              }}
              className="text-amber-600 hover:text-amber-900 dark:hover:text-amber-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Pending File Preview */}
        {pendingFile && (
          <div className="mb-2 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-2 text-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 truncate">
              {pendingFile.isImage && pendingFile.previewUrl ? (
                <img
                  src={pendingFile.previewUrl}
                  alt="preview"
                  className="h-8 w-8 rounded-lg object-cover"
                />
              ) : (
                <FileText className="h-6 w-6 text-brand" />
              )}
              <span className="truncate font-medium text-slate-800 dark:text-slate-200">
                {pendingFile.file.name}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                if (pendingFile.previewUrl)
                  URL.revokeObjectURL(pendingFile.previewUrl);
                setPendingFile(null);
              }}
              className="text-slate-400 hover:text-red-500"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Input Controls */}
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleAttach(f);
            }}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSending || isUploading}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 cursor-pointer disabled:opacity-50"
            title="Đính kèm tệp/ảnh"
          >
            <Paperclip className="h-4 w-4" />
          </button>

          <div className="flex-1 min-w-0">
            <MentionTextarea
              profiles={allProfiles}
              value={inputText}
              onChange={setInputText}
              onPaste={handlePaste}
              dropdownPlacement="top"
              placeholder={`Nhắn trong dự án ${project.name}... (@ để tag tên thành viên, Ctrl+V dán ảnh)`}
              rows={1}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <button
            type="button"
            onClick={handleSendMessage}
            disabled={isSending || isUploading || (!inputText.trim() && !pendingFile)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-white shadow-xs hover:bg-brand/90 transition cursor-pointer disabled:opacity-50"
            title="Gửi tin nhắn"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 4. Convert Message to Task Modal */}
      {convertingMessage && (
        <ConvertMessageToTaskModal
          message={convertingMessage}
          currentUser={currentUser}
          allProfiles={allProfiles}
          projects={[project]}
          defaultAssigneeId={
            convertingMessage.authorId !== currentUser.id
              ? convertingMessage.authorId
              : null
          }
          onClose={() => setConvertingMessage(null)}
          onTaskCreated={(info) => {
            setConvertingMessage(null);
            toast.success(`Đã tạo công việc "${info.taskTitle}" từ tin nhắn!`);
            onTaskCreated?.();
          }}
        />
      )}
    </div>
  );
}
export default ProjectChatTab;
