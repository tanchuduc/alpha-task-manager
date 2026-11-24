-- ============================================================================
-- ALPHA WORK LITE — Migration 013: RBAC Security Hardening & Executive Capabilities
-- Schema: alpha_lite
-- ============================================================================

-- 1. CẬP NHẬT HÀM KIỂM TRA ADMIN & QUẢN LÝ (Nhận diện đồng nhất 'DIRECTOR' & 'LEAD')
CREATE OR REPLACE FUNCTION alpha_lite.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = alpha_lite, public
AS $$
DECLARE
  v_role TEXT;
  v_custom_code TEXT;
BEGIN
  SELECT p.role, r.code
  INTO v_role, v_custom_code
  FROM alpha_lite.profiles p
  LEFT JOIN alpha_lite.roles r ON r.id = p.custom_role_id
  WHERE p.id = auth.uid() AND p.is_active = true;

  RETURN (v_role = 'admin' OR v_custom_code = 'DIRECTOR');
END;
$$;

CREATE OR REPLACE FUNCTION alpha_lite.is_admin_or_manager()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = alpha_lite, public
AS $$
DECLARE
  v_role TEXT;
  v_custom_code TEXT;
BEGIN
  SELECT p.role, r.code
  INTO v_role, v_custom_code
  FROM alpha_lite.profiles p
  LEFT JOIN alpha_lite.roles r ON r.id = p.custom_role_id
  WHERE p.id = auth.uid() AND p.is_active = true;

  RETURN (
    v_role IN ('admin', 'manager')
    OR v_custom_code IN ('DIRECTOR', 'LEAD')
  );
END;
$$;

-- 2. CẬP NHẬT TRIGGER CHỐNG TỰ NÂNG QUYỀN
CREATE OR REPLACE FUNCTION alpha_lite.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = alpha_lite, public
AS $$
BEGIN
  -- Cho phép nếu được gọi từ service_role / postgres hoặc người gọi là Admin/BOD
  IF auth.uid() IS NULL OR alpha_lite.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Nếu người dùng thường tự sửa profile của mình, bảo vệ toàn bộ các cột nhạy cảm
  NEW.role := OLD.role;
  NEW.custom_role_id := OLD.custom_role_id;
  NEW.is_active := OLD.is_active;
  NEW.department_id := OLD.department_id;
  NEW.manager_id := OLD.manager_id;
  NEW.email := OLD.email;

  RETURN NEW;
END;
$$;

