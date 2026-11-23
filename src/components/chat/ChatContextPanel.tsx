"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
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
  Image as ImageIcon,
  LogOut,
  Calendar,
  AlertCircle,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { AddGroupMemberModal } from "@/components/chat/AddGroupMemberModal";
import { MediaLightboxModal } from "@/components/chat/MediaLightboxModal";

interface ChatContextPanelProps {
  conversation: UnifiedConversationItem | null;
  currentUser: Profile;
  allProfiles: Profile[];
  messages: UnifiedMessageItem[];
  onClose: () => void;
  onScrollToMessage: (id: string) => void;
  onTogglePinConversation: (id: string) => void;
  onToggleMuteConversation: (id: string) => void;
  onAddMembers?: (convId: string, memberIds: string[]) => Promise<void>;
  onLeaveGroup?: (convId: string) => Promise<void>;
  className?: string;
}

type TabKey = "members" | "files" | "tasks" | "pins";
type FileFilterKey = "all" | "media" | "docs";

export function ChatContextPanel({
  conversation,
  currentUser,
  allProfiles,
  messages,
  onClose,
  onScrollToMessage,
  onTogglePinConversation,
  onToggleMuteConversation,
  onAddMembers,
  onLeaveGroup,
  className,
}: ChatContextPanelProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("members");
  const [fileFilter, setFileFilter] = useState<FileFilterKey>("all");
  const [lightboxImage, setLightboxImage] = useState<{
    url: string;
    name?: string | null;
  } | null>(null);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  if (!conversation) return null;

  // Extract attached files
  const attachedFiles = useMemo(() => {
    return messages
      .filter((m) => m.attachmentUrl && !m.isDeleted)
      .map((m) => {
        const isImage = Boolean(
          m.attachmentUrl?.match(/\.(jpeg|jpg|png|gif|webp)$/i) ||
            m.attachmentName?.match(/\.(jpeg|jpg|png|gif|webp)$/i)
        );
        return {
          id: m.id,
          name: m.attachmentName || (isImage ? "Hình ảnh" : "Tệp đính kèm"),
          url: m.attachmentUrl!,
          isImage,
          senderName: m.senderName,
          createdAt: m.createdAt,
        };
      });
  }, [messages]);

  const filteredFiles = useMemo(() => {
    if (fileFilter === "media") return attachedFiles.filter((f) => f.isImage);
    if (fileFilter === "docs") return attachedFiles.filter((f) => !f.isImage);
    return attachedFiles;
  }, [attachedFiles, fileFilter]);

  // Extract task cards from messages
  const extractedTasks = useMemo(() => {
    const list: Array<{
      id: string;
      title: string;
      taskUrl: string;
      messageId: string;
      senderName: string;
      createdAt: string;
      cardType: string;
    }> = [];

    messages.forEach((m) => {
      if (m.isDeleted || !m.content) return;
      const match = m.content.match(
        /\[(Tạo việc thành công|Thẻ công việc):\s*([^\]]+)\]\(([^)]+)\)/
      );
      if (match) {
        list.push({
          id: m.id,
          cardType: match[1],
          title: match[2],
          taskUrl: match[3],
          messageId: m.id,
          senderName: m.senderName,
          createdAt: m.createdAt,
        });
      }
    });

    return list;
  }, [messages]);

  // Extract pinned messages
  const pinnedMessages = useMemo(
    () => messages.filter((m) => m.isPinned && !m.isDeleted),
    [messages]
  );

  // Group members profile lookup
  const groupProfiles = useMemo(() => {
    if (conversation.type !== "group") return [];
    const ids = new Set(conversation.memberIds || []);
    if (conversation.ownerId) ids.add(conversation.ownerId);
    ids.add(currentUser.id);
    return allProfiles.filter((p) => ids.has(p.id));
  }, [conversation, allProfiles, currentUser.id]);

  const isOwner = Boolean(
    conversation.type === "group" && conversation.ownerId === currentUser.id
  );

  return (
    <>
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

        {/* Tabs: Thành viên (Members) | Tệp (Files) | Công việc (Tasks) | Đã ghim (Pins) */}
        <div className="grid grid-cols-4 border-b border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-900/40 p-1 m-2 rounded-xl text-[11px]">
          <button
            type="button"
            onClick={() => setActiveTab("members")}
            className={cn(
              "py-1 font-medium rounded-lg transition cursor-pointer text-center",
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
              "py-1 font-medium rounded-lg transition cursor-pointer text-center",
              activeTab === "files"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-2xs font-semibold"
                : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            )}
          >
            Tệp {attachedFiles.length > 0 && `(${attachedFiles.length})`}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("tasks")}
            className={cn(
              "py-1 font-medium rounded-lg transition cursor-pointer text-center",
              activeTab === "tasks"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-2xs font-semibold"
                : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            )}
          >
            Việc {extractedTasks.length > 0 && `(${extractedTasks.length})`}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("pins")}
            className={cn(
              "py-1 font-medium rounded-lg transition cursor-pointer text-center",
              activeTab === "pins"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-2xs font-semibold"
                : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            )}
          >
            Ghim {pinnedMessages.length > 0 && `(${pinnedMessages.length})`}
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
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <p className="text-[11px] text-slate-500 font-medium">
                      Thành viên ({groupProfiles.length})
                    </p>
                    {onAddMembers && (
                      <button
                        type="button"
                        onClick={() => setShowAddMemberModal(true)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand hover:text-brand-dark transition cursor-pointer"
                      >
                        <UserPlus className="h-3 w-3" />
                        <span>Thêm</span>
                      </button>
                    )}
                  </div>

                  <div className="space-y-1">
                    {groupProfiles.map((p) => {
                      const isCreator = p.id === conversation.ownerId;
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
                              {isCreator && (
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

                  {/* Leave Group Action */}
                  {onLeaveGroup && (
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                      {showLeaveConfirm ? (
                        <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 text-center space-y-2">
                          <p className="text-[11px] font-medium text-red-700 dark:text-red-400">
                            Bạn có chắc chắn muốn rời nhóm này?
                          </p>
                          <div className="flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => setShowLeaveConfirm(false)}
                              className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300"
                            >
                              Hủy
                            </button>
                            <button
                              type="button"
                              onClick={() => onLeaveGroup(conversation.id)}
                              className="px-2.5 py-1 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700"
                            >
                              Xác nhận rời
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowLeaveConfirm(true)}
                          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition text-xs font-medium cursor-pointer"
                        >
                          <LogOut className="h-3.5 w-3.5" />
                          <span>Rời khỏi nhóm</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-slate-500 font-medium px-1">
                    Thành viên tham gia dự án
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
            <div className="space-y-2">
              {/* Filter Pills */}
              <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 pb-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => setFileFilter("all")}
                  className={cn(
                    "px-2 py-0.5 rounded-md font-medium transition cursor-pointer",
                    fileFilter === "all"
                      ? "bg-brand text-white"
                      : "text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
                  )}
                >
                  Tất cả
                </button>
                <button
                  type="button"
                  onClick={() => setFileFilter("media")}
                  className={cn(
                    "px-2 py-0.5 rounded-md font-medium transition cursor-pointer",
                    fileFilter === "media"
                      ? "bg-brand text-white"
                      : "text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
                  )}
                >
                  Hình ảnh
                </button>
                <button
                  type="button"
                  onClick={() => setFileFilter("docs")}
                  className={cn(
                    "px-2 py-0.5 rounded-md font-medium transition cursor-pointer",
                    fileFilter === "docs"
                      ? "bg-brand text-white"
                      : "text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
                  )}
                >
                  Tài liệu
                </button>
              </div>

              {filteredFiles.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <FileText className="h-8 w-8 mx-auto mb-1.5 opacity-30" />
                  <p className="text-xs">Chưa có tệp nào trong mục này</p>
                </div>
              ) : fileFilter === "media" ? (
                /* Media Gallery Grid */
                <div className="grid grid-cols-3 gap-1.5 pt-1">
                  {filteredFiles.map((f) => (
                    <div
                      key={f.id}
                      onClick={() => setLightboxImage({ url: f.url, name: f.name })}
                      className="aspect-square rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 cursor-pointer hover:opacity-90 transition relative group"
                    >
                      <img
                        src={f.url}
                        alt={f.name}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                        <ImageIcon className="h-4 w-4 text-white" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* List View for Docs and All */
                <div className="space-y-1.5 pt-1">
                  {filteredFiles.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center gap-2.5 p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-brand transition group"
                    >
                      {f.isImage ? (
                        <div
                          onClick={() => setLightboxImage({ url: f.url, name: f.name })}
                          className="h-8 w-8 rounded-lg overflow-hidden shrink-0 cursor-pointer"
                        >
                          <img
                            src={f.url}
                            alt={f.name}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ) : (
                        <FileText className="h-5 w-5 text-brand shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-800 dark:text-slate-200 truncate text-[11px]">
                          {f.name}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {f.senderName} •{" "}
                          {new Date(f.createdAt).toLocaleDateString("vi-VN", {
                            day: "2-digit",
                            month: "2-digit",
                          })}
                        </p>
                      </div>
                      <a
                        href={f.url}
                        download={f.name}
                        target="_blank"
                        rel="noreferrer"
                        className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-brand transition shrink-0"
                        title="Tải xuống tệp"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: TASKS IN THIS CHAT */}
          {activeTab === "tasks" && (
            <div className="space-y-2">
              <p className="text-[11px] text-slate-500 font-medium px-1">
                Công việc được chia sẻ trong hội thoại ({extractedTasks.length})
              </p>

              {extractedTasks.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <CheckSquare className="h-8 w-8 mx-auto mb-1.5 opacity-30" />
                  <p className="text-xs">Chưa có công việc nào được chia sẻ</p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Bấm &quot;Chia sẻ&quot; từ thẻ Task hoặc dùng &quot;Tạo việc từ tin nhắn&quot;
                  </p>
                </div>
              ) : (
                extractedTasks.map((t) => (
                  <div
                    key={t.id}
                    className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-brand transition space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-semibold text-brand">
                        {t.cardType}
                      </span>
                      <span className="text-slate-400">
                        {new Date(t.createdAt).toLocaleDateString("vi-VN", {
                          day: "2-digit",
                          month: "2-digit",
                        })}
                      </span>
                    </div>

                    <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200 line-clamp-2">
                      {t.title}
                    </h5>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                      <button
                        type="button"
                        onClick={() => onScrollToMessage(t.messageId)}
                        className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                      >
                        Xem tin nhắn
                      </button>

                      <Link
                        href={t.taskUrl}
                        className="inline-flex items-center gap-1 font-semibold text-brand hover:underline"
                      >
                        <span>Mở việc</span>
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 4: PINNED MESSAGES */}
          {activeTab === "pins" && (
            <div className="space-y-1.5">
              {pinnedMessages.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <Pin className="h-8 w-8 mx-auto mb-1.5 opacity-30" />
                  <p className="text-xs">Chưa có tin nhắn nào được ghim</p>
                </div>
              ) : (
                pinnedMessages.map((m) => (
                  <div
                    key={m.id}
                    onClick={() => onScrollToMessage(m.id)}
                    className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-700 transition cursor-pointer space-y-1"
                  >
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {m.senderName}
                      </span>
                      <span className="text-slate-400">
                        {new Date(m.createdAt).toLocaleDateString("vi-VN", {
                          day: "2-digit",
                          month: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3">
                      {m.content}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Modal Lightbox Xem trước ảnh */}
      {lightboxImage && (
        <MediaLightboxModal
          imageUrl={lightboxImage.url}
          imageName={lightboxImage.name}
          onClose={() => setLightboxImage(null)}
        />
      )}

      {/* Modal Thêm thành viên vào nhóm */}
      {showAddMemberModal && conversation.type === "group" && onAddMembers && (
        <AddGroupMemberModal
          conversationTitle={conversation.title}
          existingMemberIds={conversation.memberIds || []}
          allProfiles={allProfiles}
          onClose={() => setShowAddMemberModal(false)}
          onAddMembers={async (newIds) => {
            await onAddMembers(conversation.id, newIds);
            setShowAddMemberModal(false);
          }}
        />
      )}
    </>
  );
}
