"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn, getDepartmentDisplayName, getInitials, ROLE_LABELS } from "@/lib/utils";
import type { Department, Profile, UserRole } from "@/types/database";
import { WebhookSettingsPanel } from "@/components/webhooks/WebhookSettingsPanel";
import {
  Bell,
  Building2,
  ChevronRight,
  CornerDownRight,
  FolderTree,
  KeyRound,
  Loader2,
  Network,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  User,
  UserCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

interface SettingsProjectOption {
  id: string;
  name: string;
  code: string;
}

interface SettingsViewProps {
  currentProfile: Profile;
  initialDepartments: Department[];
  initialProfiles: Profile[];
  projects: SettingsProjectOption[];
}

type SettingsTab = "profile" | "departments" | "staff" | "webhooks";

export function SettingsView({
  currentProfile,
  initialDepartments,
  initialProfiles,
  projects,
}: SettingsViewProps) {
  const router = useRouter();
  const isAdmin = currentProfile.role === "admin";
  const isManagerOrAdmin =
    currentProfile.role === "admin" || currentProfile.role === "manager";

  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");

  // --- Tab 1: Profile state ---
  const [fullName, setFullName] = useState(currentProfile.full_name);
  const [jobTitle, setJobTitle] = useState(currentProfile.job_title ?? "");
  const [telegramChatId, setTelegramChatId] = useState(
    currentProfile.telegram_chat_id ?? ""
  );
  const [savingProfile, setSavingProfile] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  // --- Tab 2: Departments state ---
  const [departments, setDepartments] =
    useState<Department[]>(initialDepartments);
  const [deptModalOpen, setDeptModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptName, setDeptName] = useState("");
  const [deptCode, setDeptCode] = useState("");
  const [deptDesc, setDeptDesc] = useState("");
  const [deptParentId, setDeptParentId] = useState("");
  const [savingDept, setSavingDept] = useState(false);

  // --- Tab 3: Staff state ---
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

  // ---------------- Tab 1 Handlers ----------------
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

  // ---------------- Tab 2 Handlers ----------------
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

  // ---------------- Tab 3 Handlers ----------------
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

  // Cấu trúc phân cấp phòng ban: Cấp 1 (Khối / Ban lớn) và Team con
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

  const tabs: Array<{
    id: SettingsTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    visible: boolean;
  }> = [
    { id: "profile", label: "Hồ sơ cá nhân", icon: User, visible: true },
    {
      id: "departments",
      label: "Phòng ban",
      icon: Building2,
      visible: isManagerOrAdmin,
    },
    { id: "staff", label: "Nhân sự nội bộ", icon: Users, visible: isAdmin },
    {
      id: "webhooks",
      label: "Thông báo Telegram & Lark",
      icon: Bell,
      visible: isManagerOrAdmin,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Heading */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Cài đặt hệ thống
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Quản lý hồ sơ cá nhân, phòng ban, nhân sự nội bộ và cấu hình thông báo.
        </p>
      </div>

      {/* Tabs Navigation */}
      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-3">
        {tabs
          .filter((t) => t.visible)
          .map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition cursor-pointer",
                  active
                    ? "bg-brand text-white shadow-xs"
                    : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
      </div>

      {/* TAB 1: HỒ SƠ CÁ NHÂN */}
      {activeTab === "profile" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Profile Info Card */}
          <form
            onSubmit={handleSaveProfile}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xs space-y-5"
          >
            <div className="flex items-center gap-3.5 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-base font-bold text-white">
                {getInitials(fullName || currentProfile.full_name)}
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {currentProfile.full_name}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {currentProfile.email} • {ROLE_LABELS[currentProfile.role]}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Họ và tên
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
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Chức danh / Vị trí
                </label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="VD: Biên tập viên, Chuyên viên Marketing..."
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Telegram Chat ID (nhận thông báo riêng)
                </label>
                <input
                  type="text"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  placeholder="VD: 123456789"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Dùng để bot Telegram gửi nhắc việc trực tiếp khi bạn được giao việc hoặc nhắc tên (@mention).
                </p>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={savingProfile}
                className="inline-flex items-center gap-2 rounded-xl bg-brand hover:bg-brand-hover disabled:opacity-60 px-4 py-2.5 text-sm font-semibold text-white transition cursor-pointer"
              >
                {savingProfile ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                <span>Lưu thay đổi</span>
              </button>
            </div>
          </form>

          {/* Change Password Card */}
          <form
            onSubmit={handleChangePassword}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xs space-y-5 self-start"
          >
            <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100 dark:border-slate-800">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft dark:bg-brand-soft-dark text-brand">
                <KeyRound className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Đổi mật khẩu
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Cập nhật mật khẩu đăng nhập tài khoản của bạn.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Mật khẩu mới
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Tối thiểu 6 ký tự"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Nhập lại mật khẩu mới
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Xác nhận mật khẩu mới"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={savingPassword}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90 disabled:opacity-60 px-4 py-2.5 text-sm font-semibold transition cursor-pointer"
              >
                {savingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>Cập nhật mật khẩu</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 2: PHÒNG BAN */}
      {activeTab === "departments" && isManagerOrAdmin && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
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
              className="inline-flex items-center gap-2 rounded-xl bg-brand hover:bg-brand-hover px-4 py-2 text-sm font-semibold text-white transition cursor-pointer self-start sm:self-auto"
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
                const children = departments.filter((d) => d.parent_id === parent.id);
                const parentStaffCount = staffCountByDept.get(parent.id) ?? 0;

                return (
                  <div key={parent.id} className="bg-white dark:bg-slate-900">
                    {/* Cấp 1: Khối / Phòng ban lớn */}
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
                          title="Thêm team con thuộc khối này"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Team con</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditDepartment(parent)}
                          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-100 transition cursor-pointer"
                          aria-label="Chỉnh sửa"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteDepartment(parent)}
                          className="rounded-lg p-2 text-slate-500 hover:bg-red-50 dark:hover:bg-red-950/50 hover:text-red-600 dark:hover:text-red-400 transition cursor-pointer"
                          aria-label="Xóa"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Cấp 2: Các Team / Bộ phận con */}
                    {children.length > 0 && (
                      <div className="pl-6 sm:pl-11 pr-5 pb-2 divide-y divide-slate-100 dark:divide-slate-800/60 bg-slate-50/40 dark:bg-slate-950/20">
                        {children.map((child) => {
                          const childStaffCount = staffCountByDept.get(child.id) ?? 0;
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
                                  aria-label="Chỉnh sửa team con"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDepartment(child)}
                                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 dark:hover:bg-red-950/50 hover:text-red-600 dark:hover:text-red-400 transition cursor-pointer"
                                  aria-label="Xóa team con"
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

              {/* Các phòng ban con mồ côi (nếu có) */}
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
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200">
                            {dept.name}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEditDepartment(dept)}
                            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: NHÂN SỰ NỘI BỘ (ADMIN ONLY) */}
      {activeTab === "staff" && isAdmin && (
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
              className="inline-flex items-center gap-2 rounded-xl bg-brand hover:bg-brand-hover px-4 py-2 text-sm font-semibold text-white transition cursor-pointer self-start sm:self-auto"
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
                          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:border-brand focus:outline-none max-w-[210px]"
                        >
                          <option value="">— Chưa gán —</option>
                          {parentDepartments.map((p) => {
                            const subDepts = departments.filter((d) => d.parent_id === p.id);
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
                          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:border-brand focus:outline-none max-w-[190px]"
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

      {/* TAB 4: WEBHOOKS TELEGRAM & LARK */}
      {activeTab === "webhooks" && isManagerOrAdmin && (
        <WebhookSettingsPanel projects={projects} />
      )}

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
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Để trống nếu đây là Khối lớn độc lập; hoặc chọn Khối cha nếu là Bộ phận / Team con.
                </p>
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
                      const subDepts = departments.filter((d) => d.parent_id === p.id);
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
