"use client";

import React, { useState, useMemo } from "react";
import type { Profile } from "@/types/database";
import type {
  UnifiedConversationItem,
  ConversationFilter,
} from "@/lib/chat/useUnifiedChat";
import { cn, getInitials } from "@/lib/utils";
import {
  Search,
  MessageSquare,
  FolderKanban,
  Users,
  Plus,
  Pin,
  PinOff,
  Bell,
  BellOff,
  Check,
  X,
  UserPlus,
  Flag,
  Tag,
  MoreHorizontal,
  Bookmark,
  Sparkles,
  ChevronRight,
  AtSign,
} from "lucide-react";
import { toast } from "sonner";

export interface ChatLabelItem {
  id: string;
  name: string;
  color: string;
}

interface ChatSidebarProps {
  conversations: UnifiedConversationItem[];
  allConversations?: UnifiedConversationItem[];
  currentUser?: Profile;
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  activeFilter: ConversationFilter;
  onChangeFilter: (filter: ConversationFilter) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onlineUserIds: Set<string>;
  onTogglePinConversation: (id: string) => void;
  onToggleMuteConversation: (id: string) => void;
  onCreateGroupClick?: () => void;
  onNewDirectChatClick?: () => void;
  onRequestNotificationPermission?: () => void;
  className?: string;
}

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

const FILTER_ITEMS: { key: ConversationFilter; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "unread", label: "Chưa đọc" },
  { key: "direct", label: "Cá nhân" },
  { key: "group", label: "Nhóm" },
  { key: "project", label: "Dự án" },
];

const DEFAULT_LABELS: ChatLabelItem[] = [
  { id: "lbl-1", name: "BĐH", color: "#3B82F6" },
  { id: "lbl-2", name: "Marketing", color: "#EC4899" },
  { id: "lbl-3", name: "TMĐT", color: "#10B981" },
  { id: "lbl-4", name: "Quan trọng", color: "#F59E0B" },
  { id: "lbl-5", name: "Thường xuyên", color: "#8B5CF6" },
];

