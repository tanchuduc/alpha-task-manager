"use client";

import { useState, useEffect } from "react";
import {
  RotateCcw,
  Calendar,
  Clock,
  Play,
  Check,
  Trash2,
  Loader2,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { cn, formatDateVi } from "@/lib/utils";
import type {
  TaskRecurringRule,
  RecurringFrequency,
  RecurringEndType,
} from "@/types/database";

interface TaskRecurringConfigProps {
  taskId: string;
  projectId: string;
  canEdit: boolean;
  initialRule: TaskRecurringRule | null;
  onRuleUpdated: (rule: TaskRecurringRule | null) => void;
}

const WEEKDAYS = [
  { value: 1, label: "T2", title: "Thứ Hai" },
  { value: 2, label: "T3", title: "Thứ Ba" },
  { value: 3, label: "T4", title: "Thứ Tư" },
  { value: 4, label: "T5", title: "Thứ Năm" },
  { value: 5, label: "T6", title: "Thứ Sáu" },
  { value: 6, label: "T7", title: "Thứ Bảy" },
  { value: 7, label: "CN", title: "Chủ Nhật" },
];

export default function TaskRecurringConfig({
  taskId,
  projectId,
  canEdit,
  initialRule,
  onRuleUpdated,
}: TaskRecurringConfigProps) {
  const supabase = createClient();

  const [rule, setRule] = useState<TaskRecurringRule | null>(initialRule);
  const [isEnabled, setIsEnabled] = useState<boolean>(Boolean(initialRule?.is_active));
  const [frequency, setFrequency] = useState<RecurringFrequency>(
    initialRule?.frequency || "weekly"
  );
  const [intervalValue, setIntervalValue] = useState<number>(
    initialRule?.interval_value || 1
  );
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(
    initialRule?.days_of_week && initialRule.days_of_week.length > 0
      ? initialRule.days_of_week
      : [1] // Default: Mon
  );
  const [dayOfMonth, setDayOfMonth] = useState<number>(
    initialRule?.day_of_month || 1
  );
  const [nextRunDate, setNextRunDate] = useState<string>(
    initialRule?.next_run_date ||
      new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  );
  const [endType, setEndType] = useState<RecurringEndType>(
    initialRule?.end_type || "never"
  );
  const [endDate, setEndDate] = useState<string>(initialRule?.end_date || "");
  const [maxOccurrences, setMaxOccurrences] = useState<number>(
    initialRule?.max_occurrences || 10
  );

  const [saving, setSaving] = useState(false);
  const [runningNow, setRunningNow] = useState(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(Boolean(initialRule));

  useEffect(() => {
    setRule(initialRule);
    if (initialRule) {
      setIsEnabled(initialRule.is_active);
      setFrequency(initialRule.frequency);
      setIntervalValue(initialRule.interval_value || 1);
      setDaysOfWeek(initialRule.days_of_week || []);
      setDayOfMonth(initialRule.day_of_month || 1);
      setNextRunDate(initialRule.next_run_date);
      setEndType(initialRule.end_type);
      setEndDate(initialRule.end_date || "");
      setMaxOccurrences(initialRule.max_occurrences || 10);
      setIsExpanded(true);
    }
  }, [initialRule]);

  function toggleDayOfWeek(dayVal: number) {
    if (!canEdit) return;
    setDaysOfWeek((prev) => {
      if (prev.includes(dayVal)) {
        if (prev.length <= 1) {
          toast.error("Phải chọn ít nhất một ngày trong tuần");
          return prev;
        }
        return prev.filter((d) => d !== dayVal);
      } else {
        return [...prev, dayVal].sort((a, b) => a - b);
      }
    });
  }

  async function handleSave() {
    if (!canEdit) return;
    setSaving(true);
    try {
      if (!isEnabled) {
        if (rule) {
          // Deactivate
          const { error } = await supabase
            .from("task_recurring_rules")
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq("id", rule.id);

          if (error) throw error;
          await supabase
            .from("tasks")
            .update({ is_recurring: false })
            .eq("id", taskId);

          const updated = { ...rule, is_active: false };
          setRule(updated);
          onRuleUpdated(updated);
          toast.success("Đã tắt lặp lại định kỳ cho công việc này");
        }
        setSaving(false);
        return;
      }

      const payload = {
        task_id: taskId,
        project_id: projectId,
        frequency,
        interval_value: intervalValue,
        days_of_week: frequency === "weekly" ? daysOfWeek : [],
        day_of_month: frequency === "monthly" ? dayOfMonth : null,
        end_type: endType,
        end_date: endType === "on_date" && endDate ? endDate : null,
        max_occurrences: endType === "after_count" ? maxOccurrences : null,
        next_run_date: nextRunDate,
        is_active: true,
        updated_at: new Date().toISOString(),
      };

      let savedRule: TaskRecurringRule | null = null;

      if (rule) {
        const { data, error } = await supabase
          .from("task_recurring_rules")
          .update(payload)
          .eq("id", rule.id)
          .select()
          .single();

        if (error) throw error;
        savedRule = data as TaskRecurringRule;
      } else {
        const { data, error } = await supabase
          .from("task_recurring_rules")
          .insert(payload)
          .select()
          .single();

        if (error) throw error;
        savedRule = data as TaskRecurringRule;
      }

      // Mark task as recurring
      await supabase
        .from("tasks")
        .update({
          is_recurring: true,
          recurring_rule_id: savedRule.id,
        })
        .eq("id", taskId);

      setRule(savedRule);
      onRuleUpdated(savedRule);
      toast.success("Đã lưu quy tắc lặp lại định kỳ!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Lỗi khi lưu quy tắc lặp lại: " + msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleTriggerRunNow() {
    if (!rule) {
      toast.error("Vui lòng lưu quy tắc lặp lại trước khi kích hoạt chạy.");
      return;
    }
    setRunningNow(true);
    try {
      const res = await fetch("/api/tasks/recurring/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ruleId: rule.id,
          forceRun: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không thể kích hoạt tạo việc.");
      }

      toast.success(
        `Đã tạo thành công ${data.createdTasksCount || 1} công việc bản sao!`
      );

      // Refresh rule state
      const { data: refreshed } = await supabase
        .from("task_recurring_rules")
        .select("*")
        .eq("id", rule.id)
        .single();

      if (refreshed) {
        setRule(refreshed as TaskRecurringRule);
        onRuleUpdated(refreshed as TaskRecurringRule);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setRunningNow(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900/80">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
            <RotateCcw className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <span>Lặp lại định kỳ (Recurring Schedule)</span>
              {rule?.is_active && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  Đang bật
                </span>
              )}
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Tự động nhân bản công việc theo chu kỳ cho xuất bản & vận hành
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="text-xs font-medium text-brand hover:underline cursor-pointer"
        >
          {isExpanded ? "Thu gọn" : "Cấu hình"}
        </button>
      </div>

      {isExpanded && (
        <div className="mt-3.5 space-y-3.5 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
          {/* Toggle enable switch */}
          <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-lg border border-slate-200/60 dark:border-slate-700/60">
            <div>
              <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                Kích hoạt chu kỳ tự động
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Khi bật, hệ thống sẽ tự sinh công việc mới theo lịch đã cài đặt
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isEnabled}
                disabled={!canEdit}
                onChange={(e) => setIsEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand"></div>
            </label>
          </div>

          {isEnabled && (
            <>
              {/* Frequency Selection */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Tần suất lặp lại
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: "daily", label: "Hàng ngày" },
                    { key: "weekly", label: "Hàng tuần" },
                    { key: "monthly", label: "Hàng tháng" },
                  ].map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => setFrequency(item.key as RecurringFrequency)}
                      className={cn(
                        "rounded-lg border py-1.5 text-center font-medium transition cursor-pointer",
                        frequency === item.key
                          ? "border-brand bg-brand-soft text-brand font-semibold shadow-2xs dark:border-brand dark:bg-brand/20"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Interval value */}
              <div className="flex items-center gap-2">
                <span className="text-slate-600 dark:text-slate-400">Lặp lại mỗi:</span>
                <input
                  type="number"
                  min={1}
                  max={99}
                  disabled={!canEdit}
                  value={intervalValue}
                  onChange={(e) => setIntervalValue(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-16 rounded-md border border-slate-200 bg-white px-2 py-1 text-center font-bold text-slate-800 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <span className="text-slate-600 dark:text-slate-400 font-medium">
                  {frequency === "daily"
                    ? "ngày"
                    : frequency === "weekly"
                    ? "tuần"
                    : "tháng"}
                </span>
              </div>

              {/* Weekly Day of Week Picker */}
              {frequency === "weekly" && (
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                    Chọn các ngày trong tuần:
                  </span>
                  <div className="flex items-center gap-1.5">
                    {WEEKDAYS.map((d) => {
                      const isSelected = daysOfWeek.includes(d.value);
                      return (
                        <button
                          key={d.value}
                          type="button"
                          disabled={!canEdit}
                          onClick={() => toggleDayOfWeek(d.value)}
                          title={d.title}
                          className={cn(
                            "flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-bold transition cursor-pointer",
                            isSelected
                              ? "border-brand bg-brand text-white shadow-2xs"
                              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                          )}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Monthly Day of Month Picker */}
              {frequency === "monthly" && (
                <div className="flex items-center gap-2">
                  <span className="text-slate-600 dark:text-slate-400">Vào ngày:</span>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    disabled={!canEdit}
                    value={dayOfMonth}
                    onChange={(e) =>
                      setDayOfMonth(
                        Math.min(31, Math.max(1, parseInt(e.target.value) || 1))
                      )
                    }
                    className="w-16 rounded-md border border-slate-200 bg-white px-2 py-1 text-center font-bold text-slate-800 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <span className="text-slate-600 dark:text-slate-400">hàng tháng</span>
                </div>
              )}

              {/* Next Run Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Ngày kích hoạt kế tiếp
                  </label>
                  <input
                    type="date"
                    disabled={!canEdit}
                    value={nextRunDate}
                    onChange={(e) => setNextRunDate(e.target.value)}
                    className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                {/* End Type */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Kết thúc chu kỳ
                  </label>
                  <select
                    disabled={!canEdit}
                    value={endType}
                    onChange={(e) => setEndType(e.target.value as RecurringEndType)}
                    className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="never">Không bao giờ</option>
                    <option value="on_date">Vào ngày cụ thể</option>
                    <option value="after_count">Sau số lần tạo</option>
                  </select>
                </div>
              </div>

              {endType === "on_date" && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Ngày kết thúc
                  </label>
                  <input
                    type="date"
                    disabled={!canEdit}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full sm:w-48 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              )}

              {endType === "after_count" && (
                <div className="flex items-center gap-2">
                  <span className="text-slate-600 dark:text-slate-400">Dừng sau:</span>
                  <input
                    type="number"
                    min={1}
                    max={999}
                    disabled={!canEdit}
                    value={maxOccurrences}
                    onChange={(e) =>
                      setMaxOccurrences(Math.max(1, parseInt(e.target.value) || 1))
                    }
                    className="w-20 rounded-md border border-slate-200 bg-white px-2 py-1 text-center font-bold text-slate-800 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <span className="text-slate-600 dark:text-slate-400">lần sinh việc</span>
                </div>
              )}

              {/* Statistics & Run Now Button */}
              {rule && (
                <div className="flex items-center justify-between rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                  <div className="text-[11px] text-slate-600 dark:text-slate-400">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      Đã tự động tạo: {rule.occurrence_count || 0} lần
                    </span>
                    <span className="block text-[10px] text-slate-400">
                      Lần tới: {formatDateVi(rule.next_run_date)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleTriggerRunNow}
                    disabled={runningNow || !canEdit}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 cursor-pointer disabled:opacity-50"
                  >
                    {runningNow ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    <span>Tạo bản sao ngay</span>
                  </button>
                </div>
              )}
            </>
          )}

          {/* Action buttons */}
          {canEdit && (
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-hover disabled:opacity-50 cursor-pointer shadow-2xs"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                <span>Lưu cấu hình</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
