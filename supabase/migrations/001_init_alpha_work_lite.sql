-- ============================================================================
-- ALPHA WORK LITE — Schema tách biệt `alpha_lite` trên Supabase PostgreSQL
-- An toàn tuyệt đối khi dùng chung project Supabase với Alpha Books OS (`public`)
-- và không đụng chạm dữ liệu cũ (`alpha_work`).
-- Chạy 1 lần trong Supabase SQL Editor.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS alpha_lite;

-- Cấp quyền truy cập schema cho PostgREST (Supabase Data API)
GRANT USAGE ON SCHEMA alpha_lite TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA alpha_lite TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA alpha_lite TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA alpha_lite TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA alpha_lite
  GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA alpha_lite
  GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA alpha_lite
  GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;

-- 1. PHÒNG BAN / KHỐI NỘI BỘ
CREATE TABLE IF NOT EXISTS alpha_lite.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  code TEXT,
  description TEXT,
  parent_id UUID REFERENCES alpha_lite.departments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT check_departments_not_self_parent CHECK (id != parent_id)
);
CREATE INDEX IF NOT EXISTS idx_alpha_lite_departments_parent_id ON alpha_lite.departments(parent_id);

-- 2. HỒ SƠ NHÂN SỰ (1-1 với auth.users)
CREATE TABLE IF NOT EXISTS alpha_lite.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'manager', 'member')),
  job_title TEXT,
  department_id UUID REFERENCES alpha_lite.departments(id) ON DELETE SET NULL,
  manager_id UUID REFERENCES alpha_lite.profiles(id) ON DELETE SET NULL,
  telegram_chat_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT check_profiles_not_self_manager CHECK (id != manager_id)
);
CREATE INDEX IF NOT EXISTS idx_alpha_lite_profiles_manager_id ON alpha_lite.profiles(manager_id);

-- 3. DỰ ÁN
CREATE TABLE IF NOT EXISTS alpha_lite.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#F26522',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  department_id UUID REFERENCES alpha_lite.departments(id) ON DELETE SET NULL,
  start_date DATE,
  due_date DATE,
  created_by UUID REFERENCES alpha_lite.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. THÀNH VIÊN DỰ ÁN
CREATE TABLE IF NOT EXISTS alpha_lite.project_members (
  project_id UUID NOT NULL REFERENCES alpha_lite.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES alpha_lite.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);

