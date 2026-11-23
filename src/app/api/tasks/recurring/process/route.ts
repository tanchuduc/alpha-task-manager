import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { TaskRecurringRule, Task, TaskPriority } from "@/types/database";

/**
 * Calculates the next run date based on frequency, interval, days_of_week, day_of_month
 */
function computeNextRunDate(
  currentDateStr: string,
  frequency: "daily" | "weekly" | "monthly" | "custom",
  intervalValue: number,
  daysOfWeek: number[] = [],
  dayOfMonth: number | null = null
): string {
  const current = new Date(currentDateStr);
  const next = new Date(current);

  if (frequency === "daily" || frequency === "custom") {
    next.setDate(next.getDate() + Math.max(1, intervalValue));
  } else if (frequency === "weekly") {
    // If specific days of week are given (1: Mon .. 7: Sun)
    if (daysOfWeek && daysOfWeek.length > 0) {
      const sortedDays = [...daysOfWeek].sort((a, b) => a - b);
      let foundNextDay = false;

      // JS day: 0=Sun, 1=Mon .. 6=Sat -> Convert to 1=Mon .. 7=Sun
      const currentDayVi = current.getDay() === 0 ? 7 : current.getDay();

      for (const d of sortedDays) {
        if (d > currentDayVi) {
          const diff = d - currentDayVi;
          next.setDate(next.getDate() + diff);
          foundNextDay = true;
          break;
        }
      }

      if (!foundNextDay) {
        // Wrap to the first day in sortedDays, advanced by intervalValue weeks
        const firstDay = sortedDays[0];
        const daysUntilSunday = 7 - currentDayVi;
        const daysToFirst = daysUntilSunday + (intervalValue - 1) * 7 + firstDay;
        next.setDate(next.getDate() + daysToFirst);
      }
    } else {
      next.setDate(next.getDate() + 7 * Math.max(1, intervalValue));
    }
  } else if (frequency === "monthly") {
    next.setMonth(next.getMonth() + Math.max(1, intervalValue));
    if (dayOfMonth && dayOfMonth >= 1 && dayOfMonth <= 31) {
      // Avoid month overflow
      const maxDaysInTargetMonth = new Date(
        next.getFullYear(),
        next.getMonth() + 1,
        0
      ).getDate();
      next.setDate(Math.min(dayOfMonth, maxDaysInTargetMonth));
    }
  }

  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, "0");
  const d = String(next.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function POST(request: Request) {
  try {
    const supabaseUser = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabaseUser.auth.getUser();

    // Use admin client for system-level task cloning across members
    let supabase = supabaseUser;
    try {
      supabase = createAdminSupabaseClient();
    } catch {
      // Fallback to user client if service key is not configured
    }

    const body = await request.json().catch(() => ({}));
    const {
      ruleId,
      projectId,
      forceRun = false,
    } = body as {
      ruleId?: string;
      projectId?: string;
      forceRun?: boolean;
    };

    const todayStr = new Date().toISOString().slice(0, 10);

    // Build query for active rules
    let rulesQuery = supabase
      .from("task_recurring_rules")
      .select("*")
      .eq("is_active", true);

    if (ruleId) {
      rulesQuery = rulesQuery.eq("id", ruleId);
    } else {
      if (projectId) {
        rulesQuery = rulesQuery.eq("project_id", projectId);
      }
      if (!forceRun) {
        rulesQuery = rulesQuery.lte("next_run_date", todayStr);
      }
    }

    const { data: rulesData, error: rulesErr } = await rulesQuery;

    if (rulesErr) {
      return NextResponse.json(
        { error: "Lỗi truy vấn quy tắc lặp lại: " + rulesErr.message },
        { status: 500 }
      );
    }

    const rules = (rulesData || []) as TaskRecurringRule[];
    const createdTasks: Array<{ ruleId: string; taskId: string; title: string }> = [];

    for (const rule of rules) {
      // Fetch source task
      const { data: srcTaskData, error: srcErr } = await supabase
        .from("tasks")
        .select("*, task_assignees(user_id)")
        .eq("id", rule.task_id)
        .maybeSingle();

      if (srcErr || !srcTaskData) {
        continue;
      }

      type RawTask = Task & { task_assignees?: { user_id: string }[] };
      const srcTask = srcTaskData as RawTask;

      // Find first status (todo) for this project
      const { data: statusList } = await supabase
        .from("task_statuses")
        .select("id, category")
        .eq("project_id", rule.project_id)
        .order("position", { ascending: true });

      const todoStatus =
        (statusList || []).find((s) => s.category === "todo") || statusList?.[0];

      // Clone task
      const newOccurrenceNumber = (rule.occurrence_count || 0) + 1;
      const newTitle = `${srcTask.title} (Lần ${newOccurrenceNumber})`;

      const { data: insertedTask, error: insertErr } = await supabase
        .from("tasks")
        .insert({
          project_id: rule.project_id,
          phase_id: srcTask.phase_id,
          status_id: todoStatus ? todoStatus.id : srcTask.status_id,
          title: newTitle,
          description: srcTask.description,
          priority: srcTask.priority as TaskPriority,
          due_date: rule.next_run_date || todayStr,
          position: srcTask.position + 1,
          created_by: user ? user.id : srcTask.created_by,
          is_recurring: false, // Instances are independent executions
          recurring_rule_id: rule.id,
          recurring_source_task_id: srcTask.id,
        })
        .select()
        .single();

      if (insertErr || !insertedTask) {
        continue;
      }

      const newTaskId = insertedTask.id;
      createdTasks.push({
        ruleId: rule.id,
        taskId: newTaskId,
        title: newTitle,
      });

      // Clone assignees
      const assignees = srcTask.task_assignees || [];
      if (assignees.length > 0) {
        const assigneeRows = assignees.map((a) => ({
          task_id: newTaskId,
          user_id: a.user_id,
          assigned_by: user ? user.id : null,
        }));
        await supabase.from("task_assignees").insert(assigneeRows);
      }

      // Clone custom field values
      const { data: customValues } = await supabase
        .from("task_custom_field_values")
        .select("field_id, value")
        .eq("task_id", srcTask.id);

      if (customValues && customValues.length > 0) {
        const customRows = customValues.map((cv) => ({
          task_id: newTaskId,
          field_id: cv.field_id,
          value: cv.value,
        }));
        await supabase.from("task_custom_field_values").insert(customRows);
      }

      // Compute next run date
      const nextRunDate = computeNextRunDate(
        rule.next_run_date || todayStr,
        rule.frequency,
        rule.interval_value,
        rule.days_of_week,
        rule.day_of_month
      );

      // Check if rule should end
      let shouldDeactivate = false;
      if (rule.end_type === "after_count" && rule.max_occurrences) {
        if (newOccurrenceNumber >= rule.max_occurrences) {
          shouldDeactivate = true;
        }
      } else if (rule.end_type === "on_date" && rule.end_date) {
        if (nextRunDate > rule.end_date) {
          shouldDeactivate = true;
        }
      }

      // Update recurring rule
      await supabase
        .from("task_recurring_rules")
        .update({
          occurrence_count: newOccurrenceNumber,
          next_run_date: nextRunDate,
          is_active: !shouldDeactivate,
          updated_at: new Date().toISOString(),
        })
        .eq("id", rule.id);

      // Log task activity on the newly created task
      await supabase.from("task_activity_logs").insert({
        task_id: newTaskId,
        actor_id: user ? user.id : srcTask.created_by,
        action: "created",
        entity_type: "status",
        details: {
          note: `Đã tự động tạo từ chu kỳ lặp lại (Quy tắc: ${rule.id})`,
          occurrence: newOccurrenceNumber,
        },
      });
    }

    return NextResponse.json({
      success: true,
      processedRulesCount: rules.length,
      createdTasksCount: createdTasks.length,
      createdTasks,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Lỗi hệ thống khi xử lý công việc lặp lại: " + message },
      { status: 500 }
    );
  }
}
