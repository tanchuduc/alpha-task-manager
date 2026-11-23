"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn, getInitials, formatDateVi } from "@/lib/utils";
import type {
  Project,
  Profile,
  ProjectUpdate,
  ProjectUpdateComment,
  ProjectUpdateReaction,
  ProjectUpdateAttachment,
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
  Megaphone,
  Rocket,
  AlertCircle,
  HelpCircle,
  Paperclip,
  FileText,
  Image as ImageIcon,
  Trash2,
  Download,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Loader2,
  Filter,
} from "lucide-react";
import { toast } from "sonner";

interface ProjectUpdatesTabProps {
  project: Project;
  currentUser: Profile;
  allProfiles: Profile[];
  canPostUpdates?: boolean;
}

type UpdateCategory = "announcement" | "progress" | "blocker" | "general";

const CATEGORY_CONFIG: Record<
  UpdateCategory,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badgeClass: string;
    pillClass: string;
  }
> = {
  announcement: {
    label: "Thông báo",
    icon: Megaphone,
    badgeClass:
      "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800",
    pillClass:
      "hover:bg-purple-50 hover:text-purple-700 hover:border-purple-200 dark:hover:bg-purple-950/50",
  },
  progress: {
    label: "Cập nhật tiến độ",
    icon: Rocket,
    badgeClass:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800",
    pillClass:
      "hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 dark:hover:bg-emerald-950/50",
  },
  blocker: {
    label: "Rủi ro / Cần trợ giúp",
    icon: AlertCircle,
    badgeClass:
      "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800",
    pillClass:
      "hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 dark:hover:bg-rose-950/50",
  },
  general: {
    label: "Thảo luận chung",
    icon: MessageSquare,
    badgeClass:
      "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    pillClass:
      "hover:bg-slate-100 hover:text-slate-800 hover:border-slate-300 dark:hover:bg-slate-800",
  },
};

const AVAILABLE_EMOJIS = [
  { emoji: "👍", label: "Đồng ý" },
  { emoji: "❤️", label: "Yêu thích" },
  { emoji: "🎉", label: "Chúc mừng" },
  { emoji: "👀", label: "Đang xem" },
  { emoji: "🔥", label: "Tuyệt vời" },
];

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

interface PendingAttachment {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  isImage: boolean;
  previewUrl?: string;
}

