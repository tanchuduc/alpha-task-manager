"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  PROJECT_PERMISSION_DEFINITIONS,
  type ProjectPermissionKey,
} from "@/lib/permissions";
import type { Profile, Project, ProjectMember, ProjectRole } from "@/types/database";
import {
  ShieldCheck,
  Shield,
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
  Layers,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { cn, getInitials } from "@/lib/utils";

interface ProjectRolesManagerModalProps {
  project: Project;
  members: ProjectMember[];
  currentUser: Profile;
  canManageMembers: boolean;
  onClose: () => void;
  onMembersUpdated: (updatedMembers: ProjectMember[]) => void;
}

export default function ProjectRolesManagerModal({
  project,
  members,
  currentUser,
  canManageMembers,
  onClose,
  onMembersUpdated,
}: ProjectRolesManagerModalProps) {
  const [activeTab, setActiveTab] = useState<"assign" | "matrix">("assign");
  const [projectRoles, setProjectRoles] = useState<ProjectRole[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  const [updatingMemberUserId, setUpdatingMemberUserId] = useState<string | null>(null);

  // Modal tạo vai trò dự án mới
  const [createRoleOpen, setCreateRoleOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleCode, setNewRoleCode] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");
  const [newRolePermissions, setNewRolePermissions] = useState<string[]>([
    "view_project",
    "create_tasks",
    "edit_own_tasks",
    "change_status",
    "post_updates",
    "manage_files",
  ]);
  const [creatingRole, setCreatingRole] = useState(false);

  // Tìm kiếm thành viên
  const [memberSearch, setMemberSearch] = useState("");

  // Tải danh sách vai trò dự án (gồm mẫu dùng chung và vai trò riêng của dự án)
  useEffect(() => {
    async function fetchProjectRoles() {
      setLoadingRoles(true);
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("project_roles")
          .select("*")
          .or(`project_id.is.null,project_id.eq.${project.id}`)
          .order("created_at", { ascending: true });

        if (error) throw error;
        const fetched = (data as ProjectRole[]) || [];
        setProjectRoles(fetched);
        if (fetched.length > 0) {
          setSelectedRoleId(fetched[0].id);
        }
      } catch (err) {
        toast.error("Không thể tải danh sách vai trò dự án.");
      } finally {
        setLoadingRoles(false);
      }
    }

    fetchProjectRoles();
  }, [project.id]);

  const activeRole = useMemo(
    () => projectRoles.find((r) => r.id === selectedRoleId) || projectRoles[0],
    [projectRoles, selectedRoleId]
  );

  // Toggle quyền cho một vai trò dự án
  function handleToggleProjectPermission(roleId: string, permKey: string) {
    if (!canManageMembers) {
      toast.error("Bạn không có quyền điều chỉnh phân quyền trong dự án này.");
      return;
    }

    setProjectRoles((prev) =>
      prev.map((r) => {
        if (r.id !== roleId) return r;
        const perms = r.permissions || [];
        const nextPerms = perms.includes(permKey)
          ? perms.filter((p) => p !== permKey)
          : [...perms, permKey];
        return { ...r, permissions: nextPerms };
      })
    );
  }

  // Lưu ma trận quyền của một vai trò dự án
  async function handleSaveRolePermissions(roleToSave: ProjectRole) {
    if (!canManageMembers) {
      toast.error("Bạn không có quyền lưu cấu hình vai trò dự án.");
      return;
    }

    setSavingRoleId(roleToSave.id);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("project_roles")
        .update({
          permissions: roleToSave.permissions,
        })
        .eq("id", roleToSave.id);

      if (error) throw error;
      toast.success(`Đã cập nhật bảng quyền cho vai trò "${roleToSave.name}".`);

      // Cập nhật lại nested project_role trong members state
      const updatedMembers = members.map((m) => {
        if (m.project_role_id === roleToSave.id) {
          return {
            ...m,
            project_role: roleToSave,
          };
        }
        return m;
      });
      onMembersUpdated(updatedMembers);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không thể lưu phân quyền vai trò."
      );
    } finally {
      setSavingRoleId(null);
    }
  }

  // Gán vai trò dự án cho một thành viên
  async function handleAssignMemberRole(userId: string, roleId: string | null) {
    if (!canManageMembers) {
      toast.error("Bạn không có quyền phân vai trò cho thành viên dự án.");
      return;
    }

    setUpdatingMemberUserId(userId);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("project_members")
        .update({
          project_role_id: roleId,
        })
        .match({
          project_id: project.id,
          user_id: userId,
        });

      if (error) throw error;

      const assignedRoleObj =
        projectRoles.find((r) => r.id === roleId) || null;

      const nextMembers = members.map((m) =>
        m.user_id === userId
          ? {
              ...m,
              project_role_id: roleId,
              project_role: assignedRoleObj,
            }
          : m
      );

      onMembersUpdated(nextMembers);
      toast.success("Đã cập nhật vai trò dự án cho thành viên.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không thể cập nhật vai trò thành viên."
      );
    } finally {
      setUpdatingMemberUserId(null);
    }
  }

  // Tạo vai trò dự án mới
  async function handleCreateProjectRole(e: React.FormEvent) {
    e.preventDefault();
    if (!newRoleName.trim() || !newRoleCode.trim()) {
      toast.error("Vui lòng điền tên và mã vai trò.");
      return;
    }

    setCreatingRole(true);
    try {
      const supabase = createClient();
      const cleanCode = newRoleCode.trim().toUpperCase().replace(/\s+/g, "_");

      const { data, error } = await supabase
        .from("project_roles")
        .insert({
          project_id: project.id,
          name: newRoleName.trim(),
          code: cleanCode,
          description: newRoleDesc.trim() || null,
          permissions: newRolePermissions,
          is_default: false,
        })
        .select()
        .single();

      if (error) throw error;

      const created = data as ProjectRole;
      setProjectRoles((prev) => [...prev, created]);
      setSelectedRoleId(created.id);
      setCreateRoleOpen(false);
      setNewRoleName("");
      setNewRoleCode("");
      setNewRoleDesc("");
      toast.success(`Đã tạo vai trò dự án "${created.name}".`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không thể tạo vai trò dự án."
      );
    } finally {
      setCreatingRole(false);
    }
  }

  // Lọc danh sách thành viên theo từ khóa
  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const name = m.profile?.full_name?.toLowerCase() || "";
      const email = m.profile?.email?.toLowerCase() || "";
      const roleName = m.project_role?.name?.toLowerCase() || "";
      return name.includes(q) || email.includes(q) || roleName.includes(q);
    });
  }, [members, memberSearch]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 p-5 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white shadow-xs">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Phân quyền & Vai trò Dự án
                <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                  ({project.name})
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Gán vai trò chuyên môn và thiết lập ma trận 10 quyền xuất bản trong dự án này.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-6 py-2.5 dark:border-slate-800 dark:bg-slate-900/50">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("assign")}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer",
                activeTab === "assign"
                  ? "bg-white text-brand shadow-xs dark:bg-slate-800 dark:text-brand"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              )}
            >
              <UserCheck className="h-4 w-4" />
              <span>Gán Vai trò Thành viên ({members.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("matrix")}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer",
                activeTab === "matrix"
                  ? "bg-white text-brand shadow-xs dark:bg-slate-800 dark:text-brand"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              )}
            >
              <Settings className="h-4 w-4" />
              <span>Ma trận Quyền Vai trò ({projectRoles.length})</span>
            </button>
          </div>

          {activeTab === "matrix" && canManageMembers && (
            <button
              type="button"
              onClick={() => setCreateRoleOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-brand-hover cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Thêm vai trò dự án</span>
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loadingRoles ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-brand" />
            </div>
          ) : activeTab === "assign" ? (
            /* TAB 1: GÁN VAI TRÒ CHO THÀNH VIÊN DỰ ÁN */
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Chỉ định vai trò chuyên môn (Trưởng dự án, Biên tập chính, Duyệt bông...) cho từng nhân sự tham gia.
                </p>
                <div className="relative w-full sm:w-64">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Tìm thành viên..."
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 py-1.5 pl-8 pr-3 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-brand focus:outline-none"
                  />
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 uppercase font-semibold tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-4 py-3">Thành viên</th>
                      <th className="px-4 py-3">Cương vị dự án</th>
                      <th className="px-4 py-3">Vai trò phân quyền (Project Role)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                    {filteredMembers.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-8 text-center text-slate-400">
                          Không tìm thấy thành viên nào.
                        </td>
                      </tr>
                    ) : (
                      filteredMembers.map((m) => {
                        const isOwner = m.role === "owner" || project.created_by === m.user_id;
                        const isBusy = updatingMemberUserId === m.user_id;

                        return (
                          <tr
                            key={m.user_id}
                            className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition"
                          >
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand dark:bg-brand/20">
                                  {getInitials(m.profile?.full_name || "MB")}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                                    {m.profile?.full_name || "Thành viên"}
                                    {m.user_id === currentUser.id && (
                                      <span className="ml-1.5 text-[11px] font-normal text-slate-400">
                                        (Bạn)
                                      </span>
                                    )}
                                  </p>
                                  <p className="text-[11px] text-slate-400 truncate">
                                    {m.profile?.email}
                                  </p>
                                </div>
                              </div>
                            </td>

                            <td className="px-4 py-3.5">
                              {isOwner ? (
                                <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                  <Sparkles className="h-3 w-3" />
                                  Chủ dự án (Toàn quyền)
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                  Thành viên
                                </span>
                              )}
                            </td>

                            <td className="px-4 py-3.5">
                              {canManageMembers && !isOwner ? (
                                <div className="flex items-center gap-2">
                                  <select
                                    disabled={isBusy}
                                    value={m.project_role_id || ""}
                                    onChange={(e) =>
                                      handleAssignMemberRole(
                                        m.user_id,
                                        e.target.value || null
                                      )
                                    }
                                    className="w-56 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50 cursor-pointer"
                                  >
                                    <option value="">
                                      -- Mặc định (Thành viên chuẩn) --
                                    </option>
                                    {projectRoles.map((r) => (
                                      <option key={r.id} value={r.id}>
                                        {r.name}
                                      </option>
                                    ))}
                                  </select>
                                  {isBusy && (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />
                                  )}
                                </div>
                              ) : (
                                <span className="font-semibold text-slate-800 dark:text-slate-200">
                                  {isOwner
                                    ? "Toàn quyền quản trị"
                                    : m.project_role?.name || "Thành viên chuẩn"}
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
          ) : (
            /* TAB 2: MA TRẬN 10 QUYỀN DỰ ÁN */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Cột danh sách vai trò */}
              <div className="lg:col-span-4 space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 px-1">
                  Vai trò khả dụng ({projectRoles.length})
                </span>

                <div className="space-y-1.5">
                  {projectRoles.map((r) => {
                    const isSelected = (activeRole?.id || "") === r.id;
                    const isGlobal = !r.project_id;

                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelectedRoleId(r.id)}
                        className={cn(
                          "w-full text-left rounded-xl border p-3 transition cursor-pointer relative",
                          isSelected
                            ? "border-brand bg-brand/5 dark:bg-brand/10 shadow-xs"
                            : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-slate-300"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                            {r.name}
                          </h4>
                          {isGlobal ? (
                            <span className="rounded-sm bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-500">
                              Mẫu chung
                            </span>
                          ) : (
                            <span className="rounded-sm bg-brand-soft dark:bg-brand/20 px-1.5 py-0.5 text-[10px] text-brand font-medium">
                              Riêng dự án
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                          {r.description || "Không có mô tả"}
                        </p>
                        <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                          <span className="font-mono uppercase text-brand">
                            #{r.code}
                          </span>
                          <span>{r.permissions?.length || 0}/10 quyền</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Cột ma trận quyền của vai trò */}
              <div className="lg:col-span-8">
                {activeRole ? (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                          <Shield className="h-4 w-4 text-brand" />
                          {activeRole.name}
                          <span className="text-xs font-mono text-slate-400 font-normal">
                            ({activeRole.code})
                          </span>
                        </h3>
                        {activeRole.description && (
                          <p className="mt-0.5 text-xs text-slate-500">
                            {activeRole.description}
                          </p>
                        )}
                      </div>

                      {canManageMembers && (
                        <button
                          type="button"
                          disabled={savingRoleId === activeRole.id}
                          onClick={() => handleSaveRolePermissions(activeRole)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-brand hover:bg-brand-hover px-3.5 py-1.5 text-xs font-semibold text-white transition disabled:opacity-60 cursor-pointer shrink-0"
                        >
                          {savingRoleId === activeRole.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Save className="h-3.5 w-3.5" />
                          )}
                          <span>Lưu ma trận</span>
                        </button>
                      )}
                    </div>

                    <div className="space-y-1.5 max-h-[55vh] overflow-y-auto pr-1">
                      {PROJECT_PERMISSION_DEFINITIONS.map((perm) => {
                        const isChecked = (
                          activeRole.permissions || []
                        ).includes(perm.key);

                        return (
                          <label
                            key={perm.key}
                            className={cn(
                              "flex items-start gap-3 p-2.5 rounded-lg border transition select-none",
                              isChecked
                                ? "border-brand/30 bg-orange-50/40 dark:border-brand/20 dark:bg-orange-950/20"
                                : "border-slate-100 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/40",
                              canManageMembers ? "cursor-pointer" : "cursor-default opacity-80"
                            )}
                          >
                            <input
                              type="checkbox"
                              disabled={!canManageMembers}
                              checked={isChecked}
                              onChange={() =>
                                handleToggleProjectPermission(
                                  activeRole.id,
                                  perm.key
                                )
                              }
                              className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-brand focus:ring-brand accent-brand cursor-pointer"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                                {perm.label}
                                <span className="ml-1.5 font-mono text-[10px] text-slate-400">
                                  ({perm.key})
                                </span>
                              </p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                {perm.description}
                              </p>
                            </div>
                            <span
                              className={cn(
                                "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold",
                                isChecked
                                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                                  : "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                              )}
                            >
                              {isChecked ? "Cho phép" : "Khóa"}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center text-xs text-slate-400">
                    Vui lòng chọn một vai trò để cấu hình quyền.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal tạo vai trò dự án mới */}
        {createRoleOpen && (
          <div
            className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
            onClick={() => setCreateRoleOpen(false)}
          >
            <div
              className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Thêm Vai trò Riêng cho Dự án
                </h3>
                <button
                  type="button"
                  onClick={() => setCreateRoleOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleCreateProjectRole} className="mt-4 space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Tên vai trò <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Biên tập viên bản thảo, Thiết kế bìa..."
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-brand focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Mã vai trò (Viết hoa) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: MANUSCRIPT_EDITOR, COVER_DESIGNER"
                    value={newRoleCode}
                    onChange={(e) => setNewRoleCode(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono uppercase text-slate-900 dark:text-slate-100 focus:border-brand focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Mô tả
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Phạm vi công việc..."
                    value={newRoleDesc}
                    onChange={(e) => setNewRoleDesc(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-brand focus:outline-none"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setCreateRoleOpen(false)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={creatingRole}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-hover disabled:opacity-60 cursor-pointer"
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
    </div>
  );
}
