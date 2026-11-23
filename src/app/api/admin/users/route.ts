import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/types/database";

const VALID_ROLES: UserRole[] = ["admin", "manager", "member"];

async function verifyAdmin() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json(
        { error: "Bạn chưa đăng nhập." },
        { status: 401 }
      ),
      user: null,
    };
  }

  const { data: requester } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();

  if (!requester || requester.role !== "admin") {
    return {
      error: NextResponse.json(
        { error: "Chỉ Quản trị viên (Admin) mới có quyền thực hiện thao tác này." },
        { status: 403 }
      ),
      user: null,
    };
  }

  return { error: null, user };
}

export async function POST(request: Request) {
  const { error: authError } = await verifyAdmin();
  if (authError) return authError;

  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      full_name?: string;
      role?: UserRole;
      department_id?: string | null;
      job_title?: string | null;
    };

    const email = body.email?.trim().toLowerCase();
    const password = body.password;
    const fullName = body.full_name?.trim();
    const role: UserRole =
      body.role && VALID_ROLES.includes(body.role) ? body.role : "member";
    const departmentId = body.department_id || null;
    const jobTitle = body.job_title?.trim() || null;

    if (!email || !password || !fullName) {
      return NextResponse.json(
        { error: "Vui lòng nhập đầy đủ họ tên, email và mật khẩu." },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Mật khẩu phải có ít nhất 6 ký tự." },
        { status: 400 }
      );
    }

    const adminClient = createAdminSupabaseClient();

    const { data: created, error: createErr } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          role,
        },
      });

    if (createErr || !created.user) {
      return NextResponse.json(
        {
          error:
            createErr?.message === "A user with this email address has already been registered"
              ? "Email này đã tồn tại trong hệ thống."
              : createErr?.message || "Không thể tạo tài khoản nhân sự.",
        },
        { status: 400 }
      );
    }

    const { data: updatedProfile, error: profileErr } = await adminClient
      .from("profiles")
      .upsert(
        {
          id: created.user.id,
          email,
          full_name: fullName,
          role,
          department_id: departmentId,
          job_title: jobTitle,
          is_active: true,
        },
        { onConflict: "id" }
      )
      .select("*, department:departments(*)")
      .single();

    if (profileErr) {
      return NextResponse.json(
        { error: `Đã tạo user nhưng lỗi cập nhật hồ sơ: ${profileErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ profile: updatedProfile }, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Lỗi hệ thống khi tạo tài khoản.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const { error: authError, user } = await verifyAdmin();
  if (authError || !user) return authError!;

  try {
    const body = (await request.json()) as {
      user_id?: string;
      role?: UserRole;
      department_id?: string | null;
      job_title?: string | null;
      is_active?: boolean;
    };

    if (!body.user_id) {
      return NextResponse.json(
        { error: "Thiếu mã nhân sự (user_id)." },
        { status: 400 }
      );
    }

    if (body.user_id === user.id && body.is_active === false) {
      return NextResponse.json(
        { error: "Không thể tự vô hiệu hóa tài khoản của chính mình." },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.role !== undefined) {
      if (!VALID_ROLES.includes(body.role)) {
        return NextResponse.json(
          { error: "Vai trò không hợp lệ." },
          { status: 400 }
        );
      }
      updates.role = body.role;
    }
    if (body.department_id !== undefined) {
      updates.department_id = body.department_id || null;
    }
    if (body.job_title !== undefined) {
      updates.job_title = body.job_title?.trim() || null;
    }
    if (body.is_active !== undefined) {
      updates.is_active = Boolean(body.is_active);
    }

    const adminClient = createAdminSupabaseClient();
    const { data: updatedProfile, error: updateErr } = await adminClient
      .from("profiles")
      .update(updates)
      .eq("id", body.user_id)
      .select("*, department:departments(*)")
      .single();

    if (updateErr) {
      return NextResponse.json(
        { error: `Không thể cập nhật nhân sự: ${updateErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ profile: updatedProfile }, { status: 200 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Lỗi hệ thống khi cập nhật nhân sự.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
