-- ============================================================================
-- ALPHA WORK LITE — Migration 012: Data Backfill Script (Idempotent)
-- Chuyển đổi dữ liệu lịch sử từ direct_messages, channel_messages, project_messages
-- sang schema hợp nhất: conversations, conversation_members, messages
-- ============================================================================

DO $$
DECLARE
  v_pair RECORD;
  v_conv_id UUID;
  v_proj RECORD;
  v_dept RECORD;
BEGIN
  -- --------------------------------------------------------------------------
  -- 1. BACKFILL CUỘC HỘI THOẠI 1-1 (DIRECT MESSAGES)
  -- --------------------------------------------------------------------------
  FOR v_pair IN
    SELECT DISTINCT
      LEAST(sender_id, receiver_id) AS user_a,
      GREATEST(sender_id, receiver_id) AS user_b
    FROM alpha_lite.direct_messages
  LOOP
    -- Tìm xem cuộc hội thoại 1-1 giữa 2 người này đã được tạo chưa
    SELECT c.id INTO v_conv_id
    FROM alpha_lite.conversations c
    JOIN alpha_lite.conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = v_pair.user_a
    JOIN alpha_lite.conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = v_pair.user_b
    WHERE c.type = 'direct'
    LIMIT 1;

    -- Nếu chưa có thì tạo mới cuộc hội thoại 1-1
    IF v_conv_id IS NULL THEN
      INSERT INTO alpha_lite.conversations (type, created_at, updated_at)
      VALUES ('direct', now(), now())
      RETURNING id INTO v_conv_id;

      -- Thêm 2 nhân sự vào danh sách thành viên
      INSERT INTO alpha_lite.conversation_members (conversation_id, user_id, role, last_read_at, joined_at)
      VALUES
        (v_conv_id, v_pair.user_a, 'member', now(), now()),
        (v_conv_id, v_pair.user_b, 'member', now(), now())
      ON CONFLICT (conversation_id, user_id) DO NOTHING;
    END IF;

    -- Chuyển toàn bộ tin nhắn 1-1 của cặp này vào bảng messages mới
    INSERT INTO alpha_lite.messages (
      id,
      conversation_id,
      sender_id,
      content,
      message_type,
      metadata,
      reply_to_id,
      is_pinned,
      is_deleted,
      edited_at,
      reactions,
      created_at
    )
    SELECT
      dm.id,
      v_conv_id,
      dm.sender_id,
      COALESCE(dm.content, ''),
      'text',
      '{}'::jsonb,
      dm.reply_to_id,
      COALESCE(dm.is_pinned, false),
      COALESCE(dm.is_deleted, false),
      dm.edited_at,
      COALESCE(dm.reactions, '{}'::jsonb),
      dm.created_at
    FROM alpha_lite.direct_messages dm
    WHERE (
      (dm.sender_id = v_pair.user_a AND dm.receiver_id = v_pair.user_b)
      OR
      (dm.sender_id = v_pair.user_b AND dm.receiver_id = v_pair.user_a)
    )
    ON CONFLICT (id) DO NOTHING;

    -- Nếu có tệp đính kèm trong direct_messages, lưu sang message_attachments
    INSERT INTO alpha_lite.message_attachments (
      message_id,
      file_name,
      storage_path,
      created_at
    )
    SELECT
      dm.id,
      COALESCE(dm.attachment_name, 'Tệp đính kèm'),
      COALESCE(dm.attachment_url, ''),
      dm.created_at
    FROM alpha_lite.direct_messages dm
    WHERE (
      (dm.sender_id = v_pair.user_a AND dm.receiver_id = v_pair.user_b)
      OR
      (dm.sender_id = v_pair.user_b AND dm.receiver_id = v_pair.user_a)
    )
    AND (dm.attachment_url IS NOT NULL AND dm.attachment_url <> '')
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- --------------------------------------------------------------------------
  -- 2. BACKFILL CUỘC HỘI THOẠI DỰ ÁN (PROJECT CHAT)
  -- --------------------------------------------------------------------------
  FOR v_proj IN
    SELECT id, name, created_by, status, created_at, updated_at
    FROM alpha_lite.projects
  LOOP
    -- Tìm xem dự án đã có conversation chưa
    SELECT id INTO v_conv_id
    FROM alpha_lite.conversations
    WHERE project_id = v_proj.id AND type = 'project'
    LIMIT 1;

    IF v_conv_id IS NULL THEN
      INSERT INTO alpha_lite.conversations (
        type,
        title,
        project_id,
        created_by,
        is_archived,
        created_at,
        updated_at
      )
      VALUES (
        'project',
        v_proj.name,
        v_proj.id,
        v_proj.created_by,
        (v_proj.status = 'archived'),
        v_proj.created_at,
        v_proj.updated_at
      )
      RETURNING id INTO v_conv_id;
    END IF;

    -- Đồng bộ toàn bộ project_members của dự án vào conversation_members
    INSERT INTO alpha_lite.conversation_members (
      conversation_id,
      user_id,
      role,
      last_read_at,
      joined_at
    )
    SELECT
      v_conv_id,
      pm.user_id,
      'member',
      now(),
      pm.created_at
    FROM alpha_lite.project_members pm
    WHERE pm.project_id = v_proj.id
    ON CONFLICT (conversation_id, user_id) DO NOTHING;

    -- Chuyển toàn bộ project_messages cũ sang messages mới
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'alpha_lite' AND table_name = 'project_messages') THEN
      INSERT INTO alpha_lite.messages (
        id,
        conversation_id,
        sender_id,
        content,
        message_type,
        metadata,
        reply_to_id,
        is_pinned,
        is_deleted,
        edited_at,
        reactions,
        created_at
      )
      SELECT
        pm.id,
        v_conv_id,
        pm.author_id,
        COALESCE(pm.content, ''),
        'text',
        '{}'::jsonb,
        pm.reply_to_id,
        COALESCE(pm.is_pinned, false),
        COALESCE(pm.is_deleted, false),
        pm.edited_at,
        COALESCE(pm.reactions, '{}'::jsonb),
        pm.created_at
      FROM alpha_lite.project_messages pm
      WHERE pm.project_id = v_proj.id
      ON CONFLICT (id) DO NOTHING;

      -- Đính kèm file của project_messages
      INSERT INTO alpha_lite.message_attachments (
        message_id,
        file_name,
        storage_path,
        created_at
      )
      SELECT
        pm.id,
        COALESCE(pm.attachment_name, 'Tệp đính kèm'),
        COALESCE(pm.attachment_url, ''),
        pm.created_at
      FROM alpha_lite.project_messages pm
      WHERE pm.project_id = v_proj.id
        AND (pm.attachment_url IS NOT NULL AND pm.attachment_url <> '')
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  -- --------------------------------------------------------------------------
  -- 3. BẢO TỒN LỊCH SỬ TIN NHẮN PHÒNG BAN CŨ (CHUYỂN THÀNH GROUP CHAT THƯỜNG)
  -- Không duy trì loại phòng ban cứng, nhưng bảo toàn lịch sử cũ thành các nhóm tự do
  -- --------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'alpha_lite' AND table_name = 'channel_messages') THEN
    FOR v_dept IN
      SELECT DISTINCT d.id, d.name, d.description
      FROM alpha_lite.departments d
      JOIN alpha_lite.channel_messages cm ON cm.department_id = d.id
    LOOP
      -- Tạo một group chat thông thường mang tên phòng ban
      INSERT INTO alpha_lite.conversations (
        type,
        title,
        description,
        is_archived,
        created_at,
        updated_at
      )
      VALUES (
        'group',
        'Nhóm ' || v_dept.name,
        COALESCE(v_dept.description, 'Lịch sử thảo luận trước đây'),
        false,
        now(),
        now()
      )
      RETURNING id INTO v_conv_id;

      -- Thêm các nhân viên thuộc phòng ban đó vào nhóm
      INSERT INTO alpha_lite.conversation_members (
        conversation_id,
        user_id,
        role,
        last_read_at,
        joined_at
      )
      SELECT
        v_conv_id,
        p.id,
        'member',
        now(),
        now()
      FROM alpha_lite.profiles p
      WHERE p.department_id = v_dept.id
      ON CONFLICT (conversation_id, user_id) DO NOTHING;

      -- Chuyển tin nhắn của channel_messages sang messages
      INSERT INTO alpha_lite.messages (
        id,
        conversation_id,
        sender_id,
        content,
        message_type,
        metadata,
        reply_to_id,
        is_pinned,
        is_deleted,
        edited_at,
        reactions,
        created_at
      )
      SELECT
        cm.id,
        v_conv_id,
        cm.author_id,
        COALESCE(cm.content, ''),
        'text',
        '{}'::jsonb,
        cm.parent_id,
        COALESCE(cm.is_pinned, false),
        COALESCE(cm.is_deleted, false),
        cm.edited_at,
        COALESCE(cm.reactions, '{}'::jsonb),
        cm.created_at
      FROM alpha_lite.channel_messages cm
      WHERE cm.department_id = v_dept.id
      ON CONFLICT (id) DO NOTHING;
    END LOOP;
  END IF;

END $$;
