-- ============================================================================
-- ALPHA WORK LITE — Migration 003: Deep Publishing Workflow & Advanced RBAC
-- Schema: alpha_lite
-- ============================================================================

-- 1. MA TRẬN VAI TRÒ HỆ THỐNG (SYSTEM ROLES)
CREATE TABLE IF NOT EXISTS alpha_lite.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  permissions TEXT[] NOT NULL DEFAULT '{}',
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. MA TRẬN VAI TRÒ THEO DỰ ÁN (PROJECT ROLES & SCHEMES)
CREATE TABLE IF NOT EXISTS alpha_lite.project_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES alpha_lite.projects(id) ON DELETE CASCADE, -- NULL = Mẫu vai trò dùng chung
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  permissions TEXT[] NOT NULL DEFAULT ARRAY[
    'view_project',
    'create_tasks',
    'edit_own_tasks',
    'change_status',
    'post_updates',
    'manage_files'
  ],
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cập nhật cột vai trò trong bảng project_members và profiles
ALTER TABLE alpha_lite.project_members
  ADD COLUMN IF NOT EXISTS project_role_id UUID REFERENCES alpha_lite.project_roles(id) ON DELETE SET NULL;

ALTER TABLE alpha_lite.profiles
  ADD COLUMN IF NOT EXISTS custom_role_id UUID REFERENCES alpha_lite.roles(id) ON DELETE SET NULL;

-- 3. GIAI ĐOẠN DỰ ÁN XUẤT BẢN SÁCH (PROJECT PHASES / MILESTONES)
CREATE TABLE IF NOT EXISTS alpha_lite.project_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES alpha_lite.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#F26522',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  start_date DATE,
  due_date DATE,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE alpha_lite.tasks
  ADD COLUMN IF NOT EXISTS phase_id UUID REFERENCES alpha_lite.project_phases(id) ON DELETE SET NULL;

-- 4. MỐI QUAN HỆ PHỤ THUỘC CÔNG VIỆC (TASK DEPENDENCIES)
CREATE TABLE IF NOT EXISTS alpha_lite.task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES alpha_lite.tasks(id) ON DELETE CASCADE,
  depends_on_task_id UUID NOT NULL REFERENCES alpha_lite.tasks(id) ON DELETE CASCADE,
  dependency_type TEXT NOT NULL DEFAULT 'blocked_by' CHECK (dependency_type IN ('blocked_by', 'blocking', 'relates_to')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, depends_on_task_id),
  CONSTRAINT no_self_dependency CHECK (task_id != depends_on_task_id)
);

-- 5. KHO TỆP TẬP TRUNG DỰ ÁN (PROJECT FILES)
CREATE TABLE IF NOT EXISTS alpha_lite.project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES alpha_lite.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  storage_path TEXT,
  file_size BIGINT,
  category TEXT NOT NULL DEFAULT 'Chung', -- 'Bản thảo', 'Thiết kế', 'Pháp lý', 'Chung'
  uploaded_by UUID REFERENCES alpha_lite.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. KHO LIÊN KẾT TÀI NGUYÊN DỰ ÁN (PROJECT LINKS HUB)
CREATE TABLE IF NOT EXISTS alpha_lite.project_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES alpha_lite.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  link_type TEXT NOT NULL DEFAULT 'gdrive' CHECK (link_type IN ('gdrive', 'gsheet', 'lark', 'other')),
  created_by UUID REFERENCES alpha_lite.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- INDEXES TỐI ƯU TRUY VẤN
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_pp_project ON alpha_lite.project_phases(project_id, position);
CREATE INDEX IF NOT EXISTS idx_td_task ON alpha_lite.task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_td_depends ON alpha_lite.task_dependencies(depends_on_task_id);
CREATE INDEX IF NOT EXISTS idx_pf_project ON alpha_lite.project_files(project_id, category);
CREATE INDEX IF NOT EXISTS idx_pl_project ON alpha_lite.project_links(project_id);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE alpha_lite.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE alpha_lite.project_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE alpha_lite.project_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE alpha_lite.task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE alpha_lite.project_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE alpha_lite.project_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roles_read" ON alpha_lite.roles;
CREATE POLICY "roles_read" ON alpha_lite.roles FOR SELECT USING (alpha_lite.is_active_staff());
DROP POLICY IF EXISTS "roles_admin" ON alpha_lite.roles;
CREATE POLICY "roles_admin" ON alpha_lite.roles FOR ALL USING (alpha_lite.is_admin());

