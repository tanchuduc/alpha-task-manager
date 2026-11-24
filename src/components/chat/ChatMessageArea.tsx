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
  type MentionTextareaRef,
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
  Forward,
  Flag,
  Copy,
  MoreHorizontal,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Link2,
  Code,
  Maximize2,
  Minimize2,
  AtSign,
} from "lucide-react";
import { toast } from "sonner";
import { MediaLightboxModal } from "@/components/chat/MediaLightboxModal";
import { ForwardMessageModal } from "@/components/chat/ForwardMessageModal";
import { LarkEmojiPicker } from "@/components/chat/LarkEmojiPicker";

interface ChatMessageAreaProps {
  conversation: UnifiedConversationItem | null;
  conversations?: UnifiedConversationItem[];
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
  onForwardMessage?: (
    message: UnifiedMessageItem,
    targetConvIds: string[],
    additionalComment?: string
  ) => Promise<void>;
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
  conversations = [],
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
  onForwardMessage,
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

  // Action states: Reply, Edit, Quick Emoji popover, Forward, Flags, Context menu
  const [replyingTo, setReplyingTo] = useState<UnifiedMessageItem | null>(null);
  const [editingMessage, setEditingMessage] = useState<UnifiedMessageItem | null>(
    null
  );
  const [forwardingMessage, setForwardingMessage] =
    useState<UnifiedMessageItem | null>(null);
  const [activeMenuMsgId, setActiveMenuMsgId] = useState<string | null>(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const [showPinnedQuickBar, setShowPinnedQuickBar] = useState(true);

  // Lark Rich text formatting & Emoji Picker states
  const mentionTextareaRef = useRef<MentionTextareaRef | null>(null);
  const [showFormattingToolbar, setShowFormattingToolbar] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isComposerExpanded, setIsComposerExpanded] = useState(false);

