-- ============================================================================
-- ALPHA WORK LITE — Migration 011: Unified Chat & Collaboration Schema
-- Phân hệ: Direct Chat 1:1, Group Chat tự do & Project Chat
-- Schema: alpha_lite
-- ============================================================================

-- 1. BẢNG CUỘC TRÒ CHUYỆN HỢP NHẤT (CONVERSATIONS)
-- Hỗ trợ đúng 3 loại hội thoại: 'direct' (1:1), 'group' (nhóm tự do), 'project' (dự án)
CREATE TABLE IF NOT EXISTS alpha_lite.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('direct', 'group', 'project')),
  title TEXT,                                        -- Tên nhóm hoặc tên dự án (null với 1:1)
  avatar_url TEXT,                                   -- Ảnh đại diện nhóm (null với 1:1 hoặc project)
  description TEXT,                                  -- Mô tả nhóm hoặc mục tiêu trao đổi
  project_id UUID REFERENCES alpha_lite.projects(id) ON DELETE CASCADE, -- Khóa ngoại nếu là project chat
  created_by UUID REFERENCES alpha_lite.profiles(id) ON DELETE SET NULL,
  is_archived BOOLEAN NOT NULL DEFAULT false,        -- Chế độ lưu trữ / chỉ đọc khi dự án đóng
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,       -- Dữ liệu tùy biến mở rộng
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ràng buộc mỗi dự án chỉ có duy nhất 1 cuộc trò chuyện chính
CREATE UNIQUE INDEX IF NOT EXISTS idx_conv_unique_project 
  ON alpha_lite.conversations(project_id) 
  WHERE type = 'project';

-- 2. BẢNG THÀNH VIÊN CUỘC TRÒ CHUYỆN (CONVERSATION MEMBERS)
-- Quản lý danh sách người tham gia, phân quyền nhóm, trạng thái đã đọc và cài đặt cá nhân
CREATE TABLE IF NOT EXISTS alpha_lite.conversation_members (
  conversation_id UUID NOT NULL REFERENCES alpha_lite.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES alpha_lite.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),  -- Dấu mốc thời gian để tính số tin chưa đọc
  is_pinned BOOLEAN NOT NULL DEFAULT false,          -- Ghim cuộc hội thoại lên đầu danh sách
  is_muted BOOLEAN NOT NULL DEFAULT false,           -- Tắt chuông thông báo
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

