"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn, getInitials, ROLE_LABELS } from "@/lib/utils";
import { hasSystemPermission, SYSTEM_PERMISSIONS } from "@/lib/permissions";
import type { Profile } from "@/types/database";
import { GlobalSearchModal } from "./GlobalSearchModal";
import { NavRail, type NavRailItemConfig } from "./NavRail";
import { NotificationDrawer } from "./NotificationDrawer";
import { QuickActionButton } from "./QuickActionButton";
import {
  Archive,
  BarChart3,
  Bell,
  Calendar,
  CheckSquare,
  Download,
  FolderKanban,
  Home,
  Inbox,
  Layers,
  LayoutGrid,
  ListTodo,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Send,
  Settings,
  Sun,
  User,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

interface AppShellProps {
  profile: Profile;
  initialUnreadCount: number;
  children: React.ReactNode;
}

const TOP_NAV_ITEMS = [
  { href: "/home", key: "home", label: "Trang chủ", icon: Home },
  { href: "/projects", key: "projects", label: "Dự án", icon: FolderKanban },
  { href: "/reports", key: "reports", label: "Báo cáo", icon: BarChart3 },
];

export function AppShell({
  profile,
  initialUnreadCount,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [searchOpen, setSearchOpen] = useState(false);
  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  // Left NavRail states (persisted per surface in localStorage like legacy-worklenz)
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [pinnedViews, setPinnedViews] = useState<Record<string, string>>({});

  const userMenuRef = useRef<HTMLDivElement>(null);

  const canViewReports = hasSystemPermission(
    profile,
    SYSTEM_PERMISSIONS.VIEW_REPORTS
  );
  const visibleTopNavItems = useMemo(() => {
    return TOP_NAV_ITEMS.filter((item) => {
      if (item.key === "reports") return canViewReports;
      return true;
    });
  }, [canViewReports]);

  // Sync theme and rail preferences on mount
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
    try {
      const savedCollapsed = localStorage.getItem("alpha_rail_collapsed");
      if (savedCollapsed === "true") setRailCollapsed(true);
      const savedPins = localStorage.getItem("alpha_rail_pins");
      if (savedPins) setPinnedViews(JSON.parse(savedPins));
    } catch {
      // ignore storage errors
    }
  }, []);

  // Global Ctrl+K / Cmd+K shortcut
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Close user dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node)
      ) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Refresh unread notifications count & subscribe realtime
  useEffect(() => {
    let active = true;
    const supabase = createClient();

    async function refreshUnread() {
      try {
        const { count } = await supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", profile.id)
          .eq("is_read", false);
        if (active && typeof count === "number") {
          setUnreadCount(count);
        }
      } catch {
        // ignore transient errors
      }
    }

    refreshUnread();

    const notifChannel = supabase
      .channel("appshell-notif-unread")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "alpha_lite",
          table: "notifications",
          filter: `user_id=eq.${profile.id}`,
        },
        () => {
          refreshUnread();
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(notifChannel);
    };
  }, [pathname, profile.id]);

  // Refresh and subscribe to unread direct messages for Chat
  useEffect(() => {
    let active = true;
    const supabase = createClient();

    async function refreshUnreadChat() {
      try {
        const { count } = await supabase
          .from("direct_messages")
          .select("id", { count: "exact", head: true })
          .eq("receiver_id", profile.id)
          .eq("is_read", false);
        if (active && typeof count === "number") {
          setUnreadChatCount(count);
        }
      } catch {
        // ignore errors
      }
    }

    refreshUnreadChat();

    const dmChannel = supabase
      .channel("appshell-chat-unread")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "alpha_lite",
          table: "direct_messages",
          filter: `receiver_id=eq.${profile.id}`,
        },
        () => {
          refreshUnreadChat();
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(dmChannel);
    };
  }, [pathname, profile.id]);

  function toggleTheme() {
    const nextDark = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", nextDark);
    try {
      localStorage.setItem("alpha-theme", nextDark ? "dark" : "light");
      localStorage.setItem("theme", nextDark ? "dark" : "light");
    } catch {
      // ignore storage errors
    }
    setIsDark(nextDark);
  }

  function handleToggleRailCollapse() {
    setRailCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("alpha_rail_collapsed", String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  function handleTogglePin(surface: string, itemKey: string) {
    setPinnedViews((prev) => {
      const next = { ...prev };
      if (next[surface] === itemKey) {
        delete next[surface];
        toast.info("Đã bỏ ghim chế độ mặc định");
      } else {
        next[surface] = itemKey;
        toast.success("Đã ghim làm chế độ mặc định khi mở!");
      }
      try {
        localStorage.setItem("alpha_rail_pins", JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  async function handleSignOut() {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      toast.success("Đã đăng xuất.");
      router.push("/login");
      router.refresh();
    } catch {
      toast.error("Không thể đăng xuất lúc này.");
    }
  }

  // Determine current surface and whether Left NavRail is shown (exactly like legacy AppShellLayout.tsx)
  const surfaceConfig = useMemo<{
    surfaceKey: string;
    items: NavRailItemConfig[];
    activeKey: string;
    onSelect: (key: string) => void;
  } | null>(() => {
    // 1. HOME SURFACE (/home or /chat or /inbox)
    if (pathname === "/home" || pathname === "/chat" || pathname.startsWith("/chat") || pathname === "/inbox") {
      const currentView =
        pathname === "/chat" || pathname.startsWith("/chat") || pathname === "/inbox"
          ? "inbox"
          : searchParams.get("view") || pinnedViews["home"] || "overview";

      return {
        surfaceKey: "home",
        activeKey: currentView,
        items: [
          { key: "overview", label: "Tổng quan", icon: LayoutGrid },
          { key: "my-tasks", label: "Việc của tôi", icon: CheckSquare },
          { key: "delegated", label: "Tôi đã giao", icon: Send },
          { key: "calendar", label: "Lịch", icon: Calendar },
          {
            key: "inbox",
            label: "Hộp thư",
            icon: Inbox,
            badge: unreadChatCount,
          },
          { key: "todo", label: "Todo", icon: ListTodo },
        ],
        onSelect: (key: string) => {
          if (key === "inbox") {
            router.push("/chat");
          } else {
            router.push(`/home?view=${key}`);
          }
        },
      };
    }

    // 2. PROJECTS PORTFOLIO SURFACE (/projects or /projects/templates, excluding /projects/[id])
    if (pathname === "/projects" || pathname === "/projects/templates") {
      const currentView =
        pathname === "/projects/templates"
          ? "templates"
          : searchParams.get("view") || pinnedViews["projects"] || "all";

      return {
        surfaceKey: "projects",
        activeKey: currentView,
        items: [
          { key: "all", label: "Tất cả\ndự án", icon: LayoutGrid },
          { key: "grouped", label: "Theo\nnhóm", icon: FolderKanban },
          { key: "templates", label: "Mẫu quy\ntrình", icon: Layers },
          { key: "archived", label: "Lưu trữ", icon: Archive },
        ],
        onSelect: (key: string) => {
          if (key === "templates") {
            router.push("/projects/templates");
          } else {
            router.push(`/projects?view=${key}`);
          }
        },
      };
    }

    // 3. REPORTS SURFACE (/reports)
    if (pathname === "/reports" || pathname.startsWith("/reports/")) {
      const currentTab =
        searchParams.get("tab") || pinnedViews["reports"] || "executive";

      return {
        surfaceKey: "reports",
        activeKey: currentTab,
        items: [
          { key: "executive", label: "Dự án", icon: FolderKanban },
          { key: "team", label: "Nhân sự", icon: Users },
          { key: "explorer", label: "Tra cứu\n& Excel", icon: Download },
        ],
        onSelect: (key: string) => {
          router.push(`/reports?tab=${key}`);
        },
      };
    }

    return null;
  }, [pathname, searchParams, pinnedViews, unreadCount, unreadChatCount, router]);

  const hasLeftRail = Boolean(surfaceConfig);

  const isTopItemActive = useCallback(
    (itemKey: string) => {
      if (itemKey === "home") {
        return (
          pathname === "/home" ||
          pathname === "/chat" ||
          pathname.startsWith("/chat") ||
          pathname === "/inbox"
        );
      }
      if (itemKey === "projects") {
        return pathname === "/projects" || pathname.startsWith("/projects/");
      }
      if (itemKey === "reports") {
        return pathname === "/reports" || pathname.startsWith("/reports/");
      }
      return false;
    },
    [pathname]
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#f5f5f5] dark:bg-[#141414] text-slate-900 dark:text-slate-100">
      {/* ====================================================================
       * 1. WORKLENZ 52PX STICKY TOP NAVBAR (Unified background with Left Rail)
       * ==================================================================== */}
      <header
        className={cn(
          "sticky top-0 z-40 h-[52px] shrink-0 bg-white dark:bg-[#141414] transition-colors",
          !hasLeftRail &&
            "border-b border-[#e8e8e8] dark:border-[#303030] shadow-2xs"
        )}
      >
        <div className="flex h-full w-full items-center justify-between gap-3 px-4 sm:px-6">
          {/* Left: Brand Logo + Horizontal Main Navigation */}
          <div className="flex items-center gap-5 min-w-0">
            <Link
              href="/home"
              className="flex items-center gap-2 shrink-0 focus:outline-none"
            >
              <img
                src="/brand/wordmark-light.png"
                alt="Alpha Books"
                className="h-6 w-auto dark:hidden"
              />
              <img
                src="/brand/wordmark-dark.png"
                alt="Alpha Books"
                className="h-6 w-auto hidden dark:block"
              />
            </Link>

            <nav className="hidden md:flex items-center gap-0.5">
              {visibleTopNavItems.map((item) => {
                const isActive = isTopItemActive(item.key);
                const isChat = item.key === "chat";

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "relative inline-flex h-[32px] items-center gap-1.5 rounded-[6px] px-3 text-[13.5px] font-medium transition",
                      isActive
                        ? "text-brand font-semibold bg-brand-soft/70 dark:bg-brand-soft-dark/60"
                        : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#222222] hover:text-slate-900 dark:hover:text-white"
                    )}
                  >
                    <span>{item.label}</span>
                    {isChat && unreadChatCount > 0 && (
                      <span className="inline-flex min-w-[16px] h-[16px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                        {unreadChatCount > 99 ? "99+" : unreadChatCount}
                      </span>
                    )}
                    {isActive && (
                      <span className="absolute bottom-0 left-2.5 right-2.5 h-[2px] rounded-full bg-brand" />
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right: Global Quick Action (+ Tạo mới) + Search + Notification Drawer Bell + Settings + Profile Card */}
          <div className="flex items-center gap-2">
            {/* 1. Worklenz QuickActionButton (+ Tạo mới) */}
            <QuickActionButton currentUser={profile} />

            {/* 2. Global Search Trigger (Ctrl+K) */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="inline-flex h-[32px] items-center gap-2 rounded-[6px] border border-[#e0e0e0] dark:border-[#333333] bg-[#fafafa] dark:bg-[#1f1f1f] hover:border-brand/50 px-2.5 text-[12.5px] text-slate-500 dark:text-slate-400 transition cursor-pointer"
              title="Tìm kiếm nhanh (Ctrl+K)"
            >
              <span className="hidden lg:inline">Tìm kiếm...</span>
              <kbd className="inline-flex items-center rounded border border-[#e0e0e0] dark:border-[#383838] bg-white dark:bg-[#141414] px-1.5 py-0.2 text-[10px] font-medium text-slate-400">
                Ctrl+K
              </kbd>
            </button>

            {/* 3. Notification Bell (Opens Slide-Over Drawer without leaving current page) */}
            <button
              type="button"
              onClick={() => setNotifDrawerOpen(true)}
              className={cn(
                "relative inline-flex h-[32px] w-[32px] items-center justify-center rounded-[6px] transition cursor-pointer",
                notifDrawerOpen || pathname === "/inbox"
                  ? "bg-brand-soft text-brand dark:bg-brand-soft-dark"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#222222]"
              )}
              title="Thông báo"
              aria-label="Thông báo"
            >
              <Bell className="h-[17px] w-[17px]" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>

            {/* 4. Quick Settings Icon */}
            <Link
              href="/settings"
              className={cn(
                "hidden sm:inline-flex h-[32px] w-[32px] items-center justify-center rounded-[6px] transition",
                pathname.startsWith("/settings")
                  ? "bg-brand-soft text-brand dark:bg-brand-soft-dark"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#222222]"
              )}
              title="Cài đặt hệ thống"
            >
              <Settings className="h-[17px] w-[17px]" />
            </Link>

            {/* 5. User Profile Button & Worklenz Profile Card Dropdown */}
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((prev) => !prev)}
                className="inline-flex items-center gap-2 rounded-full p-0.5 hover:ring-2 hover:ring-brand/30 transition cursor-pointer"
                title={`${profile.full_name} (${ROLE_LABELS[profile.role]})`}
              >
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.full_name}
                    className="h-7 w-7 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white">
                    {getInitials(profile.full_name)}
                  </div>
                )}
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 rounded-lg border border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] shadow-xl py-1.5 z-50">
                  {/* Account Header Card */}
                  <div className="border-b border-[#f0f0f0] dark:border-[#2c2c2c] px-3.5 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Tài khoản
                    </p>
                    <div className="mt-1.5 flex items-center gap-2.5">
                      {profile.avatar_url ? (
                        <img
                          src={profile.avatar_url}
                          alt={profile.full_name}
                          className="h-9 w-9 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                          {getInitials(profile.full_name)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                          {profile.full_name}
                        </p>
                        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                          {profile.email}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="inline-flex items-center rounded bg-brand-soft dark:bg-brand-soft-dark px-2 py-0.5 text-[11px] font-medium text-brand">
                        {ROLE_LABELS[profile.role]}
                      </span>
                      {profile.job_title && (
                        <span className="truncate text-[11px] text-slate-400 max-w-[130px]">
                          {profile.job_title}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Menu Items (matching Worklenz ProfileButton.tsx) */}
                  <div className="p-1 space-y-0.5">
                    <Link
                      href="/settings?tab=profile"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#2a2a2a] transition"
                    >
                      <User className="h-4 w-4 text-slate-400" />
                      <span>Hồ sơ cá nhân</span>
                    </Link>

                    <Link
                      href="/settings"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#2a2a2a] transition"
                    >
                      <Settings className="h-4 w-4 text-slate-400" />
                      <span>Trung tâm Cài đặt</span>
                    </Link>

                    <button
                      type="button"
                      onClick={toggleTheme}
                      className="w-full flex items-center justify-between rounded-md px-3 py-1.5 text-[13px] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#2a2a2a] transition cursor-pointer"
                    >
                      <span className="flex items-center gap-2.5">
                        {isDark ? (
                          <Sun className="h-4 w-4 text-amber-400" />
                        ) : (
                          <Moon className="h-4 w-4 text-slate-400" />
                        )}
                        <span>Giao diện: {isDark ? "Tối" : "Sáng"}</span>
                      </span>
                      <span className="text-[11px] text-brand font-medium">
                        Đổi
                      </span>
                    </button>

                    <div className="my-1 h-px bg-[#f0f0f0] dark:bg-[#2c2c2c]" />

                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition cursor-pointer"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>Đăng xuất</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={() => setMobileNavOpen((prev) => !prev)}
              className="md:hidden inline-flex h-[32px] w-[32px] items-center justify-center rounded-[6px] border border-[#e0e0e0] dark:border-[#333333] text-slate-600 dark:text-slate-300"
              aria-label="Mở menu điều hướng"
            >
              {mobileNavOpen ? (
                <X className="h-4 w-4" />
              ) : (
                <Menu className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Nav Drawer */}
        {mobileNavOpen && (
          <div className="md:hidden border-t border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] px-4 py-3 space-y-1 shadow-lg">
            {visibleTopNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = isTopItemActive(item.key);
              const isChat = item.key === "chat";

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileNavOpen(false)}
                  className={cn(
                    "flex items-center justify-between rounded-md px-3 py-2 text-[13.5px] font-medium transition",
                    isActive
                      ? "bg-brand-soft dark:bg-brand-soft-dark text-brand font-semibold"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  )}
                >
                  <span className="inline-flex items-center gap-2.5">
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </span>
                  {isChat && unreadChatCount > 0 && (
                    <span className="inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white">
                      {unreadChatCount > 99 ? "99+" : unreadChatCount}
                    </span>
                  )}
                </Link>
              );
            })}
            <Link
              href="/settings"
              onClick={() => setMobileNavOpen(false)}
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-[13.5px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Settings className="h-4 w-4" />
              <span>Cài đặt</span>
            </Link>
          </div>
        )}
      </header>

      {/* ====================================================================
       * 2. BODY WORKSPACE (Left NavRail + Rounded Top-Left 12px Content Pane)
       * ==================================================================== */}
      {hasLeftRail && surfaceConfig ? (
        <div
          className="flex flex-1 overflow-hidden bg-white dark:bg-[#141414]"
          style={{ height: "calc(100vh - 52px)" }}
        >
          {/* Left Mode-Switcher Rail (Worklenz NavRail) */}
          <NavRail
            surfaceKey={surfaceConfig.surfaceKey}
            items={surfaceConfig.items}
            activeKey={surfaceConfig.activeKey}
            collapsed={railCollapsed}
            pinnedKey={pinnedViews[surfaceConfig.surfaceKey] ?? null}
            onSelect={surfaceConfig.onSelect}
            onToggleCollapse={handleToggleRailCollapse}
            onTogglePin={(itemKey) =>
              handleTogglePin(surfaceConfig.surfaceKey, itemKey)
            }
          />

          {/* Main Content Pane with Worklenz signature 12px rounded top-left corner */}
          <main
            className="flex-1 min-w-0 overflow-y-auto bg-white dark:bg-[#1f1f1f] border-t border-l border-[#e8e8e8] dark:border-[#303030] px-5 py-5"
            style={{ borderTopLeftRadius: 12 }}
          >
            {children}
          </main>
        </div>
      ) : (
        <main
          className={cn(
            "flex-1 w-full bg-white dark:bg-[#1f1f1f]",
            pathname.startsWith("/projects/")
              ? "px-4 sm:px-6 py-4"
              : "mx-auto max-w-[1440px] px-4 sm:px-6 py-5"
          )}
        >
          {children}
        </main>
      )}

      {/* Global Search Modal (Ctrl+K) */}
      <GlobalSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        currentUser={profile}
      />

      {/* Slide-Over Notification Drawer */}
      <NotificationDrawer
        open={notifDrawerOpen}
        onClose={() => setNotifDrawerOpen(false)}
        currentUserId={profile.id}
        onUnreadCountChange={setUnreadCount}
      />
    </div>
  );
}