-- 3. CẬP NHẬT HÀM KIỂM TRA QUYỀN HỆ THỐNG has_system_perm()
CREATE OR REPLACE FUNCTION alpha_lite.has_system_perm(p_perm TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = alpha_lite, public
AS $$
DECLARE
  v_role TEXT;
  v_custom_code TEXT;
  v_perms TEXT[];
BEGIN
  SELECT p.role, r.code, r.permissions
  INTO v_role, v_custom_code, v_perms
  FROM alpha_lite.profiles p
  LEFT JOIN alpha_lite.roles r ON r.id = p.custom_role_id
  WHERE p.id = auth.uid() AND p.is_active = true;

  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  -- Admin hoặc BOD (DIRECTOR) luôn có toàn quyền
  IF v_role = 'admin' OR v_custom_code = 'DIRECTOR' THEN
    RETURN true;
  END IF;

  -- Nếu có mảng permissions cấu hình trong roles
  IF v_perms IS NOT NULL AND array_length(v_perms, 1) > 0 THEN
    RETURN p_perm = ANY(v_perms);
  END IF;

  -- Fallback cho manager / LEAD
  IF v_role = 'manager' OR v_custom_code = 'LEAD' THEN
    RETURN p_perm = ANY(ARRAY[
      'create_projects',
      'view_all_projects',
      'view_reports',
      'manage_departments',
      'manage_webhooks'
    ]);
  END IF;

  -- Fallback cho member chuyên viên (tạo dự án sách mới)
  IF v_role = 'member' AND (v_custom_code IS NULL OR v_custom_code != 'COLLABORATOR') THEN
    RETURN p_perm = 'create_projects';
  END IF;

  RETURN false;
END;
$$;

-- 4. BỔ SUNG CỘT PHÊ DUYỆT CÔNG VIỆC (TASK SIGN-OFF / APPROVAL GATE)
ALTER TABLE alpha_lite.tasks
  ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'none' CHECK (review_status IN ('none', 'pending_review', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES alpha_lite.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tasks_review_status ON alpha_lite.tasks(review_status);

-- 5. SIẾT CHẶT BẢO MẬT RLS CHO PHASES, FILES, LINKS, DEPENDENCIES
-- 5.1 Project Phases
DROP POLICY IF EXISTS "phases_staff" ON alpha_lite.project_phases;
DROP POLICY IF EXISTS "phases_select" ON alpha_lite.project_phases;
DROP POLICY IF EXISTS "phases_write" ON alpha_lite.project_phases;

CREATE POLICY "phases_select" ON alpha_lite.project_phases
  FOR SELECT USING (
    alpha_lite.is_admin() OR alpha_lite.has_project_perm(project_id, 'view_project')
  );

CREATE POLICY "phases_write" ON alpha_lite.project_phases
  FOR ALL USING (
    alpha_lite.is_admin() OR alpha_lite.has_project_perm(project_id, 'manage_phases')
  )
  WITH CHECK (
    alpha_lite.is_admin() OR alpha_lite.has_project_perm(project_id, 'manage_phases')
  );

-- 5.2 Project Files
DROP POLICY IF EXISTS "files_staff" ON alpha_lite.project_files;
DROP POLICY IF EXISTS "files_select" ON alpha_lite.project_files;
DROP POLICY IF EXISTS "files_insert" ON alpha_lite.project_files;
DROP POLICY IF EXISTS "files_modify" ON alpha_lite.project_files;

CREATE POLICY "files_select" ON alpha_lite.project_files
  FOR SELECT USING (
    alpha_lite.is_admin() OR alpha_lite.has_project_perm(project_id, 'view_project')
  );

CREATE POLICY "files_insert" ON alpha_lite.project_files
  FOR INSERT WITH CHECK (
    alpha_lite.is_admin() OR alpha_lite.has_project_perm(project_id, 'manage_files')
  );

CREATE POLICY "files_modify" ON alpha_lite.project_files
  FOR UPDATE USING (
    alpha_lite.is_admin()
    OR uploaded_by = auth.uid()
    OR alpha_lite.has_project_perm(project_id, 'manage_members')
  );

CREATE POLICY "files_delete" ON alpha_lite.project_files
  FOR DELETE USING (
    alpha_lite.is_admin()
    OR uploaded_by = auth.uid()
    OR alpha_lite.has_project_perm(project_id, 'manage_members')
  );

-- 5.3 Project Links
DROP POLICY IF EXISTS "links_staff" ON alpha_lite.project_links;
DROP POLICY IF EXISTS "links_select" ON alpha_lite.project_links;
DROP POLICY IF EXISTS "links_write" ON alpha_lite.project_links;

CREATE POLICY "links_select" ON alpha_lite.project_links
  FOR SELECT USING (
    alpha_lite.is_admin() OR alpha_lite.has_project_perm(project_id, 'view_project')
  );

CREATE POLICY "links_write" ON alpha_lite.project_links
  FOR ALL USING (
    alpha_lite.is_admin() OR alpha_lite.has_project_perm(project_id, 'manage_files')
  )
  WITH CHECK (
    alpha_lite.is_admin() OR alpha_lite.has_project_perm(project_id, 'manage_files')
  );

-- 5.4 Task Dependencies
DROP POLICY IF EXISTS "deps_staff" ON alpha_lite.task_dependencies;
DROP POLICY IF EXISTS "deps_select" ON alpha_lite.task_dependencies;
DROP POLICY IF EXISTS "deps_write" ON alpha_lite.task_dependencies;

CREATE POLICY "deps_select" ON alpha_lite.task_dependencies
  FOR SELECT USING (
    alpha_lite.is_admin()
    OR EXISTS (
      SELECT 1 FROM alpha_lite.tasks t
      WHERE t.id = task_dependencies.task_id
        AND alpha_lite.has_project_perm(t.project_id, 'view_project')
    )
  );

CREATE POLICY "deps_write" ON alpha_lite.task_dependencies
  FOR ALL USING (
    alpha_lite.is_admin()
    OR EXISTS (
      SELECT 1 FROM alpha_lite.tasks t
      WHERE t.id = task_dependencies.task_id
        AND (
          alpha_lite.has_project_perm(t.project_id, 'edit_all_tasks')
          OR alpha_lite.has_project_perm(t.project_id, 'create_tasks')
        )
    )
  );
