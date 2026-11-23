import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hasSystemPermission, SYSTEM_PERMISSIONS } from "@/lib/permissions";
import type { Profile, UserRole } from "@/types/database";

const VALID_ROLES: UserRole[] = ["admin", "manager", "member"];

async function verifyManageUsersAccess() {
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
      requester: null,
    };
  }

  const { data: requester } = await supabase
    .from("profiles")
    .select("*, custom_role:roles(*)")
    .eq("id", user.id)
    .single();

  const requesterProfile = requester as Profile | null;
  if (
    !requesterProfile ||
    !hasSystemPermission(requesterProfile, SYSTEM_PERMISSIONS.MANAGE_USERS)
  ) {
    return {
      error: NextResponse.json(
        { error: "Bạn không có quyền quản lý tài khoản nhân sự (manage_users)." },
        { status: 403 }
      ),
      user: null,
      requester: null,
    };
  }

  return { error: null, user, requester: requesterProfile };
}

export async function POST(request: Request) {
  const { error: authError } = await verifyManageUsersAccess();
  if (authError) return authError;

  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      full_name?: string;
      role?: UserRole;
      department_id?: string | null;
      manager_id?: string | null;
      job_title?: string | null;
    };

    const email = body.email?.trim().toLowerCase();
    const password = body.password;
    const fullName = body.full_name?.trim();
    const role: UserRole =
      body.role && VALID_ROLES.includes(body.role) ? body.role : "member";
    const departmentId = body.department_id || null;
    const managerId = body.manager_id || null;
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
          manager_id: managerId,
          job_title: jobTitle,
          is_active: true,
        },
        { onConflict: "id" }
      )
      .select("*, department:departments(*), manager:profiles!manager_id(id, full_name, email, avatar_url, job_title), custom_role:roles(*)")
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
  const { error: authError, user, requester } = await verifyManageUsersAccess();
  if (authError || !user || !requester) return authError!;

  try {
    const body = (await request.json()) as {
      user_id?: string;
      role?: UserRole;
      department_id?: string | null;
      manager_id?: string | null;
      custom_role_id?: string | null;
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
      if (body.role === "admin" && requester.role !== "admin") {
        return NextResponse.json(
          { error: "Chỉ Quản trị viên gốc (Admin) mới có thể cấp quyền Admin." },
          { status: 403 }
        );
      }
      updates.role = body.role;
    }
    if (body.department_id !== undefined) {
      updates.department_id = body.department_id || null;
    }
    if (body.manager_id !== undefined) {
      if (body.manager_id && body.manager_id === body.user_id) {
        return NextResponse.json(
          { error: "Không thể chọn chính mình làm quản lý trực tiếp." },
          { status: 400 }
        );
      }
      updates.manager_id = body.manager_id || null;
    }
    if (body.custom_role_id !== undefined) {
      updates.custom_role_id = body.custom_role_id || null;
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
      .select("*, department:departments(*), manager:profiles!manager_id(id, full_name, email, avatar_url, job_title), custom_role:roles(*)")
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
