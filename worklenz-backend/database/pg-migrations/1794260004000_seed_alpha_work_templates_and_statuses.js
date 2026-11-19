/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
  pgm.sql(`
    -- Ensure pg_sessions table exists in the active schema
    CREATE TABLE IF NOT EXISTS pg_sessions (
        sid VARCHAR NOT NULL COLLATE "default" PRIMARY KEY,
        sess JSON NOT NULL,
        expire TIMESTAMP(6) NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pg_sessions_expire ON pg_sessions (expire);

    -- Ensure task status categories exist
    INSERT INTO sys_task_status_categories (name, color_code, index, is_todo, is_doing, is_done, description, color_code_dark)
    SELECT 'To do', '#a9a9a9', 1, TRUE, FALSE, FALSE, 'For tasks that have not been started.', '#989898'
    WHERE NOT EXISTS (SELECT 1 FROM sys_task_status_categories WHERE name = 'To do');

    INSERT INTO sys_task_status_categories (name, color_code, index, is_todo, is_doing, is_done, description, color_code_dark)
    SELECT 'Doing', '#70a6f3', 2, FALSE, TRUE, FALSE, 'For tasks that have been started.', '#4190FF'
    WHERE NOT EXISTS (SELECT 1 FROM sys_task_status_categories WHERE name = 'Doing');

    INSERT INTO sys_task_status_categories (name, color_code, index, is_todo, is_doing, is_done, description, color_code_dark)
    SELECT 'Done', '#75c997', 3, FALSE, FALSE, TRUE, 'For tasks that have been completed.', '#46D980'
    WHERE NOT EXISTS (SELECT 1 FROM sys_task_status_categories WHERE name = 'Done');

    -- Ensure sys_project_statuses exist
    INSERT INTO sys_project_statuses (name, color_code, icon, sort_order, is_default)
    SELECT v.name, v.color_code, v.icon, v.sort_order, v.is_default
    FROM (VALUES
      ('Cancelled', '#f37070', 'close-circle', 0, FALSE),
      ('Blocked', '#cbc8a1', 'stop', 1, FALSE),
      ('On Hold', '#cbc8a1', 'stop', 2, FALSE),
      ('Proposed', '#cbc8a1', 'clock-circle', 3, TRUE),
      ('In Planning', '#cbc8a1', 'clock-circle', 4, FALSE),
      ('In Progress', '#80ca79', 'clock-circle', 5, FALSE),
      ('Completed', '#80ca79', 'check-circle', 6, FALSE),
      ('Continuous', '#80ca79', 'clock-circle', 7, FALSE)
    ) AS v(name, color_code, icon, sort_order, is_default)
    WHERE NOT EXISTS (SELECT 1 FROM sys_project_statuses WHERE sys_project_statuses.name = v.name);

    -- Ensure sys_project_healths exist
    INSERT INTO sys_project_healths (name, color_code, sort_order, is_default)
    SELECT v.name, v.color_code, v.sort_order, v.is_default
    FROM (VALUES
      ('Not Set', '#a9a9a9', 0, TRUE),
      ('Needs Attention', '#fbc84c', 1, FALSE),
      ('At Risk', '#f37070', 2, FALSE),
      ('Good', '#75c997', 3, FALSE)
    ) AS v(name, color_code, sort_order, is_default)
    WHERE NOT EXISTS (SELECT 1 FROM sys_project_healths WHERE sys_project_healths.name = v.name);

    -- Ensure basic pt_project_templates exist
    INSERT INTO pt_project_templates (id, name, key, description, phase_label, image_url, color_code)
    SELECT '39db59be-1dba-448b-87f4-3b955ea699d2', 'Bug Tracking', 'BT', 'The "Bug Tracking" project template is a versatile solution meticulously designed to streamline and enhance the bug management processes of businesses across diverse industries.', 'Phase', 'https://worklenz.s3.amazonaws.com/project-template-gifs/bug-tracking.gif', '#3b7ad4'
    WHERE NOT EXISTS (SELECT 1 FROM pt_project_templates WHERE id = '39db59be-1dba-448b-87f4-3b955ea699d2');

    INSERT INTO pt_statuses (id, name, template_id, category_id)
    SELECT 'c3242606-5a24-48aa-8320-cc90a05c2589', 'To Do', '39db59be-1dba-448b-87f4-3b955ea699d2', (SELECT id FROM sys_task_status_categories WHERE name = 'To do' LIMIT 1)
    WHERE NOT EXISTS (SELECT 1 FROM pt_statuses WHERE id = 'c3242606-5a24-48aa-8320-cc90a05c2589');

    INSERT INTO pt_statuses (id, name, template_id, category_id)
    SELECT '05ed8d04-92b1-4c44-bd06-abee29641f31', 'Doing', '39db59be-1dba-448b-87f4-3b955ea699d2', (SELECT id FROM sys_task_status_categories WHERE name = 'Doing' LIMIT 1)
    WHERE NOT EXISTS (SELECT 1 FROM pt_statuses WHERE id = '05ed8d04-92b1-4c44-bd06-abee29641f31');

    INSERT INTO pt_statuses (id, name, template_id, category_id)
    SELECT '66e80bc8-6b29-4e72-a484-1593eb1fb44b', 'Done', '39db59be-1dba-448b-87f4-3b955ea699d2', (SELECT id FROM sys_task_status_categories WHERE name = 'Done' LIMIT 1)
    WHERE NOT EXISTS (SELECT 1 FROM pt_statuses WHERE id = '66e80bc8-6b29-4e72-a484-1593eb1fb44b');

    -- Try to set role default search_path
    DO $$
    BEGIN
      EXECUTE 'ALTER ROLE CURRENT_USER SET search_path TO alpha_work, public, extensions;';
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END
    $$;
  `);
};

exports.down = pgm => {
  pgm.sql(`
    -- Reversible
  `);
};
