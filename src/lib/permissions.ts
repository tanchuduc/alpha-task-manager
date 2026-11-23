import type { Profile, Project, ProjectMember, SystemRole, ProjectRole } from "@/types/database";

/**
 * HỆ THỐNG MÃ QUYỀN HỆ THỐNG (SYSTEM PERMISSIONS)
 */
export const SYSTEM_PERMISSIONS = {
  MANAGE_SETTINGS: "manage_settings",
  MANAGE_USERS: "manage_users",
  MANAGE_DEPARTMENTS: "manage_departments",
  CREATE_PROJECTS: "create_projects",
  VIEW_ALL_PROJECTS: "view_all_projects",
  VIEW_REPORTS: "view_reports",
  MANAGE_WEBHOOKS: "manage_webhooks",
} as const;

export type SystemPermissionKey =
  (typeof SYSTEM_PERMISSIONS)[keyof typeof SYSTEM_PERMISSIONS];

export interface SystemPermissionDef {
  key: SystemPermissionKey;
  label: string;
  description: string;
  category: "admin" | "project" | "report";
}

export const SYSTEM_PERMISSION_DEFINITIONS: SystemPermissionDef[] = [
  {
    key: "manage_settings",
    label: "Quản lý cài đặt hệ thống",
    description: "Cấu hình chung, cấu hình thương hiệu và các chính sách hệ thống",
    category: "admin",
  },
  {
    key: "manage_users",
    label: "Quản lý tài khoản nhân sự",
    description: "Tạo tài khoản mới, phân vai trò hệ thống và trạng thái hoạt động",
    category: "admin",
  },
  {
    key: "manage_departments",
    label: "Quản lý phòng ban",
    description: "Tạo, sửa, xóa cấu trúc phòng ban và phân cấp trực thuộc",
    category: "admin",
  },
  {
    key: "manage_webhooks",
    label: "Cấu hình Webhook Telegram / Lark",
    description: "Thiết lập bot thông báo tự động cho các phòng ban và dự án",
    category: "admin",
  },
  {
    key: "create_projects",
    label: "Tạo dự án mới",
    description: "Khởi tạo dự án sách mới và chọn quy trình mẫu xuất bản",
    category: "project",
  },
  {
    key: "view_all_projects",
    label: "Xem mọi dự án",
    description: "Xem và theo dõi tất cả dự án trong hệ thống dù không tham gia",
    category: "project",
  },
  {
    key: "view_reports",
    label: "Xem báo cáo & thống kê",
    description: "Xem dashboard tổng quan hiệu suất, tiến độ dự án và thống kê công việc",
    category: "report",
  },
];

/**
 * HỆ THỐNG MÃ QUYỀN DỰ ÁN (PROJECT PERMISSIONS)
 */
export const PROJECT_PERMISSIONS = {
  VIEW_PROJECT: "view_project",
  CREATE_TASKS: "create_tasks",
  EDIT_OWN_TASKS: "edit_own_tasks",
  EDIT_ALL_TASKS: "edit_all_tasks",
  DELETE_TASKS: "delete_tasks",
  CHANGE_STATUS: "change_status",
  MANAGE_MEMBERS: "manage_members",
  MANAGE_FILES: "manage_files",
  POST_UPDATES: "post_updates",
  MANAGE_PHASES: "manage_phases",
} as const;

export type ProjectPermissionKey =
  (typeof PROJECT_PERMISSIONS)[keyof typeof PROJECT_PERMISSIONS];

export interface ProjectPermissionDef {
  key: ProjectPermissionKey;
  label: string;
  description: string;
  group: "tasks" | "collaboration" | "administration";
}