DROP POLICY IF EXISTS "proj_roles_staff" ON alpha_lite.project_roles;
CREATE POLICY "proj_roles_staff" ON alpha_lite.project_roles FOR ALL USING (alpha_lite.is_active_staff());

DROP POLICY IF EXISTS "phases_staff" ON alpha_lite.project_phases;
CREATE POLICY "phases_staff" ON alpha_lite.project_phases FOR ALL USING (alpha_lite.is_active_staff());

DROP POLICY IF EXISTS "deps_staff" ON alpha_lite.task_dependencies;
CREATE POLICY "deps_staff" ON alpha_lite.task_dependencies FOR ALL USING (alpha_lite.is_active_staff());

DROP POLICY IF EXISTS "files_staff" ON alpha_lite.project_files;
CREATE POLICY "files_staff" ON alpha_lite.project_files FOR ALL USING (alpha_lite.is_active_staff());

DROP POLICY IF EXISTS "links_staff" ON alpha_lite.project_links;
CREATE POLICY "links_staff" ON alpha_lite.project_links FOR ALL USING (alpha_lite.is_active_staff());

-- ============================================================================
-- BẬT SUPABASE REALTIME
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'alpha_lite' AND tablename = 'project_phases'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE alpha_lite.project_phases;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'alpha_lite' AND tablename = 'task_dependencies'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE alpha_lite.task_dependencies;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'alpha_lite' AND tablename = 'project_files'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE alpha_lite.project_files;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'alpha_lite' AND tablename = 'project_links'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE alpha_lite.project_links;
  END IF;
END $$;

-- ============================================================================
-- SEED VAI TRÒ CHUẨN XUẤT BẢN ALPHA BOOKS
-- ============================================================================

-- Vai trò hệ thống
INSERT INTO alpha_lite.roles (name, code, description, permissions, is_system)
VALUES
  (
    'Ban Giám đốc',
    'DIRECTOR',
    'Toàn quyền quản trị và xem tất cả dự án, báo cáo doanh thu và nhân sự',
    ARRAY['manage_settings', 'manage_users', 'manage_departments', 'create_projects', 'view_all_projects', 'view_reports', 'manage_webhooks'],
    true
  ),
  (
    'Trưởng phòng / Trưởng nhóm',
    'LEAD',
    'Tạo và điều phối dự án, giao việc và theo dõi hiệu suất phòng ban',
    ARRAY['create_projects', 'view_all_projects', 'view_reports'],
    true
  ),
  (
    'Biên tập viên / Chuyên viên',
    'SPECIALIST',
    'Thực hiện các công việc chuyên môn được giao trong dự án',
    ARRAY['create_projects'],
    true
  ),
  (
    'Cộng tác viên (Dịch giả / Thiết kế / Bông)',
    'COLLABORATOR',
    'Chỉ xem và cập nhật các công việc được chỉ định',
    ARRAY[]::TEXT[],
    true
  )
ON CONFLICT (code) DO NOTHING;

-- Mẫu vai trò trong dự án (dùng chung)
INSERT INTO alpha_lite.project_roles (project_id, name, code, description, permissions, is_default)
VALUES
  (
    NULL,
    'Trưởng dự án (Project Lead)',
    'LEAD',
    'Toàn quyền quản trị dự án, duyệt hoàn thành, quản lý thành viên và ngân sách',
    ARRAY['view_project', 'create_tasks', 'edit_all_tasks', 'delete_tasks', 'change_status', 'manage_members', 'manage_files', 'post_updates', 'manage_phases'],
    false
  ),
  (
    NULL,
    'Biên tập / Thiết kế chính (Core Member)',
    'CORE',
    'Tạo và chỉnh sửa công việc, tải tài liệu, đăng bài thảo luận',
    ARRAY['view_project', 'create_tasks', 'edit_own_tasks', 'change_status', 'manage_files', 'post_updates'],
    true
  ),
  (
    NULL,
    'Người xem xét / Duyệt bông (Reviewer)',
    'REVIEWER',
    'Xem tiến độ, đọc tài liệu và bình luận góp ý',
    ARRAY['view_project', 'post_updates'],
    false
  )
ON CONFLICT DO NOTHING;
