import type {
  Profile,
  Project,
  ProjectMember,
  Task,
} from "@/types/database";

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
    description: "Viết cập nhật tiến độ dự án, thả reaction và trao đổi bình luận",
    group: "collaboration",
  },
  {
    key: "manage_phases",
    label: "Quản lý các giai đoạn xuất bản",
    description: "Thiết lập các mốc giai đoạn (Dịch thuật, Biên tập, Thiết kế, In ấn...)",
    group: "administration",
  },
];

export interface ProjectPermissionsMap {
  canViewProject: boolean;
  canCreateTasks: boolean;
  canEditOwnTasks: boolean;
  canEditAllTasks: boolean;
  canDeleteTasks: boolean;
  canChangeStatus: boolean;
  canManageMembers: boolean;
  canManageFiles: boolean;
  canPostUpdates: boolean;
  canManagePhases: boolean;
}

/**
 * Helper kiểm tra người dùng có phải là Ban Giám Đốc (BOD) hoặc Quản trị viên hệ thống (Admin)
 */
export function isDirectorOrAdmin(
  currentUser: Profile | null | undefined
): boolean {
  if (!currentUser || !currentUser.is_active) return false;
  return (
    currentUser.role === "admin" ||
    currentUser.custom_role?.code === "DIRECTOR"
  );
}

/**
 * Helper kiểm tra người dùng có phải là Trưởng phòng / Trưởng nhóm / Quản lý
 */
export function isTeamLeadOrManager(
  currentUser: Profile | null | undefined
): boolean {
  if (!currentUser || !currentUser.is_active) return false;
  if (isDirectorOrAdmin(currentUser)) return true;
  return (
    currentUser.role === "manager" ||
    currentUser.custom_role?.code === "LEAD"
  );
}

/**
 * Helper kiểm tra người dùng có phải là Cộng tác viên ngoài (Freelancer)
 */
export function isCollaborator(
  currentUser: Profile | null | undefined
): boolean {
  if (!currentUser) return false;
  return currentUser.custom_role?.code === "COLLABORATOR";
}

/**
 * Kiểm tra xem người dùng hiện tại có quyền hệ thống chỉ định hay không.
 * - Quản trị viên (admin) & Ban Giám đốc (DIRECTOR): Luôn có tất cả quyền.
 * - Nếu người dùng có vai trò tùy chỉnh (custom_role): Kiểm tra mảng custom_role.permissions.
 * - Fallback:
 *   + Nếu role là manager hoặc LEAD: mặc định có quyền tạo dự án, xem mọi dự án, xem báo cáo, quản lý phòng ban, webhook.
 *   + Nếu role là member (chưa gán custom_role hoặc SPECIALIST): mặc định có quyền tạo dự án (`create_projects`).
 */
export function hasSystemPermission(
  currentUser: Profile | null | undefined,
  permission: string
): boolean {
  if (!currentUser || !currentUser.is_active) return false;

  // Quản trị viên hệ thống & Ban Giám đốc (BOD / DIRECTOR) có toàn quyền
  if (isDirectorOrAdmin(currentUser)) {
    return true;
  }

  // Kiểm tra vai trò hệ thống nâng cao (custom_role)
  if (currentUser.custom_role?.permissions && currentUser.custom_role.permissions.length > 0) {
    return currentUser.custom_role.permissions.includes(permission);
  }

  // Fallback quyền mặc định cho manager hoặc LEAD nếu chưa gán custom_role chi tiết
  if (currentUser.role === "manager" || currentUser.custom_role?.code === "LEAD") {
    const managerDefaults: string[] = [
      SYSTEM_PERMISSIONS.CREATE_PROJECTS,
      SYSTEM_PERMISSIONS.VIEW_ALL_PROJECTS,
      SYSTEM_PERMISSIONS.VIEW_REPORTS,
      SYSTEM_PERMISSIONS.MANAGE_DEPARTMENTS,
      SYSTEM_PERMISSIONS.MANAGE_WEBHOOKS,
    ];
    return managerDefaults.includes(permission);
  }

  // Fallback cho member chuẩn (tương đương Chuyên viên SPECIALIST) khi chưa bị khóa bởi custom_role COLLABORATOR
  if (currentUser.role === "member" && !isCollaborator(currentUser)) {
    const memberDefaults: string[] = [SYSTEM_PERMISSIONS.CREATE_PROJECTS];
    return memberDefaults.includes(permission);
  }

  return false;
}

