-- ============================================================================
-- ALPHA WORK ENTERPRISE — Migration 010: Task Recurring Engine
-- Schema: alpha_lite
-- ============================================================================

-- Bổ sung các cột lặp lại định kỳ vào bảng tasks
ALTER TABLE alpha_lite.tasks
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurring_rule_id UUID,
  ADD COLUMN IF NOT EXISTS recurring_source_task_id UUID REFERENCES alpha_lite.tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_is_recurring ON alpha_lite.tasks(is_recurring) WHERE is_recurring IS TRUE;
CREATE INDEX IF NOT EXISTS idx_tasks_recurring_rule_id ON alpha_lite.tasks(recurring_rule_id) WHERE recurring_rule_id IS NOT NULL;

-- Bảng lưu trữ quy tắc lặp lại định kỳ của công việc
CREATE TABLE IF NOT EXISTS alpha_lite.task_recurring_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES alpha_lite.tasks(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES alpha_lite.projects(id) ON DELETE CASCADE,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'custom')),
  interval_value INT NOT NULL DEFAULT 1,
  days_of_week INT[] DEFAULT '{}', -- 1: T2, 2: T3, 3: T4, 4: T5, 5: T6, 6: T7, 7: CN
  day_of_month INT, -- Ví dụ: ngày 25 hàng tháng
  end_type TEXT NOT NULL DEFAULT 'never' CHECK (end_type IN ('never', 'on_date', 'after_count')),
  end_date DATE,
  max_occurrences INT,
  occurrence_count INT NOT NULL DEFAULT 0,
  next_run_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES alpha_lite.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Khóa ngoại từ tasks(recurring_rule_id) tới task_recurring_rules(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_tasks_recurring_rule'
  ) THEN
    ALTER TABLE alpha_lite.tasks
      ADD CONSTRAINT fk_tasks_recurring_rule
      FOREIGN KEY (recurring_rule_id) REFERENCES alpha_lite.task_recurring_rules(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_recurring_rules_active_next ON alpha_lite.task_recurring_rules(is_active, next_run_date) WHERE is_active IS TRUE;
CREATE INDEX IF NOT EXISTS idx_recurring_rules_task_id ON alpha_lite.task_recurring_rules(task_id);
CREATE INDEX IF NOT EXISTS idx_recurring_rules_project_id ON alpha_lite.task_recurring_rules(project_id);

-- RLS
ALTER TABLE alpha_lite.task_recurring_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read task recurring rules"
  ON alpha_lite.task_recurring_rules
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated insert task recurring rules"
  ON alpha_lite.task_recurring_rules
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated update task recurring rules"
  ON alpha_lite.task_recurring_rules
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated delete task recurring rules"
  ON alpha_lite.task_recurring_rules
  FOR DELETE
  TO authenticated
  USING (true);

-- Realtime Publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'alpha_lite' AND tablename = 'task_recurring_rules'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE alpha_lite.task_recurring_rules;
  END IF;
END $$;
