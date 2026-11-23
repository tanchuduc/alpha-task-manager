"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import type { Profile } from "@/types/database";
import type {
  UnifiedConversationItem,
  UnifiedMessageItem,
} from "@/lib/chat/useUnifiedChat";
import { cn, getInitials } from "@/lib/utils";
import {
  MentionTextarea,
  renderContentWithMentions,
} from "@/components/common/MentionAutocomplete";
import type { SourceChatMessage } from "@/components/chat/ConvertMessageToTaskModal";
import { TaskCardMessage } from "@/components/chat/TaskCardMessage";
import {
  Send,
  MessageSquare,
  Paperclip,
  Image as ImageIcon,
  Smile,
  X,
  FileText,
  Download,
  Reply,
  Pin,
  Pencil,
  Trash2,
  CheckSquare,
  ArrowLeft,
  ExternalLink,
  FolderKanban,
  Info,
  Search,
  Sparkles,
  Tag,
  Check,
  CheckCheck,
  ChevronUp,
  ChevronDown,
  MessagesSquare,
} from "lucide-react";
import { toast } from "sonner";
import { MediaLightboxModal } from "@/components/chat/MediaLightboxModal";

interface ChatMessageAreaProps {
  conversation: UnifiedConversationItem | null;
  messages: UnifiedMessageItem[];
  currentUser: Profile;
  allProfiles: Profile[];
  loadingMessages: boolean;
  typingUser: string | null;
  isOnline?: boolean;
  onSendMessage: (
    content: string,
    options?: {
      attachmentUrl?: string | null;
      attachmentName?: string | null;
      replyToId?: string | null;
    }
  ) => Promise<void>;
  onEditMessage: (id: string, newContent: string) => Promise<void>;
  onUnsendMessage: (id: string) => Promise<void>;
  onToggleReaction: (msg: UnifiedMessageItem, emoji: string) => Promise<void>;
  onTogglePin: (msg: UnifiedMessageItem) => Promise<void>;
  onBroadcastTyping: () => void;
  onConvertToTask?: (msg: SourceChatMessage) => void;
  onOpenThread?: (msg: UnifiedMessageItem) => void;
  onOpenContextPanel?: () => void;
  showContextPanelToggle?: boolean;
  onBackToList?: () => void;
  className?: string;
}

const QUICK_REACTIONS = [
  { emoji: "👍", label: "Đồng ý" },
  { emoji: "❤️", label: "Yêu thích" },
  { emoji: "😂", label: "Haha" },
  { emoji: "🎉", label: "Chúc mừng" },
  { emoji: "🔥", label: "Tuyệt vời" },
  { emoji: "👀", label: "Đang xem" },
];

