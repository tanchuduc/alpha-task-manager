import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  dispatchWebhookNotification,
  type WebhookEventPayload,
} from "@/lib/webhooks";

const ALLOWED_EVENTS = new Set<WebhookEventPayload["event"]>([
  "task_assigned",
  "task_mentioned",
  "task_completed",
  "test",
]);

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

    const rawBody = (await request.json().catch(() => null)) as
      | Partial<WebhookEventPayload>
      | null;

    if (!rawBody || typeof rawBody !== "object") {
      return NextResponse.json(
        { ok: false, error: "Dữ liệu gửi lên không hợp lệ." },
        { status: 400 }
      );
    }

    const { event, projectId, title, body, link } = rawBody;

    if (!event || !ALLOWED_EVENTS.has(event)) {
      return NextResponse.json(
        { ok: false, error: "Loại sự kiện webhook không hợp lệ." },
        { status: 400 }
      );
    }

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json(
        { ok: false, error: "Thiếu tiêu đề thông báo webhook." },
        { status: 400 }
      );
    }

    const result = await dispatchWebhookNotification({
      event,
      projectId: typeof projectId === "string" ? projectId : null,
      title: title.trim(),
      body: typeof body === "string" ? body.trim() : "",
      link: typeof link === "string" ? link.trim() : undefined,
    });

    return NextResponse.json({
      ok: true,
      sent: result.sent,
      failed: result.failed,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Đã xảy ra lỗi khi gửi thông báo webhook.",
      },
      { status: 500 }
    );
  }
}
