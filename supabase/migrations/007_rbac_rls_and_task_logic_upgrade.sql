-- ============================================================================
-- ALPHA WORK LITE — Migration 007: RBAC Enforcement, RLS Hardening & Task Scope
-- Schema: alpha_lite
-- ============================================================================

-- 1. Thêm cột `assigned_by` vào `task_assignees` để truy vết chính xác "Việc tôi đã giao"
ALTER TABLE alpha_lite.task_assignees
  ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES alpha_lite.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_al_task_assignees_assigned_by
  ON alpha_lite.task_assignees(assigned_by);

-- 2. Thêm cờ `restrict_tasks_to_assignee` cho dự án (Giới hạn CTV/Thành viên chỉ xem việc được giao)
ALTER TABLE alpha_lite.projects
  ADD COLUMN IF NOT EXISTS restrict_tasks_to_assignee BOOLEAN DEFAULT false;

-- 3. Trigger chặn tự nâng quyền (Privilege Escalation Prevention) trên bảng `profiles`
-- Chỉ Admin hệ thống hoặc Service Role mới được thay đổi: role, custom_role_id, is_active, department_id, manager_id
CREATE OR REPLACE FUNCTION alpha_lite.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = alpha_lite, public
AS $$
BEGIN
  -- Cho phép nếu được gọi từ service_role / postgres (auth.uid() IS NULL) hoặc người gọi là Admin
  IF auth.uid() IS NULL OR alpha_lite.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Nếu người dùng thường tự sửa profile của mình, giữ nguyên các cột nhạy cảm
  NEW.role := OLD.role;
  NEW.custom_role_id := OLD.custom_role_id;
  NEW.is_active := OLD.is_active;
  NEW.department_id := OLD.department_id;
  NEW.manager_id := OLD.manager_id;
  NEW.email := OLD.email;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_escalation ON alpha_lite.profiles;
CREATE TRIGGER trg_prevent_profile_escalation
  BEFORE UPDATE ON alpha_lite.profiles
  FOR EACH ROW
  EXECUTE FUNCTION alpha_lite.prevent_profile_privilege_escalation();

-- 4. Trigger chống phụ thuộc vòng / đảo chiều (Circular / Reverse Duplicate Dependency Prevention)
CREATE OR REPLACE FUNCTION alpha_lite.prevent_reverse_duplicate_dependency()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = alpha_lite, public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM alpha_lite.task_dependencies
    WHERE task_id = NEW.depends_on_task_id
      AND depends_on_task_id = NEW.task_id
  ) THEN
    RAISE EXCEPTION 'Mối quan hệ phụ thuộc giữa hai công việc này đã tồn tại theo chiều ngược lại.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_reverse_dependency ON alpha_lite.task_dependencies;
CREATE TRIGGER trg_prevent_reverse_dependency
  BEFORE INSERT OR UPDATE ON alpha_lite.task_dependencies
  FOR EACH ROW
  EXECUTE FUNCTION alpha_lite.prevent_reverse_duplicate_dependency();

