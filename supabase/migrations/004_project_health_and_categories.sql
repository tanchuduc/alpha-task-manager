-- ============================================================================
-- ALPHA WORK LITE — Migration 004: Project Health & Category Classification
-- Schema: alpha_lite
-- ============================================================================

-- Bổ sung các trường sức khỏe dự án, phân loại danh mục, đối tác và tiến độ
ALTER TABLE alpha_lite.projects
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Dự án Chung',
  ADD COLUMN IF NOT EXISTS delivery_confidence TEXT DEFAULT 'on_track' 
    CHECK (delivery_confidence IN ('on_track', 'at_risk', 'off_track')),
  ADD COLUMN IF NOT EXISTS confidence_note TEXT,
  ADD COLUMN IF NOT EXISTS client_name TEXT,
  ADD COLUMN IF NOT EXISTS project_manager_id UUID REFERENCES alpha_lite.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS progress_mode TEXT DEFAULT 'auto' 
    CHECK (progress_mode IN ('auto', 'manual')),
  ADD COLUMN IF NOT EXISTS manual_progress INT DEFAULT 0 
    CHECK (manual_progress >= 0 AND manual_progress <= 100);

-- Tạo Index hỗ trợ lọc danh mục và sức khỏe dự án
CREATE INDEX IF NOT EXISTS idx_projects_category ON alpha_lite.projects(category);
CREATE INDEX IF NOT EXISTS idx_projects_confidence ON alpha_lite.projects(delivery_confidence);
CREATE INDEX IF NOT EXISTS idx_projects_pm ON alpha_lite.projects(project_manager_id);
