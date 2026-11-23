-- ============================================================================
-- ALPHA WORK LITE — Migration 002: Collaboration, Realtime Chat & Audit Trail
-- Schema: alpha_lite
-- ============================================================================

-- 1. TIN NHẮN TRỰC TIẾP 1-1 (DIRECT MESSAGES)
CREATE TABLE IF NOT EXISTS alpha_lite.direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES alpha_lite.profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES alpha_lite.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  attachment_url TEXT,
  attachment_name TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. TIN NHẮN PHÒNG BAN / KÊNH NHÓM (CHANNEL MESSAGES)
CREATE TABLE IF NOT EXISTS alpha_lite.channel_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES alpha_lite.departments(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES alpha_lite.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  attachment_url TEXT,
  attachment_name TEXT,
  parent_id UUID REFERENCES alpha_lite.channel_messages(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. BÀI ĐĂNG CẬP NHẬT & THẢO LUẬN DỰ ÁN (PROJECT UPDATES / DISCUSSIONS)
CREATE TABLE IF NOT EXISTS alpha_lite.project_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES alpha_lite.projects(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES alpha_lite.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. BÌNH LUẬN THEO LUỒNG CỦA BÀI CẬP NHẬT DỰ ÁN (UPDATE COMMENTS)
CREATE TABLE IF NOT EXISTS alpha_lite.project_update_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  update_id UUID NOT NULL REFERENCES alpha_lite.project_updates(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES alpha_lite.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. BIỂU CẢM CẢM XÚC (REACTIONS)
CREATE TABLE IF NOT EXISTS alpha_lite.project_update_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  update_id UUID NOT NULL REFERENCES alpha_lite.project_updates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES alpha_lite.profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(update_id, user_id, emoji)
);

-- 6. NHẬT KÝ HOẠT ĐỘNG & LỊCH SỬ THAY ĐỔI CÔNG VIỆC (TASK ACTIVITY LOGS)
CREATE TABLE IF NOT EXISTS alpha_lite.task_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES alpha_lite.tasks(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES alpha_lite.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL, -- 'created', 'status_changed', 'due_date_changed', 'priority_changed', 'assignee_added', 'assignee_removed', 'description_changed', 'attachment_added', 'subtask_created'
  details JSONB NOT NULL DEFAULT '{}'::jsonb, -- { old_value, new_value, label }
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. TRƯỜNG DỮ LIỆU TÙY BIẾN CHO DỰ ÁN SÁCH (PROJECT CUSTOM FIELDS)
CREATE TABLE IF NOT EXISTS alpha_lite.project_custom_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES alpha_lite.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('text', 'number', 'dropdown', 'date')),
  options TEXT[] DEFAULT '{}', -- Danh sách lựa chọn nếu là dropdown
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. GIÁ TRỊ TRƯỜNG TÙY BIẾN THEO TASK (TASK CUSTOM FIELD VALUES)
CREATE TABLE IF NOT EXISTS alpha_lite.task_custom_field_values (
  task_id UUID NOT NULL REFERENCES alpha_lite.tasks(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES alpha_lite.project_custom_fields(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, field_id)
);

-- ============================================================================
-- INDEXES TỐI ƯU TRUY VẤN
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_dm_pair ON alpha_lite.direct_messages(sender_id, receiver_id);
CREATE INDEX IF NOT EXISTS idx_dm_receiver_unread ON alpha_lite.direct_messages(receiver_id, is_read);
CREATE INDEX IF NOT EXISTS idx_cm_dept ON alpha_lite.channel_messages(department_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pu_project ON alpha_lite.project_updates(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tal_task ON alpha_lite.task_activity_logs(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pcf_project ON alpha_lite.project_custom_fields(project_id);

-- ============================================================================
-- RLS POLICIES (ALPHA_LITE)
-- ============================================================================
ALTER TABLE alpha_lite.direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE alpha_lite.channel_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE alpha_lite.project_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE alpha_lite.project_update_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE alpha_lite.project_update_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE alpha_lite.task_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE alpha_lite.project_custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE alpha_lite.task_custom_field_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dm_participants" ON alpha_lite.direct_messages;
CREATE POLICY "dm_participants" ON alpha_lite.direct_messages
  FOR ALL USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS "cm_active_staff" ON alpha_lite.channel_messages;
CREATE POLICY "cm_active_staff" ON alpha_lite.channel_messages
  FOR ALL USING (alpha_lite.is_active_staff());

DROP POLICY IF EXISTS "pu_active_staff" ON alpha_lite.project_updates;
CREATE POLICY "pu_active_staff" ON alpha_lite.project_updates
  FOR ALL USING (alpha_lite.is_active_staff());

DROP POLICY IF EXISTS "puc_active_staff" ON alpha_lite.project_update_comments;
CREATE POLICY "puc_active_staff" ON alpha_lite.project_update_comments
  FOR ALL USING (alpha_lite.is_active_staff());

DROP POLICY IF EXISTS "pur_active_staff" ON alpha_lite.project_update_reactions;
CREATE POLICY "pur_active_staff" ON alpha_lite.project_update_reactions
  FOR ALL USING (alpha_lite.is_active_staff());

DROP POLICY IF EXISTS "tal_active_staff" ON alpha_lite.task_activity_logs;
CREATE POLICY "tal_active_staff" ON alpha_lite.task_activity_logs
  FOR ALL USING (alpha_lite.is_active_staff());

DROP POLICY IF EXISTS "pcf_active_staff" ON alpha_lite.project_custom_fields;
CREATE POLICY "pcf_active_staff" ON alpha_lite.project_custom_fields
  FOR ALL USING (alpha_lite.is_active_staff());

DROP POLICY IF EXISTS "tcfv_active_staff" ON alpha_lite.task_custom_field_values;
CREATE POLICY "tcfv_active_staff" ON alpha_lite.task_custom_field_values
  FOR ALL USING (alpha_lite.is_active_staff());

-- ============================================================================
-- BẬT SUPABASE REALTIME CHO CÁC BẢNG MỚI
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'alpha_lite' AND tablename = 'direct_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE alpha_lite.direct_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'alpha_lite' AND tablename = 'channel_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE alpha_lite.channel_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'alpha_lite' AND tablename = 'project_updates'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE alpha_lite.project_updates;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'alpha_lite' AND tablename = 'project_update_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE alpha_lite.project_update_comments;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'alpha_lite' AND tablename = 'project_update_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE alpha_lite.project_update_reactions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'alpha_lite' AND tablename = 'task_activity_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE alpha_lite.task_activity_logs;
  END IF;
END $$;
