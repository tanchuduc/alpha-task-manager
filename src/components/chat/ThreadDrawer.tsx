"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import type { Profile } from "@/types/database";
import type { UnifiedMessageItem } from "@/lib/chat/useUnifiedChat";
import { cn, getInitials } from "@/lib/utils";
import {
  X,
  Send,
  MessageSquare,
  CornerDownRight,
  Smile,
  Paperclip,
  Image as ImageIcon,
  CheckCheck,
  FileText,
} from "lucide-react";
import {
  MentionTextarea,
  renderContentWithMentions,
} from "@/components/common/MentionAutocomplete";
import { toast } from "sonner";

interface ThreadDrawerProps {
  parentMessage: UnifiedMessageItem;
  messages: UnifiedMessageItem[];
  currentUser: Profile;
  allProfiles: Profile[];
  onClose: () => void;
  onSendMessage: (
    content: string,
    options?: {
      attachmentUrl?: string | null;
      attachmentName?: string | null;
      replyToId?: string | null;
    }
  ) => Promise<void>;
  onToggleReaction: (msg: UnifiedMessageItem, emoji: string) => Promise<void>;
  className?: string;
}

const QUICK_REACTIONS = ["👍", "❤️", "🎉", "🚀", "👀"];

export function ThreadDrawer({
  parentMessage,
  messages,
  currentUser,
  allProfiles,
  onClose,
  onSendMessage,
  onToggleReaction,
  className,
}: ThreadDrawerProps) {
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const repliesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Esc key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Extract all replies to this parent message
  const threadReplies = useMemo(() => {
    return messages.filter(
      (m) => m.replyToId === parentMessage.id && !m.isDeleted
    );
  }, [messages, parentMessage.id]);

  // Auto-scroll when new reply arrives
  useEffect(() => {
    repliesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadReplies.length]);

  const handleSendReply = async () => {
    const trimmed = inputText.trim();
    if (!trimmed || isSending) return;

    setIsSending(true);
    try {
      await onSendMessage(trimmed, {
        replyToId: parentMessage.id,
      });
      setInputText("");
      setTimeout(() => textareaRef.current?.focus(), 50);
    } catch (err) {
      console.error("Lỗi gửi phản hồi thread:", err);
      toast.error("Không thể gửi phản hồi. Vui lòng thử lại.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <aside
      className={cn(
        "w-88 sm:w-96 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col shrink-0 h-full select-none z-20 shadow-lg",
        className
      )}
    >
      {/* 1. Thread Header */}
      <div className="h-15 border-b border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between shrink-0 bg-white dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/10 text-brand">
            <MessageSquare className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              Nhánh thảo luận (Thread)
            </h3>
            <p className="text-[11px] text-slate-400">
              với {parentMessage.senderName}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Đóng nhánh thảo luận (Esc)"
          className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 2. Thread Content Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ROOT MESSAGE CARD */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-brand/15 text-brand flex items-center justify-center font-bold text-xs shrink-0">
                {parentMessage.senderAvatar ? (
                  <img
                    src={parentMessage.senderAvatar}
                    alt={parentMessage.senderName}
                    className="h-full w-full rounded-full object-cover"
                  />
                ) : (
                  getInitials(parentMessage.senderName)
                )}
              </div>
              <div>
                <p className="font-semibold text-xs text-slate-900 dark:text-slate-100">
                  {parentMessage.senderName}
                </p>
                <p className="text-[10px] text-slate-400">
                  {new Date(parentMessage.createdAt).toLocaleTimeString("vi-VN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
            {renderContentWithMentions(parentMessage.content, allProfiles)}
          </div>

          {parentMessage.attachmentUrl && (
            <div className="pt-1">
              {parentMessage.attachmentUrl.match(/\.(jpeg|jpg|png|gif|webp)$/i) ? (
                <img
                  src={parentMessage.attachmentUrl}
                  alt={parentMessage.attachmentName || "Ảnh"}
                  className="max-h-40 rounded-xl object-cover"
                />
              ) : (
                <a
                  href={parentMessage.attachmentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  <FileText className="h-4 w-4 text-brand" />
                  <span className="truncate max-w-[180px]">
                    {parentMessage.attachmentName || "Tệp đính kèm"}
                  </span>
                </a>
              )}
            </div>
          )}
        </div>

        {/* REPLIES SEPARATOR */}
        <div className="relative flex items-center justify-center my-3">
          <div className="border-t border-slate-200 dark:border-slate-800 w-full" />
          <span className="absolute bg-white dark:bg-slate-900 px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            {threadReplies.length} câu trả lời
          </span>
        </div>

        {/* REPLIES LIST */}
        <div className="space-y-3">
          {threadReplies.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <CornerDownRight className="h-8 w-8 mx-auto mb-1.5 opacity-30 text-brand" />
              <p className="text-xs">Chưa có câu trả lời nào trong nhánh</p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Hãy là người đầu tiên bắt đầu phản hồi!
              </p>
            </div>
          ) : (
            threadReplies.map((reply) => {
              const isMine = reply.senderId === currentUser.id;
              return (
                <div
                  key={reply.id}
                  className={cn(
                    "flex gap-2.5",
                    isMine ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  <div className="h-6 w-6 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-bold text-[10px] shrink-0">
                    {reply.senderAvatar ? (
                      <img
                        src={reply.senderAvatar}
                        alt={reply.senderName}
                        className="h-full w-full rounded-full object-cover"
                      />
                    ) : (
                      getInitials(reply.senderName)
                    )}
                  </div>

                  <div className="max-w-[78%] space-y-1">
                    <div
                      className={cn(
                        "flex items-center gap-1.5 text-[10px] text-slate-400",
                        isMine ? "justify-end" : "justify-start"
                      )}
                    >
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {isMine ? "Bạn" : reply.senderName}
                      </span>
                      <span>
                        {new Date(reply.createdAt).toLocaleTimeString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    <div
                      className={cn(
                        "rounded-2xl px-3 py-2 text-xs leading-relaxed break-words shadow-2xs",
                        isMine
                          ? "bg-brand text-white rounded-tr-xs"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-tl-xs"
                      )}
                    >
                      {renderContentWithMentions(reply.content, allProfiles, {
                        isInverse: isMine,
                      })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={repliesEndRef} />
        </div>
      </div>

      {/* 3. Thread Composer */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
        <div className="relative rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-2 focus-within:border-brand focus-within:bg-white dark:focus-within:bg-slate-900 transition">
          <textarea
            ref={textareaRef}
            rows={2}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendReply();
              }
            }}
            placeholder="Trả lời trong nhánh thảo luận..."
            className="w-full bg-transparent resize-none text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none pr-8"
          />

          <button
            type="button"
            disabled={!inputText.trim() || isSending}
            onClick={handleSendReply}
            className={cn(
              "absolute right-2 bottom-2 flex h-6 w-6 items-center justify-center rounded-lg transition shadow-2xs",
              inputText.trim()
                ? "bg-brand text-white hover:bg-brand-dark cursor-pointer"
                : "bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed"
            )}
          >
            <Send className="h-3 w-3" />
          </button>
        </div>
        <p className="text-[10px] text-slate-400 mt-1 text-center">
          Nhấn Enter để gửi phản hồi vào thread
        </p>
      </div>
    </aside>
  );
}