-- 3. BẢNG TIN NHẮN HỢP NHẤT (MESSAGES)
-- Lưu trữ mọi tin nhắn với đa dạng thể loại: văn bản thường, thẻ task card, tệp đính kèm, sự kiện hệ thống
CREATE TABLE IF NOT EXISTS alpha_lite.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES alpha_lite.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES alpha_lite.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'task_card', 'file', 'system_event')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,       -- Lưu snapshot Task Card hoặc chi tiết sự kiện
  reply_to_id UUID REFERENCES alpha_lite.messages(id) ON DELETE SET NULL,
  is_pinned BOOLEAN NOT NULL DEFAULT false,          -- Ghim tin nhắn quan trọng trong hội thoại
  is_deleted BOOLEAN NOT NULL DEFAULT false,         -- Thu hồi tin nhắn (Soft-delete)
  edited_at TIMESTAMPTZ,                             -- Thời điểm chỉnh sửa nội dung
  reactions JSONB NOT NULL DEFAULT '{}'::jsonb,      -- Cảm xúc: { "👍": ["uid1", "uid2"], "❤️": ["uid3"] }
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. BẢNG TỆP ĐÍNH KÈM TIN NHẮN (MESSAGE ATTACHMENTS)
-- Quản lý siêu dữ liệu tệp tin đính kèm an toàn
CREATE TABLE IF NOT EXISTS alpha_lite.message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES alpha_lite.messages(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  storage_path TEXT NOT NULL,                        -- Đường dẫn tệp trong Private Storage Bucket
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. BẢNG LIÊN KẾT CHAT ↔ TASK (TASK CHAT LINKS)
-- Cầu nối khóa ngoại 2 chiều phục vụ tra cứu ngược từ Task Drawer về tin nhắn gốc
CREATE TABLE IF NOT EXISTS alpha_lite.task_chat_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES alpha_lite.tasks(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES alpha_lite.conversations(id) ON DELETE CASCADE,
  message_id UUID REFERENCES alpha_lite.messages(id) ON DELETE SET NULL,
  created_by UUID REFERENCES alpha_lite.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- INDEXES TỐI ƯU HIỆU NĂNG TRUY VẤN
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_conv_type ON alpha_lite.conversations(type);
CREATE INDEX IF NOT EXISTS idx_conv_updated ON alpha_lite.conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_cmem_user ON alpha_lite.conversation_members(user_id, last_read_at);
CREATE INDEX IF NOT EXISTS idx_cmem_conv ON alpha_lite.conversation_members(conversation_id);
CREATE INDEX IF NOT EXISTS idx_cmem_pinned ON alpha_lite.conversation_members(user_id) WHERE is_pinned = true;
CREATE INDEX IF NOT EXISTS idx_msg_conv_created ON alpha_lite.messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_pinned ON alpha_lite.messages(conversation_id) WHERE is_pinned = true;
CREATE INDEX IF NOT EXISTS idx_matt_msg ON alpha_lite.message_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_tcl_task ON alpha_lite.task_chat_links(task_id);
CREATE INDEX IF NOT EXISTS idx_tcl_conv ON alpha_lite.task_chat_links(conversation_id);

-- ============================================================================
-- TRIGGER TỰ ĐỘNG CẬP NHẬT CONVERSATION.UPDATED_AT KHI CÓ TIN MỚI
-- ============================================================================
CREATE OR REPLACE FUNCTION alpha_lite.handle_new_message_conversation_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE alpha_lite.conversations
  SET updated_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_conversation_timestamp ON alpha_lite.messages;
CREATE TRIGGER trg_update_conversation_timestamp
  AFTER INSERT ON alpha_lite.messages
  FOR EACH ROW
  EXECUTE FUNCTION alpha_lite.handle_new_message_conversation_update();

-- ============================================================================
-- RLS POLICIES BẢO MẬT ĐA TẦNG (ROW LEVEL SECURITY)
-- ============================================================================
ALTER TABLE alpha_lite.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE alpha_lite.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE alpha_lite.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE alpha_lite.message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE alpha_lite.task_chat_links ENABLE ROW LEVEL SECURITY;

-- 1. Policies cho conversations:
DROP POLICY IF EXISTS "conv_read_access" ON alpha_lite.conversations;
CREATE POLICY "conv_read_access" ON alpha_lite.conversations
  FOR SELECT USING (
    -- Thành viên có tên trong cuộc trò chuyện
    EXISTS (
      SELECT 1 FROM alpha_lite.conversation_members cm
      WHERE cm.conversation_id = conversations.id
        AND cm.user_id = auth.uid()
    )
    -- Hoặc thành viên của dự án (nếu là project chat)
    OR (
      conversations.type = 'project'
      AND EXISTS (
        SELECT 1 FROM alpha_lite.project_members pm
        WHERE pm.project_id = conversations.project_id
          AND pm.user_id = auth.uid()
      )
    )
    -- Hoặc Quản trị viên hệ thống
    OR alpha_lite.is_admin()
  );

DROP POLICY IF EXISTS "conv_insert_access" ON alpha_lite.conversations;
CREATE POLICY "conv_insert_access" ON alpha_lite.conversations
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND alpha_lite.is_active_staff()
  );

DROP POLICY IF EXISTS "conv_update_access" ON alpha_lite.conversations;
CREATE POLICY "conv_update_access" ON alpha_lite.conversations
  FOR UPDATE USING (
    -- Chủ nhóm hoặc Admin của hội thoại
    EXISTS (
      SELECT 1 FROM alpha_lite.conversation_members cm
      WHERE cm.conversation_id = conversations.id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
    )
    OR alpha_lite.is_admin()
  );

-- 2. Policies cho conversation_members:
DROP POLICY IF EXISTS "cmem_select_access" ON alpha_lite.conversation_members;
CREATE POLICY "cmem_select_access" ON alpha_lite.conversation_members
  FOR SELECT USING (
    -- Người dùng tự xem trạng thái của mình hoặc xem bạn bè cùng nhóm
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM alpha_lite.conversation_members my_mem
      WHERE my_mem.conversation_id = conversation_members.conversation_id
        AND my_mem.user_id = auth.uid()
    )
    OR alpha_lite.is_admin()
  );

DROP POLICY IF EXISTS "cmem_insert_access" ON alpha_lite.conversation_members;
CREATE POLICY "cmem_insert_access" ON alpha_lite.conversation_members
  FOR INSERT WITH CHECK (
    -- Tự thêm bản thân vào hội thoại mới
    user_id = auth.uid()
    -- Hoặc Chủ nhóm / Admin thêm thành viên
    OR EXISTS (
      SELECT 1 FROM alpha_lite.conversation_members cm
      WHERE cm.conversation_id = conversation_members.conversation_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
    )
    -- Hoặc Trưởng dự án đồng bộ thành viên dự án
    OR alpha_lite.is_admin_or_manager()
  );

