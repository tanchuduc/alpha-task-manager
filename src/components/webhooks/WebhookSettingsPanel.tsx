"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BellRing,
  CheckCircle2,
  HelpCircle,
  Loader2,
  MessageSquare,
  PauseCircle,
  PlayCircle,
  Plus,
  Send,
  Trash2,
  Webhook,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { cn, formatDateVi } from "@/lib/utils";
import type { WebhookConfig, WebhookProvider } from "@/types/database";

interface WebhookProjectOption {
  id: string;
  name: string;
  code: string;
}

interface WebhookSettingsPanelProps {
  projects: WebhookProjectOption[];
}

const EVENT_OPTIONS = [
  {
    key: "task_assigned",
    label: "Giao việc mới",
    description: "Gửi thông báo khi có công việc mới được phân công.",
  },
  {
    key: "task_mentioned",
    label: "Nhắc tên @mention",
    description: "Gửi thông báo khi có bình luận nhắc tên thành viên.",
  },
  {
    key: "task_completed",
    label: "Hoàn thành công việc",
    description: "Gửi thông báo khi công việc được chuyển sang Hoàn thành.",
  },
] as const;

const EVENT_LABEL_MAP: Record<string, string> = {
  task_assigned: "Giao việc mới",
  task_mentioned: "Nhắc tên @mention",
  task_completed: "Hoàn thành công việc",
};

function maskSecret(value: string | null | undefined): string {
  if (!value) return "—";
  if (value.length <= 12) return "••••••••";
  return `${value.slice(0, 8)}••••••${value.slice(-4)}`;
}

