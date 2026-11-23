"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AtSign,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  ClipboardList,
  FolderPlus,
  Loader2,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { cn, getInitials } from "@/lib/utils";
import type { Notification, NotificationType } from "@/types/database";

interface InboxClientProps {
  initialNotifications: Notification[];
  currentUserId: string;
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
        label: "Cập nhật trạng thái",
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

export function InboxClient({
  initialNotifications,
  currentUserId,
}: InboxClientProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [notifications, setNotifications] =
    useState<Notification[]>(initialNotifications);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [markingAll, setMarkingAll] = useState(false);

  // Realtime subscription for incoming notifications
  useEffect(() => {
    const channel = supabase
      .channel(`inbox-notifications-${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${currentUserId}`,
        },
        async (payload) => {
          const inserted = payload.new as Notification;
          let actor: Notification["actor"] = null;

          if (inserted.actor_id) {
            const { data } = await supabase
              .from("profiles")
              .select("id, full_name, avatar_url")
              .eq("id", inserted.actor_id)
              .single();
            actor = data ?? null;
          }

          const enriched: Notification = {
            ...inserted,
            actor,
          };

          setNotifications((prev) =>
            prev.some((item) => item.id === enriched.id)
              ? prev
              : [enriched, ...prev]
          );

          toast.info(enriched.title, {
            description: enriched.body ?? undefined,
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, supabase]);

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

  const markSingleRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id);

    if (error) {
      toast.error("Không thể cập nhật trạng thái đã đọc");
    }
  };

  const handleOpenNotification = async (notification: Notification) => {
    if (!notification.is_read) {
      await markSingleRead(notification.id);
    }
    if (notification.link) {
      router.push(notification.link);
    }
  };

  const handleMarkAllRead = async () => {
    if (unreadCount === 0) return;
    setMarkingAll(true);

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", currentUserId)
      .eq("is_read", false);

    if (error) {
      toast.error("Không thể đánh dấu tất cả đã đọc", {
        description: error.message,
      });
    } else {
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      toast.success("Đã đánh dấu tất cả thông báo là đã đọc");
    }

    setMarkingAll(false);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Hộp thư Thông báo
            </h1>
            {unreadCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-brand px-2.5 py-0.5 text-xs font-semibold text-white">
                {unreadCount} chưa đọc
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Cập nhật tức thì các lượt giao việc, nhắc tên @mention và thay đổi
            tiến độ dự án.
          </p>
        </div>

        <button
          type="button"
          onClick={handleMarkAllRead}
          disabled={unreadCount === 0 || markingAll}
          className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-brand/40 hover:text-brand disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-brand/50 sm:self-auto"
        >
          {markingAll ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCheck className="h-4 w-4 text-brand" />
          )}
          Đánh dấu tất cả đã đọc
        </button>
      </div>

      {/* Filter Pills */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition",
            filter === "all"
              ? "bg-brand text-white shadow-sm"
              : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800 dark:hover:bg-slate-800"
          )}
        >
          Tất cả
          <span
            className={cn(
              "rounded-full px-1.5 py-0.2 text-xs",
              filter === "all"
                ? "bg-white/20 text-white"
                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
            )}
          >
            {notifications.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setFilter("unread")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition",
            filter === "unread"
              ? "bg-brand text-white shadow-sm"
              : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800 dark:hover:bg-slate-800"
          )}
        >
          Chưa đọc
          <span
            className={cn(
              "rounded-full px-1.5 py-0.2 text-xs",
              filter === "unread"
                ? "bg-white/20 text-white"
                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
            )}
          >
            {unreadCount}
          </span>
        </button>
      </div>

      {/* Notification List */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {visibleNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
              <BellOff className="h-6 w-6" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {filter === "unread"
                ? "Bạn đã đọc hết tất cả thông báo"
                : "Chưa có thông báo nào"}
            </h3>
            <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
              {filter === "unread"
                ? "Mọi cập nhật công việc và lời nhắc đều đã được xem qua."
                : "Khi bạn được giao việc, nhắc tên @mention hoặc thêm vào dự án mới, thông báo sẽ hiện ngay tại đây."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {visibleNotifications.map((notification) => {
              const meta = getNotificationMeta(notification.type);
              const TypeIcon = meta.icon;
              const actorName = notification.actor?.full_name;

              return (
                <li
                  key={notification.id}
                  onClick={() => void handleOpenNotification(notification)}
                  className={cn(
                    "group relative flex cursor-pointer items-start gap-3.5 px-4 py-4 transition sm:px-5",
                    notification.is_read
                      ? "bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/50"
                      : "bg-brand-soft/45 hover:bg-brand-soft/80 dark:bg-brand-soft-dark/30 dark:hover:bg-brand-soft-dark/50"
                  )}
                >
                  {/* Unread Indicator Dot */}
                  <div className="mt-2 flex h-2 w-2 shrink-0 items-center justify-center">
                    {!notification.is_read && (
                      <span className="h-2 w-2 rounded-full bg-brand" />
                    )}
                  </div>

                  {/* Actor Avatar or Type Icon */}
                  <div className="relative shrink-0">
                    {actorName ? (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white dark:bg-slate-700">
                        {getInitials(actorName)}
                      </div>
                    ) : (
                      <div
                        className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-full",
                          meta.badgeClass
                        )}
                      >
                        <TypeIcon className="h-5 w-5" />
                      </div>
                    )}
                    {actorName && (
                      <span
                        className={cn(
                          "absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white dark:border-slate-900",
                          meta.badgeClass
                        )}
                      >
                        <TypeIcon className="h-2.5 w-2.5" />
                      </span>
                    )}
                  </div>

                  {/* Main Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium",
                          meta.badgeClass
                        )}
                      >
                        {meta.label}
                      </span>
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        {formatRelativeVi(notification.created_at)}
                      </span>
                    </div>

                    <p
                      className={cn(
                        "mt-1 text-sm leading-snug",
                        notification.is_read
                          ? "font-medium text-slate-800 dark:text-slate-200"
                          : "font-semibold text-slate-900 dark:text-white"
                      )}
                    >
                      {notification.title}
                    </p>

                    {notification.body && (
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                        {notification.body}
                      </p>
                    )}

                    {actorName && (
                      <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
                        Từ <span className="font-medium text-slate-600 dark:text-slate-300">{actorName}</span>
                      </p>
                    )}
                  </div>

                  {/* Quick Mark Read Button */}
                  {!notification.is_read && (
                    <button
                      type="button"
                      title="Đánh dấu đã đọc"
                      onClick={(e) => {
                        e.stopPropagation();
                        void markSingleRead(notification.id);
                      }}
                      className="shrink-0 rounded-lg border border-transparent p-1.5 text-slate-400 opacity-0 transition hover:border-slate-200 hover:bg-white hover:text-brand group-hover:opacity-100 dark:hover:border-slate-700 dark:hover:bg-slate-800"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
