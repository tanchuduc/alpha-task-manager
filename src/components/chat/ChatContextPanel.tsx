"use client";

import React, { useState, useMemo } from "react";
import type { Profile } from "@/types/database";
import type {
  UnifiedConversationItem,
  UnifiedMessageItem,
} from "@/lib/chat/useUnifiedChat";
import { cn, getInitials } from "@/lib/utils";
import {
  X,
  Pin,
  BellOff,
  Users,
  FileText,
  CheckSquare,
  Download,
  FolderKanban,
  ExternalLink,
  ChevronRight,
  Shield,
  UserPlus,
  Crown,
} from "lucide-react";

interface ChatContextPanelProps {
  conversation: UnifiedConversationItem | null;
  currentUser: Profile;
  allProfiles: Profile[];
  messages: UnifiedMessageItem[];
  onClose: () => void;
  onScrollToMessage: (id: string) => void;
  onTogglePinConversation: (id: string) => void;
  onToggleMuteConversation: (id: string) => void;
  className?: string;
}

type TabKey = "members" | "files" | "pins";

export function ChatContextPanel({
  conversation,
  currentUser,
  allProfiles,
  messages,
  onClose,
  onScrollToMessage,
  onTogglePinConversation,
  onToggleMuteConversation,
  className,
}: ChatContextPanelProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("members");

  if (!conversation) return null;

  // Extract attached files
  const attachedFiles = messages
    .filter((m) => m.attachmentUrl && !m.isDeleted)
    .map((m) => ({
      id: m.id,
      name: m.attachmentName || "Tệp đính kèm",
      url: m.attachmentUrl!,
      senderName: m.senderName,
      createdAt: m.createdAt,
    }));

  // Extract pinned messages
  const pinnedMessages = messages.filter((m) => m.isPinned && !m.isDeleted);

  // Group members profile lookup
  const groupProfiles = useMemo(() => {
    if (conversation.type !== "group") return [];
    const ids = new Set(conversation.memberIds || []);
    if (conversation.ownerId) ids.add(conversation.ownerId);
    ids.add(currentUser.id);
    return allProfiles.filter((p) => ids.has(p.id));
  }, [conversation, allProfiles, currentUser.id]);

  return (
    <aside
      className={cn(
        "w-80 border-l border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 flex flex-col shrink-0 h-full select-none",
        className
      )}
    >
      {/* Header */}
      <div className="h-15 border-b border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between shrink-0">
        <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
          Thông tin hội thoại
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 text-slate-500 transition cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Overview Card */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col items-center text-center">
        <div className="relative mb-2">
          {conversation.avatarUrl ? (
            <img
              src={conversation.avatarUrl}
              alt={conversation.title}
              className="h-16 w-16 rounded-full object-cover border-2 border-white dark:border-slate-800 shadow-sm"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10 text-brand font-bold text-lg">
              {conversation.type === "project" ? (
                <FolderKanban className="h-8 w-8" />
              ) : conversation.type === "group" ? (
                <Users className="h-8 w-8" />
              ) : (
                getInitials(conversation.title)
              )}
            </div>
          )}
        </div>

        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
          {conversation.title}
        </h4>
        <p className="text-[11px] text-slate-500 mt-0.5">
          {conversation.type === "direct"
            ? conversation.description || "Nhắn tin 1-1"
            : conversation.type === "project"
              ? "Kênh thảo luận dự án"
              : "Nhóm trao đổi công việc"}
        </p>

        {/* Quick Actions Bar */}
        <div className="flex items-center gap-2 mt-3.5">
          <button
            type="button"
            onClick={() => onTogglePinConversation(conversation.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 text-xs rounded-xl border transition cursor-pointer font-medium",
              conversation.isPinned
                ? "bg-amber-50 dark:bg-amber-950/40 text-amber-600 border-amber-300 dark:border-amber-800"
                : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-brand hover:text-brand"
            )}
          >
            <Pin className="h-3.5 w-3.5" />
            <span>{conversation.isPinned ? "Đã ghim" : "Ghim"}</span>
          </button>

          <button
            type="button"
            onClick={() => onToggleMuteConversation(conversation.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 text-xs rounded-xl border transition cursor-pointer font-medium",
              conversation.isMuted
                ? "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700"
                : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-brand hover:text-brand"
            )}
          >
            <BellOff className="h-3.5 w-3.5" />
            <span>{conversation.isMuted ? "Đã tắt" : "Tắt chuông"}</span>
          </button>
        </div>
      </div>

      {/* Tabs: Thành viên (Members) | Tệp (Files) | Đã ghim (Pins) */}
      <div className="grid grid-cols-3 border-b border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-900/40 p-1 m-2 rounded-xl text-xs">
        <button
          type="button"
          onClick={() => setActiveTab("members")}
          className={cn(
            "py-1 font-medium rounded-lg transition cursor-pointer",
            activeTab === "members"
              ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-2xs font-semibold"
              : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          )}
        >
          Thành viên
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("files")}
          className={cn(
            "py-1 font-medium rounded-lg transition cursor-pointer flex items-center justify-center gap-1",
            activeTab === "files"
              ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-2xs font-semibold"
              : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          )}
        >
          <span>Tệp</span>
          {attachedFiles.length > 0 && (
            <span className="text-[10px] opacity-75">({attachedFiles.length})</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("pins")}
          className={cn(
            "py-1 font-medium rounded-lg transition cursor-pointer flex items-center justify-center gap-1",
            activeTab === "pins"
              ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-2xs font-semibold"
              : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          )}
        >
          <span>Ghim</span>
          {pinnedMessages.length > 0 && (
            <span className="text-[10px] opacity-75">({pinnedMessages.length})</span>
          )}
        </button>
      </div>

      {/* Tab Contents */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs">
        {/* TAB 1: MEMBERS */}
        {activeTab === "members" && (
          <div className="space-y-2">
            {conversation.type === "direct" ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2.5 p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-bold text-xs">
                    {getInitials(currentUser.full_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {currentUser.full_name} (Bạn)
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {currentUser.job_title || "Nhân sự Alpha"}
                    </p>
                  </div>
                </div>

                {conversation.partnerProfile && (
                  <div className="flex items-center gap-2.5 p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-bold text-xs">
                      {getInitials(conversation.partnerProfile.full_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {conversation.partnerProfile.full_name}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {conversation.partnerProfile.job_title ||
                          conversation.partnerProfile.department?.name ||
                          "Đồng nghiệp"}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : conversation.type === "group" ? (
              <div className="space-y-1.5">
                <p className="text-[11px] text-slate-500 font-medium px-1">
                  Thành viên nhóm ({groupProfiles.length} thành viên)
                </p>
                {groupProfiles.map((p) => {
                  const isOwner = p.id === conversation.ownerId;
                  const isMe = p.id === currentUser.id;
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-900 transition"
                    >
                      <div className="h-7 w-7 rounded-full bg-brand/10 text-brand flex items-center justify-center font-bold text-[11px]">
                        {getInitials(p.full_name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium text-slate-800 dark:text-slate-200 truncate text-[11px]">
                            {p.full_name} {isMe && "(Bạn)"}
                          </p>
                          {isOwner && (
                            <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.2 text-[9px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                              <Crown className="h-2.5 w-2.5" />
                              Chủ nhóm
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 truncate">
                          {p.job_title || p.department?.name || "Thành viên"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-[11px] text-slate-500 font-medium px-1">
                  Thành viên dự án ({allProfiles.length} người trong danh bạ)
                </p>
                {allProfiles.slice(0, 15).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-900 transition"
                  >
                    <div className="h-7 w-7 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-bold text-[11px]">
                      {getInitials(p.full_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-800 dark:text-slate-200 truncate text-[11px]">
                        {p.full_name}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {p.job_title || "Thành viên"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: FILES & MEDIA */}
        {activeTab === "files" && (
          <div className="space-y-1.5">
            {attachedFiles.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <FileText className="h-8 w-8 mx-auto mb-1.5 opacity-30" />
                <p className="text-xs">Chưa có tệp đính kèm nào</p>
              </div>
            ) : (
              attachedFiles.map((f) => (
                <a
                  key={f.id}
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2.5 p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-brand transition group"
                >
                  <FileText className="h-4 w-4 text-brand shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-800 dark:text-slate-200 truncate text-[11px]">
                      {f.name}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      Gửi bởi {f.senderName} • {new Date(f.createdAt).toLocaleDateString("vi-VN")}
                    </p>
                  </div>
                  <Download className="h-3.5 w-3.5 text-slate-400 group-hover:text-brand shrink-0" />
                </a>
              ))
            )}
          </div>
        )}

        {/* TAB 3: PINNED MESSAGES */}
        {activeTab === "pins" && (
          <div className="space-y-2">
            {pinnedMessages.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <Pin className="h-8 w-8 mx-auto mb-1.5 opacity-30" />
                <p className="text-xs">Chưa có tin nhắn được ghim</p>
              </div>
            ) : (
              pinnedMessages.map((pm) => (
                <div
                  key={pm.id}
                  onClick={() => onScrollToMessage(pm.id)}
                  className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-400 transition cursor-pointer space-y-1"
                >
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {pm.senderName}
                    </span>
                    <span>
                      {new Date(pm.createdAt).toLocaleDateString("vi-VN")}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-700 dark:text-slate-300 line-clamp-3">
                    {pm.content}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
