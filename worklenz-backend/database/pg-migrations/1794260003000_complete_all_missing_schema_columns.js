/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
  pgm.sql(`
    -- personal_todo_list
    ALTER TABLE personal_todo_list ADD COLUMN IF NOT EXISTS color_code TEXT DEFAULT '#1890ff';
    ALTER TABLE personal_todo_list ADD COLUMN IF NOT EXISTS done BOOLEAN DEFAULT FALSE;

    -- project_categories
    ALTER TABLE project_categories ADD COLUMN IF NOT EXISTS color_code TEXT DEFAULT '#70a6f3';
    ALTER TABLE project_categories ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE project_categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

    -- project_subscribers
    ALTER TABLE project_subscribers ADD COLUMN IF NOT EXISTS id UUID DEFAULT uuid_generate_v4();
    ALTER TABLE project_subscribers ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE project_subscribers ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
  `);
};

exports.down = pgm => {
  pgm.sql(`
    -- Reversible
  `);
};
