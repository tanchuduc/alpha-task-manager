-- ============================================================================
-- ALPHA WORK LITE — Migration 009: Dedicated Realtime Project Chat Stream
-- Schema: alpha_lite
-- ============================================================================

-- 1. BẢNG TIN NHẮN DỰ ÁN TRỰC TUYẾN (PROJECT CHAT MESSAGES)
CREATE TABLE IF NOT EXISTS alpha_lite.project_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES alpha_lite.projects(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES alpha_lite.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  attachment_url TEXT,
  attachment_name TEXT,
  reply_to_id UUID REFERENCES alpha_lite.project_messages(id) ON DELETE SET NULL,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  edited_at TIMESTAMPTZ,
  reactions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. BẢNG TRẠNG THÁI ĐÃ ĐỌC CỦA TỪNG NHÂN SỰ TRÊN TỪNG DỰ ÁN
CREATE TABLE IF NOT EXISTS alpha_lite.project_chat_read_states (
  user_id UUID NOT NULL REFERENCES alpha_lite.profiles(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES alpha_lite.projects(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, project_id)
);

-- 3. INDEXES TỐI ƯU TRUY VẤN
CREATE INDEX IF NOT EXISTS idx_pm_project ON alpha_lite.project_messages(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pm_pinned ON alpha_lite.project_messages(project_id) WHERE is_pinned = true;
CREATE INDEX IF NOT EXISTS idx_pcrs_user ON alpha_lite.project_chat_read_states(user_id);

-- 4. RLS POLICIES
ALTER TABLE alpha_lite.project_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE alpha_lite.project_chat_read_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pm_active_staff" ON alpha_lite.project_messages;
CREATE POLICY "pm_active_staff" ON alpha_lite.project_messages
  FOR ALL USING (alpha_lite.is_active_staff());

DROP POLICY IF EXISTS "pcrs_own_state" ON alpha_lite.project_chat_read_states;
CREATE POLICY "pcrs_own_state" ON alpha_lite.project_chat_read_states
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. BẬT SUPABASE REALTIME & REPLICA IDENTITY FULL
ALTER TABLE alpha_lite.project_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'alpha_lite' AND tablename = 'project_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE alpha_lite.project_messages;
  END IF;
END $$;
