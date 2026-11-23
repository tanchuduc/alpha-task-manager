import type { SupabaseClient } from "@supabase/supabase-js";
import type { TaskActivityLog, TaskPriority } from "@/types/database";
import { PRIORITY_CONFIG, formatDateVi } from "@/lib/utils";

export interface LogTaskActivityParams {
  taskId: string;
  actorId: string | null;
  action: string;
  details?: {
    old_value?: string | null;
    new_value?: string | null;
    label?: string;
    description?: string;
    [key: string]: unknown;
  };
}

/**
 * Ghi nhận nhật ký hoạt động cho công việc vào alpha_lite.task_activity_logs
 */
export async function logTaskActivity(
  supabase: SupabaseClient,
  { taskId, actorId, action, details = {} }: LogTaskActivityParams
) {
  try {
    const { error } = await supabase.from("task_activity_logs").insert({
      task_id: taskId,
      actor_id: actorId,
      action,
      details,
    });
    if (error) {
      console.error("[logTaskActivity] Lỗi khi ghi nhật ký:", error);
    }
  } catch (err) {
    console.error("[logTaskActivity] Lỗi kết nối:", err);
  }
}

/**
 * Chuyển đổi mốc thời gian thành định dạng thân thiện tiếng Việt
 */
export function formatRelativeTimeVi(isoString: string): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 45) return "Vừa xong";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} phút trước`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} giờ trước`;
  if (diffSec < 172800) {
    const timeStr = date.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `Hôm qua lúc ${timeStr}`;
  }

  return date.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Format thông điệp hành động thân thiện bằng tiếng Việt
 */
export function formatActivityMessage(log: TaskActivityLog): {
  title: string;
  time: string;
  icon: string;
} {
  const d = log.details || {};
  let title = d.description || "";
  let icon = "clock";

  switch (log.action) {
    case "created":
      title = "Đã tạo công việc này";
      icon = "plus";
      break;

    case "status_changed":
      icon = "check-circle";
      if (d.old_value && d.new_value) {
        title = `Đã đổi trạng thái từ "${d.old_value}" sang "${d.new_value}"`;
      } else if (d.new_value) {
        title = `Đã đổi trạng thái sang "${d.new_value}"`;
      } else {
        title = "Đã cập nhật trạng thái";
      }
      break;

    case "due_date_changed":
      icon = "calendar";
      if (d.new_value) {
        title = `Đã cập nhật hạn hoàn thành thành ${formatDateVi(d.new_value)}`;
      } else {
        title = "Đã xóa hạn hoàn thành";
      }
      break;

    case "priority_changed":
      icon = "flag";
      const oldPriority = d.old_value as TaskPriority | undefined;
      const newPriority = d.new_value as TaskPriority | undefined;
      const oldLabel = oldPriority && PRIORITY_CONFIG[oldPriority]?.label ? PRIORITY_CONFIG[oldPriority].label : d.old_value;
      const newLabel = newPriority && PRIORITY_CONFIG[newPriority]?.label ? PRIORITY_CONFIG[newPriority].label : d.new_value;
      if (oldLabel && newLabel) {
        title = `Đã đổi mức ưu tiên từ "${oldLabel}" sang "${newLabel}"`;
      } else if (newLabel) {
        title = `Đã đổi mức ưu tiên sang "${newLabel}"`;
      } else {
        title = "Đã đổi mức ưu tiên";
      }
      break;

    case "assignee_added":
      icon = "user-plus";
      title = `Đã gán công việc cho ${d.new_value || d.label || "thành viên"}`;
      break;

    case "assignee_removed":
      icon = "user-minus";
      title = `Đã bỏ phân công ${d.old_value || d.label || "thành viên"}`;
      break;

    case "attachment_added":
      icon = "paperclip";
      title = `Đã tải lên tệp "${d.new_value || d.label || "tài liệu"}"`;
      break;

    case "attachment_removed":
      icon = "trash";
      title = `Đã xóa tệp "${d.old_value || d.label || "tài liệu"}"`;
      break;

    case "subtask_created":
      icon = "check-square";
      title = `Đã tạo công việc con "${d.new_value || d.label || ""}"`;
      break;

    case "subtask_completed":
      icon = "check-square";
      title = `Đã hoàn thành công việc con "${d.new_value || d.label || ""}"`;
      break;

    case "custom_field_changed":
      icon = "tag";
      title = `Đã cập nhật trường [${d.label || "Tùy biến"}]: ${d.new_value || "(trống)"}`;
      break;

    case "title_changed":
      icon = "edit";
      title = `Đã đổi tiêu đề thành "${d.new_value || ""}"`;
      break;

    case "description_changed":
      icon = "file-text";
      title = "Đã cập nhật mô tả công việc";
      break;

    default:
      if (!title) {
        title = `Hoạt động: ${log.action}`;
      }
      break;
  }

  return {
    title,
    time: formatRelativeTimeVi(log.created_at),
    icon,
  };
}
