"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  X,
  Trash2,
  Check,
  Plus,
  Paperclip,
  Link2,
  Upload,
  FileText,
  ExternalLink,
  MessageSquare,
  Send,
  Users,
  Calendar,
  Flag,
  CheckSquare,
  Square,
  Loader2,
  AtSign,
  FileSpreadsheet,
  HardDrive,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { cn, PRIORITY_CONFIG, getInitials, isOverdue } from "@/lib/utils";
import type {
  AttachmentType,
  Profile,
  Task,
  TaskAttachment,
  TaskComment,
  TaskPriority,
  TaskStatus,
} from "@/types/database";

export interface TaskDrawerProps {
  taskId: string;
  projectId: string;
  statuses: TaskStatus[];
  members: Profile[];
  currentUser: Profile;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted: (taskId: string) => void;
}

const ATTACHMENT_TYPE_META: Record<
  AttachmentType,
  { label: string; colorClass: string }
> = {
  file: {
    label: "Tệp đính kèm",
    colorClass:
      "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  },
  gdrive: {
    label: "Google Drive",
    colorClass:
      "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
  },
  gsheet: {
    label: "Google Sheet",
    colorClass:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  },
  lark: {
    label: "Lark Docs",
    colorClass:
      "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300",
  },
  link: {
    label: "Liên kết",
    colorClass:
      "bg-orange-50 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300",
  },
};

function formatFileSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTimeVi(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function AttachmentIcon({ type }: { type: AttachmentType }) {
  switch (type) {
    case "gdrive":
      return <HardDrive className="h-4 w-4 text-blue-500" />;
    case "gsheet":
      return <FileSpreadsheet className="h-4 w-4 text-emerald-500" />;
    case "lark":
      return <BookOpen className="h-4 w-4 text-indigo-500" />;
    case "link":
      return <Link2 className="h-4 w-4 text-brand" />;
    default:
      return <FileText className="h-4 w-4 text-slate-500" />;
  }
}

export default function TaskDrawer({
  taskId,
  projectId,
  statuses,
  members,
  currentUser,
  onClose,
  onUpdated,
  onDeleted,
}: TaskDrawerProps) {
  const supabase = useMemo(() => createClient(), []);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [task, setTask] = useState<Task | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [savingDesc, setSavingDesc] = useState(false);

  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);

  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [addingSubtask, setAddingSubtask] = useState(false);

  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkType, setLinkType] = useState<Exclude<AttachmentType, "file">>("gdrive");
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [addingLink, setAddingLink] = useState(false);

  const [comments, setComments] = useState<TaskComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const [showMentionBar, setShowMentionBar] = useState(false);
  const [postingComment, setPostingComment] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletingTask, setDeletingTask] = useState(false);

  const todoStatus = useMemo(
    () => statuses.find((s) => s.category === "todo") ?? statuses[0] ?? null,
    [statuses]
  );
  const doneStatus = useMemo(
    () => statuses.find((s) => s.category === "done") ?? null,
    [statuses]
  );

  const loadTaskDetails = useCallback(async () => {
    setLoading(true);
    try {
      const [
        { data: taskData, error: taskErr },
        { data: assigneesData },
        { data: subtasksData },
        { data: attachmentsData },
        { data: commentsData },
      ] = await Promise.all([
        supabase.from("tasks").select("*").eq("id", taskId).single(),
        supabase
          .from("task_assignees")
          .select("user_id")
          .eq("task_id", taskId),
        supabase
          .from("tasks")
          .select("*")
          .eq("parent_id", taskId)
          .order("position", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase
          .from("task_attachments")
          .select("*")
          .eq("task_id", taskId)
          .order("created_at", { ascending: false }),
        supabase
          .from("task_comments")
          .select("*, author:profiles(id, full_name, email, avatar_url, role)")
          .eq("task_id", taskId)
          .order("created_at", { ascending: true }),
      ]);

      if (taskErr || !taskData) {
        toast.error("Không tìm thấy công việc này");
        onClose();
        return;
      }

      const loadedTask = taskData as Task;
      setTask(loadedTask);
      setTitle(loadedTask.title);
      setDescription(loadedTask.description ?? "");
      setAssigneeIds(
        ((assigneesData ?? []) as { user_id: string }[]).map((r) => r.user_id)
      );
      setSubtasks((subtasksData ?? []) as Task[]);
      setAttachments((attachmentsData ?? []) as TaskAttachment[]);
      setComments((commentsData ?? []) as TaskComment[]);
    } catch {
      toast.error("Lỗi khi tải chi tiết công việc");
    } finally {
      setLoading(false);
    }
  }, [supabase, taskId, onClose]);

  useEffect(() => {
    loadTaskDetails();
  }, [loadTaskDetails]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function fireWebhook(payload: {
    event: string;
    projectId: string;
    title: string;
    body: string;
    link: string;
  }) {
    fetch("/api/webhooks/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {
      // Fire-and-forget
    });
  }

  async function updateTaskFields(patch: Partial<Task>) {
    if (!task) return;
    const prev = task;
    setTask({ ...task, ...patch });

    const { error } = await supabase
      .from("tasks")
      .update(patch)
      .eq("id", task.id);

    if (error) {
      setTask(prev);
      toast.error("Không thể cập nhật công việc");
      return;
    }
    onUpdated();
  }

  async function handleSaveTitle() {
    if (!task) return;
    const trimmed = title.trim();
    if (!trimmed) {
      setTitle(task.title);
      return;
    }
    if (trimmed === task.title) return;
    await updateTaskFields({ title: trimmed });
  }

  async function handleStatusChange(newStatusId: string) {
    if (!task) return;
    const targetStatus = statuses.find((s) => s.id === newStatusId);
    if (!targetStatus) return;

    const prevStatus = statuses.find((s) => s.id === task.status_id);
    const movingToDone = targetStatus.category === "done";
    const wasDone = prevStatus?.category === "done";

    const completed_at = movingToDone
      ? new Date().toISOString()
      : wasDone
      ? null
      : task.completed_at;

    await updateTaskFields({ status_id: newStatusId, completed_at });

    if (movingToDone && !wasDone) {
      fireWebhook({
        event: "task_completed",
        projectId,
        title: `Hoàn thành công việc: ${task.title}`,
        body: `${currentUser.full_name} đã chuyển công việc "${task.title}" sang trạng thái "${targetStatus.name}".`,
        link: `/projects/${projectId}?task=${task.id}`,
      });
    }
  }

  async function handleSaveDescription() {
    if (!task) return;
    setSavingDesc(true);
    try {
      await updateTaskFields({ description: description.trim() || null });
      toast.success("Đã lưu mô tả công việc");
    } finally {
      setSavingDesc(false);
    }
  }

  async function handleDeleteTask() {
    if (!task) return;
    setDeletingTask(true);
    try {
      const { error } = await supabase.from("tasks").delete().eq("id", task.id);
      if (error) throw new Error(error.message);
      toast.success("Đã xóa công việc");
      onDeleted(task.id);
      onClose();
    } catch {
      toast.error("Không thể xóa công việc");
    } finally {
      setDeletingTask(false);
    }
  }

  async function handleToggleAssignee(member: Profile) {
    if (!task) return;
    const isAssigned = assigneeIds.includes(member.id);

    if (isAssigned) {
      setAssigneeIds((prev) => prev.filter((id) => id !== member.id));
      const { error } = await supabase
        .from("task_assignees")
        .delete()
        .eq("task_id", task.id)
        .eq("user_id", member.id);

      if (error) {
        setAssigneeIds((prev) => [...prev, member.id]);
        toast.error("Không thể gỡ người phụ trách");
        return;
      }
      onUpdated();
    } else {
      setAssigneeIds((prev) => [...prev, member.id]);
      const { error } = await supabase.from("task_assignees").insert({
        task_id: task.id,
        user_id: member.id,
      });

      if (error) {
        setAssigneeIds((prev) => prev.filter((id) => id !== member.id));
        toast.error("Không thể giao việc cho thành viên này");
        return;
      }

      onUpdated();

      if (member.id !== currentUser.id) {
        const notifTitle = `${currentUser.full_name} đã giao việc cho bạn`;
        const notifBody = `Công việc: "${task.title}"`;
        const link = `/projects/${projectId}?task=${task.id}`;

        await supabase.from("notifications").insert({
          user_id: member.id,
          actor_id: currentUser.id,
          type: "task_assigned",
          title: notifTitle,
          body: notifBody,
          link,
        });

        fireWebhook({
          event: "task_assigned",
          projectId,
          title: `Giao việc mới: ${task.title}`,
          body: `${currentUser.full_name} đã giao "${task.title}" cho ${member.full_name}.`,
          link,
        });
      }
    }
  }

  async function handleAddSubtask(e: React.FormEvent) {
    e.preventDefault();
    if (!task || !todoStatus) return;
    const trimmed = newSubtaskTitle.trim();
    if (!trimmed) return;

    setAddingSubtask(true);
    try {
      const { data, error } = await supabase
        .from("tasks")
        .insert({
          project_id: projectId,
          parent_id: task.id,
          status_id: todoStatus.id,
          title: trimmed,
          priority: "medium",
          position: subtasks.length,
          created_by: currentUser.id,
        })
        .select("*")
        .single();

      if (error || !data) throw new Error(error?.message);
      setSubtasks((prev) => [...prev, data as Task]);
      setNewSubtaskTitle("");
      onUpdated();
    } catch {
      toast.error("Không thể thêm công việc con");
    } finally {
      setAddingSubtask(false);
    }
  }

  async function handleToggleSubtask(sub: Task) {
    if (!todoStatus || !doneStatus) return;
    const isDone = Boolean(sub.completed_at) || sub.status_id === doneStatus.id;
    const nextStatusId = isDone ? todoStatus.id : doneStatus.id;
    const nextCompletedAt = isDone ? null : new Date().toISOString();

    setSubtasks((prev) =>
      prev.map((s) =>
        s.id === sub.id
          ? { ...s, status_id: nextStatusId, completed_at: nextCompletedAt }
          : s
      )
    );

    const { error } = await supabase
      .from("tasks")
      .update({ status_id: nextStatusId, completed_at: nextCompletedAt })
      .eq("id", sub.id);

    if (error) {
      toast.error("Không thể cập nhật trạng thái việc con");
      loadTaskDetails();
      return;
    }
    onUpdated();
  }

  async function handleDeleteSubtask(subId: string) {
    setSubtasks((prev) => prev.filter((s) => s.id !== subId));
    const { error } = await supabase.from("tasks").delete().eq("id", subId);
    if (error) {
      toast.error("Không thể xóa việc con");
      loadTaskDetails();
      return;
    }
    onUpdated();
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !task) return;

    setUploadingFile(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `${projectId}/${task.id}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("attachments")
        .upload(storagePath, file, { upsert: false });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { data: urlData } = supabase.storage
        .from("attachments")
        .getPublicUrl(storagePath);

      const { data: row, error: dbError } = await supabase
        .from("task_attachments")
        .insert({
          task_id: task.id,
          uploaded_by: currentUser.id,
          name: file.name,
          url: urlData.publicUrl,
          storage_path: storagePath,
          attachment_type: "file",
          file_size: file.size,
        })
        .select("*")
        .single();

      if (dbError || !row) {
        throw new Error(dbError?.message || "Lỗi lưu thông tin tệp");
      }

      setAttachments((prev) => [row as TaskAttachment, ...prev]);
      toast.success(`Đã tải lên "${file.name}"`);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `Lỗi tải tệp: ${err.message}`
          : "Không thể tải tệp lên"
      );
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleAddLink(e: React.FormEvent) {
    e.preventDefault();
    if (!task) return;
    const trimmedName = linkName.trim();
    let trimmedUrl = linkUrl.trim();
    if (!trimmedName || !trimmedUrl) {
      toast.error("Vui lòng nhập tên và đường dẫn liên kết");
      return;
    }
    if (!/^https?:\/\//i.test(trimmedUrl)) {
      trimmedUrl = `https://${trimmedUrl}`;
    }

    setAddingLink(true);
    try {
      const { data: row, error } = await supabase
        .from("task_attachments")
        .insert({
          task_id: task.id,
          uploaded_by: currentUser.id,
          name: trimmedName,
          url: trimmedUrl,
          storage_path: null,
          attachment_type: linkType,
          file_size: null,
        })
        .select("*")
        .single();

      if (error || !row) throw new Error(error?.message);

      setAttachments((prev) => [row as TaskAttachment, ...prev]);
      setLinkName("");
      setLinkUrl("");
      setShowLinkForm(false);
      toast.success("Đã gắn liên kết tài liệu");
    } catch {
      toast.error("Không thể thêm liên kết");
    } finally {
      setAddingLink(false);
    }
  }

  async function handleDeleteAttachment(att: TaskAttachment) {
    setAttachments((prev) => prev.filter((a) => a.id !== att.id));
    if (att.storage_path) {
      await supabase.storage.from("attachments").remove([att.storage_path]);
    }
    const { error } = await supabase
      .from("task_attachments")
      .delete()
      .eq("id", att.id);
    if (error) {
      toast.error("Không thể xóa tài liệu đính kèm");
      loadTaskDetails();
    }
  }

  function handleInsertMention(member: Profile) {
    const token = `@${member.full_name} `;
    setCommentText((prev) => (prev ? `${prev.trimEnd()} ${token}` : token));
    setMentionedUserIds((prev) =>
      prev.includes(member.id) ? prev : [...prev, member.id]
    );
  }

  async function handlePostComment(e: React.FormEvent) {
    e.preventDefault();
    if (!task) return;
    const trimmed = commentText.trim();
    if (!trimmed) return;

    // Keep only mentioned users whose @FullName is still present in text
    const activeMentionIds = mentionedUserIds.filter((uid) => {
      const m = members.find((mem) => mem.id === uid);
      return m ? trimmed.includes(`@${m.full_name}`) : false;
    });

    setPostingComment(true);
    try {
      const { data: newComment, error } = await supabase
        .from("task_comments")
        .insert({
          task_id: task.id,
          author_id: currentUser.id,
          content: trimmed,
          mentioned_user_ids: activeMentionIds,
        })
        .select("*, author:profiles(id, full_name, email, avatar_url, role)")
        .single();

      if (error || !newComment) throw new Error(error?.message);

      setComments((prev) => [...prev, newComment as TaskComment]);
      setCommentText("");
      setMentionedUserIds([]);
      setShowMentionBar(false);

      const link = `/projects/${projectId}?task=${task.id}`;
      const targetsToNotify = activeMentionIds.filter(
        (uid) => uid !== currentUser.id
      );

      if (targetsToNotify.length > 0) {
        await supabase.from("notifications").insert(
          targetsToNotify.map((uid) => ({
            user_id: uid,
            actor_id: currentUser.id,
            type: "task_mentioned" as const,
            title: `${currentUser.full_name} đã nhắc đến bạn trong "${task.title}"`,
            body: trimmed.slice(0, 140),
            link,
          }))
        );

        fireWebhook({
          event: "task_mentioned",
          projectId,
          title: `Bình luận nhắc tên trong: ${task.title}`,
          body: `${currentUser.full_name}: "${trimmed.slice(0, 200)}"`,
          link,
        });
      }
    } catch {
      toast.error("Không thể gửi bình luận");
    } finally {
      setPostingComment(false);
    }
  }

  const assignedProfiles = useMemo(
    () => members.filter((m) => assigneeIds.includes(m.id)),
    [members, assigneeIds]
  );

  const completedSubtasksCount = useMemo(
    () =>
      subtasks.filter(
        (s) => Boolean(s.completed_at) || (doneStatus && s.status_id === doneStatus.id)
      ).length,
    [subtasks, doneStatus]
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-[1px]">
      <div className="flex-1" onClick={onClose} />

      <div className="flex h-full w-full max-w-2xl flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Chi tiết công việc</span>
            {task && isOverdue(task.due_date, task.completed_at) && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-950/70 dark:text-red-300">
                Quá hạn
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {task && !confirmDelete && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/40 dark:hover:text-red-400 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Xóa
              </button>
            )}
            {task && confirmDelete && (
              <div className="flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1 dark:bg-red-950/50">
                <span className="text-xs font-medium text-red-700 dark:text-red-300">
                  Xác nhận xóa?
                </span>
                <button
                  type="button"
                  disabled={deletingTask}
                  onClick={handleDeleteTask}
                  className="rounded bg-red-600 px-2 py-0.5 text-xs font-semibold text-white hover:bg-red-700 cursor-pointer"
                >
                  {deletingTask ? "..." : "Xóa"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded px-1.5 py-0.5 text-xs text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Hủy
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        {loading || !task ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-brand" />
          </div>
        ) : (
          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
            {/* Editable Title */}
            <div>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleSaveTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.blur();
                  }
                }}
                className="w-full rounded-lg border border-transparent bg-transparent px-1 py-1 text-xl font-bold text-slate-900 focus:border-brand focus:bg-slate-50 focus:outline-none dark:text-slate-100 dark:focus:bg-slate-800/60"
              />
            </div>

            {/* Metadata Grid */}
            <div className="grid grid-cols-1 gap-3.5 rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/40 sm:grid-cols-2">
              {/* Status */}
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Trạng thái
                </label>
                <select
                  value={task.status_id ?? ""}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-800 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  {statuses.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Priority */}
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <Flag className="h-3.5 w-3.5" />
                  Mức độ ưu tiên
                </label>
                <select
                  value={task.priority}
                  onChange={(e) =>
                    updateTaskFields({
                      priority: e.target.value as TaskPriority,
                    })
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-800 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  {(Object.keys(PRIORITY_CONFIG) as TaskPriority[]).map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_CONFIG[p].label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Start Date */}
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <Calendar className="h-3.5 w-3.5" />
                  Ngày bắt đầu
                </label>
                <input
                  type="date"
                  value={task.start_date ? task.start_date.slice(0, 10) : ""}
                  onChange={(e) =>
                    updateTaskFields({ start_date: e.target.value || null })
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              {/* Due Date */}
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <Calendar className="h-3.5 w-3.5" />
                  Hạn hoàn thành
                </label>
                <input
                  type="date"
                  value={task.due_date ? task.due_date.slice(0, 10) : ""}
                  onChange={(e) =>
                    updateTaskFields({ due_date: e.target.value || null })
                  }
                  className={cn(
                    "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800",
                    isOverdue(task.due_date, task.completed_at)
                      ? "border-red-300 font-medium text-red-600 dark:border-red-800 dark:text-red-400"
                      : "text-slate-800 dark:text-slate-100"
                  )}
                />
              </div>
            </div>

            {/* Assignees */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-200">
                  <Users className="h-4 w-4 text-slate-400" />
                  Người phụ trách
                </span>
                <button
                  type="button"
                  onClick={() => setShowAssigneePicker((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand hover:bg-brand-soft dark:hover:bg-brand/15 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {showAssigneePicker ? "Đóng" : "Giao việc"}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {assignedProfiles.length === 0 ? (
                  <span className="text-xs italic text-slate-400">
                    Chưa giao cho ai
                  </span>
                ) : (
                  assignedProfiles.map((m) => (
                    <span
                      key={m.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1 pl-1.5 pr-2.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand/15 text-[10px] font-bold text-brand">
                        {getInitials(m.full_name)}
                      </span>
                      {m.full_name}
                      <button
                        type="button"
                        onClick={() => handleToggleAssignee(m)}
                        className="ml-0.5 text-slate-400 hover:text-red-500 cursor-pointer"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))
                )}
              </div>

              {showAssigneePicker && (
                <div className="mt-2.5 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                  {members.map((m) => {
                    const checked = assigneeIds.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => handleToggleAssignee(m)}
                        className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-700/60 cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-soft text-[10px] font-bold text-brand dark:bg-brand/20">
                            {getInitials(m.full_name)}
                          </span>
                          <div>
                            <p className="font-medium text-slate-800 dark:text-slate-100">
                              {m.full_name}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {m.job_title || m.email}
                            </p>
                          </div>
                        </div>
                        {checked && <Check className="h-4 w-4 text-brand" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Description */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Mô tả chi tiết
                </label>
                {description !== (task.description ?? "") && (
                  <button
                    type="button"
                    disabled={savingDesc}
                    onClick={handleSaveDescription}
                    className="inline-flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-hover cursor-pointer"
                  >
                    {savingDesc ? "Đang lưu..." : "Lưu mô tả"}
                  </button>
                )}
              </div>
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => {
                  if (description !== (task.description ?? "")) {
                    handleSaveDescription();
                  }
                }}
                placeholder="Nhập yêu cầu, checklist hoặc ghi chú cho công việc này..."
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100"
              />
            </div>

            {/* Subtasks */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-200">
                  <CheckSquare className="h-4 w-4 text-slate-400" />
                  Công việc con ({completedSubtasksCount}/{subtasks.length})
                </span>
              </div>

              <div className="space-y-1.5">
                {subtasks.map((sub) => {
                  const isDone =
                    Boolean(sub.completed_at) ||
                    (doneStatus !== null && sub.status_id === doneStatus.id);
                  return (
                    <div
                      key={sub.id}
                      className="group flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/40"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleSubtask(sub)}
                        className="flex flex-1 items-center gap-2.5 text-left cursor-pointer"
                      >
                        {isDone ? (
                          <CheckSquare className="h-4 w-4 shrink-0 text-emerald-500" />
                        ) : (
                          <Square className="h-4 w-4 shrink-0 text-slate-400" />
                        )}
                        <span
                          className={cn(
                            "text-sm",
                            isDone
                              ? "text-slate-400 line-through"
                              : "text-slate-800 dark:text-slate-200"
                          )}
                        >
                          {sub.title}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSubtask(sub.id)}
                        className="opacity-0 transition group-hover:opacity-100 text-slate-400 hover:text-red-500 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>

              <form onSubmit={handleAddSubtask} className="mt-2.5 flex gap-2">
                <input
                  type="text"
                  value={newSubtaskTitle}
                  onChange={(e) => setNewSubtaskTitle(e.target.value)}
                  placeholder="+ Thêm công việc con..."
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <button
                  type="submit"
                  disabled={addingSubtask || !newSubtaskTitle.trim()}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-40 dark:bg-slate-700 dark:hover:bg-slate-600 cursor-pointer"
                >
                  Thêm
                </button>
              </form>
            </div>

            {/* Attachments & External Links */}
            <div>
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-200">
                  <Paperclip className="h-4 w-4 text-slate-400" />
                  Tài liệu & Liên kết ({attachments.length})
                </span>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={uploadingFile}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                  >
                    {uploadingFile ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    Tải tệp lên
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLinkForm((v) => !v)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-brand hover:bg-brand-soft dark:border-slate-700 dark:bg-slate-800 cursor-pointer"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    Gắn link Drive / Lark
                  </button>
                </div>
              </div>

              {showLinkForm && (
                <form
                  onSubmit={handleAddLink}
                  className="mb-3 space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60"
                >
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <select
                      value={linkType}
                      onChange={(e) =>
                        setLinkType(
                          e.target.value as Exclude<AttachmentType, "file">
                        )
                      }
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="gdrive">Google Drive</option>
                      <option value="gsheet">Google Sheet</option>
                      <option value="lark">Lark Docs</option>
                      <option value="link">Liên kết khác</option>
                    </select>
                    <input
                      type="text"
                      required
                      value={linkName}
                      onChange={(e) => setLinkName(e.target.value)}
                      placeholder="Tên tài liệu (VD: Bản thảo chương 1)"
                      className="sm:col-span-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      required
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      placeholder="https://docs.google.com/..."
                      className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                    <button
                      type="submit"
                      disabled={addingLink}
                      className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-hover cursor-pointer"
                    >
                      {addingLink ? "..." : "Lưu link"}
                    </button>
                  </div>
                </form>
              )}

              {attachments.length === 0 ? (
                <p className="text-xs italic text-slate-400">
                  Chưa có tệp đính kèm hoặc liên kết tài liệu nào.
                </p>
              ) : (
                <div className="space-y-2">
                  {attachments.map((att) => {
                    const meta =
                      ATTACHMENT_TYPE_META[att.attachment_type] ??
                      ATTACHMENT_TYPE_META.link;
                    return (
                      <div
                        key={att.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-800/40"
                      >
                        <a
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex min-w-0 flex-1 items-center gap-2.5 hover:text-brand"
                        >
                          <AttachmentIcon type={att.attachment_type} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                              {att.name}
                            </p>
                            <div className="flex items-center gap-2 text-[11px] text-slate-400">
                              <span
                                className={cn(
                                  "rounded px-1.5 py-0.2 font-medium",
                                  meta.colorClass
                                )}
                              >
                                {meta.label}
                              </span>
                              {att.file_size && (
                                <span>{formatFileSize(att.file_size)}</span>
                              )}
                            </div>
                          </div>
                          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        </a>
                        <button
                          type="button"
                          onClick={() => handleDeleteAttachment(att)}
                          title="Xóa tài liệu"
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Comments */}
            <div className="border-t border-slate-200 pt-5 dark:border-slate-800">
              <span className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-200">
                <MessageSquare className="h-4 w-4 text-slate-400" />
                Trao đổi & Bình luận ({comments.length})
              </span>

              <div className="space-y-3">
                {comments.length === 0 ? (
                  <p className="text-xs italic text-slate-400">
                    Chưa có bình luận nào. Hãy nhắc tên đồng nghiệp bằng @ để thông báo nhanh!
                  </p>
                ) : (
                  comments.map((c) => {
                    const authorName = c.author?.full_name ?? "Thành viên";
                    return (
                      <div key={c.id} className="flex items-start gap-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[11px] font-bold text-brand dark:bg-brand/20">
                          {getInitials(authorName)}
                        </div>
                        <div className="flex-1 rounded-xl bg-slate-50 px-3.5 py-2.5 dark:bg-slate-800/60">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                              {authorName}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {formatDateTimeVi(c.created_at)}
                            </span>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
                            {c.content}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Comment input with @mention helper */}
              <form onSubmit={handlePostComment} className="mt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setShowMentionBar((v) => !v)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline cursor-pointer"
                  >
                    <AtSign className="h-3.5 w-3.5" />
                    Nhắc tên thành viên (@mention)
                  </button>
                </div>

                {showMentionBar && (
                  <div className="flex flex-wrap gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/60">
                    {members.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => handleInsertMention(m)}
                        className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-brand-soft hover:text-brand hover:ring-brand/40 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 cursor-pointer"
                      >
                        @{m.full_name}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <textarea
                    rows={2}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Viết bình luận... (nhấn @mention ở trên để tag đồng nghiệp)"
                    className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <button
                    type="submit"
                    disabled={postingComment || !commentText.trim()}
                    className="inline-flex items-center justify-center self-end rounded-xl bg-brand px-3.5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-50 cursor-pointer"
                  >
                    {postingComment ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
