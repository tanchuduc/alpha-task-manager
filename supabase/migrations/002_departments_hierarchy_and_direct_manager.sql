-- ============================================================================
-- ALPHA WORK LITE — Migration 002: Phòng ban phân cấp & Quản lý trực tiếp
-- 1. Departments: Hỗ trợ phân cấp 2 cấp (Khối / Ban lớn -> Bộ phận / Team con)
-- 2. Profiles: Hỗ trợ Quản lý trực tiếp (Direct Manager / Reports To)
-- Chạy trong Supabase SQL Editor.
-- ============================================================================

-- 1. Thêm parent_id cho phòng ban
ALTER TABLE alpha_lite.departments
ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES alpha_lite.departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_alpha_lite_departments_parent_id 
ON alpha_lite.departments(parent_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_departments_not_self_parent'
  ) THEN
    ALTER TABLE alpha_lite.departments
    ADD CONSTRAINT check_departments_not_self_parent CHECK (id != parent_id);
  END IF;
END $$;

-- 2. Thêm manager_id cho hồ sơ nhân sự
ALTER TABLE alpha_lite.profiles
ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES alpha_lite.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_alpha_lite_profiles_manager_id 
ON alpha_lite.profiles(manager_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_profiles_not_self_manager'
  ) THEN
    ALTER TABLE alpha_lite.profiles
    ADD CONSTRAINT check_profiles_not_self_manager CHECK (id != manager_id);
  END IF;
END $$;

COMMENT ON COLUMN alpha_lite.departments.parent_id IS 'Mã phòng ban cha / Khối cấp trên (null nếu là Khối/Phòng độc lập)';
COMMENT ON COLUMN alpha_lite.profiles.manager_id IS 'Mã nhân sự quản lý trực tiếp (trỏ về alpha_lite.profiles.id)';
