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
  | "project_added"
  | "project_update_posted"
  | "direct_message";
export type WebhookProvider = "telegram" | "lark";
export type CustomFieldType = "text" | "number" | "dropdown" | "date" | "people";
export type DependencyType = "blocked_by" | "blocking" | "relates_to";
export type PhaseStatus = "pending" | "in_progress" | "completed";
export type DeliveryConfidence = "on_track" | "at_risk" | "off_track";
export type ProgressMode = "auto" | "manual";

export interface Department {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  parent_id?: string | null;
  created_at: string;
  parent?: Department | null;
}

export interface SystemRole {
  id: string;
  name: string;
  code: string;
  description: string | null;
  permissions: string[];
  is_system: boolean;
  created_at: string;
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
  custom_role_id?: string | null;
  telegram_chat_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  department?: Department | null;
  manager?: Profile | null;
  custom_role?: SystemRole | null;
}

export interface ProjectRole {
  id: string;
  project_id: string | null;
  name: string;
  code: string;
  description: string | null;
  permissions: string[];
  is_default: boolean;
  created_at: string;
}

export interface ProjectPhase {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  color: string;
  status: PhaseStatus;
  start_date: string | null;
  due_date: string | null;
  position: number;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  code: string;
  description: string | null;
  color: string;
  status: ProjectStatus;
  department_id: string | null;
  category?: string | null;
  delivery_confidence?: DeliveryConfidence;
  confidence_note?: string | null;
  client_name?: string | null;
  project_manager_id?: string | null;
  progress_mode?: ProgressMode;
  manual_progress?: number;
  start_date: string | null;
  due_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  department?: Department | null;
  project_manager?: Pick<Profile, "id" | "full_name" | "email" | "avatar_url" | "job_title"> | null;
}

export interface ProjectMember {
  project_id: string;
  user_id: string;
  role: "owner" | "member";
  project_role_id?: string | null;
  joined_at: string;
  profile?: Profile;
  project_role?: ProjectRole | null;
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

export interface TaskDependency {
  id: string;
  task_id: string;
  depends_on_task_id: string;
  dependency_type: DependencyType;
  created_at: string;
  depends_on_task?: Pick<Task, "id" | "title" | "status_id" | "status">;
}

export interface Task {
  id: string;
  project_id: string;
  parent_id: string | null;
  status_id: string | null;
  phase_id?: string | null;
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
  phase?: ProjectPhase | null;
  project?: Pick<Project, "id" | "name" | "code" | "color"> | null;
  assignees?: Profile[];
  labels?: Label[];
  subtasks_count?: number;
  subtasks_done?: number;
  custom_values?: Record<string, string>;
  dependencies?: TaskDependency[];
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

export interface DirectMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  attachment_url: string | null;
  attachment_name: string | null;
  is_read: boolean;
  created_at: string;
  sender?: Profile;
  receiver?: Profile;
}

export interface ChannelMessage {
  id: string;
  department_id: string;
  author_id: string;
  content: string;
  attachment_url: string | null;
  attachment_name: string | null;
  parent_id: string | null;
  created_at: string;
  author?: Profile;
}

export interface ProjectUpdateComment {
  id: string;
  update_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author?: Profile;
}

export interface ProjectUpdateReaction {
  id: string;
  update_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
  user?: Profile;
}

export interface ProjectUpdate {
  id: string;
  project_id: string;
  author_id: string;
  title: string;
  content: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  author?: Profile;
  comments?: ProjectUpdateComment[];
  reactions?: ProjectUpdateReaction[];
}

export interface TaskActivityLog {
  id: string;
  task_id: string;
  actor_id: string | null;
  action: string;
  details: {
    old_value?: string | null;
    new_value?: string | null;
    label?: string;
    description?: string;
  };
  created_at: string;
  actor?: Profile;
}

export interface ProjectCustomField {
  id: string;
  project_id: string;
  name: string;
  field_type: CustomFieldType;
  options: string[];
  position: number;
  created_at: string;
}

export interface TaskCustomFieldValue {
  task_id: string;
  field_id: string;
  value: string;
  updated_at: string;
}

export interface ProjectFile {
  id: string;
  project_id: string;
  name: string;
  file_url: string;
  storage_path: string | null;
  file_size: number | null;
  category: string;
  uploaded_by: string | null;
  created_at: string;
  uploader?: Profile;
}

export interface ProjectLink {
  id: string;
  project_id: string;
  title: string;
  url: string;
  link_type: "gdrive" | "gsheet" | "lark" | "other";
  created_by: string | null;
  created_at: string;
  creator?: Profile;
}
