"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AtSign,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  ClipboardList,
  ExternalLink,
  FolderPlus,
  Loader2,
  MessageSquare,
  RefreshCw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { cn, getInitials } from "@/lib/utils";
import type { Notification, NotificationType } from "@/types/database";

interface NotificationDrawerProps {
  open: boolean;
  onClose: () => void;
  currentUserId: string;
  onUnreadCountChange?: (count: number) => void;
}

function formatRelativeVi(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "Vừa xong";

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} phút trước`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} giờ trước`;

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) return "Hôm qua";
  if (diffDay < 7) return `${diffDay} ngày trước`;

  return date.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getNotificationMeta(type: NotificationType) {
  switch (type) {
    case "task_assigned":
      return {
        label: "Giao việc",
        icon: ClipboardList,
        badgeClass:
          "bg-brand-soft text-brand dark:bg-brand-soft-dark dark:text-orange-300",
      };
    case "task_mentioned":
      return {
        label: "Nhắc tên",
        icon: AtSign,
        badgeClass:
          "bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300",
      };
    case "task_commented":
      return {
        label: "Bình luận",
        icon: MessageSquare,
        badgeClass:
          "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
      };
    case "task_status_changed":
      return {
        label: "Trạng thái",
        icon: RefreshCw,
        badgeClass:
          "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
      };
    case "project_added":
      return {
        label: "Dự án mới",
        icon: FolderPlus,
        badgeClass:
          "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
      };
    default:
      return {
        label: "Thông báo",
        icon: Bell,
        badgeClass:
          "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
      };
  }
}

