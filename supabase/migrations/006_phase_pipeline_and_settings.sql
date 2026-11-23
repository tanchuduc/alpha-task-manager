-- Migration 006: Phase Pipeline (Phase Assignees, Auto-assign Subtask Phase) & Project/Profile Settings
ALTER TABLE alpha_lite.project_phases
  ADD COLUMN IF NOT EXISTS assignee_id UUID REFERENCES alpha_lite.profiles(id) ON DELETE SET NULL;

ALTER TABLE alpha_lite.projects
  ADD COLUMN IF NOT EXISTS enable_phase_assignees BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_assign_subtask_phase BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS assign_tasks_to_creator BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS restrict_task_assignment BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT false;

ALTER TABLE alpha_lite.profiles
  ADD COLUMN IF NOT EXISTS notification_prefs JSONB DEFAULT '{"email_notifications": true, "daily_digest": false, "popup_notifications": true, "show_unread_count": true, "daily_reminder_enabled": false, "daily_reminder_time": "09:00", "weekly_start_summary": false, "weekly_end_summary": false}'::jsonb;