export function ChatMessageArea({
  conversation,
  messages,
  currentUser,
  allProfiles,
  loadingMessages,
  typingUser,
  isOnline,
  onSendMessage,
  onEditMessage,
  onUnsendMessage,
  onToggleReaction,
  onTogglePin,
  onBroadcastTyping,
  onConvertToTask,
  onOpenThread,
  onOpenContextPanel,
  showContextPanelToggle = true,
  onBackToList,
  className,
}: ChatMessageAreaProps) {
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Input & pending attachment states
  const [inputText, setInputText] = useState("");
  const [pendingFile, setPendingFile] = useState<{
    file: File;
    previewUrl?: string;
    isImage: boolean;
  } | null>(null);
  const [isSending, setIsSending] = useState(false);

  // Action states: Reply, Edit, Quick Emoji popover
  const [replyingTo, setReplyingTo] = useState<UnifiedMessageItem | null>(null);
  const [editingMessage, setEditingMessage] = useState<UnifiedMessageItem | null>(
    null
  );
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const [showPinnedQuickBar, setShowPinnedQuickBar] = useState(true);

  // In-Conversation Search & Lightbox state
  const [showInChatSearch, setShowInChatSearch] = useState(false);
  const [inChatSearchQuery, setInChatSearchQuery] = useState("");
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const inChatSearchInputRef = useRef<HTMLInputElement>(null);
  const [lightboxImage, setLightboxImage] = useState<{
    url: string;
    name?: string | null;
  } | null>(null);

  // Matching messages for in-chat search
  const searchMatches = useMemo(() => {
    const q = inChatSearchQuery.trim().toLowerCase();
    if (!q) return [];
    return messages.filter(
      (m) => !m.isDeleted && m.content.toLowerCase().includes(q)
    );
  }, [messages, inChatSearchQuery]);

  const handleNextMatch = () => {
    if (searchMatches.length === 0) return;
    const nextIdx = (searchMatchIndex + 1) % searchMatches.length;
    setSearchMatchIndex(nextIdx);
    scrollToMessage(searchMatches[nextIdx].id);
  };

  const handlePrevMatch = () => {
    if (searchMatches.length === 0) return;
    const prevIdx =
      (searchMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    setSearchMatchIndex(prevIdx);
    scrollToMessage(searchMatches[prevIdx].id);
  };

  // Auto-scroll on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, loadingMessages]);

  // Reset reply/edit when switching conversations
  useEffect(() => {
    setReplyingTo(null);
    setEditingMessage(null);
    setInputText("");
    setPendingFile(null);
  }, [conversation?.id]);

  // Pinned messages list
  const pinnedMessages = useMemo(
    () => messages.filter((m) => m.isPinned && !m.isDeleted),
    [messages]
  );

  // Scroll to a specific message
  const scrollToMessage = (msgId: string) => {
    const el = document.getElementById(`unified-msg-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedMsgId(msgId);
      setTimeout(() => setHighlightedMsgId(null), 2500);
    }
  };

  // File handlers
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      toast.error("Tệp quá lớn. Vui lòng chọn tệp nhỏ hơn 25MB.");
      return;
    }

    const isImage = file.type.startsWith("image/");
    const previewUrl = isImage ? URL.createObjectURL(file) : undefined;
    setPendingFile({ file, previewUrl, isImage });
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
          const pastedFile = new File(
            [blob],
            `pasted_image_${Date.now()}.${ext}`,
            { type: blob.type }
          );
          const previewUrl = URL.createObjectURL(pastedFile);
          setPendingFile({ file: pastedFile, previewUrl, isImage: true });
          toast.info("Đã đính kèm ảnh từ Clipboard");
          break;
        }
      }
    }
  };

  const removePendingFile = () => {
    if (pendingFile?.previewUrl) {
      URL.revokeObjectURL(pendingFile.previewUrl);
    }
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Send message
  const handleSend = async () => {
    if (isSending) return;
    const trimmed = inputText.trim();

    // If Editing
    if (editingMessage) {
      if (!trimmed) {
        toast.error("Nội dung tin nhắn không được để trống.");
        return;
      }
      setIsSending(true);
      try {
        await onEditMessage(editingMessage.id, trimmed);
        setEditingMessage(null);
        setInputText("");
      } finally {
        setIsSending(false);
      }
      return;
    }

    if (!trimmed && !pendingFile) return;

    setIsSending(true);
    try {
      let attachmentUrl: string | null = null;
      let attachmentName: string | null = null;

      if (pendingFile) {
        // Upload simulation / URL assignment
        attachmentName = pendingFile.file.name;
        attachmentUrl = pendingFile.previewUrl || null;
        removePendingFile();
      }

      await onSendMessage(trimmed, {
        attachmentUrl,
        attachmentName,
        replyToId: replyingTo?.id || null,
      });

      setInputText("");
      setReplyingTo(null);
    } catch {
      // Toast already handled
    } finally {
      setIsSending(false);
    }
  };

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const groups: { dateLabel: string; items: UnifiedMessageItem[] }[] = [];
    const todayStr = new Date().toDateString();
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toDateString();

    messages.forEach((msg) => {
      const msgDate = new Date(msg.createdAt);
      const msgDateStr = msgDate.toDateString();

      let dateLabel = msgDate.toLocaleDateString("vi-VN", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });

      if (msgDateStr === todayStr) dateLabel = "Hôm nay";
      else if (msgDateStr === yesterdayStr) dateLabel = "Hôm qua";

      const existing = groups.find((g) => g.dateLabel === dateLabel);
      if (existing) existing.items.push(msg);
      else groups.push({ dateLabel, items: [msg] });
    });

    return groups;
  }, [messages]);

  if (!conversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 bg-white dark:bg-slate-900">
        <div className="h-14 w-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3 text-slate-400">
          <MessageSquare className="h-7 w-7" />
        </div>
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Chưa chọn cuộc trò chuyện
        </h3>
        <p className="text-xs text-slate-400 max-w-sm mt-1">
          Chọn một người đồng nghiệp hoặc một dự án từ danh sách bên trái để bắt đầu thảo luận.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex-1 flex flex-col h-full bg-white dark:bg-slate-900 overflow-hidden relative",
        className
      )}
    >
      {/* ====================================================================
       * 1. CONVERSATION HEADER
       * ==================================================================== */}
      <header className="h-15 border-b border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between shrink-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3 min-w-0">
          {onBackToList && (
            <button
              type="button"
              onClick={onBackToList}
              className="md:hidden flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}

          {/* Avatar */}
          <div className="relative shrink-0">
            {conversation.avatarUrl ? (
              <img
                src={conversation.avatarUrl}
                alt={conversation.title}
                className="h-9 w-9 rounded-full object-cover border border-slate-200 dark:border-slate-700"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs">
                {getInitials(conversation.title)}
              </div>
            )}
            {isOnline && (
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-slate-900 bg-emerald-500" />
            )}
          </div>

          {/* Name & Subtitle */}
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate flex items-center gap-1.5">
              {conversation.title}
              {conversation.type === "project" && (
                <span className="rounded-md bg-indigo-50 dark:bg-indigo-950/50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
                  Dự án
                </span>
              )}
              {conversation.type === "group" && (
                <span className="rounded-md bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                  Nhóm
                </span>
              )}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {typingUser ? (
                <span className="text-brand font-medium animate-pulse">
                  {typingUser} đang nhập tin nhắn...
                </span>
              ) : isOnline ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  Đang trực tuyến
                </span>
              ) : (
                conversation.description || "Cuộc trò chuyện bảo mật"
              )}
            </p>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-1.5">
          {conversation.type === "project" && conversation.projectId && (
            <Link
              href={`/projects/${conversation.projectId}`}
              title="Xem chi tiết dự án"
              className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-brand dark:hover:text-brand border border-slate-200 dark:border-slate-700 hover:border-brand/40 transition"
            >
              <FolderKanban className="h-3.5 w-3.5 text-brand" />
              <span className="hidden sm:inline">Xem dự án</span>
              <ExternalLink className="h-3 w-3 opacity-60" />
            </Link>
          )}

          {/* Search in conversation */}
          <button
            type="button"
            onClick={() => {
              setShowInChatSearch((p) => !p);
              if (!showInChatSearch) {
                setTimeout(() => inChatSearchInputRef.current?.focus(), 100);
              }
            }}
            title="Tìm kiếm trong cuộc trò chuyện"
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg transition",
              showInChatSearch
                ? "bg-brand/10 text-brand"
                : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
            )}
          >
            <Search className="h-4 w-4" />
          </button>

          {pinnedMessages.length > 0 && (
            <button
              type="button"
              onClick={() => setShowPinnedQuickBar((p) => !p)}
              title="Xem tin đã ghim"
              className={cn(
                "flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition border cursor-pointer",
                showPinnedQuickBar
                  ? "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800"
                  : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700"
              )}
            >
              <Pin className="h-3.5 w-3.5" />
              <span className="font-semibold">{pinnedMessages.length}</span>
            </button>
          )}

          {showContextPanelToggle && onOpenContextPanel && (
            <button
              type="button"
              onClick={onOpenContextPanel}
              title="Thông tin hội thoại"
              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition"
            >
              <Info className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {/* ====================================================================
       * IN-CHAT SEARCH BAR BANNER
       * ==================================================================== */}
      {showInChatSearch && (
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-4 py-2 text-xs shrink-0 z-10 animate-in slide-in-from-top-1">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <input
              ref={inChatSearchInputRef}
              type="text"
              placeholder="Tìm nội dung tin nhắn trong cuộc trò chuyện này..."
              value={inChatSearchQuery}
              onChange={(e) => {
                setInChatSearchQuery(e.target.value);
                setSearchMatchIndex(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleNextMatch();
                if (e.key === "Escape") setShowInChatSearch(false);
              }}
              className="w-full bg-transparent text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {inChatSearchQuery && (
              <span className="text-[11px] text-slate-500 font-medium mr-1">
                {searchMatches.length > 0
                  ? `${searchMatchIndex + 1}/${searchMatches.length} kết quả`
                  : "Không tìm thấy"}
              </span>
            )}
            <button
              type="button"
              disabled={searchMatches.length === 0}
              onClick={handlePrevMatch}
              title="Kết quả trước"
              className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer text-slate-600 dark:text-slate-400 transition"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={searchMatches.length === 0}
              onClick={handleNextMatch}
              title="Kết quả tiếp theo"
              className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer text-slate-600 dark:text-slate-400 transition"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setShowInChatSearch(false);
                setInChatSearchQuery("");
              }}
              title="Đóng tìm kiếm (Esc)"
              className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 cursor-pointer transition"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ====================================================================
       * PINNED MESSAGES QUICK BANNER
       * ==================================================================== */}
      {pinnedMessages.length > 0 && showPinnedQuickBar && (
        <div className="bg-amber-50/90 dark:bg-amber-950/40 border-b border-amber-200/80 dark:border-amber-900/60 px-4 py-1.5 flex items-center justify-between text-xs text-amber-900 dark:text-amber-200 shrink-0">
          <div
            className="flex items-center gap-2 truncate cursor-pointer"
            onClick={() => scrollToMessage(pinnedMessages[pinnedMessages.length - 1].id)}
          >
            <Pin className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="font-semibold shrink-0">Tin đã ghim:</span>
            <span className="truncate text-[11px] text-amber-800 dark:text-amber-300">
              {pinnedMessages[pinnedMessages.length - 1].content}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowPinnedQuickBar(false)}
            className="text-amber-500 hover:text-amber-700 dark:hover:text-amber-300 p-0.5"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ====================================================================
       * 2. MESSAGE STREAM AREA
       * ==================================================================== */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {loadingMessages ? (
          <div className="flex items-center justify-center h-40 text-xs text-slate-400">
            Đang tải lịch sử trò chuyện...
          </div>
        ) : groupedMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center text-slate-400">
            <p className="text-xs">Chưa có tin nhắn nào trong cuộc trò chuyện này.</p>
            <p className="text-[11px] mt-1">Hãy gửi lời chào đầu tiên!</p>
          </div>
        ) : (
          groupedMessages.map((group, groupIdx) => (
            <div key={`${group.dateLabel}-${groupIdx}`} className="space-y-3">
              {/* Date Divider */}
              <div className="flex items-center justify-center my-3">
                <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400 shadow-2xs">
                  {group.dateLabel}
                </span>
              </div>

              {/* Messages in Group */}
              {group.items.map((msg, msgIdx) => {
                const prevMsg = msgIdx > 0 ? group.items[msgIdx - 1] : null;
                const isGroupedWithPrev =
                  prevMsg &&
                  prevMsg.senderId === msg.senderId &&
                  !msg.replyToId &&
                  Math.floor(
                    (new Date(msg.createdAt).getTime() -
                      new Date(prevMsg.createdAt).getTime()) /
                      1000
                  ) < 180;

                return (
                  <div
                    key={msg.id}
                    id={`unified-msg-${msg.id}`}
                    className={cn(
                      "group/msg relative flex gap-2.5 max-w-[85%] sm:max-w-[75%] rounded-2xl transition-colors duration-500",
                      msg.isMine ? "ml-auto flex-row-reverse" : "mr-auto",
                      highlightedMsgId === msg.id &&
                        "bg-orange-100/60 dark:bg-orange-950/50 p-1.5 -m-1.5"
                    )}
                  >
                    {/* Avatar */}
                    {!msg.isMine && (
                      <div className="shrink-0 w-8">
                        {!isGroupedWithPrev ? (
                          msg.senderAvatar ? (
                            <img
                              src={msg.senderAvatar}
                              alt={msg.senderName}
                              className="h-8 w-8 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                            />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs">
                              {getInitials(msg.senderName)}
                            </div>
                          )
                        ) : null}
                      </div>
                    )}

                    {/* Content Column */}
                    <div
                      className={cn(
                        "flex flex-col min-w-0",
                        msg.isMine ? "items-end" : "items-start"
                      )}
                    >
                      {/* Author Name */}
                      {!msg.isMine && !isGroupedWithPrev && (
                        <div className="flex items-center gap-1.5 mb-1 ml-1">
                          <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                            {msg.senderName}
                          </span>
                          {msg.senderJobTitle && (
                            <span className="text-[10px] text-slate-400">
                              • {msg.senderJobTitle}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Message Bubble Container */}
                      <div
                        className={cn(
                          "relative rounded-2xl px-3.5 py-2 text-xs shadow-2xs leading-relaxed",
                          msg.isDeleted
                            ? "bg-slate-100 dark:bg-slate-800/80 text-slate-400 italic border border-slate-200 dark:border-slate-700"
                            : msg.isMine
                              ? "bg-brand text-white rounded-br-xs"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-xs"
                        )}
                      >
                        {/* Quote Reply Banner */}
                        {msg.replyToMessage && !msg.isDeleted && (
                          <div
                            onClick={() =>
                              msg.replyToId && scrollToMessage(msg.replyToId)
                            }
                            className={cn(
                              "mb-1.5 cursor-pointer rounded-lg border-l-3 px-2 py-1 text-[11px] transition",
                              msg.isMine
                                ? "border-white/60 bg-white/10 text-white/90 hover:bg-white/20"
                                : "border-brand bg-slate-200/70 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
                            )}
                          >
                            <span className="font-semibold block text-[10px]">
                              {msg.replyToMessage.senderName}
                            </span>
                            <span className="truncate block opacity-90">
                              {msg.replyToMessage.content}
                            </span>
                          </div>
                        )}

                        {/* Content Render */}
                        {msg.isDeleted ? (
                          <span>Tin nhắn đã được thu hồi</span>
                        ) : (() => {
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
                            const projectId = urlMatch ? urlMatch[1] : undefined;
                            const taskId = urlMatch ? urlMatch[2] : "task";

                            return (
                              <div className="space-y-1.5 text-slate-800 dark:text-slate-100">
                                {preText && (
                                  <div className={cn(msg.isMine && "text-white")}>
                                    {renderContentWithMentions(
                                      preText,
                                      allProfiles
                                    )}
                                  </div>
                                )}
                                <TaskCardMessage
                                  task={{
                                    id: taskId,
                                    title: taskTitle,
                                    projectId,
                                    projectName:
                                      conversation?.type === "project"
                                        ? conversation.title
                                        : undefined,
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
                            <div>
                              {renderContentWithMentions(
                                msg.content,
                                allProfiles
                              )}
                            </div>
                          );
                        })()}

                        {/* Attachment Preview */}
                        {msg.attachmentUrl && !msg.isDeleted && (
                          <div className="mt-2">
                            {msg.attachmentUrl.match(/\.(jpeg|jpg|png|gif|webp)$/i) ? (
                              <div
                                onClick={() =>
                                  setLightboxImage({
                                    url: msg.attachmentUrl!,
                                    name: msg.attachmentName,
                                  })
                                }
                                className="block overflow-hidden rounded-lg cursor-pointer"
                              >
                                <img
                                  src={msg.attachmentUrl}
                                  alt={msg.attachmentName || "Ảnh"}
                                  className="max-h-56 rounded-lg object-cover hover:opacity-95 transition"
                                />
                              </div>
                            ) : (
                              <a
                                href={msg.attachmentUrl}
                                target="_blank"
                                rel="noreferrer"
                                className={cn(
                                  "flex items-center gap-2 rounded-lg p-2 border transition",
                                  msg.isMine
                                    ? "bg-white/10 border-white/20 text-white"
                                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                                )}
                              >
                                <FileText className="h-4 w-4 shrink-0 text-brand" />
                                <span className="text-[11px] font-medium truncate flex-1">
                                  {msg.attachmentName || "Tệp đính kèm"}
                                </span>
                                <Download className="h-3.5 w-3.5 shrink-0 opacity-70" />
                              </a>
                            )}
                          </div>
                        )}

                        {/* Time & Pinned Indicator */}
                        <div
                          className={cn(
                            "flex items-center justify-end gap-1 mt-1 text-[9px] opacity-75",
                            msg.isMine ? "text-white/80" : "text-slate-400"
                          )}
                        >
                          {msg.isPinned && !msg.isDeleted && (
                            <Pin className="h-2.5 w-2.5 text-amber-400 fill-amber-400" />
                          )}
                          {msg.editedAt && <span>(đã sửa)</span>}
                          <span>
                            {new Date(msg.createdAt).toLocaleTimeString("vi-VN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          {msg.isMine && (
                            <CheckCheck className="h-3 w-3 inline text-white/90" />
                          )}
                        </div>
                      </div>

                      {/* Emoji Reactions Pill Bar */}
                      {Object.keys(msg.reactions).length > 0 && !msg.isDeleted && (
                        <div className="flex flex-wrap items-center gap-1 mt-1 ml-1">
                          {Object.entries(msg.reactions).map(([emoji, uids]) => {
                            if (!uids || uids.length === 0) return null;
                            const hasMyReact = uids.includes(currentUser.id);
                            return (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => onToggleReaction(msg, emoji)}
                                className={cn(
                                  "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border transition cursor-pointer",
                                  hasMyMyReact(currentUser.id, uids)
                                    ? "border-brand bg-orange-50 dark:bg-orange-950/50 text-brand"
                                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                                )}
                              >
                                <span>{emoji}</span>
                                <span className="font-semibold">{uids.length}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Thread Replies Counter Indicator */}
                      {(() => {
                        const repliesCount = messages.filter(
                          (m) => m.replyToId === msg.id && !m.isDeleted
                        ).length;
                        if (repliesCount === 0) return null;
                        return (
                          <button
                            type="button"
                            onClick={() => onOpenThread?.(msg)}
                            className="mt-1 flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand/10 dark:hover:bg-brand/20 transition cursor-pointer"
                          >
                            <MessagesSquare className="h-3 w-3" />
                            <span>{repliesCount} câu trả lời trong nhánh</span>
                          </button>
                        );
                      })()}
                    </div>

                    {/* Quick Hover Action Bar */}
                    {!msg.isDeleted && (
                      <div
                        className={cn(
                          "hidden group-hover/msg:flex items-center gap-0.5 absolute -top-8 z-20 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-1 shadow-md text-slate-500",
                          msg.isMine ? "right-2" : "left-2"
                        )}
                      >
                        {/* Quick Reactions */}
                        <div className="flex items-center border-r border-slate-200 dark:border-slate-700 pr-1 mr-1 gap-0.5">
                          {QUICK_REACTIONS.map((r) => (
                            <button
                              key={r.emoji}
                              type="button"
                              onClick={() => onToggleReaction(msg, r.emoji)}
                              className="hover:scale-125 transition p-0.5 text-xs"
                              title={r.label}
                            >
                              {r.emoji}
                            </button>
                          ))}
                        </div>

                        {/* Reply */}
                        <button
                          type="button"
                          onClick={() => setReplyingTo(msg)}
                          title="Trả lời trích dẫn"
                          className="p-1 hover:text-brand transition rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Reply className="h-3.5 w-3.5" />
                        </button>

                        {/* Reply in Thread */}
                        {onOpenThread && (
                          <button
                            type="button"
                            onClick={() => onOpenThread(msg)}
                            title="Trả lời trong nhánh (Thread)"
                            className="p-1 hover:text-brand transition rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <MessagesSquare className="h-3.5 w-3.5" />
                          </button>
                        )}

                        {/* Convert to Task */}
                        {onConvertToTask && (
                          <button
                            type="button"
                            onClick={() =>
                              onConvertToTask({
                                id: msg.id,
                                content: msg.content,
                                authorId: msg.senderId,
                                authorName: msg.senderName,
                                createdAt: msg.createdAt,
                                attachmentUrl: msg.attachmentUrl,
                                attachmentName: msg.attachmentName,
                              })
                            }
                            title="Tạo công việc từ tin nhắn này"
                            className="p-1 hover:text-brand transition rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <CheckSquare className="h-3.5 w-3.5" />
                          </button>
                        )}

                        {/* Pin */}
                        <button
                          type="button"
                          onClick={() => onTogglePin(msg)}
                          title={msg.isPinned ? "Bỏ ghim" : "Ghim tin"}
                          className="p-1 hover:text-brand transition rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Pin className="h-3.5 w-3.5" />
                        </button>

                        {/* Edit (Mine only) */}
                        {msg.isMine && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMessage(msg);
                              setInputText(msg.content);
                            }}
                            title="Chỉnh sửa tin nhắn"
                            className="p-1 hover:text-brand transition rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}

                        {/* Unsend (Mine only) */}
                        {msg.isMine && (
                          <button
                            type="button"
                            onClick={() => onUnsendMessage(msg.id)}
                            title="Thu hồi tin nhắn"
                            className="p-1 hover:text-red-500 transition rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ====================================================================
       * 3. RICH MESSAGE COMPOSER
       * ==================================================================== */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shrink-0 space-y-2">
        {/* Reply Preview Bar */}
        {replyingTo && (
          <div className="flex items-center justify-between bg-slate-100 dark:bg-slate-800 rounded-xl px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2 truncate">
              <Reply className="h-3.5 w-3.5 text-brand shrink-0" />
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Đang trả lời {replyingTo.senderName}:
              </span>
              <span className="truncate text-slate-500">{replyingTo.content}</span>
            </div>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Edit Preview Bar */}
        {editingMessage && (
          <div className="flex items-center justify-between bg-orange-50 dark:bg-orange-950/50 rounded-xl px-3 py-1.5 text-xs border border-brand/30">
            <div className="flex items-center gap-2 truncate">
              <Pencil className="h-3.5 w-3.5 text-brand shrink-0" />
              <span className="font-semibold text-brand">Đang chỉnh sửa tin nhắn:</span>
              <span className="truncate text-slate-600 dark:text-slate-300">
                {editingMessage.content}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingMessage(null);
                setInputText("");
              }}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Pending File Attachment Preview */}
        {pendingFile && (
          <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl p-2 border border-slate-200 dark:border-slate-700">
            {pendingFile.isImage && pendingFile.previewUrl ? (
              <img
                src={pendingFile.previewUrl}
                alt="preview"
                className="h-10 w-10 rounded-lg object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-600">
                <FileText className="h-5 w-5" />
              </div>
            )}
            <div className="flex-1 min-w-0 text-xs">
              <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                {pendingFile.file.name}
              </p>
              <p className="text-[10px] text-slate-400">
                {(pendingFile.file.size / 1024).toFixed(1)} KB
              </p>
            </div>
            <button
              type="button"
              onClick={removePendingFile}
              className="p-1 hover:text-red-500 text-slate-400"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Composer Input Box */}
        <div className="relative rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950/30 focus-within:border-brand focus-within:ring-1 focus-within:ring-brand transition shadow-2xs">
          <MentionTextarea
            profiles={allProfiles}
            value={inputText}
            onChange={(val) => {
              setInputText(val);
              onBroadcastTyping();
            }}
            onPaste={handlePaste}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={2}
            placeholder={
              editingMessage
                ? "Sửa tin nhắn... (Enter để lưu, Esc để hủy)"
                : "Nhập tin nhắn, gõ @ để nhắc tên đồng nghiệp (Enter để gửi, Shift+Enter xuống dòng)..."
            }
            className="w-full bg-transparent px-3.5 pt-2.5 pb-9 text-xs focus:outline-none resize-none"
          />

          {/* Bottom Toolbar inside textarea */}
          <div className="absolute left-2.5 bottom-2 flex items-center gap-1">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileSelect}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Đính kèm tệp tin"
              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition rounded-md hover:bg-slate-200/50 dark:hover:bg-slate-800"
            >
              <Paperclip className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Đính kèm hình ảnh"
              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition rounded-md hover:bg-slate-200/50 dark:hover:bg-slate-800"
            >
              <ImageIcon className="h-4 w-4" />
            </button>
          </div>

          {/* Send Button */}
          <button
            type="button"
            onClick={handleSend}
            disabled={(!inputText.trim() && !pendingFile) || isSending}
            className={cn(
              "absolute right-2 bottom-2 flex h-7 w-7 items-center justify-center rounded-xl transition shadow-xs",
              inputText.trim() || pendingFile
                ? "bg-brand text-white hover:bg-brand/90 cursor-pointer"
                : "bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
            )}
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </footer>

      {/* Media Lightbox */}
      {lightboxImage && (
        <MediaLightboxModal
          imageUrl={lightboxImage.url}
          imageName={lightboxImage.name}
          onClose={() => setLightboxImage(null)}
        />
      )}
    </div>
  );
}

function hasMyMyReact(userId: string, uids: string[]): boolean {
  return uids.includes(userId);
}
