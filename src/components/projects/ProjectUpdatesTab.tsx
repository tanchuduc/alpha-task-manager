"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn, getInitials, formatDateVi } from "@/lib/utils";
import type {
  Project,
  Profile,
  ProjectUpdate,
  ProjectUpdateComment,
  ProjectUpdateReaction,
} from "@/types/database";
import {
  MentionTextarea,
  renderContentWithMentions,
  extractMentionedUserIds,
} from "@/components/common/MentionAutocomplete";
import {
  Pin,
  MessageSquare,
  Plus,
  X,
  Send,
  Sparkles,
  Calendar,
  User,
  ThumbsUp,
  Heart,
  PartyPopper,
  Eye,
  Flame,
  Check,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";

interface ProjectUpdatesTabProps {
  project: Project;
  currentUser: Profile;
  allProfiles: Profile[];
  canPostUpdates?: boolean;
}

const AVAILABLE_EMOJIS = [
  { emoji: "👍", label: "Đồng ý" },
  { emoji: "❤️", label: "Yêu thích" },
  { emoji: "🎉", label: "Chúc mừng" },
  { emoji: "👀", label: "Đang xem" },
  { emoji: "🔥", label: "Tuyệt vời" },
];

export function ProjectUpdatesTab({
  project,
  currentUser,
  allProfiles,
  canPostUpdates = true,
}: ProjectUpdatesTabProps) {
  const supabase = useMemo(() => createClient(), []);

  const [updates, setUpdates] = useState<ProjectUpdate[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal create state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newPinned, setNewPinned] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Expanded comment threads
  const [expandedThreads, setExpandedThreads] = useState<Record<string, boolean>>({});
  // Comment drafts per update
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [submittingComment, setSubmittingComment] = useState<Record<string, boolean>>({});

  // Load all updates with comments and reactions
  const loadUpdates = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("project_updates")
        .select(`
          *,
          author:profiles!project_updates_author_id_fkey(*),
          comments:project_update_comments(
            *,
            author:profiles!project_update_comments_author_id_fkey(*)
          ),
          reactions:project_update_reactions(
            *,
            user:profiles!project_update_reactions_user_id_fkey(*)
          )
        `)
        .eq("project_id", project.id)
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setUpdates((data as ProjectUpdate[]) || []);
    } catch (err) {
      console.error("Lỗi tải thảo luận dự án:", err);
      toast.error("Không thể tải danh sách thảo luận dự án");
    } finally {
      setLoading(false);
    }
  }, [project.id, supabase]);

  useEffect(() => {
    loadUpdates();
  }, [loadUpdates]);

  // Realtime subscriptions
  useEffect(() => {
    const updatesChannel = supabase
      .channel(`project-updates-${project.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "alpha_lite",
          table: "project_updates",
          filter: `project_id=eq.${project.id}`,
        },
        () => {
          loadUpdates();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "alpha_lite",
          table: "project_update_comments",
        },
        () => {
          loadUpdates();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "alpha_lite",
          table: "project_update_reactions",
        },
        () => {
          loadUpdates();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(updatesChannel);
    };
  }, [project.id, supabase, loadUpdates]);

  // Handle Create Update
  const handleCreateUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canPostUpdates) {
      toast.error("Bạn không có quyền đăng bài thảo luận trong dự án này.");
      return;
    }
    const titleTrimmed = newTitle.trim();
    const contentTrimmed = newContent.trim();

    if (!titleTrimmed || !contentTrimmed) {
      toast.error("Vui lòng nhập đầy đủ tiêu đề và nội dung.");
      return;
    }

    try {
      setIsSubmitting(true);
      const { data, error } = await supabase
        .from("project_updates")
        .insert({
          project_id: project.id,
          author_id: currentUser.id,
          title: titleTrimmed,
          content: contentTrimmed,
          pinned: newPinned,
        })
        .select(`
          *,
          author:profiles!project_updates_author_id_fkey(*),
          comments:project_update_comments(*),
          reactions:project_update_reactions(*)
        `)
        .single();

      if (error) throw error;

      toast.success("Đã đăng bài thảo luận thành công!");
      setNewTitle("");
      setNewContent("");
      setNewPinned(false);
      setShowCreateModal(false);

      if (data) {
        setUpdates((prev) => [data as ProjectUpdate, ...prev]);
      }

      // Notify mentioned users
      const mentionedIds = extractMentionedUserIds(contentTrimmed, allProfiles).filter(
        (id) => id !== currentUser.id
      );

      if (mentionedIds.length > 0) {
        const notifs = mentionedIds.map((uid) => ({
          user_id: uid,
          actor_id: currentUser.id,
          type: "task_mentioned" as const,
          title: `${currentUser.full_name} đã nhắc bạn trong bài thảo luận dự án ${project.name}`,
          body: contentTrimmed.slice(0, 100),
          link: `/projects/${project.id}?tab=updates`,
          is_read: false,
        }));
        await supabase.from("notifications").insert(notifs);
      }

      // Webhook dispatch
      fetch("/api/webhooks/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "project_update_posted",
          projectId: project.id,
          title: `Thảo luận mới: ${titleTrimmed} (${project.name})`,
          body: contentTrimmed,
          link: `/projects/${project.id}?tab=updates`,
        }),
      }).catch(() => {});
    } catch (err) {
      console.error("Lỗi đăng thảo luận:", err);
      toast.error("Không thể đăng bài thảo luận. Vui lòng thử lại.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle Emoji Reaction
  const handleToggleReaction = async (updateId: string, emoji: string) => {
    const update = updates.find((u) => u.id === updateId);
    if (!update) return;

    const existing = update.reactions?.find(
      (r) => r.user_id === currentUser.id && r.emoji === emoji
    );

    try {
      if (existing) {
        // Optimistic remove
        setUpdates((prev) =>
          prev.map((u) => {
            if (u.id !== updateId) return u;
            return {
              ...u,
              reactions: (u.reactions || []).filter((r) => r.id !== existing.id),
            };
          })
        );
        await supabase
          .from("project_update_reactions")
          .delete()
          .eq("id", existing.id);
      } else {
        // Optimistic add
        const tempId = `temp-${Date.now()}`;
        const newReaction: ProjectUpdateReaction = {
          id: tempId,
          update_id: updateId,
          user_id: currentUser.id,
          emoji,
          created_at: new Date().toISOString(),
          user: currentUser,
        };

        setUpdates((prev) =>
          prev.map((u) => {
            if (u.id !== updateId) return u;
            return {
              ...u,
              reactions: [...(u.reactions || []), newReaction],
            };
          })
        );

        const { data, error } = await supabase
          .from("project_update_reactions")
          .insert({
            update_id: updateId,
            user_id: currentUser.id,
            emoji,
          })
          .select()
          .single();

        if (error) {
          loadUpdates();
        } else if (data) {
          setUpdates((prev) =>
            prev.map((u) => {
              if (u.id !== updateId) return u;
              return {
                ...u,
                reactions: (u.reactions || []).map((r) =>
                  r.id === tempId ? { ...r, id: data.id } : r
                ),
              };
            })
          );
        }
      }
    } catch (err) {
      console.error("Lỗi tương tác emoji:", err);
      loadUpdates();
    }
  };

  // Handle Post Comment
  const handlePostComment = async (updateId: string) => {
    if (!canPostUpdates) {
      toast.error("Bạn không có quyền gửi bình luận trong dự án này.");
      return;
    }
    const draft = commentDrafts[updateId]?.trim();
    if (!draft) return;

    setSubmittingComment((prev) => ({ ...prev, [updateId]: true }));
    try {
      const { data, error } = await supabase
        .from("project_update_comments")
        .insert({
          update_id: updateId,
          author_id: currentUser.id,
          content: draft,
        })
        .select(`
          *,
          author:profiles!project_update_comments_author_id_fkey(*)
        `)
        .single();

      if (error) throw error;

      // Update state
      setUpdates((prev) =>
        prev.map((u) => {
          if (u.id !== updateId) return u;
          return {
            ...u,
            comments: [...(u.comments || []), data as ProjectUpdateComment],
          };
        })
      );

      // Clear draft
      setCommentDrafts((prev) => ({ ...prev, [updateId]: "" }));
      // Ensure thread is open
      setExpandedThreads((prev) => ({ ...prev, [updateId]: true }));
      toast.success("Đã gửi phản hồi.");

      // Check mentions in comment
      const mentionedIds = extractMentionedUserIds(draft, allProfiles).filter(
        (id) => id !== currentUser.id
      );
      if (mentionedIds.length > 0) {
        const notifs = mentionedIds.map((uid) => ({
          user_id: uid,
          actor_id: currentUser.id,
          type: "task_mentioned" as const,
          title: `${currentUser.full_name} đã nhắc bạn trong bình luận thảo luận dự án ${project.name}`,
          body: draft.slice(0, 100),
          link: `/projects/${project.id}?tab=updates`,
          is_read: false,
        }));
        await supabase.from("notifications").insert(notifs);
      }
    } catch (err) {
      console.error("Lỗi gửi bình luận:", err);
      toast.error("Không thể gửi bình luận lúc này.");
    } finally {
      setSubmittingComment((prev) => ({ ...prev, [updateId]: false }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Top action bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-brand" />
            Cập nhật & Thảo luận Dự án
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Không gian trao đổi tiến độ, thông báo quan trọng và phản hồi cho {project.name}
          </p>
        </div>

        {canPostUpdates && (
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-brand-hover cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>+ Đăng bài thảo luận mới</span>
          </button>
        )}
      </div>

      {/* List of Updates */}
      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400 animate-pulse">
          Đang tải dữ liệu thảo luận...
        </div>
      ) : updates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 p-12 text-center bg-white dark:bg-slate-900">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand mb-3 dark:bg-brand-soft-dark">
            <MessageSquare className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
            Chưa có bài thảo luận nào
          </h3>
          <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto dark:text-slate-400">
            Hãy đăng cập nhật tiến độ, chia sẻ thông báo mới hoặc đặt câu hỏi để toàn bộ thành viên dự án cùng theo dõi.
          </p>
          {canPostUpdates && (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-hover cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Đăng cập nhật đầu tiên
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {updates.map((update) => {
            const commentsCount = update.comments?.length || 0;
            const isThreadExpanded = expandedThreads[update.id] ?? false;

            // Group reactions by emoji
            const reactionCounts = AVAILABLE_EMOJIS.map(({ emoji, label }) => {
              const matched = (update.reactions || []).filter(
                (r) => r.emoji === emoji
              );
              const hasReacted = matched.some(
                (r) => r.user_id === currentUser.id
              );
              return {
                emoji,
                label,
                count: matched.length,
                hasReacted,
              };
            });

            return (
              <div
                key={update.id}
                className={cn(
                  "rounded-2xl border bg-white dark:bg-slate-900 p-5 shadow-xs transition",
                  update.pinned
                    ? "border-brand/40 bg-brand-soft/10 dark:border-brand/30 dark:bg-brand-soft-dark/10"
                    : "border-slate-200 dark:border-slate-800"
                )}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {update.author?.avatar_url ? (
                      <img
                        src={update.author.avatar_url}
                        alt={update.author.full_name}
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                        {getInitials(update.author?.full_name || "AB")}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {update.author?.full_name || "Thành viên"}
                        </span>
                        {update.author?.job_title && (
                          <span className="text-[11px] text-slate-400">
                            • {update.author.job_title}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400">
                        {formatDateVi(update.created_at)}
                      </span>
                    </div>
                  </div>

                  {update.pinned && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-semibold text-brand dark:bg-brand-soft-dark">
                      <Pin className="h-3 w-3 fill-brand" />
                      Đã ghim
                    </span>
                  )}
                </div>

                {/* Title & Body */}
                <div className="mt-4">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {update.title}
                  </h3>
                  <div className="mt-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                    {renderContentWithMentions(update.content, allProfiles)}
                  </div>
                </div>

                {/* Reaction Bar */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-1.5">
                  {reactionCounts.map(({ emoji, count, hasReacted, label }) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => handleToggleReaction(update.id, emoji)}
                      title={label}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs transition cursor-pointer border",
                        hasReacted
                          ? "border-brand/40 bg-brand-soft text-brand font-semibold dark:bg-brand-soft-dark"
                          : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                      )}
                    >
                      <span>{emoji}</span>
                      {count > 0 && <span className="text-[11px]">{count}</span>}
                    </button>
                  ))}

                  {/* Comment toggle button */}
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedThreads((prev) => ({
                        ...prev,
                        [update.id]: !isThreadExpanded,
                      }))
                    }
                    className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition cursor-pointer"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span>
                      {commentsCount > 0
                        ? `${commentsCount} phản hồi`
                        : "Bình luận"}
                    </span>
                    {isThreadExpanded ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </button>
                </div>

                {/* Threaded Comments Section */}
                {isThreadExpanded && (
                  <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3 bg-slate-50/50 dark:bg-slate-950/30 -mx-5 -mb-5 p-5 rounded-b-2xl">
                    {/* List of comments */}
                    {update.comments && update.comments.length > 0 ? (
                      <div className="space-y-2.5">
                        {update.comments.map((comment) => (
                          <div
                            key={comment.id}
                            className="flex items-start gap-2.5 rounded-xl bg-white dark:bg-slate-900 p-3 border border-slate-100 dark:border-slate-800 text-xs"
                          >
                            {comment.author?.avatar_url ? (
                              <img
                                src={comment.author.avatar_url}
                                alt={comment.author.full_name}
                                className="h-7 w-7 rounded-full object-cover shrink-0 mt-0.5"
                              />
                            ) : (
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white mt-0.5">
                                {getInitials(comment.author?.full_name || "AB")}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900 dark:text-slate-100">
                                  {comment.author?.full_name || "Thành viên"}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {formatDateVi(comment.created_at)}
                                </span>
                              </div>
                              <div className="mt-1 text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                                {renderContentWithMentions(comment.content, allProfiles)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center py-2 text-xs text-slate-400">
                        Chưa có bình luận nào. Hãy là người đầu tiên phản hồi!
                      </p>
                    )}

                    {/* Reply Input Box */}
                    {canPostUpdates && (
                      <div className="pt-2">
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <MentionTextarea
                              profiles={allProfiles}
                              value={commentDrafts[update.id] || ""}
                              onChange={(val) =>
                                setCommentDrafts((prev) => ({
                                  ...prev,
                                  [update.id]: val,
                                }))
                              }
                              placeholder="Viết câu trả lời... (@ để nhắc tên)"
                              rows={1}
                              dropdownPlacement="top"
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  handlePostComment(update.id);
                                }
                              }}
                              className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => handlePostComment(update.id)}
                            disabled={
                              submittingComment[update.id] ||
                              !commentDrafts[update.id]?.trim()
                            }
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-white shadow-xs transition hover:bg-brand-hover cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Gửi phản hồi"
                          >
                            <Send className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ====================================================================
       * MODAL CREATE NEW PROJECT UPDATE
       * ==================================================================== */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-brand" />
                Đăng bài thảo luận dự án mới
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUpdate} className="mt-4 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Tiêu đề bài thảo luận <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ví dụ: Cập nhật tiến độ duyệt bìa bản thảo 2.0"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              {/* Content with Mention */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nội dung chi tiết <span className="text-red-500">*</span>
                </label>
                <MentionTextarea
                  profiles={allProfiles}
                  value={newContent}
                  onChange={setNewContent}
                  placeholder="Nhập nội dung thảo luận... Gõ @ để nhắc tên thành viên dự án"
                  rows={4}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              {/* Pin checkbox */}
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newPinned}
                  onChange={(e) => setNewPinned(e.target.checked)}
                  className="rounded text-brand focus:ring-brand"
                />
                <span className="flex items-center gap-1">
                  <Pin className="h-3.5 w-3.5 text-brand" />
                  Ghim bài viết này lên đầu danh sách
                </span>
              </label>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newTitle.trim() || !newContent.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-brand-hover cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? "Đang đăng..." : "Đăng bài"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