export const PROJECT_PERMISSION_DEFINITIONS: ProjectPermissionDef[] = [
  {
    key: "view_project",
    label: "Xem thông tin dự án",
    description: "Được phép mở trang chi tiết, xem tiến độ và danh sách công việc",
    group: "administration",
  },
  {
    key: "create_tasks",
    label: "Tạo công việc mới",
    description: "Thêm việc mới trong dự án qua danh sách, bảng kanban hoặc modal",
    group: "tasks",
  },
  {
    key: "edit_own_tasks",
    label: "Chỉnh sửa việc của mình",
    description: "Sửa tiêu đề, mô tả, tệp đính kèm các việc mình được giao hoặc tạo",
    group: "tasks",
  },
  {
    key: "edit_all_tasks",
    label: "Chỉnh sửa việc của người khác",
    description: "Chỉnh sửa thông tin bất kỳ công việc nào trong dự án",
    group: "tasks",
  },
  {
    key: "delete_tasks",
    label: "Xóa công việc",
    description: "Quyền xóa bỏ hoàn toàn công việc khỏi dự án",
    group: "tasks",
  },
  {
    key: "change_status",
    label: "Kéo thả / đổi trạng thái công việc",
    description: "Thay đổi tiến độ công việc giữa các cột Cần làm, Đang làm, Hoàn thành",
    group: "tasks",
  },
  {
    key: "manage_members",
    label: "Thêm / xóa thành viên dự án",
    description: "Mời nhân sự vào dự án, gán vai trò dự án và loại bỏ thành viên",
    group: "administration",
  },
  {
    key: "manage_files",
    label: "Tải lên và quản lý tệp dự án",
    description: "Tải lên bản thảo, bìa sách, tài liệu pháp lý và tài nguyên liên kết",
    group: "collaboration",
  },
  {
    key: "post_updates",
    label: "Đăng bài và bình luận thảo luận",
    description: "Viết cập nhật tiến độ dự án, thả reaction và trao đổi trao đổi",
    group: "collaboration",
  },
  {
    key: "manage_phases",
    label: "Quản lý các giai đoạn xuất bản",
    description: "Thiết lập các mốc giai đoạn (Dịch thuật, Biên tập, Thiết kế, In ấn...)",
    group: "administration",
  },
];

/**
 * Kiểm tra xem người dùng hiện tại có quyền hệ thống chỉ định hay không.
 * - Quản trị viên (admin): Luôn có tất cả quyền.
 * - Nếu người dùng có vai trò tùy chỉnh (custom_role): Kiểm tra mảng custom_role.permissions.
 * - Fallback: Nếu role là manager, mặc định có quyền tạo dự án, xem mọi dự án, xem báo cáo, quản lý phòng ban, webhook.
 */
export function hasSystemPermission(
  currentUser: Profile | null | undefined,
  permission: string
): boolean {
  if (!currentUser) return false;

  // Quản trị viên hệ thống có toàn quyền
  if (currentUser.role === "admin") {
    return true;
  }

  // Kiểm tra vai trò hệ thống nâng cao (custom_role)
  if (currentUser.custom_role?.permissions) {
    return currentUser.custom_role.permissions.includes(permission);
  }

  // Fallback quyền mặc định cho manager nếu chưa gán custom_role
  if (currentUser.role === "manager") {
    const managerDefaults: string[] = [
      SYSTEM_PERMISSIONS.CREATE_PROJECTS,
      SYSTEM_PERMISSIONS.VIEW_ALL_PROJECTS,
      SYSTEM_PERMISSIONS.VIEW_REPORTS,
      SYSTEM_PERMISSIONS.MANAGE_DEPARTMENTS,
      SYSTEM_PERMISSIONS.MANAGE_WEBHOOKS,
    ];
    return managerDefaults.includes(permission);
  }

  return false;
}

/**
 * Kiểm tra quyền của người dùng trong một dự án cụ thể.
 * - Admin hệ thống: Luôn có mọi quyền.
 * - Chủ dự án (người tạo hoặc role === 'owner'): Luôn có mọi quyền.
 * - Nếu thành viên có `project_role`: Kiểm tra `project_role.permissions`.
 * - Nếu không có `project_role`: Dùng bộ quyền mặc định của thành viên thông thường.
 */