  const insertFormatting = (
    prefix: string,
    suffix: string = prefix,
    defaultPlaceholder: string = "văn bản"
  ) => {
    const textarea = mentionTextareaRef.current?.textarea;
    if (!textarea) return;

    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const selected = inputText.substring(start, end) || defaultPlaceholder;

    const replacement = `${prefix}${selected}${suffix}`;
    const newText =
      inputText.substring(0, start) + replacement + inputText.substring(end);
    setInputText(newText);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + prefix.length,
        start + prefix.length + selected.length
      );
    }, 0);
  };

  const handleInsertEmoji = (emoji: string) => {
    const textarea = mentionTextareaRef.current?.textarea;
    if (!textarea) {
      setInputText((prev) => prev + emoji);
      return;
    }
    const start = textarea.selectionStart ?? inputText.length;
    const end = textarea.selectionEnd ?? inputText.length;
    const newText =
      inputText.substring(0, start) + emoji + inputText.substring(end);
    setInputText(newText);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + emoji.length, start + emoji.length);
    }, 0);
  };

  // Flagged messages state (persisted per user in localStorage)
  const [flaggedMsgIds, setFlaggedMsgIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const saved = localStorage.getItem(`alpha_flagged_msgs_${currentUser.id}`);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const toggleFlagMessage = (msgId: string) => {
    setFlaggedMsgIds((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) {
        next.delete(msgId);
        toast.info("Đã bỏ gắn cờ tin nhắn");
      } else {
        next.add(msgId);
        toast.success("Đã gắn cờ tin nhắn quan trọng!");
      }
      try {
        localStorage.setItem(
          `alpha_flagged_msgs_${currentUser.id}`,
          JSON.stringify(Array.from(next))
        );
      } catch {}
      return next;
    });
  };

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
                              {renderRichMessageContent(
                                msg.content,
                                allProfiles,
                                msg.isMine
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
                          {flaggedMsgIds.has(msg.id) && !msg.isDeleted && (
                            <Flag className="h-2.5 w-2.5 text-red-500 fill-red-500" />
                          )}
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

                    {/* Floating Action Bar (Chuẩn Lark Ảnh 5 & 6) */}
                    {!msg.isDeleted && (
                      <div
                        className={cn(
                          "hidden group-hover/msg:flex items-center gap-0.5 absolute -top-8 z-20 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs px-1.5 py-0.5 shadow-lg text-slate-500 animate-in fade-in zoom-in-95 duration-100",
                          msg.isMine ? "right-2" : "left-2"
                        )}
                      >
                        {/* 1. Quick Like / Emoji Toolbar */}
                        <div className="relative group/like">
                          <button
                            type="button"
                            onClick={() => onToggleReaction(msg, "👍")}
                            title="Thích (👍)"
                            className="flex h-6 w-6 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-xs hover:scale-110 transition"
                          >
                            👍
                          </button>

                          {/* Hover Popover: 6 quick reactions */}
                          <div className="hidden group-hover/like:flex items-center gap-0.5 absolute bottom-full mb-1 left-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1 py-0.5 shadow-xl z-30">
                            {QUICK_REACTIONS.map((r) => (
                              <button
                                key={r.emoji}
                                type="button"
                                onClick={() => onToggleReaction(msg, r.emoji)}
                                className="hover:scale-125 transition p-1 text-xs rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                                title={r.label}
                              >
                                {r.emoji}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="h-3 w-px bg-slate-200 dark:bg-slate-700 mx-0.5" />

                        {/* 2. Trả lời trực tiếp (Direct Reply / Quote) */}
                        <button
                          type="button"
                          onClick={() => setReplyingTo(msg)}
                          title="Trả lời trực tiếp (↩️)"
                          className="flex h-6 w-6 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-brand transition"
                        >
                          <Reply className="h-3.5 w-3.5" />
                        </button>

                        {/* 3. Chuyển tiếp tin nhắn (Forward - Ảnh 5) */}
                        <button
                          type="button"
                          onClick={() => setForwardingMessage(msg)}
                          title="Chuyển tiếp tin nhắn (➡️)"
                          className="flex h-6 w-6 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-blue-500 transition"
                        >
                          <Forward className="h-3.5 w-3.5" />
                        </button>

                        {/* 4. Trả lời trong chuỗi (Reply in Thread) */}
                        {onOpenThread && (
                          <button
                            type="button"
                            onClick={() => onOpenThread(msg)}
                            title="Thảo luận theo chuỗi (💬)"
                            className="flex h-6 w-6 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-emerald-500 transition"
                          >
                            <MessagesSquare className="h-3.5 w-3.5" />
                          </button>
                        )}

                        {/* 5. Menu mở rộng ... (Chuẩn Lark Ảnh 6) */}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() =>
                              setActiveMenuMsgId(
                                activeMenuMsgId === msg.id ? null : msg.id
                              )
                            }
                            title="Tùy chọn khác (...)"
                            className="flex h-6 w-6 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:text-slate-100 transition"
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </button>

                          {activeMenuMsgId === msg.id && (
                            <>
                              <div
                                className="fixed inset-0 z-30"
                                onClick={() => setActiveMenuMsgId(null)}
                              />
                              <div
                                className={cn(
                                  "absolute top-full mt-1.5 z-40 w-48 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-1.5 shadow-2xl text-xs space-y-0.5 animate-in fade-in zoom-in-95 duration-100",
                                  msg.isMine ? "right-0" : "left-0"
                                )}
                              >
                                {/* Gắn cờ (Flag) */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    toggleFlagMessage(msg.id);
                                    setActiveMenuMsgId(null);
                                  }}
                                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                                >
                                  <Flag
                                    className={cn(
                                      "h-3.5 w-3.5",
                                      flaggedMsgIds.has(msg.id)
                                        ? "text-red-500 fill-red-500"
                                        : "text-slate-400"
                                    )}
                                  />
                                  <span>
                                    {flaggedMsgIds.has(msg.id)
                                      ? "Bỏ gắn cờ"
                                      : "Gắn cờ tin nhắn"}
                                  </span>
                                </button>

                                {/* Ghim tin nhắn */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    onTogglePin(msg);
                                    setActiveMenuMsgId(null);
                                  }}
                                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                                >
                                  <Pin
                                    className={cn(
                                      "h-3.5 w-3.5",
                                      msg.isPinned
                                        ? "text-amber-500 fill-amber-500"
                                        : "text-slate-400"
                                    )}
                                  />
                                  <span>
                                    {msg.isPinned ? "Bỏ ghim tin" : "Ghim tin nhắn"}
                                  </span>
                                </button>

                                {/* Sao chép văn bản */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (msg.content) {
                                      navigator.clipboard.writeText(msg.content);
                                      toast.success("Đã sao chép nội dung tin nhắn!");
                                    }
                                    setActiveMenuMsgId(null);
                                  }}
                                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                                >
                                  <Copy className="h-3.5 w-3.5 text-slate-400" />
                                  <span>Sao chép nội dung</span>
                                </button>

                                {/* Thêm nhiệm vụ (Convert to Task) */}
                                {onConvertToTask && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onConvertToTask({
                                        id: msg.id,
                                        content: msg.content,
                                        authorId: msg.senderId,
                                        authorName: msg.senderName,
                                        createdAt: msg.createdAt,
                                        attachmentUrl: msg.attachmentUrl,
                                        attachmentName: msg.attachmentName,
                                      });
                                      setActiveMenuMsgId(null);
                                    }}
                                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                                  >
                                    <CheckSquare className="h-3.5 w-3.5 text-emerald-500" />
                                    <span>Thêm nhiệm vụ (Tạo Task)</span>
                                  </button>
                                )}

                                {/* Chỉnh sửa (Nếu là của mình) */}
                                {msg.isMine && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingMessage(msg);
                                      setInputText(msg.content);
                                      setActiveMenuMsgId(null);
                                    }}
                                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                                  >
                                    <Pencil className="h-3.5 w-3.5 text-slate-400" />
                                    <span>Chỉnh sửa tin nhắn</span>
                                  </button>
                                )}

                                {/* Thu hồi (Nếu là của mình) */}
                                {msg.isMine && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onUnsendMessage(msg.id);
                                      setActiveMenuMsgId(null);
                                    }}
                                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition border-t border-slate-100 dark:border-slate-800/60"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    <span>Thu hồi tin nhắn</span>
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
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
          {/* Lark Rich Text Formatting Bar (Ảnh 1) */}
          {showFormattingToolbar && (
            <div className="flex items-center gap-0.5 px-2.5 py-1.5 border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/60 text-slate-600 dark:text-slate-300 rounded-t-2xl overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => insertFormatting("**", "**", "in đậm")}
                title="In đậm (Bold - **text**)"
                className="p-1 hover:bg-white dark:hover:bg-slate-800 rounded-md transition"
              >
                <Bold className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => insertFormatting("~~", "~~", "gạch ngang")}
                title="Gạch ngang (Strikethrough - ~~text~~)"
                className="p-1 hover:bg-white dark:hover:bg-slate-800 rounded-md transition"
              >
                <Strikethrough className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => insertFormatting("*", "*", "in nghiêng")}
                title="In nghiêng (Italic - *text*)"
                className="p-1 hover:bg-white dark:hover:bg-slate-800 rounded-md transition"
              >
                <Italic className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => insertFormatting("<u>", "</u>", "gạch chân")}
                title="Gạch chân (Underline)"
                className="p-1 hover:bg-white dark:hover:bg-slate-800 rounded-md transition"
              >
                <Underline className="h-3.5 w-3.5" />
              </button>

              <div className="h-3.5 w-px bg-slate-200 dark:bg-slate-700 mx-1" />

              <button
                type="button"
                onClick={() => insertFormatting("1. ", "", "nội dung")}
                title="Danh sách số"
                className="p-1 hover:bg-white dark:hover:bg-slate-800 rounded-md transition"
              >
                <ListOrdered className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => insertFormatting("- ", "", "nội dung")}
                title="Danh sách gạch đầu dòng"
                className="p-1 hover:bg-white dark:hover:bg-slate-800 rounded-md transition"
              >
                <List className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => insertFormatting("> ", "", "trích dẫn")}
                title="Trích dẫn (Quote)"
                className="p-1 hover:bg-white dark:hover:bg-slate-800 rounded-md transition"
              >
                <Quote className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() =>
                  insertFormatting("[", "](https://...)", "tiêu đề liên kết")
                }
                title="Chèn liên kết (Link)"
                className="p-1 hover:bg-white dark:hover:bg-slate-800 rounded-md transition"
              >
                <Link2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => insertFormatting("`", "`", "code")}
                title="Đoạn mã (Code)"
                className="p-1 hover:bg-white dark:hover:bg-slate-800 rounded-md transition"
              >
                <Code className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <MentionTextarea
            ref={mentionTextareaRef}
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
                : "Nhập @ nhắc tên, tin nhắn (Enter để gửi, Shift+Enter xuống dòng, Ctrl+V dán ảnh)..."
            }
            className={cn(
              "w-full bg-transparent px-3.5 pt-2.5 pb-9 text-xs focus:outline-none resize-none transition-all",
              isComposerExpanded ? "min-h-[140px]" : "min-h-[44px]"
            )}
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

            {/* Lark Emoji Picker Button & Popup (Ảnh 2) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowEmojiPicker((prev) => !prev)}
                title="Chèn biểu tượng cảm xúc (Emoji)"
                className={cn(
                  "p-1 transition rounded-md",
                  showEmojiPicker
                    ? "text-brand bg-orange-100 dark:bg-orange-950/60"
                    : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800"
                )}
              >
                <Smile className="h-4 w-4" />
              </button>

              {showEmojiPicker && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowEmojiPicker(false)}
                  />
                  <div className="absolute bottom-full mb-2 left-0 z-50">
                    <LarkEmojiPicker
                      onSelectEmoji={handleInsertEmoji}
                      onClose={() => setShowEmojiPicker(false)}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right Action Buttons: Aa, @, Expand/Collapse & Send */}
          <div className="absolute right-2 bottom-2 flex items-center gap-1">
            {/* Aa Formatting Toggle (Ảnh 1) */}
            <button
              type="button"
              onClick={() => setShowFormattingToolbar((prev) => !prev)}
              title={
                showFormattingToolbar
                  ? "Ẩn định dạng (Aa)"
                  : "Hiện định dạng (Aa)"
              }
              className={cn(
                "flex h-7 px-2 items-center justify-center rounded-xl transition text-xs font-serif font-bold shadow-2xs cursor-pointer",
                showFormattingToolbar
                  ? "bg-brand text-white font-extrabold"
                  : "bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700"
              )}
            >
              Aa
            </button>

            {/* @ Mention Shortcut (Ảnh 1) */}
            <button
              type="button"
              onClick={() => {
                setInputText((prev) => prev + "@");
              }}
              title="Nhắc đến ai đó (@)"
              className="flex h-7 w-7 items-center justify-center rounded-xl transition text-xs font-bold bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 shadow-2xs cursor-pointer"
            >
              <AtSign className="h-3.5 w-3.5" />
            </button>

            {/* Expand / Collapse Textarea Toggle (Ảnh 1 & 2) */}
            <button
              type="button"
              onClick={() => setIsComposerExpanded((p) => !p)}
              title={
                isComposerExpanded
                  ? "Thu nhỏ khung soạn thảo"
                  : "Mở rộng khung soạn thảo"
              }
              className="flex h-7 w-7 items-center justify-center rounded-xl transition text-xs bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 shadow-2xs cursor-pointer"
            >
              {isComposerExpanded ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </button>

            {/* Send Button */}
            <button
              type="button"
              onClick={handleSend}
              disabled={(!inputText.trim() && !pendingFile) || isSending}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-xl transition shadow-xs",
                inputText.trim() || pendingFile
                  ? "bg-brand text-white hover:bg-brand/90 cursor-pointer"
                  : "bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
              )}
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
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

      {/* Modal Chuyển Tiếp Tin Nhắn (Lark Forward Modal) */}
      {forwardingMessage && (
        <ForwardMessageModal
          message={forwardingMessage}
          conversations={conversations}
          currentUser={currentUser}
          onClose={() => setForwardingMessage(null)}
          onForward={async (targetConvIds, comment) => {
            if (onForwardMessage) {
              await onForwardMessage(forwardingMessage, targetConvIds, comment);
            }
          }}
        />
      )}
    </div>
  );
}

