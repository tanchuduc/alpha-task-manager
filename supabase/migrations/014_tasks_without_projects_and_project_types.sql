-- ============================================================================
-- ALPHA WORK LITE — Migration 014: Tasks Without Projects & Project Types
-- Schema: alpha_lite
-- ============================================================================

-- 1. Cho phép task tồn tại độc lập (không bắt buộc project_id)
ALTER TABLE alpha_lite.tasks
  ALTER COLUMN project_id DROP NOT NULL;

-- 2. Cho phép task_statuses dùng chung toàn hệ thống (project_id NULL)
ALTER TABLE alpha_lite.task_statuses
  ALTER COLUMN project_id DROP NOT NULL;

-- Khởi tạo 3 trạng thái mặc định dùng chung toàn hệ thống nếu chưa có
INSERT INTO alpha_lite.task_statuses (project_id, name, color, category, position)
SELECT NULL, 'Cần làm', '#64748B', 'todo', 0
WHERE NOT EXISTS (
  SELECT 1 FROM alpha_lite.task_statuses WHERE project_id IS NULL AND category = 'todo'
);

INSERT INTO alpha_lite.task_statuses (project_id, name, color, category, position)
SELECT NULL, 'Đang thực hiện', '#3B82F6', 'doing', 1
WHERE NOT EXISTS (
  SELECT 1 FROM alpha_lite.task_statuses WHERE project_id IS NULL AND category = 'doing'
);

INSERT INTO alpha_lite.task_statuses (project_id, name, color, category, position)
SELECT NULL, 'Hoàn thành', '#10B981', 'done', 2
WHERE NOT EXISTS (
  SELECT 1 FROM alpha_lite.task_statuses WHERE project_id IS NULL AND category = 'done'
);

-- 3. Phân loại dự án: 'publishing' (Dự án Sách) vs 'operational' (Danh sách Vận hành / Team)
ALTER TABLE alpha_lite.projects
  ADD COLUMN IF NOT EXISTS project_type TEXT NOT NULL DEFAULT 'publishing'
  CHECK (project_type IN ('publishing', 'operational'));

-- Cập nhật các dự án chung hiện tại thành 'operational' nếu phù hợp
UPDATE alpha_lite.projects
SET project_type = 'operational'
WHERE category = 'Dự án Chung' OR name ILIKE '%chung%' OR name ILIKE '%vận hành%';

-- 4. Cho phép kiểm tra quyền đối với task độc lập (project_id IS NULL)
CREATE OR REPLACE FUNCTION alpha_lite.has_project_perm(p_project_id uuid, p_perm text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'alpha_lite', 'public'
AS $function$
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

  -- Nếu không thuộc dự án (công việc độc lập), mọi nhân sự hợp lệ đều có quyền thao tác
  IF p_project_id IS NULL THEN
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
$function$;
