"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { hasSystemPermission, SYSTEM_PERMISSIONS } from "@/lib/permissions";
import { cn, getInitials, ROLE_LABELS, formatDateVi } from "@/lib/utils";
import type {
  Department,
  NotificationPreferences,
  Profile,
  ProjectTemplate,
  SystemRole,
  TaskActivityLog,
  UserRole,
} from "@/types/database";
import { WebhookSettingsPanel } from "@/components/webhooks/WebhookSettingsPanel";
import { PermissionsManagerPanel } from "./PermissionsManagerPanel";
import { PROJECT_CATEGORIES } from "@/components/projects/ProjectSettingsModal";
import { ALPHA_STANDARD_PHASES } from "@/components/projects/ProjectPhasesManagerModal";
import {
  Activity,
  Bell,
  Building2,
  ChevronDown,
  ChevronRight,
  Clock,
  CornerDownRight,
  ExternalLink,
  FolderKanban,
  Globe,
  KeyRound,
  Layers,
  LayoutTemplate,
  Loader2,
  Moon,
  Palette,
  Pencil,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Sun,
  Tag,
  Trash2,
  User,
  UserPlus,
  Users,
  Webhook,
  X,
} from "lucide-react";
import { toast } from "sonner";

interface SettingsProjectOption {
  id: string;
  name: string;
  code: string;
  category?: string | null;
}

interface SettingsViewProps {
  currentProfile: Profile;
  initialDepartments: Department[];
  initialProfiles: Profile[];
  projects: SettingsProjectOption[];
  initialRoles?: SystemRole[];
  initialTemplates?: ProjectTemplate[];
  initialActivityLogs?: TaskActivityLog[];
}

type SettingsTab =
  | "profile"
  | "notifications"
  | "appearance"
  | "password"
  | "departments"
  | "staff"
  | "permissions"
  | "categories"
  | "templates"
  | "webhooks"
  | "audit_logs";

type SettingsSectionKey =
  | "account"
  | "workspace"
  | "workflow"
  | "integrations";

const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  email_notifications: true,
  daily_digest: false,
  popup_notifications: true,
  show_unread_count: true,
  daily_reminder_enabled: false,
  daily_reminder_time: "09:00",
  weekly_start_summary: false,
  weekly_end_summary: false,
};