export function ProjectUpdatesTab({
  project,
  currentUser,
  allProfiles,
  canPostUpdates = true,
}: ProjectUpdatesTabProps) {
  const supabase = useMemo(() => createClient(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [updates, setUpdates] = useState<ProjectUpdate[]>([]);
  const [loading, setLoading] = useState(true);

  // In-line composer states
  const [isComposerExpanded, setIsComposerExpanded] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState<UpdateCategory>("general");
  const [newPinned, setNewPinned] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingAttachment[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter state
  const [selectedFilter, setSelectedFilter] = useState<string>("all");

  // Expanded comment threads
  const [expandedThreads, setExpandedThreads] = useState<Record<string, boolean>>({});
  // Comment drafts per update
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [submittingComment, setSubmittingComment] = useState<Record<string, boolean>>({});

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      pendingFiles.forEach((f) => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
    };
  }, [pendingFiles]);

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
      console.error("Lỗi tải bản tin dự án:", err);
      toast.error("Không thể tải danh sách bản tin dự án");
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

  // Handle file select
  const handleSelectFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const validFiles = files.filter((f) => {
      if (f.size > 25 * 1024 * 1024) {
        toast.error(`Tệp "${f.name}" vượt quá kích thước 25MB`);
        return false;
      }
      return true;
    });

    const newAttachments: PendingAttachment[] = validFiles.map((file) => {
      const isImage = file.type.startsWith("image/");
      const previewUrl = isImage ? URL.createObjectURL(file) : undefined;
      return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream",
        isImage,
        previewUrl,
      };
    });

    setPendingFiles((prev) => [...prev, ...newAttachments]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemovePendingFile = (id: string) => {
    setPendingFiles((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  };

  // Handle Create Update
  const handleCreateUpdate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!canPostUpdates) {
      toast.error("Bạn không có quyền đăng bản tin trong dự án này.");
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

      // Upload pending files if any
      const uploadedAttachments: ProjectUpdateAttachment[] = [];
      if (pendingFiles.length > 0) {
        for (const item of pendingFiles) {
          const cleanName = item.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const path = `updates/${project.id}/${Date.now()}_${cleanName}`;
          const { error: uploadError } = await supabase.storage
            .from("attachments")
            .upload(path, item.file);

          if (uploadError) {
            console.warn("Storage upload warn:", uploadError);
          }

          const { data: pubData } = supabase.storage
            .from("attachments")
            .getPublicUrl(path);

          uploadedAttachments.push({
            id: crypto.randomUUID(),
            name: item.name,
            url: pubData?.publicUrl || "",
            size: item.size,
            type: item.type,
          });
        }
      }

      const { data, error } = await supabase
        .from("project_updates")
        .insert({
          project_id: project.id,
          author_id: currentUser.id,
          title: titleTrimmed,
          content: contentTrimmed,
          pinned: newPinned,
          category: newCategory,
          attachments: uploadedAttachments,
        })
        .select(`
          *,
          author:profiles!project_updates_author_id_fkey(*),
          comments:project_update_comments(*),
          reactions:project_update_reactions(*)
        `)
        .single();

      if (error) throw error;

      toast.success("Đã đăng bản tin thành công!");
      setNewTitle("");
      setNewContent("");
      setNewCategory("general");
      setNewPinned(false);
      setPendingFiles([]);
      setIsComposerExpanded(false);

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
          title: `${currentUser.full_name} đã nhắc bạn trong bản tin dự án ${project.name}`,
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
          title: `[${CATEGORY_CONFIG[newCategory].label}] ${titleTrimmed} (${project.name})`,
          body: contentTrimmed,
          link: `/projects/${project.id}?tab=updates`,
        }),
      }).catch(() => {});
    } catch (err) {
      console.error("Lỗi đăng bản tin:", err);
      toast.error("Không thể đăng bản tin. Vui lòng thử lại.");
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

      setUpdates((prev) =>
        prev.map((u) => {
          if (u.id !== updateId) return u;
          return {
            ...u,
            comments: [...(u.comments || []), data as ProjectUpdateComment],
          };
        })
      );

      setCommentDrafts((prev) => ({ ...prev, [updateId]: "" }));
      setExpandedThreads((prev) => ({ ...prev, [updateId]: true }));
      toast.success("Đã gửi phản hồi.");

      const mentionedIds = extractMentionedUserIds(draft, allProfiles).filter(
        (id) => id !== currentUser.id
      );
      if (mentionedIds.length > 0) {
        const notifs = mentionedIds.map((uid) => ({
          user_id: uid,
          actor_id: currentUser.id,
          type: "task_mentioned" as const,
          title: `${currentUser.full_name} đã nhắc bạn trong bình luận bản tin dự án ${project.name}`,
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

  // Toggle Pin on existing update
  const handleTogglePin = async (updateId: string, currentPinned: boolean) => {
    try {
      const { error } = await supabase
        .from("project_updates")
        .update({ pinned: !currentPinned })
        .eq("id", updateId);

      if (error) throw error;
      setUpdates((prev) =>
        prev.map((u) => (u.id === updateId ? { ...u, pinned: !currentPinned } : u))
      );
      toast.success(!currentPinned ? "Đã ghim bài viết" : "Đã bỏ ghim");
    } catch (err) {
      toast.error("Không thể cập nhật ghim");
    }
  };

  // Delete update
  const handleDeleteUpdate = async (updateId: string) => {
    if (!confirm("Bạn có chắc chắn muốn xóa bài viết này không?")) return;
    try {
      const { error } = await supabase
        .from("project_updates")
        .delete()
        .eq("id", updateId);
      if (error) throw error;
      setUpdates((prev) => prev.filter((u) => u.id !== updateId));
      toast.success("Đã xóa bài viết thành công");
    } catch (err) {
      toast.error("Không thể xóa bài viết");
    }
  };

  // Quick template trigger
  const applyTemplate = (cat: UpdateCategory, tTitle: string, tContent: string) => {
    setIsComposerExpanded(true);
    setNewCategory(cat);
    setNewTitle(tTitle);
    setNewContent(tContent);
    window.scrollTo({ top: 120, behavior: "smooth" });
  };

  // Filtered updates
  const filteredUpdates = useMemo(() => {
    if (selectedFilter === "all") return updates;
    if (selectedFilter === "pinned") return updates.filter((u) => u.pinned);
    return updates.filter((u) => (u.category || "general") === selectedFilter);
  }, [updates, selectedFilter]);

  return (
    <div className="space-y-6">
      {/* ====================================================================
       * HEADER BANNER
       * ==================================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-brand" />
            Bản tin & Tiến độ Dự án
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Không gian thông báo chính thức, cập nhật mốc tiến độ và thảo luận trọng tâm cho {project.name}
          </p>
        </div>

        {canPostUpdates && (
          <button
            type="button"
            onClick={() => setIsComposerExpanded((prev) => !prev)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-brand-hover cursor-pointer"
          >
            {isComposerExpanded ? (
              <>
                <ChevronUp className="h-4 w-4" />
                <span>Thu gọn khung đăng</span>
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                <span>Đăng bản tin mới</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* ====================================================================
       * IN-LINE POST COMPOSER (KÈM ĐÍNH KÈM FILE & HÌNH ẢNH)
       * ==================================================================== */}
      {canPostUpdates && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900 transition-all">
          {!isComposerExpanded ? (
            /* Collapsed bar */
            <div
              onClick={() => setIsComposerExpanded(true)}
              className="flex items-center gap-3 p-4 cursor-pointer hover:bg-slate-50/70 dark:hover:bg-slate-800/40 rounded-2xl transition"
            >
              {currentUser.avatar_url ? (
                <img
                  src={currentUser.avatar_url}
                  alt={currentUser.full_name}
                  className="h-9 w-9 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                  {getInitials(currentUser.full_name)}
                </div>
              )}
              <div className="flex-1 rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-2 text-xs text-slate-400 dark:border-slate-700/80 dark:bg-slate-800/60">
                Chia sẻ thông báo, cập nhật tiến độ bản thảo hoặc gửi tài liệu... (@ để nhắc tên)
              </div>
              <div className="hidden sm:flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  <Paperclip className="h-3.5 w-3.5 text-slate-400" />
                  Đính kèm tệp
                </span>
                <span className="inline-flex items-center gap-1 rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs text-purple-700 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300">
                  <Megaphone className="h-3.5 w-3.5" />
                  Thông báo
                </span>
                <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <Rocket className="h-3.5 w-3.5" />
                  Tiến độ
                </span>
              </div>
            </div>
          ) : (
            /* Expanded Full Form */
            <form onSubmit={handleCreateUpdate} className="p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  {currentUser.avatar_url ? (
                    <img
                      src={currentUser.avatar_url}
                      alt={currentUser.full_name}
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                      {getInitials(currentUser.full_name)}
                    </div>
                  )}
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                      {currentUser.full_name}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Đăng bản tin vào dự án {project.name}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsComposerExpanded(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 cursor-pointer"
                  title="Thu gọn"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Category selector */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
                  Phân loại bài viết
                </label>
                <div className="flex flex-wrap gap-2">
                  {(
                    Object.keys(CATEGORY_CONFIG) as UpdateCategory[]
                  ).map((catKey) => {
                    const cfg = CATEGORY_CONFIG[catKey];
                    const IconComp = cfg.icon;
                    const isSelected = newCategory === catKey;
                    return (
                      <button
                        key={catKey}
                        type="button"
                        onClick={() => setNewCategory(catKey)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition cursor-pointer",
                          isSelected
                            ? cfg.badgeClass
                            : "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 " +
                              cfg.pillClass
                        )}
                      >
                        <IconComp className="h-3.5 w-3.5" />
                        <span>{cfg.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Title input */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wide">
                  Tiêu đề bản tin <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ví dụ: [Thông báo] Đã duyệt market bìa sách và ký lệnh in đợt 1"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              {/* Content textarea */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wide">
                  Nội dung chi tiết <span className="text-red-500">*</span>
                </label>
                <MentionTextarea
                  profiles={allProfiles}
                  value={newContent}
                  onChange={setNewContent}
                  placeholder="Chi tiết thông báo hoặc cập nhật... Gõ @ để nhắc tên đồng nghiệp nhận thông báo"
                  rows={4}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              {/* Attachments Section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    Tệp & Hình ảnh đính kèm ({pendingFiles.length})
                  </label>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline cursor-pointer"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    + Thêm tệp (PDF, Word, Ảnh, ZIP tối đa 25MB)
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleSelectFiles}
                  />
                </div>

                {/* File preview list */}
                {pendingFiles.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                    {pendingFiles.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-2 text-xs dark:border-slate-700 dark:bg-slate-800/60"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {item.isImage && item.previewUrl ? (
                            <img
                              src={item.previewUrl}
                              alt={item.name}
                              className="h-8 w-8 rounded-lg object-cover shrink-0"
                            />
                          ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand dark:bg-brand-soft-dark">
                              <FileText className="h-4 w-4" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-800 dark:text-slate-200 text-xs">
                              {item.name}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {formatFileSize(item.size)}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemovePendingFile(item.id)}
                          className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700 cursor-pointer"
                          title="Xóa tệp này"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Pin option & Action buttons */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newPinned}
                    onChange={(e) => setNewPinned(e.target.checked)}
                    className="rounded text-brand focus:ring-brand h-4 w-4"
                  />
                  <span className="flex items-center gap-1">
                    <Pin className="h-3.5 w-3.5 text-brand" />
                    Ghim bài viết này lên đầu trang
                  </span>
                </label>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsComposerExpanded(false);
                      setPendingFiles([]);
                    }}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Hủy
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting || !newTitle.trim() || !newContent.trim()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-brand-hover cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Đang đăng...</span>
                      </>
                    ) : (
                      <>
                        <Send className="h-3.5 w-3.5" />
                        <span>Đăng bản tin</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ====================================================================
       * CATEGORY FILTER TABS
       * ==================================================================== */}
      {updates.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-2 dark:border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 mr-2 flex items-center gap-1">
            <Filter className="h-3 w-3" />
            Lọc bài viết:
          </span>
          <button
            type="button"
            onClick={() => setSelectedFilter("all")}
            className={cn(
              "rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer",
              selectedFilter === "all"
                ? "bg-brand text-white"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            )}
          >
            Tất cả ({updates.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedFilter("pinned")}
            className={cn(
              "rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer flex items-center gap-1",
              selectedFilter === "pinned"
                ? "bg-brand text-white"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            )}
          >
            <Pin className="h-3 w-3" />
            Đã ghim ({updates.filter((u) => u.pinned).length})
          </button>
          {(Object.keys(CATEGORY_CONFIG) as UpdateCategory[]).map((catKey) => {
            const count = updates.filter(
              (u) => (u.category || "general") === catKey
            ).length;
            if (count === 0) return null;
            return (
              <button
                key={catKey}
                type="button"
                onClick={() => setSelectedFilter(catKey)}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer",
                  selectedFilter === catKey
                    ? "bg-brand text-white"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                )}
              >
                {CATEGORY_CONFIG[catKey].label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* ====================================================================
       * LIST OF UPDATES OR ENHANCED EMPTY STATE
       * ==================================================================== */}
      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400 animate-pulse">
          Đang tải dữ liệu bản tin dự án...
        </div>
      ) : updates.length === 0 ? (
        /* Empty State with Quick Templates */
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 p-8 sm:p-10 text-center bg-white dark:bg-slate-900 shadow-xs">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand mb-3 dark:bg-brand-soft-dark">
            <Megaphone className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Chưa có bản tin nào trong dự án {project.name}
          </h3>
          <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto dark:text-slate-400">
            Hãy đăng thông báo mốc duyệt bìa sách, cập nhật tiến độ tuần hoặc chia sẻ tài liệu để toàn đội cùng theo dõi.
          </p>

          {canPostUpdates && (
            <div className="mt-6 max-w-xl mx-auto">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2.5 text-left">
                Gợi ý mẫu đăng nhanh (1-Click Template):
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-left">
                {/* Template 1 */}
                <div
                  onClick={() =>
                    applyTemplate(
                      "announcement",
                      `[Thông báo] Thống nhất mốc duyệt bìa & quy cách in ${project.name}`,
                      `@all Kính gửi các thành viên dự án ${project.name},\n\nSau khi làm việc với Ban Biên tập và Nhà in, chúng tôi xin thông báo mốc tiến độ:\n- Hạn chót duyệt market bìa:\n- Quy cách kỹ thuật in:\n- Kế hoạch phát hành:\n\nĐề nghị các bộ phận chủ động phối hợp.`
                    )
                  }
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 hover:border-brand/50 hover:bg-brand-soft/20 cursor-pointer transition dark:border-slate-800 dark:bg-slate-800/40"
                >
                  <div className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400 font-semibold text-xs mb-1">
                    <Megaphone className="h-3.5 w-3.5" />
                    <span>Duyệt bìa & In ấn</span>
                  </div>
                  <p className="text-[11px] text-slate-500 line-clamp-2 dark:text-slate-400">
                    Mẫu thông báo chốt mốc duyệt market và quy cách xuất bản.
                  </p>
                </div>

                {/* Template 2 */}
                <div
                  onClick={() =>
                    applyTemplate(
                      "progress",
                      `[Cập nhật tiến độ] Tình hình biên tập & dịch thuật tuần này`,
                      `Cập nhật tiến độ dự án ${project.name} tuần này:\n✅ Đã hoàn thành:\n⏳ Đang xử lý:\n🎯 Mục tiêu trọng tâm tuần tới:`
                    )
                  }
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 hover:border-brand/50 hover:bg-brand-soft/20 cursor-pointer transition dark:border-slate-800 dark:bg-slate-800/40"
                >
                  <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold text-xs mb-1">
                    <Rocket className="h-3.5 w-3.5" />
                    <span>Báo cáo tuần</span>
                  </div>
                  <p className="text-[11px] text-slate-500 line-clamp-2 dark:text-slate-400">
                    Báo cáo tỷ lệ hoàn thành công việc và kế hoạch tuần tới.
                  </p>
                </div>

                {/* Template 3 */}
                <div
                  onClick={() =>
                    applyTemplate(
                      "blocker",
                      `[Cần trợ giúp] Phát sinh vướng mắc trong khâu bản quyền / dàn trang`,
                      `@all Đang có vướng mắc cần ý kiến chỉ đạo:\n- Vấn đề gặp phải:\n- Tác động tiến độ:\n- Đề xuất phương án:`
                    )
                  }
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 hover:border-brand/50 hover:bg-brand-soft/20 cursor-pointer transition dark:border-slate-800 dark:bg-slate-800/40"
                >
                  <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-semibold text-xs mb-1">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span>Báo cáo rủi ro</span>
                  </div>
                  <p className="text-[11px] text-slate-500 line-clamp-2 dark:text-slate-400">
                    Xin ý kiến giải quyết phát sinh bản quyền, giấy phép.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : filteredUpdates.length === 0 ? (
        <div className="py-10 text-center text-xs text-slate-400">
          Không có bài viết nào phù hợp với bộ lọc đã chọn.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredUpdates.map((update) => {
            const commentsCount = update.comments?.length || 0;
            const isThreadExpanded = expandedThreads[update.id] ?? false;
            const cat = (update.category || "general") as UpdateCategory;
            const catCfg = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.general;
            const CatIcon = catCfg.icon;

            const isAuthorOrAdmin =
              currentUser.id === update.author_id ||
              currentUser.role === "admin" ||
              currentUser.role === "manager";

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
                {/* Header card */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {update.author?.avatar_url ? (
                      <img
                        src={update.author.avatar_url}
                        alt={update.author.full_name}
                        className="h-10 w-10 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                        {getInitials(update.author?.full_name || "AB")}
                      </div>
                    )}
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {update.author?.full_name || "Thành viên"}
                        </span>
                        {update.author?.job_title && (
                          <span className="text-[11px] text-slate-400">
                            • {update.author.job_title}
                          </span>
                        )}

                        {/* Category badge */}
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border",
                            catCfg.badgeClass
                          )}
                        >
                          <CatIcon className="h-3 w-3" />
                          {catCfg.label}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400">
                        {formatDateVi(update.created_at)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {update.pinned && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-semibold text-brand dark:bg-brand-soft-dark">
                        <Pin className="h-3 w-3 fill-brand" />
                        Đã ghim
                      </span>
                    )}

                    {isAuthorOrAdmin && (
                      <div className="flex items-center gap-1 ml-2">
                        <button
                          type="button"
                          onClick={() => handleTogglePin(update.id, update.pinned)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 cursor-pointer"
                          title={update.pinned ? "Bỏ ghim bài viết" : "Ghim bài viết"}
                        >
                          <Pin className={cn("h-3.5 w-3.5", update.pinned && "text-brand")} />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteUpdate(update.id)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 cursor-pointer"
                          title="Xóa bài viết"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Title & Body */}
                <div className="mt-3.5">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {update.title}
                  </h3>
                  <div className="mt-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                    {renderContentWithMentions(update.content, allProfiles)}
                  </div>
                </div>

                {/* Attachments Display */}
                {update.attachments && update.attachments.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <Paperclip className="h-3 w-3" />
                      Tài liệu đính kèm ({update.attachments.length}):
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {update.attachments.map((att) => {
                        const isImg =
                          att.type?.startsWith("image/") ||
                          att.name?.match(/\.(png|jpe?g|gif|webp|svg)$/i);
                        return (
                          <div
                            key={att.id}
                            className="group flex items-center justify-between gap-2.5 rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 text-xs dark:border-slate-800 dark:bg-slate-800/40 hover:bg-slate-100/70 dark:hover:bg-slate-800 transition"
                          >
                            <a
                              href={att.url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-2.5 min-w-0 flex-1"
                            >
                              {isImg ? (
                                <img
                                  src={att.url}
                                  alt={att.name}
                                  className="h-9 w-9 rounded-lg object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                                />
                              ) : (
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand dark:bg-brand-soft-dark">
                                  <FileText className="h-4 w-4" />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-semibold text-slate-800 group-hover:text-brand dark:text-slate-200 text-xs">
                                  {att.name}
                                </p>
                                <p className="text-[10px] text-slate-400">
                                  {formatFileSize(att.size)}
                                </p>
                              </div>
                            </a>

                            <a
                              href={att.url}
                              target="_blank"
                              rel="noreferrer"
                              download={att.name}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-brand dark:hover:bg-slate-700"
                              title="Tải về"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Reaction Bar & Comment Toggle */}
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
                        Chưa có phản hồi nào. Hãy là người đầu tiên trao đổi!
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
                              placeholder="Viết phản hồi... (@ để nhắc tên)"
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
    </div>
  );
}
