"use client";

import React, { useState, useMemo } from "react";
import type { Profile } from "@/types/database";
import type {
  UnifiedConversationItem,
  UnifiedMessageItem,
} from "@/lib/chat/useUnifiedChat";
import { cn, getInitials, removeVietnameseTones } from "@/lib/utils";
import {
  X,
  Forward,
  Search,
  Check,
  Users,
  FolderKanban,
  User,
  Loader2,
  FileText,
  ImageIcon,
} from "lucide-react";
import { toast } from "sonner";

interface ForwardMessageModalProps {
  message: UnifiedMessageItem;
  conversations: UnifiedConversationItem[];
  currentUser: Profile;
  onClose: () => void;
  onForward: (
    targetConversationIds: string[],
    additionalComment?: string
  ) => Promise<void>;
}

export function ForwardMessageModal({
  message,
  conversations,
  currentUser,
  onClose,
  onForward,
}: ForwardMessageModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedConvIds, setSelectedConvIds] = useState<Set<string>>(
    () => new Set()
  );
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "direct" | "group" | "project">("all");

  // Filter conversations
  const filteredConversations = useMemo(() => {
    const q = removeVietnameseTones(searchQuery);
    return conversations.filter((c) => {
      // Don't forward to deleted items
      if (activeTab === "direct" && c.type !== "direct") return false;
      if (activeTab === "group" && c.type !== "group") return false;
      if (activeTab === "project" && c.type !== "project") return false;

      if (!q) return true;
      const title = removeVietnameseTones(c.title || "");
      const desc = removeVietnameseTones(c.description || "");
      return title.includes(q) || desc.includes(q);
    });
  }, [conversations, activeTab, searchQuery]);

  const toggleSelect = (id: string) => {
    setSelectedConvIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    setSelectedConvIds((prev) => {
      const next = new Set(prev);
      filteredConversations.forEach((c) => next.add(c.id));
      return next;
    });
  };

  const handleDeselectAll = () => {
    setSelectedConvIds(new Set());
  };

  const handleForward = async () => {
    if (selectedConvIds.size === 0) {
      toast.error("Vui lòng chọn ít nhất một cuộc trò chuyện để chuyển tiếp.");
      return;
    }

    setIsSubmitting(true);
    try {
      await onForward(Array.from(selectedConvIds), comment.trim() || undefined);
      toast.success(`Đã chuyển tiếp tới ${selectedConvIds.size} cuộc trò chuyện!`);
      onClose();
    } catch (err) {
      console.error("Lỗi chuyển tiếp:", err);
      toast.error("Không thể chuyển tiếp tin nhắn. Vui lòng thử lại.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500 text-white shadow-xs">
              <Forward className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Chuyển tiếp tin nhắn
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Chia sẻ tin nhắn tới đồng nghiệp, nhóm hoặc dự án liên quan
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs">
          {/* 1. Preview Tin Nhắn Được Chuyển Tiếp */}
          <div className="rounded-xl border border-blue-200/80 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/20 p-3 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-semibold text-blue-700 dark:text-blue-300">
              <span className="flex items-center gap-1.5">
                <Forward className="h-3.5 w-3.5" />
                Tin nhắn từ {message.senderName}
              </span>
              <span className="text-[10px] text-slate-400">
                {new Date(message.createdAt).toLocaleTimeString("vi-VN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>

            <p className="text-slate-800 dark:text-slate-200 line-clamp-3 leading-relaxed whitespace-pre-wrap">
              {message.content || "[Tệp đính kèm]"}
            </p>

            {message.attachmentUrl && (
              <div className="flex items-center gap-1.5 pt-1 text-[11px] text-slate-500">
                {message.attachmentUrl.match(/\.(jpeg|jpg|png|gif|webp)$/i) ? (
                  <ImageIcon className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <FileText className="h-3.5 w-3.5 text-blue-500" />
                )}
                <span className="truncate">{message.attachmentName || "Tệp đính kèm"}</span>
              </div>
            )}
          </div>

          {/* 2. Lời nhắn kèm theo (tùy chọn) */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-800 dark:text-slate-200">
              Lời nhắn gửi kèm (tùy chọn)
            </label>
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="VD: Nhờ anh/chị xem qua nội dung này nhé..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950/40 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          {/* 3. Danh sách cuộc trò chuyện đích */}
          <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-800 dark:text-slate-200">
                Chọn người nhận ({selectedConvIds.size} đã chọn)
              </label>
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={handleSelectAllFiltered}
                  className="text-brand hover:underline"
                >
                  Chọn tất cả
                </button>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  Bỏ chọn
                </button>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1">
              {[
                { key: "all", label: "Tất cả" },
                { key: "direct", label: "Cá nhân" },
                { key: "group", label: "Nhóm" },
                { key: "project", label: "Dự án" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key as any)}
                  className={cn(
                    "px-2.5 py-1 text-[11px] rounded-lg transition",
                    activeTab === tab.key
                      ? "bg-brand text-white font-semibold"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm đồng nghiệp, nhóm hoặc dự án..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-brand text-xs"
              />
            </div>

            {/* Conversation List Scroll */}
            <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800/60 bg-white dark:bg-slate-900">
              {filteredConversations.length === 0 ? (
                <div className="p-4 text-center text-slate-400 text-xs">
                  Không tìm thấy cuộc trò chuyện phù hợp
                </div>
              ) : (
                filteredConversations.map((conv) => {
                  const isChecked = selectedConvIds.has(conv.id);
                  return (
                    <div
                      key={conv.id}
                      onClick={() => toggleSelect(conv.id)}
                      className={cn(
                        "flex items-center justify-between p-2.5 cursor-pointer transition",
                        isChecked
                          ? "bg-blue-50/60 dark:bg-blue-950/30"
                          : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {conv.avatarUrl ? (
                          <img
                            src={conv.avatarUrl}
                            alt={conv.title}
                            className="h-8 w-8 rounded-full object-cover shrink-0"
                          />
                        ) : conv.type === "project" ? (
                          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-100 dark:bg-orange-900/60 text-brand font-bold text-xs shrink-0">
                            <FolderKanban className="h-4 w-4" />
                          </div>
                        ) : conv.type === "group" ? (
                          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 font-bold text-xs shrink-0">
                            <Users className="h-4 w-4" />
                          </div>
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-200 dark:bg-slate-800 font-bold text-xs shrink-0">
                            {getInitials(conv.title)}
                          </div>
                        )}

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-semibold text-slate-900 dark:text-slate-100 truncate text-xs">
                              {conv.title}
                            </p>
                            <span
                              className={cn(
                                "text-[9px] px-1.5 py-0.2 rounded font-medium",
                                conv.type === "project"
                                  ? "bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300"
                                  : conv.type === "group"
                                    ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300"
                                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                              )}
                            >
                              {conv.type === "project"
                                ? "Dự án"
                                : conv.type === "group"
                                  ? "Nhóm"
                                  : "1-1"}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 truncate">
                            {conv.description || conv.lastMessage?.content || "Không có mô tả"}
                          </p>
                        </div>
                      </div>

                      {/* Custom Checkbox */}
                      <div
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded-md border transition shrink-0",
                          isChecked
                            ? "bg-blue-600 border-blue-600 text-white shadow-2xs"
                            : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
                        )}
                      >
                        {isChecked && <Check className="h-3.5 w-3.5" />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition text-xs"
          >
            Hủy bỏ
          </button>
          <button
            type="button"
            onClick={handleForward}
            disabled={isSubmitting || selectedConvIds.size === 0}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition text-xs shadow-xs disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Đang gửi...</span>
              </>
            ) : (
              <>
                <Forward className="h-3.5 w-3.5" />
                <span>Chuyển tiếp ({selectedConvIds.size})</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
