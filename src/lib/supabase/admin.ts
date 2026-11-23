import { createClient } from "@supabase/supabase-js";

export function createAdminSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Thiếu cấu hình SUPABASE_SERVICE_ROLE_KEY để thực hiện thao tác quản trị nhân sự"
    );
  }

  return createClient(url, serviceKey, {
    db: { schema: "alpha_lite" },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