-- 5. CỘT TRẠNG THÁI CÔNG VIỆC THEO DỰ ÁN
CREATE TABLE IF NOT EXISTS alpha_lite.task_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES alpha_lite.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#64748B',
  category TEXT NOT NULL DEFAULT 'todo' CHECK (category IN ('todo', 'doing', 'done')),
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. CÔNG VIỆC & CÔNG VIỆC CON (SUBTASK)
CREATE TABLE IF NOT EXISTS alpha_lite.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES alpha_lite.projects(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES alpha_lite.tasks(id) ON DELETE CASCADE,
  status_id UUID REFERENCES alpha_lite.task_statuses(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  start_date DATE,
  due_date DATE,
  completed_at TIMESTAMPTZ,
  position DOUBLE PRECISION NOT NULL DEFAULT 1000,
  created_by UUID REFERENCES alpha_lite.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. PHÂN CÔNG NGƯỜI THỰC HIỆN
CREATE TABLE IF NOT EXISTS alpha_lite.task_assignees (
  task_id UUID NOT NULL REFERENCES alpha_lite.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES alpha_lite.profiles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);

-- 8 & 9. NHÃN PHÂN LOẠI
CREATE TABLE IF NOT EXISTS alpha_lite.labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES alpha_lite.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#F26522',
  UNIQUE (project_id, name)
);

CREATE TABLE IF NOT EXISTS alpha_lite.task_labels (
  task_id UUID NOT NULL REFERENCES alpha_lite.tasks(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES alpha_lite.labels(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, label_id)
);

-- 10. BÌNH LUẬN CÔNG VIỆC
CREATE TABLE IF NOT EXISTS alpha_lite.task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES alpha_lite.tasks(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES alpha_lite.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  mentioned_user_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. TỆP ĐÍNH KÈM & LIÊN KẾT (Supabase Storage / Google Drive / Google Sheet / Lark)
CREATE TABLE IF NOT EXISTS alpha_lite.task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES alpha_lite.tasks(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES alpha_lite.profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  storage_path TEXT,
  attachment_type TEXT NOT NULL DEFAULT 'file' CHECK (attachment_type IN ('file', 'gdrive', 'gsheet', 'lark', 'link')),
  file_size BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 12. VIỆC CẦN LÀM CÁ NHÂN (PERSONAL TODOS)
CREATE TABLE IF NOT EXISTS alpha_lite.personal_todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES alpha_lite.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_done BOOLEAN NOT NULL DEFAULT false,
  due_date DATE,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13. HỘP THƯ THÔNG BÁO NỘI BỘ (INBOX)
CREATE TABLE IF NOT EXISTS alpha_lite.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES alpha_lite.profiles(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES alpha_lite.profiles(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('task_assigned', 'task_mentioned', 'task_commented', 'task_status_changed', 'project_added')),
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 14 & 15. MẪU DỰ ÁN & ĐẦU VIỆC MẪU (PROJECT TEMPLATES)
CREATE TABLE IF NOT EXISTS alpha_lite.project_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#F26522',
  category TEXT NOT NULL DEFAULT 'Vận hành',
  created_by UUID REFERENCES alpha_lite.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alpha_lite.project_template_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES alpha_lite.project_templates(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status_category TEXT NOT NULL DEFAULT 'todo' CHECK (status_category IN ('todo', 'doing', 'done')),
  offset_days INT NOT NULL DEFAULT 0,
  position INT NOT NULL DEFAULT 0
);

-- 16. CẤU HÌNH WEBHOOK THÔNG BÁO (TELEGRAM BOT / LARK SUITE)
CREATE TABLE IF NOT EXISTS alpha_lite.webhook_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('telegram', 'lark')),
  project_id UUID REFERENCES alpha_lite.projects(id) ON DELETE CASCADE,
  webhook_url TEXT,
  telegram_bot_token TEXT,
  telegram_chat_id TEXT,
  events TEXT[] NOT NULL DEFAULT ARRAY['task_assigned', 'task_mentioned', 'task_completed'],
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES alpha_lite.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- INDEXES TỐI ƯU HIỆU NĂNG TRUY VẤN
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_al_tasks_project_id ON alpha_lite.tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_al_tasks_status_id ON alpha_lite.tasks(status_id);
CREATE INDEX IF NOT EXISTS idx_al_tasks_parent_id ON alpha_lite.tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_al_tasks_due_date ON alpha_lite.tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_al_task_assignees_user_id ON alpha_lite.task_assignees(user_id);
CREATE INDEX IF NOT EXISTS idx_al_task_comments_task_id ON alpha_lite.task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_al_notifications_user_unread ON alpha_lite.notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_al_personal_todos_user ON alpha_lite.personal_todos(user_id);

-- ============================================================================
-- TRIGGERS TỰ ĐỘNG HÓA (TÊN RIÊNG ĐỂ KHÔNG ĐỤNG TRIGGER CỦA ALPHA BOOKS OS)
-- ============================================================================

CREATE OR REPLACE FUNCTION alpha_lite.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = alpha_lite, public
AS $$
DECLARE
  user_count INT;
  assigned_role TEXT;
BEGIN
  SELECT COUNT(*) INTO user_count FROM alpha_lite.profiles;
  assigned_role := COALESCE(
    NEW.raw_user_meta_data->>'role',
    CASE WHEN user_count = 0 THEN 'admin' ELSE 'member' END
  );

  INSERT INTO alpha_lite.profiles (id, email, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    CASE WHEN assigned_role IN ('admin', 'manager', 'member') THEN assigned_role ELSE 'member' END
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_alpha_lite ON auth.users;
CREATE TRIGGER on_auth_user_created_alpha_lite
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION alpha_lite.handle_new_user();

-- Đồng bộ sẵn các tài khoản đã tồn tại trong auth.users vào alpha_lite.profiles
-- (Tài khoản tạo sớm nhất tự động là admin nếu bảng còn trống)
INSERT INTO alpha_lite.profiles (id, email, full_name, avatar_url, role)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
  u.raw_user_meta_data->>'avatar_url',
  CASE
    WHEN ROW_NUMBER() OVER (ORDER BY u.created_at ASC) = 1
      AND NOT EXISTS (SELECT 1 FROM alpha_lite.profiles WHERE role = 'admin')
    THEN 'admin'
    ELSE 'member'
  END
FROM auth.users u
WHERE u.email IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- Tự động tạo 4 cột trạng thái mặc định khi tạo Dự án mới
CREATE OR REPLACE FUNCTION alpha_lite.handle_new_project_statuses()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = alpha_lite, public
AS $$
BEGIN
  INSERT INTO alpha_lite.task_statuses (project_id, name, color, category, position)
  VALUES
    (NEW.id, 'Cần làm', '#64748B', 'todo', 0),
    (NEW.id, 'Đang thực hiện', '#3B82F6', 'doing', 1),
    (NEW.id, 'Chờ duyệt', '#F59E0B', 'doing', 2),
    (NEW.id, 'Hoàn thành', '#10B981', 'done', 3);

  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO alpha_lite.project_members (project_id, user_id, role)
    VALUES (NEW.id, NEW.created_by, 'owner')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_project_created_defaults ON alpha_lite.projects;
CREATE TRIGGER on_project_created_defaults
  AFTER INSERT ON alpha_lite.projects
  FOR EACH ROW EXECUTE FUNCTION alpha_lite.handle_new_project_statuses();

-- Tự động cập nhật updated_at
CREATE OR REPLACE FUNCTION alpha_lite.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated ON alpha_lite.profiles;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON alpha_lite.profiles FOR EACH ROW EXECUTE FUNCTION alpha_lite.set_updated_at();

DROP TRIGGER IF EXISTS trg_projects_updated ON alpha_lite.projects;
CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON alpha_lite.projects FOR EACH ROW EXECUTE FUNCTION alpha_lite.set_updated_at();

DROP TRIGGER IF EXISTS trg_tasks_updated ON alpha_lite.tasks;
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON alpha_lite.tasks FOR EACH ROW EXECUTE FUNCTION alpha_lite.set_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) — MÔ HÌNH NỘI BỘ ALPHA BOOKS
-- ============================================================================

CREATE OR REPLACE FUNCTION alpha_lite.is_active_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = alpha_lite, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM alpha_lite.profiles
    WHERE id = auth.uid() AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION alpha_lite.is_admin_or_manager()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = alpha_lite, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM alpha_lite.profiles
    WHERE id = auth.uid() AND is_active = true AND role IN ('admin', 'manager')
  );
$$;

CREATE OR REPLACE FUNCTION alpha_lite.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = alpha_lite, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM alpha_lite.profiles
    WHERE id = auth.uid() AND is_active = true AND role = 'admin'
  );
$$;

ALTER TABLE alpha_lite.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE alpha_lite.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE alpha_lite.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE alpha_lite.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE alpha_lite.task_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE alpha_lite.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE alpha_lite.task_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE alpha_lite.labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE alpha_lite.task_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE alpha_lite.task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE alpha_lite.task_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE alpha_lite.personal_todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE alpha_lite.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE alpha_lite.project_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE alpha_lite.project_template_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE alpha_lite.webhook_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_read_departments" ON alpha_lite.departments;
CREATE POLICY "staff_read_departments" ON alpha_lite.departments FOR SELECT USING (alpha_lite.is_active_staff());
DROP POLICY IF EXISTS "admin_manage_departments" ON alpha_lite.departments;
CREATE POLICY "admin_manage_departments" ON alpha_lite.departments FOR ALL USING (alpha_lite.is_admin_or_manager());

DROP POLICY IF EXISTS "staff_read_profiles" ON alpha_lite.profiles;
CREATE POLICY "staff_read_profiles" ON alpha_lite.profiles FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "user_update_own_profile" ON alpha_lite.profiles;
CREATE POLICY "user_update_own_profile" ON alpha_lite.profiles FOR UPDATE USING (auth.uid() = id OR alpha_lite.is_admin());

DROP POLICY IF EXISTS "staff_all_projects" ON alpha_lite.projects;
CREATE POLICY "staff_all_projects" ON alpha_lite.projects FOR ALL USING (alpha_lite.is_active_staff());

DROP POLICY IF EXISTS "staff_all_project_members" ON alpha_lite.project_members;
CREATE POLICY "staff_all_project_members" ON alpha_lite.project_members FOR ALL USING (alpha_lite.is_active_staff());

DROP POLICY IF EXISTS "staff_all_task_statuses" ON alpha_lite.task_statuses;
CREATE POLICY "staff_all_task_statuses" ON alpha_lite.task_statuses FOR ALL USING (alpha_lite.is_active_staff());

DROP POLICY IF EXISTS "staff_all_tasks" ON alpha_lite.tasks;
CREATE POLICY "staff_all_tasks" ON alpha_lite.tasks FOR ALL USING (alpha_lite.is_active_staff());

DROP POLICY IF EXISTS "staff_all_task_assignees" ON alpha_lite.task_assignees;
CREATE POLICY "staff_all_task_assignees" ON alpha_lite.task_assignees FOR ALL USING (alpha_lite.is_active_staff());

DROP POLICY IF EXISTS "staff_all_labels" ON alpha_lite.labels;
CREATE POLICY "staff_all_labels" ON alpha_lite.labels FOR ALL USING (alpha_lite.is_active_staff());

DROP POLICY IF EXISTS "staff_all_task_labels" ON alpha_lite.task_labels;
CREATE POLICY "staff_all_task_labels" ON alpha_lite.task_labels FOR ALL USING (alpha_lite.is_active_staff());

DROP POLICY IF EXISTS "staff_all_task_comments" ON alpha_lite.task_comments;
CREATE POLICY "staff_all_task_comments" ON alpha_lite.task_comments FOR ALL USING (alpha_lite.is_active_staff());

DROP POLICY IF EXISTS "staff_all_task_attachments" ON alpha_lite.task_attachments;
CREATE POLICY "staff_all_task_attachments" ON alpha_lite.task_attachments FOR ALL USING (alpha_lite.is_active_staff());

DROP POLICY IF EXISTS "own_personal_todos" ON alpha_lite.personal_todos;
CREATE POLICY "own_personal_todos" ON alpha_lite.personal_todos FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own_notifications_select" ON alpha_lite.notifications;
CREATE POLICY "own_notifications_select" ON alpha_lite.notifications FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_notifications_update" ON alpha_lite.notifications;
CREATE POLICY "own_notifications_update" ON alpha_lite.notifications FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "staff_insert_notifications" ON alpha_lite.notifications;
CREATE POLICY "staff_insert_notifications" ON alpha_lite.notifications FOR INSERT WITH CHECK (alpha_lite.is_active_staff());

DROP POLICY IF EXISTS "staff_read_templates" ON alpha_lite.project_templates;
CREATE POLICY "staff_read_templates" ON alpha_lite.project_templates FOR SELECT USING (alpha_lite.is_active_staff());
DROP POLICY IF EXISTS "manager_manage_templates" ON alpha_lite.project_templates;
CREATE POLICY "manager_manage_templates" ON alpha_lite.project_templates FOR ALL USING (alpha_lite.is_admin_or_manager());

DROP POLICY IF EXISTS "staff_read_template_tasks" ON alpha_lite.project_template_tasks;
CREATE POLICY "staff_read_template_tasks" ON alpha_lite.project_template_tasks FOR SELECT USING (alpha_lite.is_active_staff());
DROP POLICY IF EXISTS "manager_manage_template_tasks" ON alpha_lite.project_template_tasks;
CREATE POLICY "manager_manage_template_tasks" ON alpha_lite.project_template_tasks FOR ALL USING (alpha_lite.is_admin_or_manager());

DROP POLICY IF EXISTS "admin_manage_webhooks" ON alpha_lite.webhook_configs;
CREATE POLICY "admin_manage_webhooks" ON alpha_lite.webhook_configs FOR ALL USING (alpha_lite.is_admin_or_manager());

-- ============================================================================
-- BẬT SUPABASE REALTIME CHO TASKS & NOTIFICATIONS TRONG SCHEMA alpha_lite
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'alpha_lite' AND tablename = 'tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE alpha_lite.tasks;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'alpha_lite' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE alpha_lite.notifications;
  END IF;
END $$;

-- ============================================================================
-- STORAGE BUCKET CHO TỆP ĐÍNH KÈM
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "alpha_lite_upload_attachments" ON storage.objects;
CREATE POLICY "alpha_lite_upload_attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'attachments' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "alpha_lite_read_attachments" ON storage.objects;
CREATE POLICY "alpha_lite_read_attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'attachments');

DROP POLICY IF EXISTS "alpha_lite_delete_attachments" ON storage.objects;
CREATE POLICY "alpha_lite_delete_attachments"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'attachments' AND auth.uid() IS NOT NULL);

-- ============================================================================
-- SEED DỮ LIỆU MẪU CHUẨN ALPHA BOOKS
-- ============================================================================
INSERT INTO alpha_lite.departments (name, code, description)
VALUES
  ('Ban Biên tập', 'BT', 'Biên tập nội dung, bản quyền và xuất bản sách'),
  ('Marketing & Truyền thông', 'MKT', 'Chiến dịch ra mắt sách, truyền thông đa kênh'),
  ('Thiết kế & Dàn trang', 'TK', 'Thiết kế bìa sách, dàn trang và ấn phẩm truyền thông'),
  ('Kinh doanh & Phát hành', 'KD', 'Phát hành đại lý, thương mại điện tử và B2B'),
  ('Vận hành & Công nghệ', 'VH', 'Quản trị hệ thống, kho vận và vận hành nội bộ')
ON CONFLICT (name) DO NOTHING;

DO $$
DECLARE
  tpl_book_id UUID;
  tpl_mkt_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM alpha_lite.project_templates WHERE name = 'Quy trình Xuất bản Sách chuẩn') THEN
    INSERT INTO alpha_lite.project_templates (name, description, color, category)
    VALUES (
      'Quy trình Xuất bản Sách chuẩn',
      'Bộ đầu việc tiêu chuẩn từ tiếp nhận bản thảo đến phát hành sách Alpha Books',
      '#F26522',
      'Xuất bản'
    ) RETURNING id INTO tpl_book_id;

    INSERT INTO alpha_lite.project_template_tasks (template_id, title, priority, offset_days, position)
    VALUES
      (tpl_book_id, 'Thẩm định & tiếp nhận bản thảo', 'high', 3, 0),
      (tpl_book_id, 'Biên tập nội dung & hiệu đính lần 1', 'high', 14, 1),
      (tpl_book_id, 'Thiết kế bìa sách & duyệt phương án', 'medium', 18, 2),
      (tpl_book_id, 'Dàn trang ruột & đọc bông soát lỗi', 'high', 24, 3),
      (tpl_book_id, 'Hoàn tất thủ tục xin giấy phép xuất bản', 'urgent', 28, 4),
      (tpl_book_id, 'Chuyển file nhà in & kiểm tra bản in mẫu', 'high', 35, 5),
      (tpl_book_id, 'Nhập kho & bàn giao đội Phát hành / Marketing', 'medium', 42, 6);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM alpha_lite.project_templates WHERE name = 'Chiến dịch Ra mắt Sách (Marketing)') THEN
    INSERT INTO alpha_lite.project_templates (name, description, color, category)
    VALUES (
      'Chiến dịch Ra mắt Sách (Marketing)',
      'Kế hoạch truyền thông, nội dung social, sàn TMĐT và sự kiện ra mắt sách mới',
      '#2563EB',
      'Marketing'
    ) RETURNING id INTO tpl_mkt_id;

    INSERT INTO alpha_lite.project_template_tasks (template_id, title, priority, offset_days, position)
    VALUES
      (tpl_mkt_id, 'Xây dựng Big Idea & thông điệp truyền thông', 'high', 3, 0),
      (tpl_mkt_id, 'Thiết kế bộ ấn phẩm Social / Banner sàn TMĐT', 'medium', 7, 1),
      (tpl_mkt_id, 'Lên lịch bài PR, Review KOL/KOC & cộng đồng đọc', 'high', 10, 2),
      (tpl_mkt_id, 'Thiết lập trang bán hàng & chương trình Pre-order', 'urgent', 12, 3),
      (tpl_mkt_id, 'Triển khai chạy quảng cáo & theo dõi chuyển đổi', 'high', 18, 4),
      (tpl_mkt_id, 'Tổng kết hiệu quả chiến dịch sau 2 tuần phát hành', 'medium', 28, 5);
  END IF;
END $$;
