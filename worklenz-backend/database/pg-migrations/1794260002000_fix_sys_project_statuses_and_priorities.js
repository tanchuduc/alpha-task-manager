/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
  pgm.sql(`
    ALTER TABLE sys_project_statuses ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT 'clock-circle';
    ALTER TABLE sys_project_statuses ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE;
    UPDATE sys_project_statuses SET is_default = TRUE WHERE name = 'Proposed';

    UPDATE task_priorities SET value = 0 WHERE name = 'Low';
    UPDATE task_priorities SET value = 1 WHERE name = 'Medium';
    UPDATE task_priorities SET value = 2 WHERE name = 'High';
    UPDATE task_priorities SET value = 3 WHERE name = 'Critical';
  `);
};

exports.down = pgm => {
  pgm.sql(`
    -- Reversible
  `);
};