export function WebhookSettingsPanel({ projects }: WebhookSettingsPanelProps) {
  const supabase = useMemo(() => createClient(), []);

  const [configs, setConfigs] = useState<WebhookConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<WebhookProvider>("telegram");
  const [projectId, setProjectId] = useState<string>("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([
    "task_assigned",
    "task_mentioned",
    "task_completed",
  ]);

  const [saving, setSaving] = useState(false);
  const [testingForm, setTestingForm] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const projectMap = useMemo(() => {
    const map = new Map<string, WebhookProjectOption>();
    for (const p of projects) {
      map.set(p.id, p);
    }
    return map;
  }, [projects]);

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("webhook_configs")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Không thể tải danh sách cấu hình Webhook", {
        description: error.message,
      });
    } else {
      setConfigs((data ?? []) as WebhookConfig[]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void fetchConfigs();
  }, [fetchConfigs]);

  const resetForm = () => {
    setName("");
    setProvider("telegram");
    setProjectId("");
    setWebhookUrl("");
    setTelegramBotToken("");
    setTelegramChatId("");
    setSelectedEvents(["task_assigned", "task_mentioned", "task_completed"]);
  };

  const toggleEvent = (eventKey: string) => {
    setSelectedEvents((prev) =>
      prev.includes(eventKey)
        ? prev.filter((item) => item !== eventKey)
        : [...prev, eventKey]
    );
  };

  const callTestApi = async (payload: {
    provider: WebhookProvider;
    webhook_url?: string | null;
    telegram_bot_token?: string | null;
    telegram_chat_id?: string | null;
  }) => {
    const res = await fetch("/api/webhooks/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    };
    if (!res.ok || !data.ok) {
      toast.error("Gửi thử Webhook thất bại", {
        description: data.error || "Vui lòng kiểm tra lại thông tin kết nối.",
      });
      return false;
    }
    toast.success("Đã gửi tin nhắn thử nghiệm thành công!", {
      description:
        payload.provider === "telegram"
          ? "Hãy kiểm tra nhóm/kênh Telegram của bạn."
          : "Hãy kiểm tra nhóm chat Lark Suite của bạn.",
    });
    return true;
  };

  const handleTestForm = async () => {
    if (provider === "telegram") {
      if (!telegramBotToken.trim() || !telegramChatId.trim()) {
        toast.error("Vui lòng nhập đầy đủ Bot Token và Chat ID trước khi gửi thử.");
        return;
      }
    } else {
      if (!webhookUrl.trim()) {
        toast.error("Vui lòng nhập Webhook URL của Lark Suite trước khi gửi thử.");
        return;
      }
    }

    setTestingForm(true);
    try {
      await callTestApi({
        provider,
        webhook_url: provider === "lark" ? webhookUrl.trim() : null,
        telegram_bot_token:
          provider === "telegram" ? telegramBotToken.trim() : null,
        telegram_chat_id:
          provider === "telegram" ? telegramChatId.trim() : null,
      });
    } finally {
      setTestingForm(false);
    }
  };

  const handleTestExisting = async (cfg: WebhookConfig) => {
    setTestingId(cfg.id);
    try {
      await callTestApi({
        provider: cfg.provider,
        webhook_url: cfg.webhook_url,
        telegram_bot_token: cfg.telegram_bot_token,
        telegram_chat_id: cfg.telegram_chat_id,
      });
    } finally {
      setTestingId(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Vui lòng nhập tên cấu hình Webhook.");
      return;
    }
    if (selectedEvents.length === 0) {
      toast.error("Vui lòng chọn ít nhất một sự kiện kích hoạt.");
      return;
    }
    if (provider === "telegram") {
      if (!telegramBotToken.trim() || !telegramChatId.trim()) {
        toast.error("Vui lòng nhập đầy đủ Telegram Bot Token và Chat ID.");
        return;
      }
    } else {
      if (
        !webhookUrl.trim().startsWith("https://") &&
        !webhookUrl.trim().startsWith("http://")
      ) {
        toast.error("Webhook URL của Lark Suite phải bắt đầu bằng https://");
        return;
      }
    }

    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("webhook_configs")
        .insert({
          name: name.trim(),
          provider,
          project_id: projectId || null,
          webhook_url: provider === "lark" ? webhookUrl.trim() : null,
          telegram_bot_token:
            provider === "telegram" ? telegramBotToken.trim() : null,
          telegram_chat_id:
            provider === "telegram" ? telegramChatId.trim() : null,
          events: selectedEvents,
          is_active: true,
          created_by: user?.id ?? null,
        })
        .select("*")
        .single();

      if (error) {
        toast.error("Không thể lưu cấu hình Webhook", {
          description: error.message,
        });
        return;
      }

      setConfigs((prev) => [data as WebhookConfig, ...prev]);
      toast.success("Đã thêm cấu hình Webhook mới!");
      resetForm();
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (cfg: WebhookConfig) => {
    setTogglingId(cfg.id);
    const nextState = !cfg.is_active;
    const { error } = await supabase
      .from("webhook_configs")
      .update({ is_active: nextState })
      .eq("id", cfg.id);

    if (error) {
      toast.error("Không thể cập nhật trạng thái Webhook", {
        description: error.message,
      });
    } else {
      setConfigs((prev) =>
        prev.map((item) =>
          item.id === cfg.id ? { ...item, is_active: nextState } : item
        )
      );
      toast.success(
        nextState
          ? `Đã kích hoạt "${cfg.name}"`
          : `Đã tạm dừng "${cfg.name}"`
      );
    }
    setTogglingId(null);
  };

  const handleDelete = async (cfg: WebhookConfig) => {
    const confirmed = window.confirm(
      `Bạn có chắc muốn xóa cấu hình Webhook "${cfg.name}" không?`
    );
    if (!confirmed) return;

    setDeletingId(cfg.id);
    const { error } = await supabase
      .from("webhook_configs")
      .delete()
      .eq("id", cfg.id);

    if (error) {
      toast.error("Không thể xóa cấu hình Webhook", {
        description: error.message,
      });
    } else {
      setConfigs((prev) => prev.filter((item) => item.id !== cfg.id));
      toast.success(`Đã xóa cấu hình "${cfg.name}"`);
    }
    setDeletingId(null);
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
            <Webhook className="h-5 w-5 text-brand" />
            Tích hợp Thông báo Telegram &amp; Lark Suite
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Tự động đẩy thông báo giao việc, nhắc tên @mention và hoàn thành công
            việc về nhóm chat nội bộ.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowGuide((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <HelpCircle className="h-4 w-4 text-brand" />
            {showGuide ? "Ẩn hướng dẫn" : "Hướng dẫn thiết lập"}
          </button>
          <button
            type="button"
            onClick={() => setShowForm((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-hover"
          >
            {showForm ? (
              <>
                <X className="h-4 w-4" />
                Đóng biểu mẫu
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Thêm Webhook
              </>
            )}
          </button>
        </div>
      </div>

      {/* Setup Guide (Telegram & Lark) */}
      {showGuide && (
        <div className="grid gap-4 rounded-xl border border-orange-200/80 bg-brand-soft/60 p-4 dark:border-orange-900/50 dark:bg-brand-soft-dark/40 md:grid-cols-2">
          <div className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Send className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              Cách lấy Telegram Bot Token &amp; Chat ID
            </h3>
            <ol className="list-decimal space-y-1 pl-4 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              <li>
                Mở Telegram, tìm <code className="rounded bg-white/80 px-1 py-0.5 font-mono text-slate-800 dark:bg-slate-800 dark:text-slate-200">@BotFather</code> và gửi lệnh <code className="rounded bg-white/80 px-1 py-0.5 font-mono text-slate-800 dark:bg-slate-800 dark:text-slate-200">/newbot</code> để tạo bot mới, sau đó sao chép <strong>Bot Token</strong>.
              </li>
              <li>
                Thêm bot vừa tạo vào nhóm chat Telegram cần nhận thông báo.
              </li>
              <li>
                Lấy <strong>Chat ID</strong> của nhóm (thường bắt đầu bằng <code className="rounded bg-white/80 px-1 py-0.5 font-mono text-slate-800 dark:bg-slate-800 dark:text-slate-200">-100...</code>) bằng cách dùng <code className="rounded bg-white/80 px-1 py-0.5 font-mono text-slate-800 dark:bg-slate-800 dark:text-slate-200">@userinfobot</code> hoặc truy cập API <code className="rounded bg-white/80 px-1 py-0.5 font-mono text-slate-800 dark:bg-slate-800 dark:text-slate-200">getUpdates</code> của bot.
              </li>
            </ol>
          </div>

          <div className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <MessageSquare className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              Cách tạo Lark Suite Custom Bot Webhook
            </h3>
            <ol className="list-decimal space-y-1 pl-4 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              <li>
                Mở nhóm chat trên <strong>Lark Suite</strong> cần nhận thông báo, chọn biểu tượng <strong>Cài đặt nhóm (Settings)</strong>.
              </li>
              <li>
                Chọn mục <strong>Bots</strong> &rarr; nhấn <strong>Add Bot</strong> &rarr; chọn <strong>Custom Bot</strong> và đặt tên (ví dụ: <em>ALPHA Work Bot</em>).
              </li>
              <li>
                Sao chép đường dẫn <strong>Webhook URL</strong> (dạng <code className="rounded bg-white/80 px-1 py-0.5 font-mono text-slate-800 dark:bg-slate-800 dark:text-slate-200">https://open.larksuite.com/open-apis/bot/v2/hook/...</code>) và dán vào cấu hình bên dưới.
              </li>
            </ol>
          </div>
        </div>
      )}

      {/* Add Webhook Form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Thêm cấu hình Webhook mới
            </h3>
            <button
              type="button"
              onClick={() => {
                resetForm();
                setShowForm(false);
              }}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Config Name */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Tên cấu hình <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="VD: Nhóm Telegram Biên tập, Lark Ban Giám đốc..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            {/* Scope */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Phạm vi áp dụng
              </label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="">Toàn công ty (tất cả dự án)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.code}] {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Provider selector */}
          <div className="mt-4 space-y-1.5">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Nền tảng nhận thông báo
            </label>
            <div className="grid grid-cols-2 gap-3 sm:max-w-md">
              <button
                type="button"
                onClick={() => setProvider("telegram")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm font-medium transition",
                  provider === "telegram"
                    ? "border-brand bg-brand-soft text-brand dark:bg-brand-soft-dark dark:text-orange-300"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
                )}
              >
                <Send className="h-4 w-4" />
                Telegram Bot
              </button>
              <button
                type="button"
                onClick={() => setProvider("lark")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm font-medium transition",
                  provider === "lark"
                    ? "border-brand bg-brand-soft text-brand dark:bg-brand-soft-dark dark:text-orange-300"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
                )}
              >
                <MessageSquare className="h-4 w-4" />
                Lark Suite Webhook
              </button>
            </div>
          </div>

          {/* Provider-specific fields */}
          {provider === "telegram" ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Telegram Bot Token <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={telegramBotToken}
                  onChange={(e) => setTelegramBotToken(e.target.value)}
                  placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Telegram Chat ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  placeholder="-1001234567890"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-1.5">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Lark Webhook URL <span className="text-red-500">*</span>
              </label>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://open.larksuite.com/open-apis/bot/v2/hook/..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          )}

          {/* Events checkboxes */}
          <div className="mt-4 space-y-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Sự kiện kích hoạt <span className="text-red-500">*</span>
            </label>
            <div className="grid gap-2.5 sm:grid-cols-3">
              {EVENT_OPTIONS.map((evt) => {
                const checked = selectedEvents.includes(evt.key);
                return (
                  <label
                    key={evt.key}
                    className={cn(
                      "flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition",
                      checked
                        ? "border-brand/60 bg-brand-soft/60 dark:border-brand/50 dark:bg-brand-soft-dark/40"
                        : "border-slate-200 bg-slate-50/50 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/50 dark:hover:bg-slate-800/60"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleEvent(evt.key)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-brand"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {evt.label}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {evt.description}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Form actions */}
          <div className="mt-5 flex flex-wrap items-center justify-end gap-2.5 border-t border-slate-100 pt-4 dark:border-slate-800">
            <button
              type="button"
              onClick={handleTestForm}
              disabled={testingForm || saving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {testingForm ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4 text-brand" />
              )}
              Gửi thử (Test)
            </button>

            <button
              type="submit"
              disabled={saving || testingForm}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-hover disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Lưu cấu hình
            </button>
          </div>
        </form>
      )}

      {/* Existing Webhooks List */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin text-brand" />
            Đang tải cấu hình Webhook...
          </div>
        ) : configs.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand dark:bg-brand-soft-dark">
              <BellRing className="h-6 w-6" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
              Chưa có cấu hình Webhook nào
            </h3>
            <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
              Kết nối Telegram Bot hoặc Lark Suite Custom Bot để đội ngũ Alpha
              Books nhận cảnh báo công việc tức thì ngay trong nhóm chat.
            </p>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white transition hover:bg-brand-hover"
            >
              <Plus className="h-4 w-4" />
              Tạo cấu hình đầu tiên
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {configs.map((cfg) => {
              const scopeProject = cfg.project_id
                ? projectMap.get(cfg.project_id)
                : null;
              const isTesting = testingId === cfg.id;
              const isToggling = togglingId === cfg.id;
              const isDeleting = deletingId === cfg.id;

              return (
                <div
                  key={cfg.id}
                  className="flex flex-col gap-4 p-4 transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold",
                          cfg.provider === "telegram"
                            ? "bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300"
                            : "bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300"
                        )}
                      >
                        {cfg.provider === "telegram" ? (
                          <>
                            <Send className="h-3 w-3" />
                            Telegram Bot
                          </>
                        ) : (
                          <>
                            <MessageSquare className="h-3 w-3" />
                            Lark Suite
                          </>
                        )}
                      </span>

                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {cfg.name}
                      </span>

                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                          cfg.is_active
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            cfg.is_active ? "bg-emerald-500" : "bg-slate-400"
                          )}
                        />
                        {cfg.is_active ? "Đang hoạt động" : "Tạm dừng"}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span>
                        Phạm vi:{" "}
                        <strong className="font-medium text-slate-700 dark:text-slate-200">
                          {scopeProject
                            ? `[${scopeProject.code}] ${scopeProject.name}`
                            : "Toàn công ty"}
                        </strong>
                      </span>

                      {cfg.provider === "telegram" ? (
                        <span className="font-mono">
                          Chat ID: {cfg.telegram_chat_id || "—"} · Token:{" "}
                          {maskSecret(cfg.telegram_bot_token)}
                        </span>
                      ) : (
                        <span className="font-mono">
                          URL: {maskSecret(cfg.webhook_url)}
                        </span>
                      )}

                      <span>Ngày tạo: {formatDateVi(cfg.created_at)}</span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {(cfg.events ?? []).map((ev) => (
                        <span
                          key={ev}
                          className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300"
                        >
                          {EVENT_LABEL_MAP[ev] ?? ev}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Row Actions */}
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleTestExisting(cfg)}
                      disabled={isTesting}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-brand/40 hover:text-brand disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-brand/50"
                    >
                      {isTesting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      Gửi thử
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleActive(cfg)}
                      disabled={isToggling}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-60",
                        cfg.is_active
                          ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
                      )}
                    >
                      {isToggling ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : cfg.is_active ? (
                        <PauseCircle className="h-3.5 w-3.5" />
                      ) : (
                        <PlayCircle className="h-3.5 w-3.5" />
                      )}
                      {cfg.is_active ? "Tạm dừng" : "Kích hoạt"}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(cfg)}
                      disabled={isDeleting}
                      title="Xóa cấu hình"
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100 disabled:opacity-60 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/70"
                    >
                      {isDeleting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      Xóa
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
