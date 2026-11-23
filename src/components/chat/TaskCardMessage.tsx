"use client";

import React from "react";
import Link from "next/link";
import { cn, getInitials } from "@/lib/utils";
import {
  CheckSquare,
  ExternalLink,
  Calendar,
  User,
  AlertCircle,
  FolderKanban,
  CheckCircle2,
  Clock,
} from "lucide-react";

export interface TaskCardData {
  id: string;
  title: string;
  projectId?: string;
  projectName?: string;
  statusName?: string;
  statusCategory?: "todo" | "doing" | "done";
  priority?: "low" | "medium" | "high" | "urgent" | string;
  assigneeName?: string;
  assigneeAvatar?: string | null;
  dueDate?: string | null;
  taskUrl?: string;
}

interface TaskCardMessageProps {
  task: TaskCardData;
  className?: string;
}

export function TaskCardMessage({ task, className }: TaskCardMessageProps) {
  const url =
    task.taskUrl ||
    (task.projectId
      ? `/projects/${task.projectId}?task=${task.id}`
      : `#`);

  const category = task.statusCategory || "todo";

  const statusBg =
    category === "done"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
      : category === "doing"
        ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
        : "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";

  const priorityColor =
    task.priority === "urgent"
      ? "text-red-600 bg-red-50 dark:bg-red-950/40 dark:text-red-400 border-red-200 dark:border-red-800"
      : task.priority === "high"
        ? "text-orange-600 bg-orange-50 dark:bg-orange-950/40 dark:text-orange-400 border-orange-200 dark:border-orange-800"
        : task.priority === "medium"
          ? "text-blue-600 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-400 border-blue-200 dark:border-blue-800"
          : "text-slate-500 bg-slate-50 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700";

  const priorityLabel =
    task.priority === "urgent"
      ? "Khẩn cấp"
      : task.priority === "high"
        ? "Cao"
        : task.priority === "medium"
          ? "Trung bình"
          : "Thấp";

  return (
    <div
      className={cn(
        "my-1.5 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden transition hover:shadow-md",
        category === "done"
          ? "border-l-4 border-l-emerald-500"
          : category === "doing"
            ? "border-l-4 border-l-amber-500"
            : "border-l-4 border-l-brand",
        className
      )}
    >
      {/* Header: Project Badge & Action */}
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 px-3.5 py-2 bg-slate-50/60 dark:bg-slate-800/30">
        <div className="flex items-center gap-1.5 min-w-0">
          <FolderKanban className="h-3.5 w-3.5 text-brand shrink-0" />
          <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate">
            {task.projectName || "Alpha Task"}
          </span>
        </div>
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-brand tracking-wider uppercase">
          <CheckSquare className="h-3 w-3" />
          Thẻ công việc
        </span>
      </div>

      {/* Body: Title & Meta Info */}
      <div className="p-3.5 space-y-2.5">
        <div>
          <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 line-clamp-2 leading-relaxed">
            {task.title}
          </h4>
        </div>

        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-1.5">
          {task.statusName && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold",
                statusBg
              )}
            >
              {category === "done" ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : category === "doing" ? (
                <Clock className="h-3 w-3" />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
              )}
              {task.statusName}
            </span>
          )}

          {task.priority && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold",
                priorityColor
              )}
            >
              <AlertCircle className="h-3 w-3" />
              {priorityLabel}
            </span>
          )}
        </div>

        {/* Details: Assignee & Due Date */}
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/60 text-[11px]">
          <div className="flex items-center gap-1.5 min-w-0 text-slate-600 dark:text-slate-400">
            {task.assigneeAvatar ? (
              <img
                src={task.assigneeAvatar}
                alt={task.assigneeName || "Assignee"}
                className="h-4 w-4 rounded-full object-cover shrink-0"
              />
            ) : (
              <User className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            )}
            <span className="truncate">
              {task.assigneeName || "Chưa phân công"}
            </span>
          </div>

          {task.dueDate && (
            <div className="flex items-center gap-1.5 min-w-0 text-slate-600 dark:text-slate-400 justify-end">
              <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="truncate">
                {new Date(task.dueDate).toLocaleDateString("vi-VN", {
                  day: "2-digit",
                  month: "2-digit",
                })}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Footer: Open Button */}
      <div className="border-t border-slate-100 dark:border-slate-800/80 px-3.5 py-2 bg-slate-50/40 dark:bg-slate-800/20 flex justify-end">
        <Link
          href={url}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand hover:text-brand-dark transition cursor-pointer"
        >
          <span>Xem chi tiết công việc</span>
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
