# Lộ trình Sản phẩm — ALPHA Work Enterprise Lite

**Phiên bản:** `1.1.0-enterprise`  
**Kiến trúc:** Next.js 15 (App Router) + Supabase (PostgreSQL, Auth, Realtime, Storage) + Vercel  
**Nhánh lưu trữ bản cũ:** `legacy-worklenz`

---

## Tính năng đã hoàn thành (Phase 1 & Phase 1.5)

### 1. Giao tiếp & Cộng tác Realtime (Đã hoàn thành)
- **Kênh Chat đa năng (`/chat`):**
  - Chat 1-1 giữa 23 nhân sự nội bộ Alpha Books: danh sách trạng thái trực tuyến, avatar, xem trước tin nhắn, badge tin chưa đọc.
  - Chat 5 kênh Phòng ban: Ban Biên tập, Marketing, Thiết kế, Kinh doanh, Vận hành.
  - Gửi tệp đính kèm, ảnh qua Supabase Storage, định dạng ngày giờ, đồng bộ tức thì qua Supabase Realtime.
  - Tự động tạo thông báo Inbox và gọi Webhook Telegram/Lark khi có tin nhắn 1-1 mới.
- **Tab Thảo luận & Cập nhật Dự án (Project Updates):**
  - Bảng tin tiến độ dự án chuyên dụng: đăng bài cập nhật kèm tiêu đề, ghim bài quan trọng.
  - Thả biểu cảm cảm xúc (👍, ❤️, 🎉, 👀, 🔥) kèm bộ đếm tương tác.
  - Bình luận theo luồng (Threaded Comments) kèm `@mention`.
- **Component `@mention` thông minh:**
  - Tự động gợi ý nhân sự khi gõ `@` trong Chat, Thảo luận và Chi tiết công việc.

### 2. Hiệu suất & Truy vết (Đã hoàn thành)
- **Nhật ký hoạt động & Lịch sử thay đổi (Activity Logs / Audit Trail):**
  - Tự động ghi vết chi tiết từng giây mọi biến động: đổi trạng thái, dời hạn hoàn thành, đổi mức ưu tiên, gán/bỏ người làm, tải file, thêm việc con.
  - Hiển thị dòng thời gian trực quan (Timeline) ngay trong Task Drawer.
- **Thanh thao tác hàng loạt (Bulk Actions Bar):**
  - Tích chọn nhiều công việc trong List View (hỗ trợ chọn toàn bộ trong nhóm).
  - Thanh floating bar nổi phía dưới cho phép: Đổi trạng thái hàng loạt, Gán người phụ trách hàng loạt, Dời hạn hoàn thành hàng loạt, Đổi mức ưu tiên hàng loạt, Xóa hàng loạt có xác nhận.
- **Trường dữ liệu tùy biến theo đặc thù sách (Custom Fields):**
  - Định nghĩa trường linh hoạt cho từng dự án sách: Tác giả/Dịch giả, Số trang dự kiến, Khổ sách, Giá bìa, Số lượng in đợt 1.
  - Nhập và lưu trực tiếp trong Task Drawer, hỗ trợ các loại Text, Number, Dropdown, Date.

### 3. Phân hệ Quản trị & Công việc Cốt lõi (Đã hoàn thành)
- **Trang chủ (Việc của tôi):** 4 thẻ KPI, Danh sách việc được giao, Lịch tháng, Todo cá nhân.
- **Dự án & Mẫu quy trình:** Tạo dự án trống hoặc 1-click từ Mẫu quy trình Alpha Books (*Xuất bản sách*, *Chiến dịch Marketing*).
- **3 chế độ xem Công việc:** Danh sách, Kanban kéo thả `@dnd-kit`, Lịch tháng/tuần.
- **Báo cáo 3 góc nhìn:** Tổng quan Dự án · Hiệu suất Phòng ban · Tra cứu tổng hợp & Xuất Excel/CSV (UTF-8 BOM).
- **Hộp thư thông báo Inbox & Webhook Telegram/Lark.**
- **Tìm kiếm nhanh toàn cục (`Ctrl + K`).**

---

## Phase 2 — Kế hoạch tiếp theo
1. **Ma trận Phân quyền Chuyên sâu (Advanced RBAC & Project Schemes):**
   - Phân vai trò trong từng dự án (Trưởng dự án, Biên tập viên, Thiết kế, CTV...).
   - Khóa/chặn quyền sửa/xóa việc của người khác theo vai trò.
2. **Kho Tệp & Tài liệu tập trung theo Dự án (Project Files & Links Hub):**
   - Tab quản lý tệp và liên kết dùng chung của toàn dự án.
3. **Mối quan hệ phụ thuộc công việc (Task Dependencies):**
   - Thiết lập việc A chặn việc B trong quy trình sản xuất sách.
4. **Công việc lặp lại định kỳ (Recurring Tasks).**
