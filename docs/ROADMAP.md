# Lộ trình Sản phẩm — ALPHA Work Lite

**Phiên bản:** `1.0.0-lite`  
**Kiến trúc:** Next.js 15 (App Router) + Supabase (PostgreSQL, Auth, Realtime, Storage) + Vercel  
**Nhánh lưu trữ bản cũ:** `legacy-worklenz`

---

## Phase 1 — MVP (Triển khai hiện tại)

### 6 Phân hệ cốt lõi
1. **Xác thực & Nhân sự nội bộ:** Đăng nhập 1 bước (Email/Mật khẩu + Google OAuth `@alphabooks.vn`), tắt đăng ký tự do. Admin tạo/quản lý nhân sự, phân quyền (`Admin / Quản lý / Nhân viên`) và chia **Phòng ban**.
2. **Trang chủ (Việc của tôi):** Thống kê nhanh (Đang làm, Quá hạn, Hoàn thành tuần này), danh sách việc ưu tiên được giao, việc cần làm cá nhân (`Personal Todos`).
3. **Quản lý Dự án:** Tạo/sửa/lưu trữ dự án, gán phòng ban & thành viên tham gia.
4. **Quản lý Công việc (Tasks):** Xem dạng **Danh sách (List)** & **Bảng Kanban kéo thả**, đồng bộ Realtime qua Supabase. **Task Drawer** đầy đủ: Subtask, Phân công nhiều người, Mức ưu tiên, Hạn hoàn thành, Mô tả, Bình luận (`@mention`), Đính kèm tệp (Supabase Storage) và gắn link Google Drive / Google Sheet / Lark Docs.
5. **Hộp thư thông báo nội bộ (Inbox):** Nhận thông báo khi được giao việc, `@mention`, hoặc cập nhật trạng thái.
6. **Báo cáo 3 góc nhìn:**
   - Tổng quan Dự án (Ban Giám đốc)
   - Hiệu suất Phòng ban & Nhân sự (Trưởng phòng/Leader)
   - Tra cứu Tổng hợp & **Xuất Excel/CSV**

### 4 Tính năng mở rộng đưa thẳng vào MVP (Nhóm A)
- **Lịch công việc (Calendar View gọn):** Xem hạn hoàn thành theo tháng/tuần trên Trang chủ và trong từng Dự án.
- **Mẫu Dự án / Quy trình chuẩn (Project Templates):** Seed sẵn mẫu *Quy trình Xuất bản sách* và *Quy trình Chiến dịch Marketing*, cho phép tạo dự án mới trong 1 click.
- **Tìm kiếm nhanh toàn cục (`Ctrl + K`):** Tìm nhanh Dự án, Công việc, Nhân sự từ bất kỳ màn hình nào.
- **Thông báo Webhook sang Telegram / Lark Suite:** Gửi cảnh báo trực tiếp vào nhóm chat nội bộ khi giao việc mới hoặc `@mention`.

---

## Phase 2 — Backlog (Ghi nhận từ Nhóm B)

Các tính năng sau sẽ được triển khai ở Phase 2 sau khi MVP vận hành ổn định trong nội bộ Alpha Books:

1. **Công việc lặp lại định kỳ (Recurring Tasks):**
   - Tự động sinh đầu việc lặp theo chu kỳ hằng tuần / hằng tháng / hằng quý (họp giao ban, báo cáo doanh số, kiểm kho) bằng Vercel Cron + Supabase.
2. **Ghim tài liệu dự án (Project Links / Resource Hub):**
   - Khu vực ghim nhanh các liên kết dùng chung của dự án (Google Sheet kế hoạch, thư mục Google Drive bản thảo, tài liệu Lark Docs) ngay đầu trang Dự án.
3. **Nhật ký quản trị hệ thống (Audit Log cơ bản):**
   - Ghi lại các thao tác nhạy cảm (xóa dự án, thay đổi vai trò nhân sự, khóa tài khoản) để Admin tra cứu khi cần.
4. **Đồng bộ lịch `.ics` (Calendar Feed):**
   - Cung cấp link `.ics` cá nhân để nhân sự nhúng deadline trực tiếp vào Google Calendar mà không cần cấu hình OAuth phức tạp.
