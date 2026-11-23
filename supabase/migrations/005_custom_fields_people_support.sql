-- ============================================================================
-- ALPHA WORK LITE — Migration 005: Custom Fields Support 'people' Type
-- Schema: alpha_lite
-- ============================================================================

ALTER TABLE alpha_lite.project_custom_fields 
  DROP CONSTRAINT IF EXISTS project_custom_fields_field_type_check;

ALTER TABLE alpha_lite.project_custom_fields 
  ADD CONSTRAINT project_custom_fields_field_type_check 
  CHECK (field_type IN ('text', 'number', 'dropdown', 'date', 'people'));
