"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  Profile,
  Project,
  ProjectPhase,
  TaskPriority,
  TaskStatus,
} from "@/types/database";
import {
  CheckSquare,
  X,
  Calendar,
  FolderKanban,
  User,
  Flag,
  Layers,
  Paperclip,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

export interface SourceChatMessage {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
}

interface ConvertMessageToTaskModalProps {
  message: SourceChatMessage | null;
  currentUser: Profile;
  allProfiles: Profile[];
  projects: Project[];
  defaultAssigneeId?: string | null;
  onClose: () => void;
  onTaskCreated?: (info: {
    taskId: string;
    taskTitle: string;
    projectId: string;
    projectName: string;
  }) => void;
}

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "low", label: "Thấp" },
  { value: "medium", label: "Trung bình" },
  { value: "high", label: "Cao" },
  { value: "urgent", label: "Khẩn cấp" },
];

export function ConvertMessageToTaskModal({
  message,
  currentUser,
  allProfiles,
  projects,
  defaultAssigneeId,
  onClose,
  onTaskCreated,
}: ConvertMessageToTaskModalProps) {
  const supabase = useMemo(() => createClient(), []);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedPhaseId, setSelectedPhaseId] = useState<string>("");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState<string>("");

  const [phases, setPhases] = useState<ProjectPhase[]>([]);
  const [statuses, setStatuses] = useState<TaskStatus[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize fields from the source message
  useEffect(() => {
    if (!message) return;

    const cleanContent = (message.content || "").trim();
    const firstLine = cleanContent.split("\n")[0] || "Công việc từ trò chuyện";
    const defaultTitle =
      firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine;

    const timeFormatted = new Date(message.createdAt).toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    const descLines = [
      cleanContent,
      "",
      `---`,
      `💬 Tạo từ tin nhắn của ${message.authorName} lúc ${timeFormatted}`,
    ];
    if (message.attachmentUrl) {
      descLines.push(
        `📎 Đính kèm: ${message.attachmentName || message.attachmentUrl}`
      );
    }

    setTitle(defaultTitle);
    setDescription(descLines.join("\n"));

    if (projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id);
    }

    if (defaultAssigneeId) {
      setAssigneeId(defaultAssigneeId);
    } else if (message.authorId !== currentUser.id) {
      setAssigneeId(message.authorId);
    } else {
      setAssigneeId(currentUser.id);
    }
  }, [message, projects, defaultAssigneeId, currentUser.id, selectedProjectId]);

  // Load phases and statuses when selectedProjectId changes
  useEffect(() => {
    if (!selectedProjectId) {
      setPhases([]);
      setStatuses([]);
      setSelectedPhaseId("");
      return;
    }

    let isMounted = true;
    async function loadProjectMeta() {
      const [phasesRes, statusesRes] = await Promise.all([
        supabase
          .from("project_phases")
          .select("*")
          .eq("project_id", selectedProjectId)
          .order("position", { ascending: true }),
        supabase
          .from("task_statuses")
          .select("*")
          .eq("project_id", selectedProjectId)
          .order("position", { ascending: true }),
      ]);

      if (!isMounted) return;
      if (phasesRes.data) {
        setPhases(phasesRes.data as ProjectPhase[]);
      }
      if (statusesRes.data) {
        setStatuses(statusesRes.data as TaskStatus[]);
      }
      setSelectedPhaseId("");
    }

    loadProjectMeta();
    return () => {
      isMounted = false;
    };
  }, [selectedProjectId, supabase]);

  if (!message) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error("Vui lòng nhập tên công việc.");
      return;
    }
    if (!selectedProjectId) {
      toast.error("Vui lòng chọn dự án.");
      return;
    }

    setIsSubmitting(true);
    try {
      const todoStatus =
        statuses.find((s) => s.category === "todo") || statuses[0] || null;

      const { data: createdTask, error: taskError } = await supabase
        .from("tasks")
        .insert({
          project_id: selectedProjectId,
          status_id: todoStatus?.id || null,
          phase_id: selectedPhaseId || null,
          title: trimmedTitle,
          description: description.trim() || null,
          priority,
          due_date: dueDate || null,
          position: 0,
          created_by: currentUser.id,
        })
        .select("*")
        .single();

      if (taskError) throw taskError;

      // 1. Assign user if selected
      if (assigneeId && createdTask) {
        await supabase.from("task_assignees").insert({
          task_id: createdTask.id,
          user_id: assigneeId,
        });

        // Notify assignee if different from current user
        if (assigneeId !== currentUser.id) {
          const projectObj = projects.find((p) => p.id === selectedProjectId);
          await supabase.from("notifications").insert({
            user_id: assigneeId,
            actor_id: currentUser.id,
            type: "task_assigned",
            title: `${currentUser.full_name} đã giao việc cho bạn từ Trò chuyện`,
            body: `${trimmedTitle} (${projectObj?.name || "Dự án"})`,
            link: `/projects/${selectedProjectId}?task=${createdTask.id}`,
            is_read: false,
          });
        }
      }

      // 2. Attach file if the source message had an attachment
      if (message.attachmentUrl && createdTask) {
        await supabase.from("task_attachments").insert({
          task_id: createdTask.id,
          uploaded_by: currentUser.id,
          name: message.attachmentName || "Tệp đính kèm từ chat",
          url: message.attachmentUrl,
          attachment_type: "file",
        });
      }

      // 3. Log activity
      if (createdTask) {
        await supabase.from("task_activity_logs").insert({
          task_id: createdTask.id,
          actor_id: currentUser.id,
          action: "created",
          details: {
            label: "Khởi tạo từ tin nhắn Trò chuyện nội bộ",
            new_value: trimmedTitle,
          },
        });
      }

      const projectObj = projects.find((p) => p.id === selectedProjectId);
      toast.success("Đã chuyển tin nhắn thành công việc!", {
        description: `${trimmedTitle} • ${projectObj?.name || ""}`,
      });

      if (createdTask) {
        onTaskCreated?.({
          taskId: createdTask.id,
          taskTitle: trimmedTitle,
          projectId: selectedProjectId,
          projectName: projectObj?.name || "Dự án",
        });
      }
      onClose();
    } catch (err) {
      console.error("Lỗi tạo công việc từ tin nhắn:", err);
      toast.error("Không thể tạo công việc. Vui lòng thử lại.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-soft text-brand dark:bg-brand-soft-dark">
              <CheckSquare className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Chuyển tin nhắn thành Công việc
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Giao việc nhanh vào dự án từ tin nhắn của {message.authorName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          {/* Task Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Tên công việc <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nhập tên đầu việc cần thực hiện..."
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          {/* Project & Phase */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="flex items-center gap-1 text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                <FolderKanban className="h-3.5 w-3.5 text-brand" />
                <span>Dự án <span className="text-red-500">*</span></span>
              </label>
              <select
                required
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                {projects.length === 0 ? (
                  <option value="">Chưa có dự án đang hoạt động</option>
                ) : (
                  projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.code}] {p.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="flex items-center gap-1 text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                <Layers className="h-3.5 w-3.5 text-slate-400" />
                <span>Giai đoạn (Phase)</span>
              </label>
              <select
                value={selectedPhaseId}
                onChange={(e) => setSelectedPhaseId(e.target.value)}
                disabled={phases.length === 0}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="">-- Không chọn giai đoạn --</option>
                {phases.map((ph) => (
                  <option key={ph.id} value={ph.id}>
                    {ph.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Assignee, Priority & Due Date */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="flex items-center gap-1 text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                <User className="h-3.5 w-3.5 text-slate-400" />
                <span>Người phụ trách</span>
              </label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="">-- Chưa gán --</option>
                {allProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="flex items-center gap-1 text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                <Flag className="h-3.5 w-3.5 text-slate-400" />
                <span>Mức ưu tiên</span>
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="flex items-center gap-1 text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                <span>Hạn hoàn thành</span>
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Mô tả & Ngữ cảnh tin nhắn
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          {/* Attachment indicator if present */}
          {message.attachmentUrl && (
            <div className="flex items-center gap-2 rounded-xl border border-brand/20 bg-brand-soft/40 px-3 py-2 text-xs text-brand dark:bg-brand-soft-dark/30">
              <Paperclip className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate flex-1">
                Tự động đính kèm tệp: <strong>{message.attachmentName || "Tệp đính kèm"}</strong>
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !title.trim() || !selectedProjectId}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-brand-hover cursor-pointer disabled:opacity-50"
            >
              <CheckSquare className="h-3.5 w-3.5" />
              <span>{isSubmitting ? "Đang tạo việc..." : "Tạo công việc"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
