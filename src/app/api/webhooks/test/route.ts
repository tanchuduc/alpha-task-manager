import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  sendLarkWebhookMessage,
  sendTelegramMessage,
} from "@/lib/webhooks";
import type { WebhookProvider } from "@/types/database";

interface TestWebhookRequest {
  provider?: WebhookProvider;
  webhook_url?: string | null;
  telegram_bot_token?: string | null;
  telegram_chat_id?: string | null;
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: "Bạn cần đăng nhập để thực hiện thao tác này." },
        { status: 401 }
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, full_name")
      .eq("id", user.id)
      .single();

    if (!profile || !["admin", "manager"].includes(profile.role)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Chỉ Quản trị viên hoặc Quản lý mới có quyền gửi thử webhook.",
        },
        { status: 403 }
      );
    }

    const payload = (await request.json().catch(() => null)) as
      | TestWebhookRequest
      | null;

    if (!payload || !payload.provider) {
      return NextResponse.json(
        { ok: false, error: "Thiếu thông tin nền tảng webhook." },
        { status: 400 }
      );
    }

    const senderName = profile.full_name || user.email || "Quản trị viên";
    const timestamp = new Date().toLocaleString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
    });

    if (payload.provider === "telegram") {
      const botToken = payload.telegram_bot_token?.trim();
      const chatId = payload.telegram_chat_id?.trim();

      if (!botToken || !chatId) {
        return NextResponse.json(
          {
            ok: false,
            error: "Vui lòng nhập đầy đủ Bot Token và Chat ID của Telegram.",
          },
          { status: 400 }
        );
      }

      const text = [
        "<b>[ALPHA Work] Kiểm tra kết nối Telegram thành công!</b>",
        "Hệ thống quản lý công việc ALPHA Work Lite đã kết nối thành công với kênh Telegram này.",
        `Người gửi thử: <b>${senderName}</b>`,
        `Thời gian: ${timestamp}`,
      ].join("\n");

      const result = await sendTelegramMessage(botToken, chatId, text);
      return NextResponse.json({
        ok: result.ok,
        error: result.error,
      });
    }

    if (payload.provider === "lark") {
      const webhookUrl = payload.webhook_url?.trim();

      if (
        !webhookUrl ||
        (!webhookUrl.startsWith("https://") && !webhookUrl.startsWith("http://"))
      ) {
        return NextResponse.json(
          {
            ok: false,
            error: "Vui lòng nhập đường dẫn Webhook URL hợp lệ của Lark Suite.",
          },
          { status: 400 }
        );
      }

      const result = await sendLarkWebhookMessage(
        webhookUrl,
        "[ALPHA Work] Kiểm tra kết nối Lark Suite thành công!",
        `Hệ thống quản lý công việc ALPHA Work Lite đã kết nối thành công với nhóm Lark này.\nNgười gửi thử: ${senderName}\nThời gian: ${timestamp}`
      );

      return NextResponse.json({
        ok: result.ok,
        error: result.error,
      });
    }

    return NextResponse.json(
      { ok: false, error: "Nền tảng webhook không được hỗ trợ." },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Đã xảy ra lỗi khi gửi tin nhắn thử nghiệm.",
      },
      { status: 500 }
    );
  }
}