DROP POLICY IF EXISTS "cmem_update_access" ON alpha_lite.conversation_members;
CREATE POLICY "cmem_update_access" ON alpha_lite.conversation_members
  FOR UPDATE USING (
    -- Người dùng tự cập nhật trạng thái đọc, ghim, tắt chuông của mình
    user_id = auth.uid()
    -- Hoặc Owner/Admin thay đổi vai trò
    OR EXISTS (
      SELECT 1 FROM alpha_lite.conversation_members cm
      WHERE cm.conversation_id = conversation_members.conversation_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "cmem_delete_access" ON alpha_lite.conversation_members;
CREATE POLICY "cmem_delete_access" ON alpha_lite.conversation_members
  FOR DELETE USING (
    -- Tự rời nhóm
    user_id = auth.uid()
    -- Hoặc Owner/Admin xóa thành viên
    OR EXISTS (
      SELECT 1 FROM alpha_lite.conversation_members cm
      WHERE cm.conversation_id = conversation_members.conversation_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
    )
    OR alpha_lite.is_admin()
  );

-- 3. Policies cho messages:
DROP POLICY IF EXISTS "msg_select_access" ON alpha_lite.messages;
CREATE POLICY "msg_select_access" ON alpha_lite.messages
  FOR SELECT USING (
    -- Thành viên của hội thoại
    EXISTS (
      SELECT 1 FROM alpha_lite.conversation_members cm
      WHERE cm.conversation_id = messages.conversation_id
        AND cm.user_id = auth.uid()
    )
    -- Hoặc thành viên của dự án (nếu là project chat)
    OR EXISTS (
      SELECT 1 FROM alpha_lite.conversations c
      JOIN alpha_lite.project_members pm ON pm.project_id = c.project_id
      WHERE c.id = messages.conversation_id
        AND c.type = 'project'
        AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "msg_insert_access" ON alpha_lite.messages;
CREATE POLICY "msg_insert_access" ON alpha_lite.messages
  FOR INSERT WITH CHECK (
    -- Người gửi phải chính là người dùng đang đăng nhập (chống mạo danh sender_id)
    auth.uid() = sender_id
    AND (
      -- Và phải là thành viên hợp lệ của hội thoại
      EXISTS (
        SELECT 1 FROM alpha_lite.conversation_members cm
        WHERE cm.conversation_id = messages.conversation_id
          AND cm.user_id = auth.uid()
      )
      -- Hoặc thành viên dự án
      OR EXISTS (
        SELECT 1 FROM alpha_lite.conversations c
        JOIN alpha_lite.project_members pm ON pm.project_id = c.project_id
        WHERE c.id = messages.conversation_id
          AND c.type = 'project'
          AND pm.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "msg_update_access" ON alpha_lite.messages;
CREATE POLICY "msg_update_access" ON alpha_lite.messages
  FOR UPDATE USING (
    -- Chỉ chính người gửi mới có quyền sửa hoặc thu hồi tin của mình
    auth.uid() = sender_id
    -- Hoặc thành viên nhóm có quyền thả reaction / ghim tin
    OR EXISTS (
      SELECT 1 FROM alpha_lite.conversation_members cm
      WHERE cm.conversation_id = messages.conversation_id
        AND cm.user_id = auth.uid()
    )
  );

-- 4. Policies cho message_attachments:
DROP POLICY IF EXISTS "matt_access" ON alpha_lite.message_attachments;
CREATE POLICY "matt_access" ON alpha_lite.message_attachments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM alpha_lite.messages m
      JOIN alpha_lite.conversation_members cm ON cm.conversation_id = m.conversation_id
      WHERE m.id = message_attachments.message_id
        AND cm.user_id = auth.uid()
    )
    OR alpha_lite.is_admin()
  );

-- 5. Policies cho task_chat_links:
DROP POLICY IF EXISTS "tcl_access" ON alpha_lite.task_chat_links;
CREATE POLICY "tcl_access" ON alpha_lite.task_chat_links
  FOR ALL USING (alpha_lite.is_active_staff());

-- ============================================================================
-- BẬT SUPABASE REALTIME & REPLICA IDENTITY FULL CHO CÁC BẢNG MỚI
-- ============================================================================
ALTER TABLE alpha_lite.conversations REPLICA IDENTITY FULL;
ALTER TABLE alpha_lite.conversation_members REPLICA IDENTITY FULL;
ALTER TABLE alpha_lite.messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'alpha_lite' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE alpha_lite.conversations;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'alpha_lite' AND tablename = 'conversation_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE alpha_lite.conversation_members;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'alpha_lite' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE alpha_lite.messages;
  END IF;
END $$;
