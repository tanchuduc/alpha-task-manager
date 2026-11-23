"use client";

import React, { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Project, Task } from "@/types/database";
import { cn, getInitials } from "@/lib/utils";
import {
  X,
  Share2,
  Users,
  User,
  FolderKanban,
  Search,
  Send,
  Loader2,
  Check,
} from "lucide-react";
import { toast } from "sonner";

interface ShareTaskToChatModalProps {
  task: any; // Task with status, assignee, project
  currentUser: Profile;
  allProfiles: Profile[];
  allProjects?: Project[];
  onClose: () => void;
  onShared?: (convId: string) => void;
}

type TargetType = "direct" | "group" | "project";

export function ShareTaskToChatModal({
  task,
  currentUser,
  allProfiles,
  allProjects = [],
  onClose,
  onShared,
}: ShareTaskToChatModalProps) {
  const supabase = useMemo(() => createClient(), []);
  const [targetType, setTargetType] = useState<TargetType>("direct");
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Direct candidates
  const directCandidates = useMemo(
    () => allProfiles.filter((p) => p.id !== currentUser.id),
    [allProfiles, currentUser.id]
  );

  // Group candidates from localStorage
  const groupCandidates = useMemo(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(
        localStorage.getItem(`alpha_custom_groups_${currentUser.id}`) || "[]"
      );
    } catch {
      return [];
    }
  }, [currentUser.id]);

  // Project candidates
  const projectCandidates = useMemo(
    () => allProjects.filter((p) => p.status === "active"),
    [allProjects]
  );

  // Filtered lists
  const filteredDirect = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return directCandidates;
    return directCandidates.filter(
      (p) =>
        p.full_name?.toLowerCase().includes(q) ||
        p.job_title?.toLowerCase().includes(q) ||
        p.department?.name?.toLowerCase().includes(q)
    );
  }, [directCandidates, searchQuery]);

  const filteredGroups = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return groupCandidates;
    return groupCandidates.filter((g: any) =>
      g.title?.toLowerCase().includes(q)
    );
  }, [groupCandidates, searchQuery]);

  const filteredProjects = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return projectCandidates;
    return projectCandidates.filter((p) =>
      p.name?.toLowerCase().includes(q)
    );
  }, [projectCandidates, searchQuery]);

  const handleShare = async () => {
    if (!selectedTargetId) {
      toast.error("Vui lòng chọn nơi bạn muốn chia sẻ công việc.");
      return;
    }

    setIsSubmitting(true);
    const taskUrl = `${window.location.origin}/projects/${task.project_id || task.projectId}?task=${task.id}`;
    const cardContent = note.trim()
      ? `${note.trim()}\n\n[Thẻ công việc: ${task.title}](${taskUrl})`
      : `[Thẻ công việc: ${task.title}](${taskUrl})`;

    try {
      if (targetType === "direct") {
        await supabase.from("direct_messages").insert({
          sender_id: currentUser.id,
          receiver_id: selectedTargetId,
          content: cardContent,
          is_read: false,
        });

        // Trigger notification
        await supabase.from("notifications").insert({
          user_id: selectedTargetId,
          actor_id: currentUser.id,
          type: "task_mentioned",
          title: `${currentUser.full_name} đã chia sẻ thẻ công việc với bạn`,
          body: task.title,
          link: `/chat?user=${currentUser.id}`,
          is_read: false,
        });

        toast.success("Đã chia sẻ công việc vào tin nhắn 1-1!");
        onShared?.(`dm:${selectedTargetId}`);
      } else if (targetType === "project") {
        await supabase.from("project_messages").insert({
          project_id: selectedTargetId,
          author_id: currentUser.id,
          content: cardContent,
        });

        toast.success("Đã chia sẻ công việc vào kênh Dự án!");
        onShared?.(`proj:${selectedTargetId}`);
      } else if (targetType === "group") {
        const fallbackMsg = {
          id: `gmsg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          conversation_id: selectedTargetId,
          sender_id: currentUser.id,
          sender: currentUser,
          content: cardContent,
          message_type: "text",
          is_pinned: false,
          is_deleted: false,
          reactions: {},
          created_at: new Date().toISOString(),
        };

        const existing = JSON.parse(
          localStorage.getItem(`alpha_group_msgs_${selectedTargetId}`) || "[]"
        );
        existing.push(fallbackMsg);
        localStorage.setItem(
          `alpha_group_msgs_${selectedTargetId}`,
          JSON.stringify(existing)
        );

        toast.success("Đã chia sẻ công việc vào Nhóm trao đổi!");
        onShared?.(selectedTargetId);
      }

      onClose();
    } catch (err) {
      console.error("Lỗi chia sẻ công việc:", err);
      toast.error("Không thể chia sẻ công việc. Vui lòng thử lại.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <Share2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Chia sẻ thẻ công việc
              </h3>
              <p className="text-[11px] text-slate-500 line-clamp-1">
                {task.title}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Target Tabs */}
        <div className="grid grid-cols-3 border-b border-slate-200 dark:border-slate-800 p-2 gap-1 bg-slate-50/50 dark:bg-slate-950/30 text-xs shrink-0">
          <button
            type="button"
            onClick={() => {
              setTargetType("direct");
              setSelectedTargetId(null);
            }}
            className={cn(
              "flex items-center justify-center gap-1.5 py-1.5 font-medium rounded-lg transition",
              targetType === "direct"
                ? "bg-white dark:bg-slate-800 text-brand shadow-xs font-semibold"
                : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            )}
          >
            <User className="h-3.5 w-3.5" />
            <span>Đồng nghiệp</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTargetType("group");
              setSelectedTargetId(null);
            }}
            className={cn(
              "flex items-center justify-center gap-1.5 py-1.5 font-medium rounded-lg transition",
              targetType === "group"
                ? "bg-white dark:bg-slate-800 text-brand shadow-xs font-semibold"
                : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            )}
          >
            <Users className="h-3.5 w-3.5" />
            <span>Nhóm chat</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTargetType("project");
              setSelectedTargetId(null);
            }}
            className={cn(
              "flex items-center justify-center gap-1.5 py-1.5 font-medium rounded-lg transition",
              targetType === "project"
                ? "bg-white dark:bg-slate-800 text-brand shadow-xs font-semibold"
                : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            )}
          >
            <FolderKanban className="h-3.5 w-3.5" />
            <span>Dự án</span>
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder={
                targetType === "direct"
                  ? "Tìm đồng nghiệp..."
                  : targetType === "group"
                    ? "Tìm nhóm chat..."
                    : "Tìm dự án..."
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-1.5 pl-8 pr-3 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:border-brand focus:outline-none"
            />
          </div>
        </div>

        {/* List of candidates */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1 max-h-56 text-xs">
          {targetType === "direct" &&
            filteredDirect.map((p) => {
              const isSelected = selectedTargetId === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedTargetId(p.id)}
                  className={cn(
                    "flex items-center gap-2.5 p-2 rounded-xl cursor-pointer transition border",
                    isSelected
                      ? "bg-brand/10 border-brand/50 text-brand"
                      : "border-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                  )}
                >
                  <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-bold text-xs shrink-0">
                    {getInitials(p.full_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{p.full_name}</p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {p.job_title || p.department?.name || "Đồng nghiệp"}
                    </p>
                  </div>
                  {isSelected && <Check className="h-4 w-4 text-brand shrink-0" />}
                </div>
              );
            })}

          {targetType === "group" &&
            (filteredGroups.length === 0 ? (
              <p className="text-center py-6 text-slate-400 text-xs">
                Chưa có nhóm chat nào được tạo
              </p>
            ) : (
              filteredGroups.map((g: any) => {
                const isSelected = selectedTargetId === g.id;
                return (
                  <div
                    key={g.id}
                    onClick={() => setSelectedTargetId(g.id)}
                    className={cn(
                      "flex items-center gap-2.5 p-2 rounded-xl cursor-pointer transition border",
                      isSelected
                        ? "bg-brand/10 border-brand/50 text-brand"
                        : "border-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                    )}
                  >
                    <div className="h-8 w-8 rounded-xl bg-brand/10 text-brand flex items-center justify-center shrink-0">
                      <Users className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{g.title}</p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {g.description || `${g.memberIds?.length || 1} thành viên`}
                      </p>
                    </div>
                    {isSelected && <Check className="h-4 w-4 text-brand shrink-0" />}
                  </div>
                );
              })
            ))}

          {targetType === "project" &&
            filteredProjects.map((proj) => {
              const isSelected = selectedTargetId === proj.id;
              return (
                <div
                  key={proj.id}
                  onClick={() => setSelectedTargetId(proj.id)}
                  className={cn(
                    "flex items-center gap-2.5 p-2 rounded-xl cursor-pointer transition border",
                    isSelected
                      ? "bg-brand/10 border-brand/50 text-brand"
                      : "border-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                  )}
                >
                  <div className="h-8 w-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                    <FolderKanban className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{proj.name}</p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {proj.description || "Kênh thảo luận dự án"}
                    </p>
                  </div>
                  {isSelected && <Check className="h-4 w-4 text-brand shrink-0" />}
                </div>
              );
            })}
        </div>

        {/* Optional note */}
        <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 shrink-0">
          <input
            type="text"
            placeholder="Ghi chú kèm theo (tùy chọn)..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:border-brand focus:outline-none"
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-800 p-3 bg-white dark:bg-slate-900 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={!selectedTargetId || isSubmitting}
            onClick={handleShare}
            className="flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-brand-dark disabled:opacity-50 transition"
          >
            {isSubmitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            <span>Chia sẻ</span>
          </button>
        </div>
      </div>
    </div>
  );
}
