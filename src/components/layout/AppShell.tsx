"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn, getInitials, ROLE_LABELS } from "@/lib/utils";
import type { Profile } from "@/types/database";
import { GlobalSearchModal } from "./GlobalSearchModal";
import {
  BarChart3,
  ChevronDown,
  FolderKanban,
  Home,
  Inbox,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Search,
  Settings,
  Sun,
  X,
} from "lucide-react";
import { toast } from "sonner";

interface AppShellProps {
  profile: Profile;
  initialUnreadCount: number;
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { href: "/home", label: "Trang chủ", icon: Home },
  { href: "/projects", label: "Dự án", icon: FolderKanban },
  { href: "/chat", label: "Trò chuyện", icon: MessageSquare },
  { href: "/reports", label: "Báo cáo", icon: BarChart3 },
  { href: "/inbox", label: "Hộp thư", icon: Inbox },
  { href: "/settings", label: "Cài đặt", icon: Settings },
];

export function AppShell({
  profile,
  initialUnreadCount,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [searchOpen, setSearchOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  const userMenuRef = useRef<HTMLDivElement>(null);

  // Sync theme state on mount
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
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

  // Refresh unread count when navigating (e.g. after reading in /inbox)
  useEffect(() => {
    let active = true;
    async function refreshUnread() {
      try {
        const supabase = createClient();
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
    return () => {
      active = false;
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

    // Realtime changes on direct_messages for this user
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
    } catch {
      // ignore storage errors
    }
    setIsDark(nextDark);
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

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Sticky Top Navbar */}
      <header className="sticky top-0 z-30 h-16 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md">
        <div className="mx-auto flex h-full max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6">
          {/* Left: Brand + Desktop Nav */}
          <div className="flex items-center gap-6 min-w-0">
            <Link
              href="/home"
              className="flex items-center gap-2 shrink-0 focus:outline-none"
            >
              <img
                src="/brand/wordmark-light.png"
                alt="Alpha Books"
                className="h-7 w-auto dark:hidden"
              />
              <img
                src="/brand/wordmark-dark.png"
                alt="Alpha Books"
                className="h-7 w-auto hidden dark:block"
              />
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive =
                  pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);
                const isInbox = item.href === "/inbox";

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "relative inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition",
                      isActive
                        ? "bg-brand-soft dark:bg-brand-soft-dark text-brand"
                        : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                    {isInbox && unreadCount > 0 && (
                      <span className="inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right: Search + Theme + User Menu */}
          <div className="flex items-center gap-2">
            {/* Search Trigger */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 px-3 py-1.5 text-sm text-slate-500 dark:text-slate-400 transition cursor-pointer"
              aria-label="Tìm kiếm nhanh"
            >
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Tìm kiếm...</span>
              <kbd className="hidden lg:inline-flex items-center rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                Ctrl+K
              </kbd>
            </button>

            {/* Dark/Light Mode Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              title={isDark ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
              aria-label={isDark ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* User Dropdown */}
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((prev) => !prev)}
                className="inline-flex items-center gap-2 rounded-xl border border-transparent hover:border-slate-200 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/80 px-2 py-1.5 transition cursor-pointer"
              >
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.full_name}
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">
                    {getInitials(profile.full_name)}
                  </div>
                )}
                <div className="hidden lg:block text-left leading-tight max-w-[140px]">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {profile.full_name}
                  </p>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {ROLE_LABELS[profile.role]}
                  </p>
                </div>
                <ChevronDown className="hidden sm:block h-4 w-4 text-slate-400" />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-60 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg py-1.5 z-40">
                  <div className="border-b border-slate-100 dark:border-slate-800 px-3.5 py-2.5">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {profile.full_name}
                    </p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {profile.email}
                    </p>
                    <span className="mt-1.5 inline-flex items-center rounded-full bg-brand-soft dark:bg-brand-soft-dark px-2 py-0.5 text-[11px] font-medium text-brand">
                      {ROLE_LABELS[profile.role]}
                    </span>
                  </div>

                  <div className="p-1.5 space-y-0.5">
                    <Link
                      href="/settings"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                      <Settings className="h-4 w-4 text-slate-400" />
                      <span>Cài đặt tài khoản</span>
                    </Link>

                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition cursor-pointer"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>Đăng xuất</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile Nav Button */}
            <button
              type="button"
              onClick={() => setMobileNavOpen((prev) => !prev)}
              className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
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
          <div className="md:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 space-y-1 shadow-md">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              const isInbox = item.href === "/inbox";

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileNavOpen(false)}
                  className={cn(
                    "flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition",
                    isActive
                      ? "bg-brand-soft dark:bg-brand-soft-dark text-brand"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  )}
                >
                  <span className="inline-flex items-center gap-2.5">
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </span>
                  {isInbox && unreadCount > 0 && (
                    <span className="inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 mx-auto w-full max-w-[1440px] px-4 sm:px-6 py-6">
        {children}
      </main>

      {/* Global Search Modal */}
      <GlobalSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
      />
    </div>
  );
}