export function NotificationDrawer({
  open,
  onClose,
  currentUserId,
  onUnreadCountChange,
}: NotificationDrawerProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [markingAll, setMarkingAll] = useState(false);

  // Fetch notifications when drawer opens
  useEffect(() => {
    if (!open) return;

    let active = true;
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("notifications")
        .select("*, actor:profiles!notifications_actor_id_fkey(id, full_name, avatar_url)")
        .eq("user_id", currentUserId)
        .order("created_at", { ascending: false })
        .limit(40);

      if (active && data) {
        type RawNotification = Omit<Notification, "actor"> & {
          actor?: Notification["actor"] | Array<NonNullable<Notification["actor"]>>;
        };
        const list = (data as unknown as RawNotification[]).map((n) => ({
          ...n,
          actor: Array.isArray(n.actor) ? n.actor[0] ?? null : n.actor ?? null,
        }));
        setNotifications(list);
        const unread = list.filter((x) => !x.is_read).length;
        onUnreadCountChange?.(unread);
      }
      if (active) setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [open, currentUserId, supabase, onUnreadCountChange]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications]
  );

  const visibleNotifications = useMemo(
    () =>
      filter === "unread"
        ? notifications.filter((n) => !n.is_read)
        : notifications,
    [filter, notifications]
  );

  async function markSingleRead(id: string) {
    setNotifications((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, is_read: true } : n));
      onUnreadCountChange?.(next.filter((x) => !x.is_read).length);
      return next;
    });

    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
  }

  async function handleOpenNotification(item: Notification) {
    if (!item.is_read) {
      await markSingleRead(item.id);
    }
    onClose();
    if (item.link) {
      router.push(item.link);
    }
  }

  async function handleMarkAllRead() {
    if (unreadCount === 0) return;
    setMarkingAll(true);
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", currentUserId)
      .eq("is_read", false);

    if (!error) {
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      onUnreadCountChange?.(0);
      toast.success("Đã đánh dấu tất cả là đã đọc");
    }
    setMarkingAll(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Transparent click-away overlay (no dark blur that blocks context) */}
      <div
        className="fixed inset-0 bg-black/15"
        onClick={onClose}
      />

      <aside className="relative z-10 flex h-full w-full max-w-[400px] flex-col border-l border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e8e8e8] dark:border-[#303030] px-4 py-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-brand" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Thông báo
            </h2>
            {unreadCount > 0 && (
              <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={markingAll}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand hover:bg-brand-soft dark:hover:bg-brand-soft-dark transition cursor-pointer"
                title="Đánh dấu tất cả đã đọc"
              >
                {markingAll ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCheck className="h-3.5 w-3.5" />
                )}
                <span>Đọc tất cả</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
              aria-label="Đóng thông báo"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Sub-toolbar: Filter pills + View full page */}
        <div className="flex items-center justify-between border-b border-[#e8e8e8] dark:border-[#303030] bg-[#fafafa] dark:bg-[#181818] px-4 py-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition cursor-pointer",
                filter === "all"
                  ? "bg-brand text-white"
                  : "text-slate-600 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-800"
              )}
            >
              Tất cả ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("unread")}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition cursor-pointer",
                filter === "unread"
                  ? "bg-brand text-white"
                  : "text-slate-600 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-800"
              )}
            >
              Chưa đọc ({unreadCount})
            </button>
          </div>

          <Link
            href="/inbox"
            onClick={onClose}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-brand dark:text-slate-400"
          >
            <span>Mở Hộp thư</span>
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#f0f0f0] dark:divide-[#2a2a2a]">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-xs text-slate-400 gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-brand" />
              <span>Đang tải thông báo...</span>
            </div>
          ) : visibleNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
                <BellOff className="h-5 w-5" />
              </div>
              <p className="mt-3 text-xs font-semibold text-slate-700 dark:text-slate-200">
                {filter === "unread"
                  ? "Không có thông báo chưa đọc"
                  : "Chưa có thông báo nào"}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                Các lượt giao việc, @mention và cập nhật tiến độ sẽ hiển thị tại đây.
              </p>
            </div>
          ) : (
            visibleNotifications.map((item) => {
              const meta = getNotificationMeta(item.type);
              const TypeIcon = meta.icon;
              const actorName = item.actor?.full_name;

              return (
                <div
                  key={item.id}
                  onClick={() => void handleOpenNotification(item)}
                  className={cn(
                    "group relative flex cursor-pointer items-start gap-3 px-4 py-3 transition",
                    item.is_read
                      ? "bg-white hover:bg-slate-50 dark:bg-[#1f1f1f] dark:hover:bg-[#262626]"
                      : "bg-brand-soft/45 hover:bg-brand-soft/80 dark:bg-brand-soft-dark/30 dark:hover:bg-brand-soft-dark/50"
                  )}
                >
                  {/* Unread Dot */}
                  <div className="mt-1.5 flex h-2 w-2 shrink-0 items-center justify-center">
                    {!item.is_read && (
                      <span className="h-2 w-2 rounded-full bg-brand" />
                    )}
                  </div>

                  {/* Avatar */}
                  <div className="relative shrink-0">
                    {actorName ? (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-[11px] font-semibold text-white">
                        {getInitials(actorName)}
                      </div>
                    ) : (
                      <div
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-full",
                          meta.badgeClass
                        )}
                      >
                        <TypeIcon className="h-4 w-4" />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={cn(
                          "inline-flex items-center rounded px-1.5 py-0.2 text-[10px] font-medium",
                          meta.badgeClass
                        )}
                      >
                        {meta.label}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {formatRelativeVi(item.created_at)}
                      </span>
                    </div>

                    <p
                      className={cn(
                        "mt-1 text-xs leading-snug",
                        item.is_read
                          ? "font-medium text-slate-800 dark:text-slate-200"
                          : "font-semibold text-slate-900 dark:text-white"
                      )}
                    >
                      {item.title}
                    </p>

                    {item.body && (
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500 dark:text-slate-400">
                        {item.body}
                      </p>
                    )}
                  </div>

                  {!item.is_read && (
                    <button
                      type="button"
                      title="Đánh dấu đã đọc"
                      onClick={(e) => {
                        e.stopPropagation();
                        void markSingleRead(item.id);
                      }}
                      className="shrink-0 rounded p-1 text-slate-400 opacity-0 transition hover:bg-white hover:text-brand group-hover:opacity-100 dark:hover:bg-slate-800"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
}
