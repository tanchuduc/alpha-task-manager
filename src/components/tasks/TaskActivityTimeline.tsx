"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus,
  CheckCircle2,
  Calendar,
  Flag,
  UserPlus,
  UserMinus,
  Paperclip,
  Trash2,
  CheckSquare,
  Tag,
  Edit3,
  FileText,
  Clock,
  Loader2,
  History,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { TaskActivityLog } from "@/types/database";
import { formatActivityMessage } from "@/lib/activity-logger";
import { getInitials } from "@/lib/utils";

interface TaskActivityTimelineProps {
  taskId: string;
}

function ActivityIcon({ iconName }: { iconName: string }) {
  const iconProps = { className: "h-3.5 w-3.5" };

  switch (iconName) {
    case "plus":
      return <Plus {...iconProps} className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />;
    case "check-circle":
      return <CheckCircle2 {...iconProps} className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />;
    case "calendar":
      return <Calendar {...iconProps} className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />;
    case "flag":
      return <Flag {...iconProps} className="h-3.5 w-3.5 text-brand" />;
    case "user-plus":
      return <UserPlus {...iconProps} className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />;
    case "user-minus":
      return <UserMinus {...iconProps} className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />;
    case "paperclip":
      return <Paperclip {...iconProps} className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />;
    case "trash":
      return <Trash2 {...iconProps} className="h-3.5 w-3.5 text-red-500" />;
    case "check-square":
      return <CheckSquare {...iconProps} className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />;
    case "tag":
      return <Tag {...iconProps} className="h-3.5 w-3.5 text-brand" />;
    case "edit":
      return <Edit3 {...iconProps} className="h-3.5 w-3.5 text-indigo-500" />;
    case "file-text":
      return <FileText {...iconProps} className="h-3.5 w-3.5 text-slate-500" />;
    default:
      return <Clock {...iconProps} className="h-3.5 w-3.5 text-slate-400" />;
  }
}

export default function TaskActivityTimeline({ taskId }: TaskActivityTimelineProps) {
  const supabase = useMemo(() => createClient(), []);
  const [logs, setLogs] = useState<TaskActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("task_activity_logs")
        .select("*, actor:profiles(id, full_name, avatar_url, email)")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setLogs(data as TaskActivityLog[]);
      }
    } catch (err) {
      console.error("[TaskActivityTimeline] Lỗi khi tải nhật ký:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase, taskId]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Realtime subscription for task_activity_logs
  useEffect(() => {
    const channel = supabase
      .channel(`task-activity-${taskId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "alpha_lite",
          table: "task_activity_logs",
          filter: `task_id=eq.${taskId}`,
        },
        async (payload) => {
          // Fetch full row with actor joined
          const { data } = await supabase
            .from("task_activity_logs")
            .select("*, actor:profiles(id, full_name, avatar_url, email)")
            .eq("id", payload.new.id)
            .single();

          if (data) {
            setLogs((prev) => [data as TaskActivityLog, ...prev]);
          } else {
            fetchLogs();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, taskId, fetchLogs]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-brand" />
        <span className="ml-2 text-xs text-slate-500">Đang tải lịch sử hoạt động...</span>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-8 text-center dark:border-slate-800">
        <History className="h-8 w-8 text-slate-300 dark:text-slate-600" />
        <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">
          Chưa có lịch sử hoạt động nào được ghi nhận
        </p>
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          Mọi thay đổi trạng thái, hạn chót, phân công sẽ tự động hiển thị tại đây.
        </p>
      </div>
    );
  }

  return (
    <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
      {logs.map((log) => {
        const { title, time, icon } = formatActivityMessage(log);
        const actorName = log.actor?.full_name || "Hệ thống";

        return (
          <div key={log.id} className="relative group">
            {/* Timeline dot / icon */}
            <div className="absolute -left-6 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white ring-4 ring-white dark:bg-slate-900 dark:ring-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xs">
              <ActivityIcon iconName={icon} />
            </div>

            {/* Content card */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 transition group-hover:border-slate-200 group-hover:bg-slate-50 dark:border-slate-800/80 dark:bg-slate-800/40 dark:group-hover:border-slate-700 dark:group-hover:bg-slate-800/80">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[10px] font-bold text-brand dark:bg-brand/20">
                    {getInitials(actorName)}
                  </div>
                  <span className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {actorName}
                  </span>
                </div>
                <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500" title={new Date(log.created_at).toLocaleString("vi-VN")}>
                  {time}
                </span>
              </div>

              <p className="mt-1.5 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                {title}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