export function SettingsView({
  currentProfile,
  initialDepartments,
  initialProfiles,
  projects,
  initialRoles = [],
  initialTemplates = [],
  initialActivityLogs = [],
}: SettingsViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isAdmin = currentProfile.role === "admin";
  const isManagerOrAdmin =
    currentProfile.role === "admin" || currentProfile.role === "manager";
  const canManageDepartments = hasSystemPermission(
    currentProfile,
    SYSTEM_PERMISSIONS.MANAGE_DEPARTMENTS
  );
  const canManageUsers = hasSystemPermission(
    currentProfile,
    SYSTEM_PERMISSIONS.MANAGE_USERS
  );
  const canManageSettings = hasSystemPermission(
    currentProfile,
    SYSTEM_PERMISSIONS.MANAGE_SETTINGS
  );
  const canManageWebhooks = hasSystemPermission(
    currentProfile,
    SYSTEM_PERMISSIONS.MANAGE_WEBHOOKS
  );
  const canCreateProjects = hasSystemPermission(
    currentProfile,
    SYSTEM_PERMISSIONS.CREATE_PROJECTS
  );

  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  useEffect(() => {
    const tabParam = searchParams.get("tab") as SettingsTab | null;
    if (tabParam) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);
  const [navSearch, setNavSearch] = useState("");
  const [collapsedSections, setCollapsedSections] = useState<
    Record<SettingsSectionKey, boolean>
  >({
    account: false,
    workspace: false,
    workflow: false,
    integrations: false,
  });

  // --- Profile state ---
  const [fullName, setFullName] = useState(currentProfile.full_name);
  const [jobTitle, setJobTitle] = useState(currentProfile.job_title ?? "");
  const [telegramChatId, setTelegramChatId] = useState(
    currentProfile.telegram_chat_id ?? ""
  );
  const [savingProfile, setSavingProfile] = useState(false);

  // --- Password state ---
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  // --- Notifications state ---
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>(() => ({
    ...DEFAULT_NOTIFICATION_PREFS,
    ...(currentProfile.notification_prefs || {}),
  }));
  const [savingNotif, setSavingNotif] = useState(false);

  // --- Appearance state ---
  const [themeMode, setThemeMode] = useState<"light" | "dark">("light");
  const [compactDensity, setCompactDensity] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const isDark = document.documentElement.classList.contains("dark");
      setThemeMode(isDark ? "dark" : "light");
      const savedDensity = localStorage.getItem("alpha_compact_density");
      setCompactDensity(savedDensity === "true");
    }
  }, []);

  function handleSetTheme(mode: "light" | "dark") {
    setThemeMode(mode);
    if (typeof window !== "undefined") {
      if (mode === "dark") {
        document.documentElement.classList.add("dark");
        localStorage.setItem("theme", "dark");
      } else {
        document.documentElement.classList.remove("dark");
        localStorage.setItem("theme", "light");
      }
      toast.success(
        `Đã chuyển sang giao diện ${mode === "dark" ? "Tối (Dark Mode)" : "Sáng (Light Mode)"}`
      );
    }
  }

  function handleToggleDensity(next: boolean) {
    setCompactDensity(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("alpha_compact_density", String(next));
      toast.success("Đã lưu tùy chọn mật độ hiển thị.");
    }
  }

  // --- Departments state ---
  const [departments, setDepartments] =
    useState<Department[]>(initialDepartments);
  const [deptModalOpen, setDeptModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptName, setDeptName] = useState("");
  const [deptCode, setDeptCode] = useState("");
  const [deptDesc, setDeptDesc] = useState("");
  const [deptParentId, setDeptParentId] = useState("");
  const [savingDept, setSavingDept] = useState(false);

  // --- Staff state ---
  const [staffList, setStaffList] = useState<Profile[]>(initialProfiles);
  const [staffSearch, setStaffSearch] = useState("");
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserRole, setNewUserRole] = useState<UserRole>("member");
  const [newUserDeptId, setNewUserDeptId] = useState("");
  const [newUserManagerId, setNewUserManagerId] = useState("");
  const [newUserJobTitle, setNewUserJobTitle] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  // ---------------- Handlers ----------------
  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error("Họ và tên không được để trống.");
      return;
    }

    setSavingProfile(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          job_title: jobTitle.trim() || null,
          telegram_chat_id: telegramChatId.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentProfile.id);

      if (error) throw error;
      toast.success("Đã lưu thông tin hồ sơ cá nhân.");
      router.refresh();
    } catch {
      toast.error("Không thể cập nhật hồ sơ.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleUpdateNotifPrefs(
    patch: Partial<NotificationPreferences>
  ) {
    const updated: NotificationPreferences = {
      ...notifPrefs,
      ...patch,
    };
    setNotifPrefs(updated);
    setSavingNotif(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({
          notification_prefs: updated,
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentProfile.id);
      if (error) throw error;
      toast.success("Đã lưu cài đặt thông báo.");
    } catch {
      toast.error("Không thể lưu cài đặt thông báo.");
    } finally {
      setSavingNotif(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error("Mật khẩu mới phải có ít nhất 6 ký tự.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Xác nhận mật khẩu không khớp.");
      return;
    }

    setSavingPassword(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Đổi mật khẩu thành công.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không thể đổi mật khẩu."
      );
    } finally {
      setSavingPassword(false);
    }
  }

  function openCreateDepartment(defaultParentId?: string) {
    setEditingDept(null);
    setDeptName("");
    setDeptCode("");
    setDeptDesc("");
    setDeptParentId(defaultParentId ?? "");
    setDeptModalOpen(true);
  }

  function openEditDepartment(dept: Department) {
    setEditingDept(dept);
    setDeptName(dept.name);
    setDeptCode(dept.code ?? "");
    setDeptDesc(dept.description ?? "");
    setDeptParentId(dept.parent_id ?? "");
    setDeptModalOpen(true);
  }

  async function handleSaveDepartment(e: React.FormEvent) {
    e.preventDefault();
    if (!deptName.trim()) {
      toast.error("Vui lòng nhập tên phòng ban.");
      return;
    }

    setSavingDept(true);
    try {
      const supabase = createClient();
      if (editingDept) {
        const { data, error } = await supabase
          .from("departments")
          .update({
            name: deptName.trim(),
            code: deptCode.trim() || null,
            description: deptDesc.trim() || null,
            parent_id: deptParentId || null,
          })
          .eq("id", editingDept.id)
          .select("*, parent:departments!parent_id(id, name, code)")
          .single();

        if (error) throw error;
        setDepartments((prev) =>
          prev.map((d) => (d.id === editingDept.id ? (data as Department) : d))
        );
        toast.success("Đã cập nhật phòng ban.");
      } else {
        const { data, error } = await supabase
          .from("departments")
          .insert({
            name: deptName.trim(),
            code: deptCode.trim() || null,
            description: deptDesc.trim() || null,
            parent_id: deptParentId || null,
          })
          .select("*, parent:departments!parent_id(id, name, code)")
          .single();

        if (error) throw error;
        setDepartments((prev) => [...prev, data as Department]);
        toast.success("Đã thêm phòng ban mới.");
      }
      setDeptModalOpen(false);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Không thể lưu phòng ban (có thể tên đã tồn tại)."
      );
    } finally {
      setSavingDept(false);
    }
  }

  async function handleDeleteDepartment(dept: Department) {
    const confirmed = window.confirm(
      `Bạn có chắc muốn xóa phòng ban "${dept.name}"?`
    );
    if (!confirmed) return;

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("departments")
        .delete()
        .eq("id", dept.id);
      if (error) throw error;
      setDepartments((prev) => prev.filter((d) => d.id !== dept.id));
      toast.success("Đã xóa phòng ban.");
    } catch {
      toast.error("Không thể xóa phòng ban này.");
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserPassword) {
      toast.error("Vui lòng điền đầy đủ họ tên, email và mật khẩu.");
      return;
    }

    setCreatingUser(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: newUserName.trim(),
          email: newUserEmail.trim(),
          password: newUserPassword,
          role: newUserRole,
          department_id: newUserDeptId || null,
          manager_id: newUserManagerId || null,
          job_title: newUserJobTitle.trim() || null,
        }),
      });

      const payload = (await res.json()) as {
        profile?: Profile;
        error?: string;
      };

      if (!res.ok || !payload.profile) {
        throw new Error(payload.error || "Không thể tạo tài khoản.");
      }

      setStaffList((prev) => [payload.profile!, ...prev]);
      setCreateUserOpen(false);
      setNewUserName("");
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserRole("member");
      setNewUserDeptId("");
      setNewUserManagerId("");
      setNewUserJobTitle("");
      toast.success(`Đã tạo tài khoản cho ${payload.profile.full_name}.`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không thể tạo tài khoản."
      );
    } finally {
      setCreatingUser(false);
    }
  }

  async function handleUpdateStaff(
    userId: string,
    patch: {
      role?: UserRole;
      department_id?: string | null;
      manager_id?: string | null;
      is_active?: boolean;
    }
  ) {
    setUpdatingUserId(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, ...patch }),
      });

      const payload = (await res.json()) as {
        profile?: Profile;
        error?: string;
      };

      if (!res.ok || !payload.profile) {
        throw new Error(payload.error || "Không thể cập nhật nhân sự.");
      }

      setStaffList((prev) =>
        prev.map((u) => (u.id === userId ? payload.profile! : u))
      );
      toast.success("Đã cập nhật thông tin nhân sự.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không thể cập nhật nhân sự."
      );
    } finally {
      setUpdatingUserId(null);
    }
  }

  const parentDepartments = useMemo(
    () => departments.filter((d) => !d.parent_id),
    [departments]
  );

  const orphanSubDepartments = useMemo(
    () =>
      departments.filter(
        (d) => d.parent_id && !departments.some((p) => p.id === d.parent_id)
      ),
    [departments]
  );

  const staffCountByDept = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of staffList) {
      if (s.department_id) {
        counts.set(s.department_id, (counts.get(s.department_id) ?? 0) + 1);
      }
    }
    return counts;
  }, [staffList]);

  const filteredStaff = staffList.filter((u) => {
    const q = staffSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      u.full_name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.job_title ?? "").toLowerCase().includes(q)
    );
  });

  // Grouped Sidebar Sections (matching Worklenz Settings architecture)
  const navSections: Array<{
    key: SettingsSectionKey;
    title: string;
    items: Array<{
      id: SettingsTab;
      label: string;
      icon: React.ComponentType<{ className?: string }>;
      visible: boolean;
      keywords: string;
    }>;
  }> = [
    {
      key: "account",
      title: "TÀI KHOẢN & CÁ NHÂN",
      items: [
        {
          id: "profile",
          label: "Hồ sơ cá nhân",
          icon: User,
          visible: true,
          keywords: "profile ho so ca nhan ten chuc danh telegram",
        },
        {
          id: "notifications",
          label: "Thông báo & Nhắc việc",
          icon: Bell,
          visible: true,
          keywords: "notifications thong bao email digest reminder nhac viec",
        },
        {
          id: "appearance",
          label: "Giao diện & Ngôn ngữ",
          icon: Palette,
          visible: true,
          keywords: "appearance giao dien dark mode sang toi ngon ngu",
        },
        {
          id: "password",
          label: "Đổi mật khẩu",
          icon: KeyRound,
          visible: true,
          keywords: "password mat khau bao mat",
        },
      ],
    },
    {
      key: "workspace",
      title: "TỔ CHỨC & NHÂN SỰ",
      items: [
        {
          id: "departments",
          label: "Cơ cấu Phòng ban",
          icon: Building2,
          visible: canManageDepartments,
          keywords: "departments phong ban khoi team",
        },
        {
          id: "staff",
          label: "Nhân sự nội bộ",
          icon: Users,
          visible: canManageUsers,
          keywords: "staff members nhan su thanh vien tai khoan",
        },
        {
          id: "permissions",
          label: "Phân quyền & Vai trò",
          icon: ShieldCheck,
          visible: isManagerOrAdmin || canManageSettings || canManageUsers,
          keywords: "permissions roles phan quyen vai tro rbac",
        },
      ],
    },
    {
      key: "workflow",
      title: "DỰ ÁN & QUY TRÌNH",
      items: [
        {
          id: "categories",
          label: "Danh mục & Quy trình",
          icon: Tag,
          visible: canCreateProjects || isManagerOrAdmin,
          keywords: "categories labels phases danh muc quy trinh xuat ban",
        },
        {
          id: "templates",
          label: "Mẫu dự án chuẩn",
          icon: LayoutTemplate,
          visible: canCreateProjects || isManagerOrAdmin,
          keywords: "templates mau du an mau cong viec",
        },
      ],
    },
    {
      key: "integrations",
      title: "HỆ THỐNG & TÍCH HỢP",
      items: [
        {
          id: "webhooks",
          label: "Tích hợp Telegram & Lark",
          icon: Webhook,
          visible: canManageWebhooks,
          keywords: "webhooks integrations telegram lark bot",
        },
        {
          id: "audit_logs",
          label: "Nhật ký hệ thống",
          icon: Activity,
          visible: isManagerOrAdmin || canManageSettings,
          keywords: "audit logs nhat ky lich su hoat dong",
        },
      ],
    },
  ];

  const normalizedSearch = navSearch.trim().toLowerCase();

  return (
    <div className="space-y-6">
      {/* Page Heading */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Cài đặt hệ thống (Settings)
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Quản lý tài khoản cá nhân, tổ chức phòng ban, chuẩn hóa quy trình xuất bản và tích hợp hệ thống.
        </p>
      </div>

      {/* Main 2-Column Settings Layout (matching Worklenz SettingsLayout & settings-sidebar.tsx) */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* LEFT SIDEBAR NAVIGATION */}
        <aside className="w-full shrink-0 rounded-[8px] border border-[#e8e8e8] bg-white p-3 dark:border-[#303030] dark:bg-[#1f1f1f] lg:w-64">
          {/* Search settings input */}
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={navSearch}
              onChange={(e) => setNavSearch(e.target.value)}
              placeholder="Tìm cài đặt..."
              className="w-full rounded-[6px] border border-[#d9d9d9] bg-[#fafafa] py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand focus:bg-white focus:outline-none dark:border-[#3a3a3a] dark:bg-[#141414] dark:text-slate-100"
            />
          </div>

          <div className="divide-y divide-[#f0f0f0] dark:divide-[#2c2c2c]">
            {navSections.map((section) => {
              const visibleItems = section.items.filter((item) => {
                if (!item.visible) return false;
                if (!normalizedSearch) return true;
                return (
                  item.label.toLowerCase().includes(normalizedSearch) ||
                  item.keywords.includes(normalizedSearch)
                );
              });

              if (visibleItems.length === 0) return null;
              const isCollapsed =
                !normalizedSearch && collapsedSections[section.key];

              return (
                <div key={section.key} className="py-2 first:pt-0 last:pb-0">
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsedSections((prev) => ({
                        ...prev,
                        [section.key]: !prev[section.key],
                      }))
                    }
                    className="flex w-full items-center justify-between px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <span>{section.title}</span>
                    {isCollapsed ? (
                      <ChevronRight className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </button>

                  {!isCollapsed && (
                    <div className="mt-1 space-y-0.5">
                      {visibleItems.map((item) => {
                        const Icon = item.icon;
                        const active = activeTab === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setActiveTab(item.id)}
                            style={{
                              borderLeft: active
                                ? "3px solid #F47830"
                                : "3px solid transparent",
                            }}
                            className={cn(
                              "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition cursor-pointer",
                              active
                                ? "bg-brand-soft/80 font-semibold text-brand dark:bg-brand-soft-dark/70"
                                : "text-slate-700 hover:bg-slate-100/80 dark:text-slate-300 dark:hover:bg-[#262626]"
                            )}
                          >
                            <Icon
                              className={cn(
                                "h-4 w-4 shrink-0",
                                active
                                  ? "text-brand"
                                  : "text-slate-400 dark:text-slate-500"
                              )}
                            />
                            <span className="truncate">{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        {/* RIGHT CONTENT AREA */}
        <div className="min-w-0 flex-1">
          {/* ==========================================================
           * 1. ACCOUNT & PERSONAL -> PROFILE
           * ======================================================== */}
          {activeTab === "profile" && (
            <form
              onSubmit={handleSaveProfile}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xs space-y-6"
            >
              <div className="flex items-center gap-4 pb-5 border-b border-slate-100 dark:border-slate-800">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-lg font-bold text-white shadow-xs">
                  {getInitials(fullName || currentProfile.full_name)}
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 truncate">
                    {currentProfile.full_name}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {currentProfile.email} •{" "}
                    <span className="font-semibold text-brand">
                      {ROLE_LABELS[currentProfile.role]}
                    </span>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Họ và tên <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Chức danh / Vị trí chuyên môn
                  </label>
                  <input
                    type="text"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="VD: Biên tập viên chính, Họa sĩ thiết kế..."
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Email đăng nhập
                  </label>
                  <input
                    type="email"
                    disabled
                    value={currentProfile.email}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-500 cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Telegram Chat ID (nhận nhắc việc cá nhân)
                  </label>
                  <input
                    type="text"
                    value={telegramChatId}
                    onChange={(e) => setTelegramChatId(e.target.value)}
                    placeholder="VD: 123456789"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                  />
                </div>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                Mẹo: Điền Telegram Chat ID để Bot tự động gửi tin nhắn trực tiếp khi bạn được giao công việc mới hoặc được nhắc tên (<code>@mention</code>) trong bình luận.
              </p>

              <div className="flex justify-end border-t border-slate-100 pt-4 dark:border-slate-800">
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand hover:bg-brand-hover disabled:opacity-60 px-5 py-2.5 text-sm font-semibold text-white transition cursor-pointer"
                >
                  {savingProfile ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  <span>Lưu hồ sơ cá nhân</span>
                </button>
              </div>
            </form>
          )}

          {/* ==========================================================
           * 2. ACCOUNT & PERSONAL -> NOTIFICATIONS (Matches Worklenz UI)
           * ======================================================== */}
          {activeTab === "notifications" && (
            <div className="space-y-6">
              {/* General Notifications Card */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      Thông báo chung (General Notifications)
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      Tự động lưu và áp dụng ngay khi bạn bật/tắt từng tùy chọn.
                    </p>
                  </div>
                  {savingNotif && (
                    <span className="inline-flex items-center gap-1 text-xs text-brand">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Đang lưu...
                    </span>
                  )}
                </div>

                <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                  <label className="flex items-center justify-between gap-4 py-3.5 cursor-pointer">
                    <div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        Nhận thông báo khi được giao việc mới hoặc @mention
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Gửi thông báo vào Hộp thư (Inbox) và qua Telegram/Email khi có việc mới gán cho bạn.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifPrefs.email_notifications}
                      onChange={(e) =>
                        handleUpdateNotifPrefs({
                          email_notifications: e.target.checked,
                        })
                      }
                      className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand/40 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-4 py-3.5 cursor-pointer">
                    <div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        Bản tin tổng hợp cuối ngày (Daily Digest)
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Nhận bản tóm tắt các hoạt động và tiến độ công việc vào mỗi buổi tối.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifPrefs.daily_digest}
                      onChange={(e) =>
                        handleUpdateNotifPrefs({
                          daily_digest: e.target.checked,
                        })
                      }
                      className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand/40 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-4 py-3.5 cursor-pointer">
                    <div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        Hiển thị thông báo nổi trên trình duyệt (Popup Notifications)
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Hiển thị toast thông báo tức thì khi bạn đang mở Alpha Work trên máy tính.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifPrefs.popup_notifications}
                      onChange={(e) =>
                        handleUpdateNotifPrefs({
                          popup_notifications: e.target.checked,
                        })
                      }
                      className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand/40 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-4 py-3.5 cursor-pointer">
                    <div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        Hiển thị số lượng thông báo chưa đọc trên thanh điều hướng
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Hiển thị huy hiệu số đỏ tại mục Hộp thư và Trò chuyện khi có tin mới.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifPrefs.show_unread_count}
                      onChange={(e) =>
                        handleUpdateNotifPrefs({
                          show_unread_count: e.target.checked,
                        })
                      }
                      className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand/40 cursor-pointer"
                    />
                  </label>
                </div>
              </div>

              {/* Scheduled Task Digest Card */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-100 pb-4 dark:border-slate-800">
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Lịch nhắc việc định kỳ (Scheduled Task Digests)
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Nhận bản tổng hợp công việc cá nhân hóa theo khung giờ cố định hàng ngày và hàng tuần.
                  </p>
                </div>

                <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                  <div className="py-3.5 space-y-2.5">
                    <label className="flex items-center justify-between gap-4 cursor-pointer">
                      <div>
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                          Nhắc việc mỗi sáng (Daily Task Reminder)
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Tổng hợp các việc đến hạn hôm nay, ngày mai và các việc đang quá hạn.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={notifPrefs.daily_reminder_enabled}
                        onChange={(e) =>
                          handleUpdateNotifPrefs({
                            daily_reminder_enabled: e.target.checked,
                          })
                        }
                        className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand/40 cursor-pointer"
                      />
                    </label>

                    <div className="flex items-center gap-3 pt-1">
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        Giờ gửi:
                      </span>
                      <input
                        type="time"
                        value={notifPrefs.daily_reminder_time || "09:00"}
                        onChange={(e) =>
                          handleUpdateNotifPrefs({
                            daily_reminder_time: e.target.value,
                          })
                        }
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      />
                    </div>
                  </div>

                  <label className="flex items-center justify-between gap-4 py-3.5 cursor-pointer">
                    <div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        Kế hoạch đầu tuần (Weekly Start Summary — Thứ Hai 08:00)
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Gửi sáng thứ Hai hàng tuần, liệt kê toàn bộ lịch trình công việc trong tuần mới.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifPrefs.weekly_start_summary}
                      onChange={(e) =>
                        handleUpdateNotifPrefs({
                          weekly_start_summary: e.target.checked,
                        })
                      }
                      className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand/40 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-4 py-3.5 cursor-pointer">
                    <div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        Tổng kết cuối tuần (Weekly End Summary — Thứ Sáu 17:00)
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Gửi chiều thứ Sáu, tổng kết các đầu việc đã hoàn thành trong tuần và việc tồn đọng.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifPrefs.weekly_end_summary}
                      onChange={(e) =>
                        handleUpdateNotifPrefs({
                          weekly_end_summary: e.target.checked,
                        })
                      }
                      className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand/40 cursor-pointer"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* ==========================================================
           * 3. ACCOUNT & PERSONAL -> APPEARANCE & LANGUAGE
           * ======================================================== */}
          {activeTab === "appearance" && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs dark:border-slate-800 dark:bg-slate-900 space-y-5">
                <div className="border-b border-slate-100 pb-4 dark:border-slate-800">
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Chủ đề Giao diện (Theme & Appearance)
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Tùy chỉnh chế độ hiển thị màu sắc và mật độ bảng công việc phù hợp với mắt của bạn.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => handleSetTheme("light")}
                    className={cn(
                      "flex items-center gap-3.5 rounded-xl border p-4 text-left transition cursor-pointer",
                      themeMode === "light"
                        ? "border-brand bg-brand-soft/30 ring-2 ring-brand/20"
                        : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                    )}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                      <Sun className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        Giao diện Sáng (Light Mode)
                      </p>
                      <p className="text-xs text-slate-500">
                        Nền sáng rõ ràng, tối ưu khi làm việc ban ngày.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSetTheme("dark")}
                    className={cn(
                      "flex items-center gap-3.5 rounded-xl border p-4 text-left transition cursor-pointer",
                      themeMode === "dark"
                        ? "border-brand bg-brand-soft/30 ring-2 ring-brand/20"
                        : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                    )}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-slate-200">
                      <Moon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        Giao diện Tối (Dark Mode)
                      </p>
                      <p className="text-xs text-slate-500">
                        Giảm mỏi mắt khi làm việc trong môi trường thiếu sáng.
                      </p>
                    </div>
                  </button>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                  <label className="flex items-center justify-between gap-4 cursor-pointer">
                    <div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        Hiển thị bảng công việc thu gọn (Compact Table Density)
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Tối ưu diện tích dòng trên danh sách công việc khi dự án có nhiều Custom Columns.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={compactDensity}
                      onChange={(e) => handleToggleDensity(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand/40 cursor-pointer"
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs dark:border-slate-800 dark:bg-slate-900 space-y-4">
                <div className="flex items-center gap-2.5">
                  <Globe className="h-5 w-5 text-brand" />
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      Ngôn ngữ & Khu vực (Language & Region)
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Định dạng ngày giờ và múi giờ chuẩn cho lịch xuất bản Alpha Books.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Ngôn ngữ hiển thị
                    </label>
                    <select
                      disabled
                      defaultValue="vi"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    >
                      <option value="vi">Tiếng Việt (Vietnamese — Mặc định)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Múi giờ hệ thống
                    </label>
                    <select
                      disabled
                      defaultValue="Asia/Ho_Chi_Minh"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    >
                      <option value="Asia/Ho_Chi_Minh">
                        (GMT+07:00) Hà Nội, TP. Hồ Chí Minh
                      </option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==========================================================
           * 4. ACCOUNT & PERSONAL -> CHANGE PASSWORD
           * ======================================================== */}
          {activeTab === "password" && (
            <form
              onSubmit={handleChangePassword}
              className="max-w-xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xs space-y-5"
            >
              <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft dark:bg-brand-soft-dark text-brand">
                  <KeyRound className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Đổi mật khẩu đăng nhập
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Cập nhật mật khẩu bảo mật cho tài khoản {currentProfile.email}.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Mật khẩu mới <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Nhập mật khẩu mới (tối thiểu 6 ký tự)"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Xác nhận mật khẩu mới <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Nhập lại mật khẩu mới"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={savingPassword}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand hover:bg-brand-hover text-white disabled:opacity-60 px-5 py-2.5 text-sm font-semibold transition cursor-pointer"
                >
                  {savingPassword ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  <span>Cập nhật mật khẩu</span>
                </button>
              </div>
            </form>
          )}

          {/* ==========================================================
           * 5. WORKSPACE SETUP -> DEPARTMENTS
           * ======================================================== */}
          {activeTab === "departments" && canManageDepartments && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 px-5 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      Cơ cấu phòng ban ({departments.length})
                    </h2>
                    <span className="rounded-md bg-brand-soft dark:bg-brand-soft-dark px-2 py-0.5 text-xs font-medium text-brand">
                      Mô hình phân cấp 2 cấp
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Quản lý Khối / Phòng ban lớn và các Bộ phận / Team con trực thuộc tại Alpha Books.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openCreateDepartment()}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand hover:bg-brand-hover px-4 py-2 text-xs font-semibold text-white transition cursor-pointer self-start sm:self-auto"
                >
                  <Plus className="h-4 w-4" />
                  <span>Thêm phòng ban / Khối</span>
                </button>
              </div>

              {departments.length === 0 ? (
                <div className="py-14 text-center text-sm text-slate-500 dark:text-slate-400">
                  Chưa có phòng ban nào. Nhấn &ldquo;Thêm phòng ban / Khối&rdquo; để bắt đầu.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {parentDepartments.map((parent) => {
                    const children = departments.filter(
                      (d) => d.parent_id === parent.id
                    );
                    const parentStaffCount =
                      staffCountByDept.get(parent.id) ?? 0;

                    return (
                      <div key={parent.id} className="bg-white dark:bg-slate-900">
                        <div className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                          <div className="min-w-0 flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft dark:bg-brand-soft-dark text-brand">
                              <Building2 className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                  {parent.name}
                                </p>
                                {parent.code && (
                                  <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-mono text-slate-600 dark:text-slate-300">
                                    {parent.code}
                                  </span>
                                )}
                                <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                                  Khối / Cấp 1
                                </span>
                                {children.length > 0 && (
                                  <span className="rounded-full bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 text-[11px] font-medium text-blue-600 dark:text-blue-400">
                                    {children.length} team con
                                  </span>
                                )}
                                <span className="text-xs text-slate-400">
                                  • {parentStaffCount} nhân sự
                                </span>
                              </div>
                              {parent.description && (
                                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                                  {parent.description}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => openCreateDepartment(parent.id)}
                              className="hidden sm:inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-brand hover:bg-brand-soft dark:hover:bg-brand-soft-dark transition cursor-pointer"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              <span>Team con</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditDepartment(parent)}
                              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-100 transition cursor-pointer"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteDepartment(parent)}
                              className="rounded-lg p-2 text-slate-500 hover:bg-red-50 dark:hover:bg-red-950/50 hover:text-red-600 dark:hover:text-red-400 transition cursor-pointer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        {children.length > 0 && (
                          <div className="pl-6 sm:pl-11 pr-5 pb-2 divide-y divide-slate-100 dark:divide-slate-800/60 bg-slate-50/40 dark:bg-slate-950/20">
                            {children.map((child) => {
                              const childStaffCount =
                                staffCountByDept.get(child.id) ?? 0;
                              return (
                                <div
                                  key={child.id}
                                  className="flex items-center justify-between gap-4 py-2.5 hover:bg-white dark:hover:bg-slate-800/40 rounded-lg px-3 transition"
                                >
                                  <div className="min-w-0 flex items-center gap-2.5">
                                    <CornerDownRight className="h-4 w-4 text-slate-400 shrink-0" />
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <p className="text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200">
                                          {child.name}
                                        </p>
                                        {child.code && (
                                          <span className="rounded bg-slate-200/70 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-600 dark:text-slate-300">
                                            {child.code}
                                          </span>
                                        )}
                                        <span className="text-[11px] text-slate-400">
                                          • {childStaffCount} nhân sự
                                        </span>
                                      </div>
                                      {child.description && (
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                          {child.description}
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => openEditDepartment(child)}
                                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteDepartment(child)}
                                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 dark:hover:bg-red-950/50 hover:text-red-600 dark:hover:text-red-400 transition cursor-pointer"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {orphanSubDepartments.length > 0 && (
                    <div className="px-5 py-4 bg-amber-50/30 dark:bg-amber-950/20">
                      <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-2">
                        Các phòng ban chưa rõ cấp trên ({orphanSubDepartments.length})
                      </p>
                      <div className="space-y-2">
                        {orphanSubDepartments.map((dept) => (
                          <div
                            key={dept.id}
                            className="flex items-center justify-between gap-4 py-2 px-3 rounded-lg bg-white dark:bg-slate-900 border border-amber-200/50 dark:border-amber-900/40"
                          >
                            <p className="text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200">
                              {dept.name}
                            </p>
                            <button
                              type="button"
                              onClick={() => openEditDepartment(dept)}
                              className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ==========================================================
           * 6. WORKSPACE SETUP -> STAFF
           * ======================================================== */}
          {activeTab === "staff" && canManageUsers && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 px-5 py-4">
                <div className="relative flex-1 max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={staffSearch}
                    onChange={(e) => setStaffSearch(e.target.value)}
                    placeholder="Tìm nhân sự theo tên, email..."
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-brand focus:outline-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setCreateUserOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand hover:bg-brand-hover px-4 py-2 text-xs font-semibold text-white transition cursor-pointer self-start sm:self-auto"
                >
                  <UserPlus className="h-4 w-4" />
                  <span>+ Tạo tài khoản nhân sự</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <th className="px-5 py-3">Nhân sự</th>
                      <th className="px-4 py-3">Vai trò</th>
                      <th className="px-4 py-3">Phòng ban</th>
                      <th className="px-4 py-3">Quản lý trực tiếp</th>
                      <th className="px-4 py-3 text-right">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                    {filteredStaff.map((member) => {
                      const busy = updatingUserId === member.id;
                      const isSelf = member.id === currentProfile.id;

                      return (
                        <tr
                          key={member.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition"
                        >
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-xs font-semibold text-brand">
                                {getInitials(member.full_name)}
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-slate-900 dark:text-slate-100 truncate">
                                  {member.full_name}
                                  {isSelf && (
                                    <span className="ml-1.5 rounded bg-brand-soft dark:bg-brand-soft-dark px-1.5 py-0.5 text-[10px] font-semibold text-brand">
                                      Bạn
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                  {member.email}
                                  {member.job_title ? ` • ${member.job_title}` : ""}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3.5">
                            <select
                              value={member.role}
                              disabled={busy}
                              onChange={(e) =>
                                handleUpdateStaff(member.id, {
                                  role: e.target.value as UserRole,
                                })
                              }
                              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 focus:border-brand focus:outline-none"
                            >
                              <option value="admin">{ROLE_LABELS.admin}</option>
                              <option value="manager">{ROLE_LABELS.manager}</option>
                              <option value="member">{ROLE_LABELS.member}</option>
                            </select>
                          </td>

                          <td className="px-4 py-3.5">
                            <select
                              value={member.department_id ?? ""}
                              disabled={busy}
                              onChange={(e) =>
                                handleUpdateStaff(member.id, {
                                  department_id: e.target.value || null,
                                })
                              }
                              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:border-brand focus:outline-none max-w-[200px]"
                            >
                              <option value="">— Chưa gán —</option>
                              {parentDepartments.map((p) => {
                                const subDepts = departments.filter(
                                  (d) => d.parent_id === p.id
                                );
                                if (subDepts.length === 0) {
                                  return (
                                    <option key={p.id} value={p.id}>
                                      {p.name}
                                    </option>
                                  );
                                }
                                return (
                                  <optgroup key={p.id} label={p.name}>
                                    <option value={p.id}>
                                      {p.name} (Khối chung)
                                    </option>
                                    {subDepts.map((sub) => (
                                      <option key={sub.id} value={sub.id}>
                                        ↳ {sub.name}
                                      </option>
                                    ))}
                                  </optgroup>
                                );
                              })}
                              {orphanSubDepartments.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name}
                                </option>
                              ))}
                            </select>
                          </td>

                          <td className="px-4 py-3.5">
                            <select
                              value={member.manager_id ?? ""}
                              disabled={busy}
                              onChange={(e) =>
                                handleUpdateStaff(member.id, {
                                  manager_id: e.target.value || null,
                                })
                              }
                              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:border-brand focus:outline-none max-w-[180px]"
                            >
                              <option value="">— Chưa chỉ định —</option>
                              {staffList
                                .filter((s) => s.id !== member.id && s.is_active)
                                .map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.full_name} ({ROLE_LABELS[s.role] || s.role})
                                  </option>
                                ))}
                            </select>
                          </td>

                          <td className="px-4 py-3.5 text-right">
                            <button
                              type="button"
                              disabled={busy || isSelf}
                              onClick={() =>
                                handleUpdateStaff(member.id, {
                                  is_active: !member.is_active,
                                })
                              }
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
                                member.is_active
                                  ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100"
                                  : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200"
                              )}
                            >
                              <span
                                className={cn(
                                  "h-1.5 w-1.5 rounded-full",
                                  member.is_active
                                    ? "bg-emerald-500"
                                    : "bg-slate-400"
                                )}
                              />
                              {member.is_active ? "Đang hoạt động" : "Đã khóa"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ==========================================================
           * 7. WORKSPACE SETUP -> PERMISSIONS & ROLES
           * ======================================================== */}
          {activeTab === "permissions" &&
            (isManagerOrAdmin || canManageSettings || canManageUsers) && (
            <PermissionsManagerPanel
              currentProfile={currentProfile}
              initialRoles={initialRoles}
              staffList={staffList}
              onStaffUpdated={(updated) => {
                setStaffList((prev) =>
                  prev.map((u) => (u.id === updated.id ? updated : u))
                );
              }}
            />
          )}

          {/* ==========================================================
           * 8. PROJECT & WORKFLOW -> CATEGORIES & STANDARD PHASES
           * ======================================================== */}
          {activeTab === "categories" && (
            <div className="space-y-6">
              {/* Project Categories */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      Danh mục phân loại dự án & Tủ sách (Project Categories)
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      Các danh mục chuẩn dùng để phân loại dự án xuất bản sách và chiến dịch truyền thông.
                    </p>
                  </div>
                  <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-bold text-brand dark:bg-brand/20">
                    {PROJECT_CATEGORIES.length} danh mục chuẩn
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {PROJECT_CATEGORIES.map((cat) => {
                    const count = projects.filter(
                      (p) => (p.category || "Dự án Chung") === cat
                    ).length;
                    return (
                      <div
                        key={cat}
                        className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50/60 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-800/40"
                      >
                        <div className="flex items-center gap-2.5">
                          <Tag className="h-4 w-4 text-brand shrink-0" />
                          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                            {cat}
                          </span>
                        </div>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500 shadow-2xs dark:bg-slate-900 dark:text-slate-400">
                          {count} dự án
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Standard 5 Publishing Phases Blueprint */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-100 pb-4 dark:border-slate-800">
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Khung 5 Giai đoạn Xuất bản Sách Chuẩn (Standard Publishing Pipeline)
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Khi khởi tạo lộ trình trong từng dự án, hệ thống áp dụng bộ 5 giai đoạn chuẩn có hỗ trợ Phase Assignees này.
                  </p>
                </div>

                <div className="mt-4 space-y-2.5">
                  {ALPHA_STANDARD_PHASES.map((ph, idx) => (
                    <div
                      key={ph.name}
                      className="flex items-start gap-3 rounded-xl border border-slate-200/80 p-3.5 dark:border-slate-800"
                    >
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                        style={{ backgroundColor: ph.color }}
                      >
                        {idx + 1}
                      </span>
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          {ph.name}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {ph.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ==========================================================
           * 9. PROJECT & WORKFLOW -> PROJECT TEMPLATES
           * ======================================================== */}
          {activeTab === "templates" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs dark:border-slate-800 dark:bg-slate-900 space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Thư viện Mẫu Dự án & Quy trình ({initialTemplates.length})
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Tái sử dụng danh sách công việc mẫu cho các dòng sách dịch, sách tái bản và chiến dịch ra mắt sách.
                  </p>
                </div>
                <Link
                  href="/projects/templates"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-white hover:bg-brand-hover transition self-start sm:self-auto"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Mở trình quản lý Mẫu Dự án</span>
                </Link>
              </div>

              {initialTemplates.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
                  <LayoutTemplate className="mx-auto h-8 w-8 text-slate-400" />
                  <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Chưa có mẫu dự án tùy chỉnh
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Truy cập trình quản lý Mẫu dự án để tạo hoặc khởi tạo dự án nhanh từ mẫu.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {initialTemplates.map((tpl) => (
                    <div
                      key={tpl.id}
                      className="flex flex-col justify-between rounded-xl border border-slate-200 p-4 dark:border-slate-800"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className="inline-block h-3 w-3 rounded-full shrink-0"
                            style={{ backgroundColor: tpl.color || "#F26522" }}
                          />
                          <h3 className="flex-1 truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                            {tpl.name}
                          </h3>
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {tpl.tasks?.length ?? 0} đầu việc
                          </span>
                        </div>
                        {tpl.description && (
                          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                            {tpl.description}
                          </p>
                        )}
                      </div>
                      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                        <span>Danh mục: {tpl.category || "Xuất bản"}</span>
                        <Link
                          href="/projects/templates"
                          className="font-semibold text-brand hover:underline"
                        >
                          Chi tiết &rarr;
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ==========================================================
           * 10. SYSTEM & INTEGRATIONS -> WEBHOOKS
           * ======================================================== */}
          {activeTab === "webhooks" && canManageWebhooks && (
            <WebhookSettingsPanel projects={projects} />
          )}

          {/* ==========================================================
           * 11. SYSTEM & INTEGRATIONS -> AUDIT LOGS
           * ======================================================== */}
          {activeTab === "audit_logs" &&
            (isManagerOrAdmin || canManageSettings) && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <div className="border-b border-slate-100 pb-4 dark:border-slate-800">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Nhật ký hoạt động hệ thống gần đây (System Audit Logs)
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Theo dõi 40 thao tác cập nhật công việc, trạng thái và phân công gần nhất trên toàn hệ thống.
                </p>
              </div>

              {initialActivityLogs.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  Chưa có bản ghi nhật ký hoạt động nào.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {initialActivityLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start justify-between gap-4 py-3 text-xs"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[10px] font-bold text-brand dark:bg-brand/20">
                          {getInitials(log.actor?.full_name || "A")}
                        </div>
                        <div>
                          <p className="text-slate-800 dark:text-slate-200">
                            <span className="font-semibold">
                              {log.actor?.full_name || "Hệ thống"}
                            </span>{" "}
                            —{" "}
                            <span>
                              {log.details?.description || log.action}
                            </span>
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-400">
                            Mã thao tác: <code>{log.action}</code>
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 text-[11px] text-slate-400">
                        {formatDateVi(log.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* MODAL: THÊM / SỬA PHÒNG BAN */}
      {deptModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4"
          onClick={() => setDeptModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {editingDept ? "Chỉnh sửa phòng ban" : "Thêm phòng ban mới"}
              </h3>
              <button
                type="button"
                onClick={() => setDeptModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDepartment} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Tên phòng ban *
                </label>
                <input
                  type="text"
                  required
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  placeholder="VD: Ban Biên tập Kinh doanh"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Mã phòng ban
                </label>
                <input
                  type="text"
                  value={deptCode}
                  onChange={(e) => setDeptCode(e.target.value)}
                  placeholder="VD: BBT-KD"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Thuộc Khối / Phòng ban cấp trên
                </label>
                <select
                  value={deptParentId}
                  onChange={(e) => setDeptParentId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm focus:border-brand focus:outline-none"
                >
                  <option value="">— Là Khối / Phòng ban lớn (Cấp 1) —</option>
                  {parentDepartments
                    .filter((p) => p.id !== editingDept?.id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        Khối: {p.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Mô tả
                </label>
                <textarea
                  rows={3}
                  value={deptDesc}
                  onChange={(e) => setDeptDesc(e.target.value)}
                  placeholder="Mô tả ngắn chức năng của phòng ban..."
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeptModalOpen(false)}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingDept}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand hover:bg-brand-hover disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white cursor-pointer"
                >
                  {savingDept && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>{editingDept ? "Lưu thay đổi" : "Tạo phòng ban"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TẠO TÀI KHOẢN NHÂN SỰ */}
      {createUserOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4"
          onClick={() => setCreateUserOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Tạo tài khoản nhân sự nội bộ
              </h3>
              <button
                type="button"
                onClick={() => setCreateUserOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Họ và tên *
                </label>
                <input
                  type="text"
                  required
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="Nguyễn Văn A"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Email công việc *
                </label>
                <input
                  type="email"
                  required
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="ten@alphabooks.vn"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Mật khẩu khởi tạo *
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  placeholder="Tối thiểu 6 ký tự"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Vai trò
                  </label>
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm focus:border-brand focus:outline-none"
                  >
                    <option value="member">{ROLE_LABELS.member}</option>
                    <option value="manager">{ROLE_LABELS.manager}</option>
                    <option value="admin">{ROLE_LABELS.admin}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Phòng ban
                  </label>
                  <select
                    value={newUserDeptId}
                    onChange={(e) => setNewUserDeptId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm focus:border-brand focus:outline-none"
                  >
                    <option value="">— Chưa gán —</option>
                    {parentDepartments.map((p) => {
                      const subDepts = departments.filter(
                        (d) => d.parent_id === p.id
                      );
                      if (subDepts.length === 0) {
                        return (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        );
                      }
                      return (
                        <optgroup key={p.id} label={p.name}>
                          <option value={p.id}>{p.name} (Khối chung)</option>
                          {subDepts.map((sub) => (
                            <option key={sub.id} value={sub.id}>
                              ↳ {sub.name}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                    {orphanSubDepartments.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Quản lý trực tiếp
                  </label>
                  <select
                    value={newUserManagerId}
                    onChange={(e) => setNewUserManagerId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm focus:border-brand focus:outline-none"
                  >
                    <option value="">— Chưa chỉ định —</option>
                    {staffList
                      .filter((s) => s.is_active)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.full_name} ({ROLE_LABELS[s.role] || s.role})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Chức danh
                  </label>
                  <input
                    type="text"
                    value={newUserJobTitle}
                    onChange={(e) => setNewUserJobTitle(e.target.value)}
                    placeholder="VD: Chuyên viên truyền thông"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm focus:border-brand focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateUserOpen(false)}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={creatingUser}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand hover:bg-brand-hover disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white cursor-pointer"
                >
                  {creatingUser && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>Tạo tài khoản</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