function hasMyMyReact(userId: string, uids: string[]): boolean {
  return uids.includes(userId);
}

function renderRichMessageContent(
  content: string,
  allProfiles: Profile[],
  isMine: boolean
): React.ReactNode {
  if (!content) return null;

  const lines = content.split("\n");
  return (
    <div className="space-y-1">
      {lines.map((line, lineIdx) => {
        // 1. Blockquote
        if (line.startsWith("> ")) {
          return (
            <div
              key={lineIdx}
              className={cn(
                "border-l-3 px-2 py-0.5 rounded-r my-1 text-[11px] leading-relaxed",
                isMine
                  ? "border-white/60 bg-white/10 text-white/90"
                  : "border-brand bg-slate-200/60 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300"
              )}
            >
              {renderInlineMarkdown(line.slice(2), allProfiles)}
            </div>
          );
        }

        // 2. Bullet list
        if (line.startsWith("- ") || line.startsWith("* ")) {
          return (
            <div key={lineIdx} className="flex items-start gap-1.5 ml-1">
              <span className="opacity-60">•</span>
              <span>{renderInlineMarkdown(line.slice(2), allProfiles)}</span>
            </div>
          );
        }

        // 3. Normal line
        return (
          <div key={lineIdx} className="min-h-[1.1rem]">
            {renderInlineMarkdown(line, allProfiles)}
          </div>
        );
      })}
    </div>
  );
}