-- 5. Hàm SQL kiểm tra Quyền Hệ thống (System Permission Helper)
CREATE OR REPLACE FUNCTION alpha_lite.has_system_perm(p_perm TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = alpha_lite, public
AS $$
DECLARE
  v_role TEXT;
  v_custom_role_id UUID;
  v_perms TEXT[];
BEGIN
  SELECT p.role, p.custom_role_id
  INTO v_role, v_custom_role_id
  FROM alpha_lite.profiles p
  WHERE p.id = auth.uid() AND p.is_active = true;

  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  -- Admin luôn có toàn quyền
  IF v_role = 'admin' THEN
    RETURN true;
  END IF;

  -- Nếu được gán custom_role
  IF v_custom_role_id IS NOT NULL THEN
    SELECT r.permissions INTO v_perms
    FROM alpha_lite.roles r
    WHERE r.id = v_custom_role_id;

    IF v_perms IS NOT NULL THEN
      RETURN p_perm = ANY(v_perms);
    END IF;
  END IF;

  -- Fallback cho manager
  IF v_role = 'manager' THEN
    RETURN p_perm = ANY(ARRAY[
      'create_projects',
      'view_all_projects',
      'view_reports',
      'manage_departments',
      'manage_webhooks'
    ]);
  END IF;

  RETURN false;
END;
$$;

-- 6. Hàm SQL kiểm tra Quyền Dự án (Project Permission Helper)
CREATE OR REPLACE FUNCTION alpha_lite.has_project_perm(p_project_id UUID, p_perm TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = alpha_lite, public
AS $$
DECLARE
  v_created_by UUID;
  v_pm_id UUID;
  v_is_private BOOLEAN;
  v_member_role TEXT;
  v_project_role_id UUID;
  v_role_perms TEXT[];
BEGIN
  IF NOT alpha_lite.is_active_staff() THEN
    RETURN false;
  END IF;

  -- Admin hệ thống luôn có toàn quyền
  IF alpha_lite.is_admin() THEN
    RETURN true;
  END IF;

  SELECT pr.created_by, pr.project_manager_id, COALESCE(pr.is_private, false)
  INTO v_created_by, v_pm_id, v_is_private
  FROM alpha_lite.projects pr
  WHERE pr.id = p_project_id;

  -- Người tạo dự án hoặc Trưởng dự án (Project Manager) có toàn quyền trong dự án
  IF v_created_by = auth.uid() OR v_pm_id = auth.uid() THEN
    RETURN true;
  END IF;

  -- Kiểm tra tư cách thành viên trong project_members
  SELECT pm.role, pm.project_role_id
  INTO v_member_role, v_project_role_id
  FROM alpha_lite.project_members pm
  WHERE pm.project_id = p_project_id AND pm.user_id = auth.uid();

  IF v_member_role = 'owner' THEN
    RETURN true;
  END IF;

  IF v_member_role IS NOT NULL THEN
    -- Có gán vai trò dự án cụ thể
    IF v_project_role_id IS NOT NULL THEN
      SELECT prl.permissions INTO v_role_perms
      FROM alpha_lite.project_roles prl
      WHERE prl.id = v_project_role_id;

      IF v_role_perms IS NOT NULL THEN
        RETURN p_perm = ANY(v_role_perms);
      END IF;
    END IF;

    -- Thành viên mặc định
    RETURN p_perm = ANY(ARRAY[
      'view_project',
      'create_tasks',
      'edit_own_tasks',
      'change_status',
      'post_updates',
      'manage_files'
    ]);
  END IF;

  -- Nếu không phải thành viên dự án: chỉ cho phép xem nếu có quyền view_all_projects hoặc dự án không private
  IF p_perm = 'view_project' THEN
    IF alpha_lite.has_system_perm('view_all_projects') THEN
      RETURN true;
    END IF;
    IF NOT v_is_private THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

-- 7. Siết chặt RLS cho `project_roles`:
-- Mọi nhân sự đang hoạt động được ĐỌC.
-- Chỉ Admin mới được sửa/xóa vai trò mẫu chung (project_id IS NULL).
-- Thành viên có quyền `manage_members` mới được tạo/sửa/xóa vai trò riêng của dự án.
DROP POLICY IF EXISTS "proj_roles_staff" ON alpha_lite.project_roles;
DROP POLICY IF EXISTS "proj_roles_select" ON alpha_lite.project_roles;
DROP POLICY IF EXISTS "proj_roles_write" ON alpha_lite.project_roles;

CREATE POLICY "proj_roles_select" ON alpha_lite.project_roles
  FOR SELECT USING (alpha_lite.is_active_staff());

CREATE POLICY "proj_roles_write" ON alpha_lite.project_roles
  FOR ALL
  USING (
    alpha_lite.is_admin()
    OR (project_id IS NOT NULL AND alpha_lite.has_project_perm(project_id, 'manage_members'))
  )
  WITH CHECK (
    alpha_lite.is_admin()
    OR (project_id IS NOT NULL AND alpha_lite.has_project_perm(project_id, 'manage_members'))
  );

-- 8. Siết chặt RLS cho `departments`, `project_templates`, `webhook_configs` theo `has_system_perm`
DROP POLICY IF EXISTS "admin_manage_departments" ON alpha_lite.departments;
CREATE POLICY "admin_manage_departments" ON alpha_lite.departments
  FOR ALL USING (alpha_lite.has_system_perm('manage_departments'))
  WITH CHECK (alpha_lite.has_system_perm('manage_departments'));

DROP POLICY IF EXISTS "admin_manage_webhooks" ON alpha_lite.webhook_configs;
CREATE POLICY "admin_manage_webhooks" ON alpha_lite.webhook_configs
  FOR ALL USING (alpha_lite.has_system_perm('manage_webhooks'))
  WITH CHECK (alpha_lite.has_system_perm('manage_webhooks'));

-- 9. Bật Realtime cho `task_assignees` và `task_custom_field_values` để đồng bộ giao việc & trường tùy biến tức thì
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'alpha_lite' AND tablename = 'task_assignees'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE alpha_lite.task_assignees;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'alpha_lite' AND tablename = 'task_custom_field_values'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE alpha_lite.task_custom_field_values;
  END IF;
END $$;
