import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { WebhookConfig } from "@/types/database";

export interface WebhookEventPayload {
  event:
    | "task_assigned"
    | "task_mentioned"
    | "task_completed"
    | "direct_message"
    | "project_update_posted"
    | "test";
  projectId?: string | null;
  title: string;
  body: string;
  link?: string;
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      }
    );
    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `Telegram API ${res.status}: ${errText}` };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Không thể kết nối Telegram",
    };
  }
}

export async function sendLarkWebhookMessage(
  webhookUrl: string,
  title: string,
  body: string,
  link?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const textContent = link ? `${title}\n${body}\nXem chi tiết: ${link}` : `${title}\n${body}`;
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        msg_type: "text",
        content: {
          text: textContent,
        },
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `Lark Webhook ${res.status}: ${errText}` };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Không thể kết nối Lark Webhook",
    };
  }
}

export async function dispatchWebhookNotification(
  payload: WebhookEventPayload
): Promise<{ sent: number; failed: number }> {
  const supabase = await createServerSupabaseClient();
  const { data: configs } = await supabase
    .from("webhook_configs")
    .select("*")
    .eq("is_active", true);

  if (!configs || configs.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const fullLink =
    payload.link && appUrl && payload.link.startsWith("/")
      ? `${appUrl}${payload.link}`
      : payload.link;

  const matching = (configs as WebhookConfig[]).filter((cfg) => {
    const projectMatches =
      cfg.project_id === null ||
      (payload.projectId && cfg.project_id === payload.projectId);
    const eventMatches =
      payload.event === "test" ||
      (Array.isArray(cfg.events) && cfg.events.includes(payload.event));
    return projectMatches && eventMatches;
  });

  let sent = 0;
  let failed = 0;

  await Promise.all(
    matching.map(async (cfg) => {
      let result: { ok: boolean } = { ok: false };
      if (cfg.provider === "telegram" && cfg.telegram_bot_token && cfg.telegram_chat_id) {
        const tgText = `<b>[ALPHA Work] ${payload.title}</b>\n${payload.body}${
          fullLink ? `\n<a href="${fullLink}">Mở công việc</a>` : ""
        }`;
        result = await sendTelegramMessage(
          cfg.telegram_bot_token,
          cfg.telegram_chat_id,
          tgText
        );
      } else if (cfg.provider === "lark" && cfg.webhook_url) {
        result = await sendLarkWebhookMessage(
          cfg.webhook_url,
          `[ALPHA Work] ${payload.title}`,
          payload.body,
          fullLink
        );
      }
      if (result.ok) sent += 1;
      else failed += 1;
    })
  );

  return { sent, failed };
}