function renderInlineMarkdown(
  text: string,
  profiles: Profile[]
): React.ReactNode {
  // Split tokens for bold, italic, strike, underline, code, links
  const tokenRegex =
    /(\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~|`[^`]+`|<u>[^<]+<\/u>|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
  const parts = text.split(tokenRegex);

  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={idx} className="font-bold">
          {renderContentWithMentions(part.slice(2, -2), profiles)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return (
        <em key={idx} className="italic">
          {renderContentWithMentions(part.slice(1, -1), profiles)}
        </em>
      );
    }
    if (part.startsWith("~~") && part.endsWith("~~") && part.length > 4) {
      return (
        <del key={idx} className="line-through opacity-75">
          {renderContentWithMentions(part.slice(2, -2), profiles)}
        </del>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/15 font-mono text-[11px]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("<u>") && part.endsWith("</u>") && part.length > 7) {
      return (
        <span key={idx} className="underline underline-offset-2">
          {renderContentWithMentions(part.slice(3, -4), profiles)}
        </span>
      );
    }
    if (part.startsWith("[") && part.includes("](") && part.endsWith(")")) {
      const match = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      if (match) {
        return (
          <a
            key={idx}
            href={match[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand hover:underline font-medium inline-flex items-center gap-0.5"
          >
            {match[1]}
            <ExternalLink className="h-2.5 w-2.5 opacity-60 inline" />
          </a>
        );
      }
    }
    return renderContentWithMentions(part, profiles);
  });
}