/**
 * Kiểm tra xem người dùng có phải là người có đặc quyền quản trị trong dự án không
 * (Admin hệ thống, BOD Director, Người tạo dự án, Trưởng dự án PM, hoặc Owner/LEAD trong project_members)
 */
export function isProjectPrivilegedUser(
  currentUser: Profile | null | undefined,
  project: Project | null | undefined,
  member: ProjectMember | undefined
): boolean {
  if (!currentUser) return false;
  if (isDirectorOrAdmin(currentUser)) return true;
  if (project && project.created_by === currentUser.id) return true;
  if (project && project.project_manager_id === currentUser.id) return true;
  if (member && member.role === "owner") return true;
  if (member?.project_role?.code === "LEAD") return true;
  return false;
}

/**
 * Kiểm tra xem một dự án có được phép hiển thị với người dùng hiện tại không.
 * - Admin hoặc BOD hoặc người có quyền hệ thống `view_all_projects`: Xem được mọi dự án.
 * - Người tạo dự án, Trưởng dự án (PM), hoặc thành viên trong `project_members`: Xem được dự án đó.
 * - Nếu dự án KHÔNG đánh dấu `is_private` VÀ người dùng không phải là Cộng tác viên hạn chế (`COLLABORATOR`),
 *   cho phép xem trong không gian làm việc nội bộ.
 */
export function canUserViewProject(
  currentUser: Profile | null | undefined,
  project: Project | null | undefined,
  isProjectMember: boolean
): boolean {
  if (!currentUser || !project) return false;
  if (isDirectorOrAdmin(currentUser)) return true;
  if (hasSystemPermission(currentUser, SYSTEM_PERMISSIONS.VIEW_ALL_PROJECTS)) {
    return true;
  }
  if (
    project.created_by === currentUser.id ||
    project.project_manager_id === currentUser.id ||
    isProjectMember
  ) {
    return true;
  }
  // Nếu tài khoản bị gán vai trò COLLABORATOR (Cộng tác viên ngoài), bắt buộc chỉ thấy dự án mình tham gia
  if (isCollaborator(currentUser)) {
    return false;
  }
  // Dự án nội bộ (không bật is_private) thì nhân viên chính thức xem được
  return !project.is_private;
}

/**
 * Kiểm tra quyền của người dùng trong một dự án cụ thể.
 * - Admin hệ thống & BOD: Luôn có mọi quyền.
 * - Chủ dự án (người tạo, PM hoặc role === 'owner'): Luôn có mọi quyền.
 * - Nếu thành viên có `project_role`: Kiểm tra `project_role.permissions`.
 *   + Lưu ý: Nếu `view_project` bị thu hồi trong `project_role`, tự động từ chối mọi quyền thao tác khác.
 * - Nếu không có `project_role`: Dùng bộ quyền mặc định của thành viên thông thường.
 */
