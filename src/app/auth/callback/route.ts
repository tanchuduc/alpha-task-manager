import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/home";

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const allowedDomain = process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN?.trim().toLowerCase();
      const email = (data.user.email || "").toLowerCase();

      if (allowedDomain && !email.endsWith(`@${allowedDomain}`)) {
        await supabase.auth.signOut();
        return NextResponse.redirect(
          `${origin}/login?error=${encodeURIComponent(
            `Chỉ cho phép đăng nhập bằng email nội bộ @${allowedDomain}`
          )}`
        );
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent("Đăng nhập không thành công. Vui lòng thử lại.")}`
  );
}
