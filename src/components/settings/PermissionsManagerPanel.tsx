"use client";

import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  SYSTEM_PERMISSION_DEFINITIONS,
  isDirectorOrAdmin,
  type SystemPermissionKey,
} from "@/lib/permissions";
import type { Profile, SystemRole } from "@/types/database";
import {
  ShieldCheck,
  ShieldAlert,
  Save,
  Plus,
  Loader2,
  Check,
  Search,
  UserCheck,
  Users,
  Settings,
  HelpCircle,
  X,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { cn, getInitials, ROLE_LABELS } from "@/lib/utils";

interface PermissionsManagerPanelProps {
  currentProfile: Profile;
  initialRoles: SystemRole[];
  staffList: Profile[];
  onStaffUpdated?: (updatedProfile: Profile) => void;
}

export function PermissionsManagerPanel({
  currentProfile,
  initialRoles,
  staffList,
  onStaffUpdated,
}: PermissionsManagerPanelProps) {
  const isAdmin = isDirectorOrAdmin(currentProfile);
  const [roles, setRoles] = useState<SystemRole[]>(initialRoles);
  const [selectedRoleId, setSelectedRoleId] = useState<string>(
    initialRoles[0]?.id || ""
  );
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<"matrix" | "assign">("matrix");

  // State cho Modal tạo vai trò mới
  const [createRoleModalOpen, setCreateRoleModalOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleCode, setNewRoleCode] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");
  const [newRolePermissions, setNewRolePermissions] = useState<string[]>([]);
  const [creatingRole, setCreatingRole] = useState(false);

  // State cho tìm kiếm nhân sự gán quyền
  const [staffSearch, setStaffSearch] = useState("");
  const [assigningUserId, setAssigningUserId] = useState<string | null>(null);

  // Vai trò đang chọn để xem ma trận quyền
  const activeRole = useMemo(
    () => roles.find((r) => r.id === selectedRoleId) || roles[0],
    [roles, selectedRoleId]
  );

  // Toggle quyền cho một role trong bộ nhớ
  function handleTogglePermission(roleId: string, permKey: string) {
    if (!isAdmin) {
      toast.error("Chỉ Quản trị viên mới có thể cấu hình ma trận quyền.");
      return;
    }

    setRoles((prev) =>
      prev.map((role) => {
        if (role.id !== roleId) return role;
        const perms = role.permissions || [];
        const nextPerms = perms.includes(permKey)
          ? perms.filter((p) => p !== permKey)
          : [...perms, permKey];
        return { ...role, permissions: nextPerms };
      })
    );
  }

  // Lưu ma trận quyền của vai trò hiện tại vào database
  async function handleSaveRolePermissions(roleToSave: SystemRole) {
    if (!isAdmin) {
      toast.error("Chỉ Quản trị viên mới có quyền lưu cấu hình.");
      return;
    }

    setSavingRoleId(roleToSave.id);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("roles")
        .update({
          permissions: roleToSave.permissions,
        })
        .eq("id", roleToSave.id);

      if (error) throw error;
      toast.success(`Đã cập nhật bảng quyền cho vai trò "${roleToSave.name}".`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không thể lưu phân quyền vai trò."
      );
    } finally {
      setSavingRoleId(null);
    }
  }

  // Xử lý tạo vai trò mới
  async function handleCreateRole(e: React.FormEvent) {
    e.preventDefault();
    if (!newRoleName.trim() || !newRoleCode.trim()) {
      toast.error("Vui lòng nhập tên và mã vai trò.");
      return;
    }

    setCreatingRole(true);
    try {
      const supabase = createClient();
      const cleanCode = newRoleCode.trim().toUpperCase().replace(/\s+/g, "_");

      const { data, error } = await supabase
        .from("roles")
        .insert({
          name: newRoleName.trim(),
          code: cleanCode,
          description: newRoleDesc.trim() || null,
          permissions: newRolePermissions,
          is_system: false,
        })
        .select()
        .single();

      if (error) throw error;

      const createdRole = data as SystemRole;
      setRoles((prev) => [...prev, createdRole]);
      setSelectedRoleId(createdRole.id);
      setCreateRoleModalOpen(false);
      setNewRoleName("");
      setNewRoleCode("");
      setNewRoleDesc("");
      setNewRolePermissions([]);
      toast.success(`Đã thêm vai trò mới "${createdRole.name}".`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không thể tạo vai trò mới."
      );
    } finally {
      setCreatingRole(false);
    }
  }

  // Xử lý gán vai trò hệ thống cho nhân sự
  async function handleAssignUserRole(userId: string, roleId: string | null) {
    if (!isAdmin) {
      toast.error("Chỉ Quản trị viên mới có thể gán vai trò hệ thống cho nhân sự.");
      return;
    }

    setAssigningUserId(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          custom_role_id: roleId,
        }),
      });

      const payload = (await res.json()) as {
        profile?: Profile;
        error?: string;
      };

      if (!res.ok || !payload.profile) {
        throw new Error(payload.error || "Không thể cập nhật vai trò.");
      }

      onStaffUpdated?.(payload.profile);
      toast.success("Đã cập nhật vai trò hệ thống cho nhân sự.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không thể cập nhật vai trò nhân sự."
      );
    } finally {
      setAssigningUserId(null);
    }
  }

  // Lọc nhân sự theo từ khóa
  const filteredStaff = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    if (!q) return staffList;
    return staffList.filter(
      (u) =>
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.job_title ?? "").toLowerCase().includes(q) ||
        (u.custom_role?.name ?? "").toLowerCase().includes(q)
    );
  }, [staffList, staffSearch]);

  return (
    <div className="space-y-6">
      {/* Top Banner Alert / Info */}
      <div className="rounded-2xl border border-orange-200 dark:border-orange-900/50 bg-gradient-to-r from-orange-50/80 via-white to-amber-50/60 dark:from-orange-950/20 dark:via-slate-900 dark:to-amber-950/10 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="rounded-xl bg-brand/10 p-2.5 text-brand dark:bg-brand/20">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Hệ thống Phân quyền Nâng cao & Vai trò Xuất bản (RBAC)
                <span className="inline-flex items-center rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand dark:bg-brand/20">
                  Alpha Work Lite
                </span>
              </h2>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 max-w-2xl">
                Kiểm soát quyền truy cập theo mô hình Role-Based Access Control chặt chẽ cho toàn hệ thống:
                Ban Giám đốc, Trưởng phòng, Chuyên viên và Cộng tác viên biên tập / thiết kế.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isAdmin && (
              <button
                type="button"
                onClick={() => setCreateRoleModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-brand-hover transition cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>Thêm vai trò</span>
              </button>
            )}
          </div>
        </div>

        {/* Sub-tabs Switcher */}
        <div className="mt-5 flex gap-2 border-t border-orange-100 dark:border-slate-800 pt-3">
          <button
            type="button"
            onClick={() => setActiveSubTab("matrix")}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer",
              activeSubTab === "matrix"
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
          >
            <Settings className="h-3.5 w-3.5" />
            <span>Ma trận Quyền theo Vai trò ({roles.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("assign")}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer",
              activeSubTab === "assign"
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
          >
            <UserCheck className="h-3.5 w-3.5" />
            <span>Gán Vai trò cho Nhân sự ({staffList.length})</span>
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: MA TRẬN QUYỀN VAI TRÒ */}
      {activeSubTab === "matrix" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Cột trái: Danh sách Vai trò */}
          <div className="lg:col-span-4 space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Danh sách Vai trò Hệ thống
              </span>
              <span className="text-xs text-slate-400">
                {roles.length} vai trò
              </span>
            </div>

            <div className="space-y-2">
              {roles.map((r) => {
                const isSelected = (activeRole?.id || "") === r.id;
                const permCount = r.permissions?.length || 0;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedRoleId(r.id)}
                    className={cn(
                      "w-full text-left rounded-2xl border p-4 transition cursor-pointer relative",
                      isSelected
                        ? "border-brand bg-white dark:bg-slate-900 shadow-sm ring-2 ring-brand/20"
                        : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-slate-300 dark:hover:border-slate-700"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                            {r.name}
                          </h3>
                          {r.is_system && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-300">
                              <Lock className="h-2.5 w-2.5" />
                              Hệ thống
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                          {r.description || "Không có mô tả chi tiết."}
                        </p>
                      </div>

                      <span className="shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        {permCount} quyền
                      </span>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-100 dark:border-slate-800/80 pt-2">
                      <span className="font-mono uppercase text-brand">
                        #{r.code}
                      </span>
                      {isSelected && (
                        <span className="font-medium text-brand flex items-center gap-1">
                          Đang xem ma trận <Check className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cột phải: Chi tiết Ma trận quyền của Role được chọn */}
          <div className="lg:col-span-8">
            {activeRole ? (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xs space-y-6">
                {/* Role Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white font-bold">
                        <ShieldCheck className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                          {activeRole.name}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                          Mã định danh: {activeRole.code}
                        </p>
                      </div>
                    </div>
                    {activeRole.description && (
                      <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                        {activeRole.description}
                      </p>
                    )}
                  </div>

                  {isAdmin && (
                    <button
                      type="button"
                      disabled={savingRoleId === activeRole.id}
                      onClick={() => handleSaveRolePermissions(activeRole)}
                      className="inline-flex items-center gap-2 rounded-xl bg-brand hover:bg-brand-hover disabled:opacity-60 px-4 py-2 text-xs font-bold text-white transition shadow-xs cursor-pointer shrink-0"
                    >
                      {savingRoleId === activeRole.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      <span>Lưu thay đổi ma trận</span>
                    </button>
                  )}
                </div>

                {/* Table Checkboxes Permissions */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      Bảng phân quyền chi tiết ({SYSTEM_PERMISSION_DEFINITIONS.length} mục)
                    </h4>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Đã kích hoạt:{" "}
                      <strong className="text-brand">
                        {activeRole.permissions?.length || 0}
                      </strong>
                      /{SYSTEM_PERMISSION_DEFINITIONS.length}
                    </span>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50/50 dark:bg-slate-900/40">
                    {SYSTEM_PERMISSION_DEFINITIONS.map((perm) => {
                      const isGranted = (activeRole.permissions || []).includes(
                        perm.key
                      );

                      return (
                        <label
                          key={perm.key}
                          className={cn(
                            "flex items-start gap-3.5 p-4 transition select-none",
                            isAdmin
                              ? "cursor-pointer hover:bg-white dark:hover:bg-slate-800/60"
                              : "cursor-default opacity-90"
                          )}
                        >
                          <div className="pt-0.5">
                            <input
                              type="checkbox"
                              disabled={!isAdmin}
                              checked={isGranted}
                              onChange={() =>
                                handleTogglePermission(activeRole.id, perm.key)
                              }
                              className="h-4 w-4 rounded-md border-slate-300 text-brand focus:ring-brand accent-brand dark:border-slate-700 dark:bg-slate-800 cursor-pointer"
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "text-sm font-semibold",
                                  isGranted
                                    ? "text-slate-900 dark:text-slate-100"
                                    : "text-slate-500 dark:text-slate-400"
                                )}
                              >
                                {perm.label}
                              </span>
                              <span className="font-mono text-[11px] text-slate-400">
                                ({perm.key})
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                              {perm.description}
                            </p>
                          </div>

                          <span
                            className={cn(
                              "shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                              isGranted
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                                : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                            )}
                          >
                            {isGranted ? "Cho phép" : "Không có"}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {!isAdmin && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300 flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    <span>
                      Bạn đang xem ma trận quyền với quyền đọc. Chỉ Quản trị viên (Admin) mới có thể thay đổi ma trận này.
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400">
                Chưa có vai trò nào được chọn.
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: GÁN VAI TRÒ HỆ THỐNG CHO TỪNG NHÂN SỰ */}
      {activeSubTab === "assign" && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Gán Vai trò Hệ thống cho Nhân sự
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Chọn vai trò chuyên trách (Ban Giám đốc, Trưởng phòng, Chuyên viên, CTV) cho từng tài khoản.
              </p>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={staffSearch}
                onChange={(e) => setStaffSearch(e.target.value)}
                placeholder="Tìm nhân viên theo tên, email..."
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 py-2 pl-9 pr-3 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3">Nhân sự</th>
                  <th className="px-4 py-3">Phòng ban & Chức danh</th>
                  <th className="px-4 py-3">Quyền gốc (Account Role)</th>
                  <th className="px-4 py-3">Vai trò Hệ thống Nâng cao (Custom Role)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 bg-white dark:bg-slate-900">
                {filteredStaff.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-400">
                      Không tìm thấy nhân sự phù hợp.
                    </td>
                  </tr>
                ) : (
                  filteredStaff.map((u) => {
                    const isBusy = assigningUserId === u.id;
                    const assignedRole =
                      roles.find((r) => r.id === u.custom_role_id) ||
                      u.custom_role;

                    return (
                      <tr
                        key={u.id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition"
                      >
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand dark:bg-brand/20">
                              {getInitials(u.full_name)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                                {u.full_name}
                              </p>
                              <p className="text-[11px] text-slate-400 truncate">
                                {u.email}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3.5">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-800 dark:text-slate-200">
                              {u.department?.name || "Chưa phân phòng"}
                            </p>
                            <p className="text-[11px] text-slate-400 truncate">
                              {u.job_title || "Chuyên viên"}
                            </p>
                          </div>
                        </td>

                        <td className="px-4 py-3.5">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold",
                              u.role === "admin"
                                ? "bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 border border-purple-200 dark:border-purple-800"
                                : u.role === "manager"
                                ? "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                                : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            )}
                          >
                            {ROLE_LABELS[u.role]}
                          </span>
                        </td>

                        <td className="px-4 py-3.5">
                          {isAdmin ? (
                            <div className="flex items-center gap-2">
                              <select
                                disabled={isBusy}
                                value={u.custom_role_id || ""}
                                onChange={(e) =>
                                  handleAssignUserRole(
                                    u.id,
                                    e.target.value || null
                                  )
                                }
                                className="w-56 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50 cursor-pointer"
                              >
                                <option value="">-- Mặc định (Theo Account) --</option>
                                {roles.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.name} ({r.code})
                                  </option>
                                ))}
                              </select>
                              {isBusy && (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />
                              )}
                            </div>
                          ) : (
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {assignedRole?.name || "Mặc định (Theo Account)"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL TẠO VAI TRÒ MỚI */}
      {createRoleModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
          onClick={() => setCreateRoleModalOpen(false)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-brand" />
                Thêm Vai trò Hệ thống Mới
              </h3>
              <button
                type="button"
                onClick={() => setCreateRoleModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRole} className="mt-4 space-y-4 flex-1 overflow-y-auto pr-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Tên vai trò <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="VD: Kiểm duyệt Bản quyền, Thiết kế trưởng..."
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Mã vai trò (Mã code viết hoa) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="VD: COPYRIGHT_CHECKER, LEAD_DESIGNER"
                  value={newRoleCode}
                  onChange={(e) => setNewRoleCode(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-xs font-mono uppercase text-slate-900 dark:text-slate-100 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Mô tả nhiệm vụ
                </label>
                <textarea
                  rows={2}
                  placeholder="Mô tả phạm vi quyền hạn và trách nhiệm của vai trò này..."
                  value={newRoleDesc}
                  onChange={(e) => setNewRoleDesc(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Quyền hạn ban đầu ({newRolePermissions.length}/{SYSTEM_PERMISSION_DEFINITIONS.length})
                </label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 p-2.5 bg-slate-50 dark:bg-slate-950/50">
                  {SYSTEM_PERMISSION_DEFINITIONS.map((p) => {
                    const isChecked = newRolePermissions.includes(p.key);
                    return (
                      <label
                        key={p.key}
                        className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-800 cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setNewRolePermissions((prev) =>
                              isChecked
                                ? prev.filter((k) => k !== p.key)
                                : [...prev, p.key]
                            );
                          }}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-brand focus:ring-brand accent-brand cursor-pointer"
                        />
                        <span className="text-xs text-slate-800 dark:text-slate-200">
                          {p.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setCreateRoleModalOpen(false)}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={creatingRole}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-white hover:bg-brand-hover disabled:opacity-60 cursor-pointer"
                >
                  {creatingRole ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  <span>Tạo vai trò</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
