# ALPHA Work Lite — Quản lý công việc nội bộ Alpha Books

Phiên bản tinh gọn, hiệu năng cao dành riêng cho môi trường nội bộ **Alpha Books**, xây dựng trên **Next.js 15 (App Router) + Supabase + Vercel**.

> Bản mã nguồn Worklenz cũ được lưu nguyên vẹn tại nhánh Git `legacy-worklenz`.

---

## Tính năng chính (MVP 1.0)
- **Đăng nhập nội bộ 1 bước:** Email/Mật khẩu (Admin cấp tài khoản) hoặc Google OAuth (`@alphabooks.vn`), tắt đăng ký công khai.
- **Trang chủ (Việc của tôi):** Thống kê nhanh, Danh sách việc được giao, **Lịch công việc (Calendar View)**, và **Todo cá nhân**.
- **Dự án & Mẫu quy trình:** Tạo dự án từ trống hoặc từ **Mẫu quy trình chuẩn Alpha Books** (Xuất bản sách, Chiến dịch Marketing) trong 1 click.
- **Công việc (List · Kanban kéo thả · Lịch):** Đồng bộ trực tiếp qua **Supabase Realtime** (không cần Socket.IO), **Task Drawer** hỗ trợ Subtask, Phân công nhiều người, Bình luận `@mention`, Upload tệp (Supabase Storage) và gắn link **Google Drive / Google Sheet / Lark Docs**.
- **Tìm kiếm nhanh toàn cục (`Ctrl + K`):** Tìm nhanh Dự án, Công việc, Nhân sự từ mọi màn hình.
- **Hộp thư thông báo (Inbox) & Webhook Telegram / Lark Suite:** Nhận thông báo trong app và đẩy thẳng sang nhóm Telegram / Lark khi giao việc, `@mention`, hoặc hoàn thành công việc.
- **Báo cáo 3 góc nhìn:** Tổng quan Dự án · Hiệu suất Phòng ban & Nhân sự · Tra cứu tổng hợp & **Xuất Excel/CSV** chuẩn UTF-8.

Xem lộ trình Phase 2 tại [docs/ROADMAP.md](./docs/ROADMAP.md).

---

## Hướng dẫn cài đặt & Triển khai nhanh (5 phút)

### Bước 1: Chạy SQL khởi tạo Database trên Supabase
1. Mở **Supabase Dashboard → SQL Editor → New Query**.
2. Dán toàn bộ nội dung file [`supabase/migrations/001_init_alpha_work_lite.sql`](./supabase/migrations/001_init_alpha_work_lite.sql) và bấm **Run**.
3. Script sẽ tự tạo ~15 bảng chuẩn, Row Level Security (RLS), Storage bucket `attachments`, bật Realtime cho `tasks` & `notifications`, và seed sẵn phòng ban + 2 mẫu quy trình Alpha Books.

### Bước 2: Cấu hình biến môi trường
Sao chép `.env.example` thành `.env.local` (khi chạy local) hoặc nhập vào **Vercel → Project Settings → Environment Variables**:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-id>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN=alphabooks.vn
NEXT_PUBLIC_APP_URL=https://work.alphabooks.vn
```

### Bước 3: Tạo tài khoản Admin đầu tiên
- Trong **Supabase Dashboard → Authentication → Users → Add user** (tích `Auto Confirm User`).
- Tài khoản đầu tiên đăng ký vào hệ thống sẽ **tự động được gán quyền `admin`** nhờ trigger `handle_new_user()`.
- Sau khi đăng nhập, vào **Cài đặt → Nhân sự nội bộ** để tạo thêm tài khoản cho các thành viên Alpha Books.

### Bước 4: Chạy Local hoặc Deploy lên Vercel
```bash
npm install
npm run dev
```
Để deploy production: kết nối repo GitHub này trực tiếp vào **Vercel** (chọn Framework: `Next.js`, Root Directory: `.`), nhập 5 biến môi trường ở Bước 2 và bấm **Deploy**.