export function ChatSidebar({
  conversations,
  allConversations,
  currentUser,
  activeConversationId,
  onSelectConversation,
  activeFilter,
  onChangeFilter,
  searchQuery,
  onSearchChange,
  onlineUserIds,
  onTogglePinConversation,
  onToggleMuteConversation,
  onCreateGroupClick,
  onNewDirectChatClick,
  onRequestNotificationPermission,
  className,
}: ChatSidebarProps) {
  const [showPlusMenu, setShowPlusMenu] = useState(false);

  // Lark Feature 1: Labels / Tags State
  const userId = currentUser?.id || "default";
  const [labels, setLabels] = useState<ChatLabelItem[]>(() => {
    if (typeof window === "undefined") return DEFAULT_LABELS;
    try {
      const saved = localStorage.getItem(`alpha_chat_labels_${userId}`);
      return saved ? JSON.parse(saved) : DEFAULT_LABELS;
    } catch {
      return DEFAULT_LABELS;
    }
  });

  const [conversationLabels, setConversationLabels] = useState<
    Record<string, string[]>
  >(() => {
    if (typeof window === "undefined") return {};
    try {
      const saved = localStorage.getItem(`alpha_chat_conv_labels_${userId}`);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Lark Feature 2: Flagged Conversations State (Ảnh 3 & 4)
  const [flaggedConvIds, setFlaggedConvIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const saved = localStorage.getItem(`alpha_chat_flagged_convs_${userId}`);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Active Label, Flag, or Mention Filter
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  const [onlyFlaggedFilter, setOnlyFlaggedFilter] = useState(false);
  const [onlyMentionedFilter, setOnlyMentionedFilter] = useState(false);

  // Context Menu state
  const [contextMenuConvId, setContextMenuConvId] = useState<string | null>(null);
  const [showLabelSubmenu, setShowLabelSubmenu] = useState(false);
  const [showCreateLabelModal, setShowCreateLabelModal] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#F26522");

  // Save labels helper
  const handleCreateLabel = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newLabelName.trim();
    if (!trimmed) return;
    const newLbl: ChatLabelItem = {
      id: `lbl-${Date.now()}`,
      name: trimmed,
      color: newLabelColor,
    };
    const next = [...labels, newLbl];
    setLabels(next);
    try {
      localStorage.setItem(`alpha_chat_labels_${userId}`, JSON.stringify(next));
    } catch {}
    setNewLabelName("");
    setShowCreateLabelModal(false);
    toast.success(`Đã tạo nhãn "${trimmed}"!`);
  };

  const toggleConversationLabel = (convId: string, labelId: string) => {
    setConversationLabels((prev) => {
      const currentLbls = prev[convId] || [];
      const nextLbls = currentLbls.includes(labelId)
        ? currentLbls.filter((l) => l !== labelId)
        : [...currentLbls, labelId];
      const next = { ...prev, [convId]: nextLbls };
      try {
        localStorage.setItem(
          `alpha_chat_conv_labels_${userId}`,
          JSON.stringify(next)
        );
      } catch {}
      return next;
    });
  };

  const toggleFlagConversation = (convId: string) => {
    setFlaggedConvIds((prev) => {
      const next = new Set(prev);
      if (next.has(convId)) {
        next.delete(convId);
        toast.info("Đã bỏ gắn cờ hội thoại.");
      } else {
        next.add(convId);
        toast.success("Đã gắn cờ hội thoại quan trọng!");
      }
      try {
        localStorage.setItem(
          `alpha_chat_flagged_convs_${userId}`,
          JSON.stringify(Array.from(next))
        );
      } catch {}
      return next;
    });
  };

  // Top Pinned Avatar Carousel (Ảnh 3 & 4)
  const pinnedConversations = useMemo(() => {
    const pool = allConversations && allConversations.length > 0 ? allConversations : conversations;
    return pool.filter((c) => c.isPinned);
  }, [allConversations, conversations]);

  // Final filtered list based on active filter, selected label, flagged filter, mention filter
  const displayedConversations = useMemo(() => {
    let list = conversations;
    if (onlyFlaggedFilter) {
      list = list.filter((c) => flaggedConvIds.has(c.id));
    } else if (onlyMentionedFilter) {
      const myName = currentUser?.full_name?.toLowerCase() || "";
      list = list.filter((c) => {
        const text = c.lastMessage?.content?.toLowerCase() || "";
        return (
          (myName && text.includes(`@${myName}`)) ||
          text.includes("@all") ||
          text.includes("@channel")
        );
      });
    } else if (selectedLabelId) {
      list = list.filter((c) =>
        (conversationLabels[c.id] || []).includes(selectedLabelId)
      );
    }
    return list;
  }, [
    conversations,
    onlyFlaggedFilter,
    onlyMentionedFilter,
    selectedLabelId,
    flaggedConvIds,
    conversationLabels,
    currentUser?.full_name,
  ]);

  return (
    <aside
      className={cn(
        "flex flex-col w-full md:w-80 lg:w-88 border-r border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 shrink-0 select-none h-full",
        className
      )}
    >
      {/* 1. Header Top */}
      <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand text-white shadow-xs">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                Trò chuyện
                <span className="inline-flex items-center rounded-full bg-slate-200 dark:bg-slate-800 px-1.5 py-0.2 text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                  {displayedConversations.length}
                </span>
              </h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {onlineUserIds.size} người trực tuyến
              </p>
            </div>
          </div>

          {/* Action Buttons: Bell & Plus */}
          <div className="flex items-center gap-1.5">
            {onRequestNotificationPermission && (
              <button
                type="button"
                onClick={onRequestNotificationPermission}
                title="Bật thông báo trên trình duyệt"
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-brand hover:text-brand shadow-xs transition"
              >
                <Bell className="h-3.5 w-3.5" />
              </button>
            )}

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowPlusMenu((prev) => !prev)}
                title="Tạo cuộc trò chuyện mới"
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-brand hover:text-brand shadow-xs transition"
              >
                <Plus className="h-4 w-4" />
              </button>

              {showPlusMenu && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setShowPlusMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-1.5 z-40 w-44 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1 shadow-lg text-xs space-y-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setShowPlusMenu(false);
                        onCreateGroupClick?.();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                      <Users className="h-3.5 w-3.5 text-brand" />
                      <span>Tạo nhóm chat mới</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowPlusMenu(false);
                        onNewDirectChatClick?.();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                      <UserPlus className="h-3.5 w-3.5 text-emerald-500" />
                      <span>Nhắn tin 1-1</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 2. Search Bar */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Tìm cuộc trò chuyện, nhân sự..."
            className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-brand shadow-2xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* 3. Core Filter Tabs: Tất cả | Chưa đọc | Cá nhân | Nhóm | Dự án */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
          {FILTER_ITEMS.map((tab) => {
            const isActive =
              activeFilter === tab.key &&
              !onlyFlaggedFilter &&
              !onlyMentionedFilter &&
              !selectedLabelId;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setOnlyFlaggedFilter(false);
                  setOnlyMentionedFilter(false);
                  setSelectedLabelId(null);
                  onChangeFilter(tab.key);
                }}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded-lg whitespace-nowrap transition cursor-pointer",
                  isActive
                    ? "bg-brand text-white shadow-xs font-semibold"
                    : "bg-slate-200/70 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800"
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* 4. Lark Special Filters & Labels Bar (Ảnh 3) */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pt-1 text-[11px] border-t border-slate-200/60 dark:border-slate-800/60">
          {/* Flagged filter toggle */}
          <button
            type="button"
            onClick={() => {
              setOnlyFlaggedFilter((p) => !p);
              setOnlyMentionedFilter(false);
              setSelectedLabelId(null);
            }}
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded-lg border transition shrink-0 cursor-pointer font-medium",
              onlyFlaggedFilter
                ? "bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 font-semibold"
                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300"
            )}
            title="Xem các cuộc hội thoại đã gắn cờ"
          >
            <Flag
              className={cn(
                "h-3 w-3",
                onlyFlaggedFilter
                  ? "text-red-500 fill-red-500"
                  : "text-slate-400"
              )}
            />
            <span>Đã cờ</span>
            {flaggedConvIds.size > 0 && (
              <span className="text-[10px] font-bold opacity-80">
                ({flaggedConvIds.size})
              </span>
            )}
          </button>

          {/* Mentioned filter toggle (@ Được nhắc) */}
          <button
            type="button"
            onClick={() => {
              setOnlyMentionedFilter((p) => !p);
              setOnlyFlaggedFilter(false);
              setSelectedLabelId(null);
            }}
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded-lg border transition shrink-0 cursor-pointer font-medium",
              onlyMentionedFilter
                ? "bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800 text-blue-600 dark:text-blue-400 font-semibold"
                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300"
            )}
            title="Xem các cuộc hội thoại được nhắc đến (@)"
          >
            <AtSign
              className={cn(
                "h-3 w-3",
                onlyMentionedFilter ? "text-blue-500" : "text-slate-400"
              )}
            />
            <span>Được nhắc</span>
          </button>

          {/* Label Pills */}
          {labels.map((lbl) => {
            const isSelected = selectedLabelId === lbl.id;
            return (
              <button
                key={lbl.id}
                type="button"
                onClick={() => {
                  setSelectedLabelId(isSelected ? null : lbl.id);
                  setOnlyFlaggedFilter(false);
                  setOnlyMentionedFilter(false);
                }}
                className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded-lg border transition shrink-0 cursor-pointer font-medium",
                  isSelected
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent font-semibold shadow-2xs"
                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                )}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: lbl.color }}
                />
                <span>{lbl.name}</span>
              </button>
            );
          })}

          {/* Button + Tạo nhãn mới */}
          <button
            type="button"
            onClick={() => setShowCreateLabelModal(true)}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-slate-400 hover:text-brand hover:border-brand transition shrink-0 text-[10px]"
            title="Tạo nhãn mới"
          >
            <Plus className="h-3 w-3" />
            <span>Nhãn</span>
          </button>
        </div>
      </div>

      {/* 5. Lark Top Pinned Avatar Carousel (Dải Avatar Ghim Ngang - Ảnh 3 & 4) */}
      {pinnedConversations.length > 0 && (
        <div className="px-3.5 py-2.5 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/40 dark:bg-slate-900/40 shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Pin className="h-2.5 w-2.5 text-amber-500 fill-amber-500" />
              Đã ghim ({pinnedConversations.length})
            </span>
          </div>

          <div className="flex items-center gap-3 overflow-x-auto no-scrollbar py-1">
            {pinnedConversations.map((c) => {
              const isActive = c.id === activeConversationId;
              const isOnline =
                c.type === "direct" &&
                c.partnerId &&
                onlineUserIds.has(c.partnerId);

              return (
                <div
                  key={c.id}
                  onClick={() => onSelectConversation(c.id)}
                  className="group flex flex-col items-center gap-1 shrink-0 cursor-pointer w-12"
                  title={c.title}
                >
                  <div className="relative">
                    {c.avatarUrl ? (
                      <img
                        src={c.avatarUrl}
                        alt={c.title}
                        className={cn(
                          "h-10 w-10 rounded-full object-cover transition",
                          isActive
                            ? "ring-2 ring-brand ring-offset-2 dark:ring-offset-slate-900 scale-105 shadow-xs"
                            : "border border-slate-200 dark:border-slate-700 group-hover:scale-105"
                        )}
                      />
                    ) : (
                      <div
                        className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-xl font-bold text-xs transition shadow-2xs",
                          c.type === "project"
                            ? "bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300"
                            : c.type === "group"
                              ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300"
                              : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300",
                          isActive &&
                            "ring-2 ring-brand ring-offset-2 dark:ring-offset-slate-900 scale-105 shadow-xs"
                        )}
                      >
                        {c.type === "project" ? (
                          <FolderKanban className="h-4.5 w-4.5" />
                        ) : c.type === "group" ? (
                          <Users className="h-4.5 w-4.5" />
                        ) : (
                          getInitials(c.title)
                        )}
                      </div>
                    )}

                    {isOnline && (
                      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-slate-900 bg-emerald-500 shadow-xs" />
                    )}

                    {c.unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[9px] font-bold text-white shadow-xs">
                        {c.unreadCount > 99 ? "99+" : c.unreadCount}
                      </span>
                    )}
                  </div>

                  <span
                    className={cn(
                      "text-[10px] truncate w-full text-center font-medium",
                      isActive
                        ? "font-bold text-brand"
                        : "text-slate-600 dark:text-slate-300"
                    )}
                  >
                    {c.title}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 6. Conversations Scroll List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 p-1.5 space-y-0.5">
        {displayedConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400">
            <MessageSquare className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-xs font-medium">Không tìm thấy cuộc trò chuyện</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Thử tìm kiếm từ khóa khác hoặc đổi bộ lọc
            </p>
          </div>
        ) : (
          displayedConversations.map((conv) => {
            const isActive = conv.id === activeConversationId;
            const isOnline =
              conv.type === "direct" &&
              conv.partnerId &&
              onlineUserIds.has(conv.partnerId);

            const isFlagged = flaggedConvIds.has(conv.id);
            const myLabelIds = conversationLabels[conv.id] || [];
            const myLabels = labels.filter((l) => myLabelIds.includes(l.id));

            return (
              <div
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenuConvId(conv.id);
                  setShowLabelSubmenu(false);
                }}
                className={cn(
                  "group relative flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition text-left",
                  isActive
                    ? "bg-orange-50/80 dark:bg-orange-950/30 border border-brand/20 shadow-xs"
                    : "hover:bg-white dark:hover:bg-slate-900 border border-transparent"
                )}
              >
                {/* Avatar with Status Badge */}
                <div className="relative shrink-0">
                  {conv.avatarUrl ? (
                    <img
                      src={conv.avatarUrl}
                      alt={conv.title}
                      className="h-10 w-10 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                    />
                  ) : (
                    <div
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-xl font-bold text-xs shadow-2xs",
                        conv.type === "project"
                          ? "bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300"
                          : conv.type === "group"
                            ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300"
                            : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                      )}
                    >
                      {conv.type === "project" ? (
                        <FolderKanban className="h-5 w-5" />
                      ) : conv.type === "group" ? (
                        <Users className="h-5 w-5" />
                      ) : (
                        getInitials(conv.title)
                      )}
                    </div>
                  )}

                  {/* Online indicator for 1-1 */}
                  {isOnline && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white dark:border-slate-900 bg-emerald-500 shadow-xs" />
                  )}
                </div>

                {/* Conversation Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={cn(
                        "text-xs font-semibold truncate flex items-center gap-1",
                        isActive
                          ? "text-brand dark:text-brand"
                          : "text-slate-900 dark:text-slate-100"
                      )}
                    >
                      <span className="truncate">{conv.title}</span>
                      {isFlagged && (
                        <Flag className="h-2.5 w-2.5 text-red-500 fill-red-500 shrink-0" />
                      )}
                    </span>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {formatRelativeShort(conv.updatedAt)}
                    </span>
                  </div>

                  {/* Preview & Labels */}
                  <div className="flex items-center justify-between gap-1 mt-0.5">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[170px]">
                      {conv.lastMessage?.content ? (
                        conv.lastMessage.isDeleted ? (
                          <span className="italic text-slate-400">
                            Tin nhắn đã thu hồi
                          </span>
                        ) : (
                          conv.lastMessage.content
                        )
                      ) : (
                        <span className="italic text-slate-400">
                          {conv.type === "project"
                            ? "Kênh thảo luận dự án"
                            : "Chưa có tin nhắn"}
                        </span>
                      )}
                    </p>

                    {/* Unread badge & Pin icon */}
                    <div className="flex items-center gap-1 shrink-0">
                      {conv.isMuted && (
                        <BellOff className="h-3 w-3 text-slate-400" />
                      )}

                      {conv.isPinned && (
                        <Pin className="h-3 w-3 text-amber-500 fill-amber-500/20" />
                      )}

                      {conv.unreadCount > 0 && (
                        <span className="flex min-w-4.5 h-4.5 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white shadow-xs">
                          {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Tagged Labels List */}
                  {myLabels.length > 0 && (
                    <div className="flex items-center gap-1 mt-1 overflow-hidden">
                      {myLabels.map((lbl) => (
                        <span
                          key={lbl.id}
                          className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md text-[9px] font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800"
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: lbl.color }}
                          />
                          {lbl.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Lark Action Menu Button on Hover (...) */}
                <div className="hidden group-hover:flex items-center absolute right-2 top-2 z-10 bg-white/90 dark:bg-slate-900/90 rounded-md p-0.5 shadow-xs border border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setContextMenuConvId(
                        contextMenuConvId === conv.id ? null : conv.id
                      );
                      setShowLabelSubmenu(false);
                    }}
                    title="Tùy chọn hội thoại"
                    className="p-1 hover:text-brand text-slate-400"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>

                  {/* Lark Context Menu (Ảnh 4) */}
                  {contextMenuConvId === conv.id && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        onClick={(e) => {
                          e.stopPropagation();
                          setContextMenuConvId(null);
                        }}
                      />
                      <div
                        className="absolute right-0 top-full mt-1 z-40 w-48 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-1.5 shadow-2xl text-xs space-y-0.5 animate-in fade-in zoom-in-95 duration-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* 1. Ghim lên đầu */}
                        <button
                          type="button"
                          onClick={() => {
                            onTogglePinConversation(conv.id);
                            setContextMenuConvId(null);
                          }}
                          className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                        >
                          <Pin className="h-3.5 w-3.5 text-amber-500" />
                          <span>
                            {conv.isPinned ? "Bỏ ghim hội thoại" : "Ghim lên đầu"}
                          </span>
                        </button>

                        {/* 2. Gắn cờ (Flag) */}
                        <button
                          type="button"
                          onClick={() => {
                            toggleFlagConversation(conv.id);
                            setContextMenuConvId(null);
                          }}
                          className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                        >
                          <Flag
                            className={cn(
                              "h-3.5 w-3.5",
                              isFlagged
                                ? "text-red-500 fill-red-500"
                                : "text-slate-400"
                            )}
                          />
                          <span>{isFlagged ? "Bỏ gắn cờ" : "Gắn cờ"}</span>
                        </button>

                        {/* 3. Gắn nhãn > Submenu */}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setShowLabelSubmenu((p) => !p)}
                            className="flex w-full items-center justify-between px-3 py-1.5 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                          >
                            <span className="flex items-center gap-2.5">
                              <Tag className="h-3.5 w-3.5 text-blue-500" />
                              <span>Gắn nhãn</span>
                            </span>
                            <ChevronRight className="h-3 w-3 text-slate-400" />
                          </button>

                          {showLabelSubmenu && (
                            <div className="p-1.5 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/40 space-y-1">
                              {labels.map((lbl) => {
                                const isChecked = (
                                  conversationLabels[conv.id] || []
                                ).includes(lbl.id);
                                return (
                                  <div
                                    key={lbl.id}
                                    onClick={() =>
                                      toggleConversationLabel(conv.id, lbl.id)
                                    }
                                    className="flex items-center justify-between px-2 py-1 rounded-lg hover:bg-white dark:hover:bg-slate-800 cursor-pointer text-[11px]"
                                  >
                                    <span className="flex items-center gap-1.5">
                                      <span
                                        className="h-2 w-2 rounded-full"
                                        style={{ backgroundColor: lbl.color }}
                                      />
                                      <span>{lbl.name}</span>
                                    </span>
                                    {isChecked && (
                                      <Check className="h-3 w-3 text-brand" />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* 4. Tắt/Bật tiếng */}
                        <button
                          type="button"
                          onClick={() => {
                            onToggleMuteConversation(conv.id);
                            setContextMenuConvId(null);
                          }}
                          className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition border-t border-slate-100 dark:border-slate-800/60"
                        >
                          <BellOff className="h-3.5 w-3.5 text-slate-400" />
                          <span>
                            {conv.isMuted ? "Bật thông báo" : "Tắt tiếng"}
                          </span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Tạo Nhãn Mới */}
      {showCreateLabelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-4 space-y-3.5 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Tag className="h-4 w-4 text-brand" />
                Tạo nhãn mới
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateLabelModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateLabel} className="space-y-3">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Tên nhãn
                </label>
                <input
                  type="text"
                  required
                  value={newLabelName}
                  onChange={(e) => setNewLabelName(e.target.value)}
                  placeholder="VD: Dự án Alpha 2026, Đối tác..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/40 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Màu đại diện
                </label>
                <div className="flex items-center gap-2">
                  {[
                    "#F26522",
                    "#3B82F6",
                    "#10B981",
                    "#EC4899",
                    "#8B5CF6",
                    "#F59E0B",
                    "#64748B",
                  ].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewLabelColor(c)}
                      className={cn(
                        "h-6 w-6 rounded-full transition shadow-xs",
                        newLabelColor === c &&
                          "ring-2 ring-offset-2 ring-slate-900 dark:ring-white scale-110"
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateLabelModal(false)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-brand text-white font-semibold hover:bg-brand/90 shadow-xs"
                >
                  Tạo nhãn
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </aside>
  );
}
