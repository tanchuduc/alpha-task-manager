-- ============================================================================
-- ALPHA WORK LITE — Migration 008: Personal Todos 2.0 (Notes, Priority, Category, Task Promotion)
-- Schema: alpha_lite
-- ============================================================================

ALTER TABLE alpha_lite.personal_todos
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'work',
  ADD COLUMN IF NOT EXISTS promoted_task_id UUID REFERENCES alpha_lite.tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_al_personal_todos_due_date
  ON alpha_lite.personal_todos(user_id, due_date);

CREATE INDEX IF NOT EXISTS idx_al_personal_todos_category
  ON alpha_lite.personal_todos(user_id, category);