export function hasProjectPermission(
  currentUser: Profile | null | undefined,
  project: Project | null | undefined,
  member: ProjectMember | undefined,
  permission: string
): boolean {
  if (!currentUser) return false;

  // Admin hệ thống luôn có mọi quyền trong bất kỳ dự án nào
  if (currentUser.role === "admin") {
    return true;
  }

  // Chủ sở hữu dự án (người tạo hoặc role là owner) có toàn quyền
  if (project && project.created_by === currentUser.id) {
    return true;
  }
  if (member && member.role === "owner") {
    return true;
  }

  // Kiểm tra vai trò dự án cụ thể (project_role)
  if (member?.project_role?.permissions) {
    return member.project_role.permissions.includes(permission);
  }

  // Nếu là thành viên tham gia nhưng chưa gán vai trò riêng: Áp dụng quyền thành viên cơ bản
  if (member) {
    const defaultMemberPermissions: string[] = [
      PROJECT_PERMISSIONS.VIEW_PROJECT,
      PROJECT_PERMISSIONS.CREATE_TASKS,
      PROJECT_PERMISSIONS.EDIT_OWN_TASKS,
      PROJECT_PERMISSIONS.CHANGE_STATUS,
      PROJECT_PERMISSIONS.POST_UPDATES,
      PROJECT_PERMISSIONS.MANAGE_FILES,
    ];
    return defaultMemberPermissions.includes(permission);
  }

  // Nếu không tham gia dự án: Nếu có quyền xem mọi dự án ở cấp hệ thống thì cho phép xem
  if (
    permission === PROJECT_PERMISSIONS.VIEW_PROJECT &&
    hasSystemPermission(currentUser, SYSTEM_PERMISSIONS.VIEW_ALL_PROJECTS)
  ) {
    return true;
  }

  return false;
}

/**
 * Helper lấy toàn bộ danh sách cờ quyền dự án cho currentUser
 */
export function getProjectPermissionsMap(
  currentUser: Profile | null | undefined,
  project: Project | null | undefined,
  member: ProjectMember | undefined
) {
  return {
    canViewProject: hasProjectPermission(
      currentUser,
      project,
      member,
      PROJECT_PERMISSIONS.VIEW_PROJECT
    ),
    canCreateTasks: hasProjectPermission(
      currentUser,
      project,
      member,
      PROJECT_PERMISSIONS.CREATE_TASKS
    ),
    canEditOwnTasks: hasProjectPermission(
      currentUser,
      project,
      member,
      PROJECT_PERMISSIONS.EDIT_OWN_TASKS
    ),
    canEditAllTasks: hasProjectPermission(
      currentUser,
      project,
      member,
      PROJECT_PERMISSIONS.EDIT_ALL_TASKS
    ),
    canDeleteTasks: hasProjectPermission(
      currentUser,
      project,
      member,
      PROJECT_PERMISSIONS.DELETE_TASKS
    ),
    canChangeStatus: hasProjectPermission(
      currentUser,
      project,
      member,
      PROJECT_PERMISSIONS.CHANGE_STATUS
    ),
    canManageMembers: hasProjectPermission(
      currentUser,
      project,
      member,
      PROJECT_PERMISSIONS.MANAGE_MEMBERS
    ),
    canManageFiles: hasProjectPermission(
      currentUser,
      project,
      member,
      PROJECT_PERMISSIONS.MANAGE_FILES
    ),
    canPostUpdates: hasProjectPermission(
      currentUser,
      project,
      member,
      PROJECT_PERMISSIONS.POST_UPDATES
    ),
    canManagePhases: hasProjectPermission(
      currentUser,
      project,
      member,
      PROJECT_PERMISSIONS.MANAGE_PHASES
    ),
  };
}
