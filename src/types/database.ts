export type UserRole = "admin" | "manager" | "member";
export type ProjectStatus = "active" | "completed" | "archived";
export type TaskStatusCategory = "todo" | "doing" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type AttachmentType = "file" | "gdrive" | "gsheet" | "lark" | "link";
export type NotificationType =
  | "task_assigned"
  | "task_mentioned"
  | "task_commented"
  | "task_status_changed"
  | "project_added";
export type WebhookProvider = "telegram" | "lark";

export interface Department {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  parent_id?: string | null;
  created_at: string;
  parent?: Pick<Department, "id" | "name" | "code"> | null;
  children?: Department[];
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  role: UserRole;
  job_title: string | null;
  department_id: string | null;
  manager_id?: string | null;
  telegram_chat_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  department?: Department | null;
  manager?: Pick<Profile, "id" | "full_name" | "email" | "avatar_url" | "job_title"> | null;
}

export interface Project {
  id: string;
  name: string;
  code: string;
  description: string | null;
  color: string;
  status: ProjectStatus;
  department_id: string | null;
  start_date: string | null;
  due_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  department?: Department | null;
}

export interface ProjectMember {
  project_id: string;
  user_id: string;
  role: "owner" | "member";
  joined_at: string;
  profile?: Profile;
}

export interface TaskStatus {
  id: string;
  project_id: string;
  name: string;
  color: string;
  category: TaskStatusCategory;
  position: number;
}

export interface Label {
  id: string;
  project_id: string;
  name: string;
  color: string;
}

export interface Task {
  id: string;
  project_id: string;
  parent_id: string | null;
  status_id: string | null;
  title: string;
  description: string | null;
  priority: TaskPriority;
  start_date: string | null;
  due_date: string | null;
  completed_at: string | null;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined optional fields
  status?: TaskStatus | null;
  project?: Pick<Project, "id" | "name" | "code" | "color"> | null;
  assignees?: Profile[];
  labels?: Label[];
  subtasks_count?: number;
  subtasks_done?: number;
}

export interface TaskComment {
  id: string;
  task_id: string;
  author_id: string;
  content: string;
  mentioned_user_ids: string[];
  created_at: string;
  updated_at: string;
  author?: Profile;
}

export interface TaskAttachment {
  id: string;
  task_id: string;
  uploaded_by: string | null;
  name: string;
  url: string;
  storage_path: string | null;
  attachment_type: AttachmentType;
  file_size: number | null;
  created_at: string;
}

export interface PersonalTodo {
  id: string;
  user_id: string;
  title: string;
  is_done: boolean;
  due_date: string | null;
  position: number;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
  actor?: Pick<Profile, "id" | "full_name" | "avatar_url"> | null;
}

export interface ProjectTemplateTask {
  id: string;
  template_id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status_category: TaskStatusCategory;
  offset_days: number;
  position: number;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string | null;
  color: string;
  category: string;
  created_by: string | null;
  created_at: string;
  tasks?: ProjectTemplateTask[];
}

export interface WebhookConfig {
  id: string;
  name: string;
  provider: WebhookProvider;
  project_id: string | null;
  webhook_url: string | null;
  telegram_bot_token: string | null;
  telegram_chat_id: string | null;
  events: string[];
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  project?: Pick<Project, "id" | "name" | "code"> | null;
}
