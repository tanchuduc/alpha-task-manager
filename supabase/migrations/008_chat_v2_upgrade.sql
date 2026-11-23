-- ============================================================================
-- ALPHA WORK LITE — Migration 008: Realtime Chat 2.0 (Replies, Reactions, Edit/Unsend, Pins & Channel Read States)
-- Schema: alpha_lite
-- ============================================================================

-- 1. Mở rộng bảng direct_messages (Tin nhắn 1-1)
ALTER TABLE alpha_lite.direct_messages
  ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES alpha_lite.direct_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reactions JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 2. Mở rộng bảng channel_messages (Tin nhắn Phòng ban)
ALTER TABLE alpha_lite.channel_messages
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reactions JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 3. Bảng theo dõi trạng thái đọc của từng nhân sự trên các kênh phòng ban
CREATE TABLE IF NOT EXISTS alpha_lite.channel_read_states (
  user_id UUID NOT NULL REFERENCES alpha_lite.profiles(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES alpha_lite.departments(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, department_id)
);

CREATE INDEX IF NOT EXISTS idx_dm_pinned ON alpha_lite.direct_messages(sender_id, receiver_id) WHERE is_pinned = true;
CREATE INDEX IF NOT EXISTS idx_cm_pinned ON alpha_lite.channel_messages(department_id) WHERE is_pinned = true;
CREATE INDEX IF NOT EXISTS idx_crs_user ON alpha_lite.channel_read_states(user_id);

-- 4. RLS cho channel_read_states
ALTER TABLE alpha_lite.channel_read_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crs_own_state" ON alpha_lite.channel_read_states;
CREATE POLICY "crs_own_state" ON alpha_lite.channel_read_states
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. Bật REPLICA IDENTITY FULL cho direct_messages và channel_messages để Realtime UPDATE trả về đầy đủ dữ liệu
ALTER TABLE alpha_lite.direct_messages REPLICA IDENTITY FULL;
ALTER TABLE alpha_lite.channel_messages REPLICA IDENTITY FULL;