export function hasProjectPermission(
  currentUser: Profile | null | undefined,
  project: Project | null | undefined,
  member: ProjectMember | undefined,
  permission: string
): boolean {
  if (!currentUser) return false;

  // Admin hệ thống và BOD luôn có mọi quyền trong bất kỳ dự án nào
  if (isDirectorOrAdmin(currentUser)) {
    return true;
  }

  // Chủ sở hữu dự án (người tạo, Trưởng dự án PM, hoặc role là owner) có toàn quyền
  if (project && (project.created_by === currentUser.id || project.project_manager_id === currentUser.id)) {
    return true;
  }
  if (member && member.role === "owner") {
    return true;
  }

  // Kiểm tra vai trò dự án cụ thể (project_role)
  if (member?.project_role?.permissions) {
    const perms = member.project_role.permissions;
    // Nếu bị thu hồi quyền xem dự án thì không có bất kỳ quyền thao tác nào
    if (!perms.includes(PROJECT_PERMISSIONS.VIEW_PROJECT)) {
      return false;
    }
    return perms.includes(permission);
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

  // Nếu không nằm trong danh sách project_members:
  if (permission === PROJECT_PERMISSIONS.VIEW_PROJECT) {
    return canUserViewProject(currentUser, project, false);
  }

  // Người có quyền view_all_projects là Manager được phép tương tác cơ bản nếu dự án không private
  if (
    currentUser.role === "manager" &&
    hasSystemPermission(currentUser, SYSTEM_PERMISSIONS.VIEW_ALL_PROJECTS) &&
    !project?.is_private
  ) {
    const managerFallbackPerms: string[] = [
      PROJECT_PERMISSIONS.VIEW_PROJECT,
      PROJECT_PERMISSIONS.CREATE_TASKS,
      PROJECT_PERMISSIONS.EDIT_OWN_TASKS,
      PROJECT_PERMISSIONS.EDIT_ALL_TASKS,
      PROJECT_PERMISSIONS.CHANGE_STATUS,
      PROJECT_PERMISSIONS.POST_UPDATES,
      PROJECT_PERMISSIONS.MANAGE_FILES,
    ];
    return managerFallbackPerms.includes(permission);
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
): ProjectPermissionsMap {
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

/**
 * Kiểm tra xem người dùng có quyền chỉnh sửa một công việc (Task) cụ thể hay không.
 * - Có `canEditAllTasks`: Sửa được mọi task trong dự án.
 * - Có `canEditOwnTasks`: Chỉ sửa được nếu mình là người tạo (`created_by`) hoặc nằm trong danh sách `assignees` (hoặc `assigneeIds`).
 */
export function canUserEditTask(
  currentUser: Profile | null | undefined,
  task: Pick<Task, "created_by" | "assignees"> | null | undefined,
  permissionsMap: Pick<ProjectPermissionsMap, "canEditAllTasks" | "canEditOwnTasks">,
  explicitAssigneeIds?: string[]
): boolean {
  if (!currentUser || !task) return false;
  if (permissionsMap.canEditAllTasks) return true;
  if (!permissionsMap.canEditOwnTasks) return false;

  const isCreator = task.created_by === currentUser.id;
  const isAssignedInList = explicitAssigneeIds
    ? explicitAssigneeIds.includes(currentUser.id)
    : (task.assignees ?? []).some((a) => a.id === currentUser.id);

  return isCreator || isAssignedInList;
}

/**
 * Kiểm tra xem người dùng có bị giới hạn chỉ xem các công việc được giao cho mình không
 * (tương đương `resolveAssigneeTaskScope` trong Worklenz cũ).
 * Áp dụng khi:
 * 1. Dự án bật `restrict_tasks_to_assignee === true`, HOẶC người dùng có vai trò hệ thống `COLLABORATOR`.
 * 2. VÀ người dùng không phải Admin, Trưởng phòng (`manager`), Chủ dự án, PM, hoặc Trưởng dự án (`LEAD`).
 */
export function shouldRestrictTasksToAssignee(
  currentUser: Profile | null | undefined,
  project: Project | null | undefined,
  member: ProjectMember | undefined
): boolean {
  if (!currentUser || !project) return false;
  if (isProjectPrivilegedUser(currentUser, project, member)) return false;
  if (currentUser.role === "manager") return false;

  if (project.restrict_tasks_to_assignee) return true;
  if (isCollaborator(currentUser)) return true;

  return false;
}

/**
 * Kiểm tra xem người dùng có quyền Nghiệm thu / Phê duyệt (Sign-off) một công việc hay không.
 * - Admin hệ thống hoặc BOD (DIRECTOR): Luôn có quyền.
 * - Người tạo dự án, PM, Owner hoặc Trưởng dự án (LEAD): Có quyền.
 * - Người giao việc ban đầu (assigned_by hoặc created_by của task): Có quyền nghiệm thu công việc mình đã giao.
 */
export function canUserReviewTask(
  currentUser: Profile | null | undefined,
  project: Project | null | undefined,
  member: ProjectMember | undefined,
  task: Pick<Task, "created_by"> & { assigned_by?: string | null },
  explicitAssignedById?: string | null
): boolean {
  if (!currentUser || !task) return false;
  if (isProjectPrivilegedUser(currentUser, project, member)) return true;
  if (isTeamLeadOrManager(currentUser)) return true;

  // Người giao việc hoặc người tạo task được quyền duyệt
  const assignerId = explicitAssignedById ?? task.assigned_by;
  if (assignerId && assignerId === currentUser.id) return true;
  if (task.created_by === currentUser.id) return true;

  return false;
}
