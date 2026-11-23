"use client";

import React, { useState } from "react";
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
} from "lucide-react";

interface ChatSidebarProps {
  conversations: UnifiedConversationItem[];
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
  { key: "direct", label: "1-1" },
  { key: "group", label: "Nhóm" },
  { key: "project", label: "Dự án" },
];

export function ChatSidebar({
  conversations,
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
                  {conversations.length}
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
                <div className="absolute right-0 top-8 z-40 w-44 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1 shadow-lg text-xs">
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

        {/* 3. Filter Pill Tabs: Tất cả | Chưa đọc | 1-1 | Nhóm | Dự án */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
          {FILTER_ITEMS.map((tab) => {
            const isActive = activeFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onChangeFilter(tab.key)}
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
      </div>

      {/* 4. Conversations Scroll List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 p-1.5 space-y-0.5">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400">
            <MessageSquare className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-xs font-medium">Không tìm thấy cuộc trò chuyện</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Thử tìm kiếm từ khóa khác hoặc đổi bộ lọc
            </p>
          </div>
        ) : (
          conversations.map((conv) => {
            const isActive = conv.id === activeConversationId;
            const isOnline =
              conv.type === "direct" &&
              conv.partnerId &&
              onlineUserIds.has(conv.partnerId);

            return (
              <div
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
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
                        "text-xs font-semibold truncate",
                        isActive
                          ? "text-brand dark:text-brand"
                          : "text-slate-900 dark:text-slate-100"
                      )}
                    >
                      {conv.title}
                    </span>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {formatRelativeShort(conv.updatedAt)}
                    </span>
                  </div>

                  {/* Preview & Subtitle */}
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
                </div>

                {/* Quick Hover Pin Button */}
                <div className="hidden group-hover:flex items-center absolute right-2 top-2 bg-white/90 dark:bg-slate-900/90 rounded-md p-0.5 shadow-xs border border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTogglePinConversation(conv.id);
                    }}
                    title={conv.isPinned ? "Bỏ ghim hội thoại" : "Ghim hội thoại lên đầu"}
                    className="p-1 hover:text-brand text-slate-400"
                  >
                    {conv.isPinned ? (
                      <PinOff className="h-3 w-3" />
                    ) : (
                      <Pin className="h-3 w-3" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleMuteConversation(conv.id);
                    }}
                    title={conv.isMuted ? "Bật thông báo" : "Tắt thông báo"}
                    className="p-1 hover:text-brand text-slate-400"
                  >
                    <BellOff
                      className={cn(
                        "h-3 w-3",
                        conv.isMuted && "text-slate-700 dark:text-slate-200"
                      )}
                    />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
