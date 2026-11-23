# BÁO CÁO TIẾN ĐỘ & LỘ TRÌNH DỰ ÁN (PROJECT ROADMAP & STATUS)

**Dự án:** ALPHA Work (Alpha Task Manager)  
**Phiên bản hiện tại:** `3.1.0-alpha.internal`  
**Ngày cập nhật:** 23/11/2026  
**Trạng thái tổng thể:** 🟢 Sẵn sàng kiểm thử E2E & Vận hành nội bộ (Internal Ready)  
**Kho mã nguồn:** [GitHub Repository](https://github.com/tanchuduc/alpha-task-manager.git) (`branch: main`)

---

## 1. TỔNG QUAN TIẾN ĐỘ THEO CÁC GIAI ĐOẠN (MILESTONES)

| Giai đoạn (Phase) | Nội dung trọng tâm | Trạng thái | Bằng chứng / Commits |
|---|---|:---:|---|
| **Phase 1: Database & Cloud Postgres** | Thiết lập Supabase, phân tách schema `alpha_work`, migration tự động, DDL/DML, connection pooling & SSL | ✅ **Đã hoàn thành** | `4497f893`, `3b28b9e7`, `76f93c36`, `7881d02d`, `791ffca4` |
| **Phase 2: Multi-Cloud Deployment** | Đóng gói Backend Serverless (Vercel), Frontend SPA (Cloudflare Pages), Cookie cross-domain (`SameSite=None`, `Secure`) | ✅ **Đã hoàn thành** | `4255e58d`, `b3cb46d0`, `519d8870`, `53ca1ec4`, `32deea38` |
| **Phase 3: Doanh nghiệp hóa nội bộ (Internal Hardening)** | Gỡ bỏ SaaS billing, seat limits, guest limits, trial alert; cố định Enterprise Tier; đóng đăng ký tự do, chặn cổng Client Portal | ✅ **Đã hoàn thành** | `267bf04f`, `c34a0964` |
| **Phase 4: Bản địa hóa & Tinh chỉnh UX/UI** | Chuyển mặc định sang Tiếng Việt, thêm bộ chọn ngôn ngữ, tối ưu thuật ngữ quản trị công việc tiếng Việt, chuẩn hóa form đăng nhập 1 bước | ✅ **Đã hoàn thành** | `a1ff23bc`, `0b3b9510`, `e9d3e5f9`, `a15b03f7`, `37a053f2` |
| **Phase 5: Kiểm thử E2E & Vận hành (E2E & Production)** | Kiểm thử luồng công việc thực tế, phân quyền phòng ban/nhân sự, backup/restore định kỳ, cấu hình domain & SSL chính thức | 🟡 **Đang chuẩn bị** | Sẵn sàng triển khai |

---

## 2. CHI TIẾT CÁC HẠNG MỤC ĐÃ HOÀN THÀNH

### ✅ Phase 1: Kiến trúc Dữ liệu Cloud (Supabase PostgreSQL)
- **Tách Schema riêng biệt:** Toàn bộ hệ thống chạy trên schema chuyên dụng `alpha_work`, tự động phân giải `search_path`.
- **Hệ thống Migration tự động:** Viết script `npm run setup:supabase` xử lý trọn gói khởi tạo bảng, ràng buộc toàn vẹn, functions, views.
- **Sửa lỗi Schema:** Đã bổ sung đầy đủ các cột và giá trị còn thiếu (`personal_todo_list`, `project_categories`, `project_subscribers`, `sys_project_statuses`, `task_priorities`).
- **Tối ưu kết nối:** Cấu hình SSL thông minh override connection string của Supabase Transaction Pooler (Port 6543) và Direct Connection (Port 5432).

### ✅ Phase 2: Triển khai Đa nền tảng (Multi-Cloud / Serverless)
- **Frontend SPA (Cloudflare Pages):** Cấu hình rules redirect SPA `_redirects` hoặc `_routes.json`, tối ưu tốc độ phân phối tĩnh qua mạng lưới CDN toàn cầu của Cloudflare.
- **Backend API (Vercel Serverless Function):** Thiết lập entrypoint `/api` tương thích Vercel Serverless, loại bỏ các native module không tương thích serverless (như `segfault-handler`), cố định phiên bản tương thích CJS (`sanitize-html@2.13.0`, `htmlparser2@9.1.0`).
- **Bảo mật Cookie Cross-Origin:** Cấu hình session cookie với `SameSite=None` và `Secure=true` để Frontend và Backend chạy độc lập trên 2 domain/subdomain khác nhau vẫn duy trì đăng nhập thông suốt.

### ✅ Phase 3: Doanh nghiệp hóa & Loại bỏ Rào cản SaaS
- **Vĩnh viễn mở khóa gói Enterprise:** Backend luôn trả về gói Enterprise với đầy đủ tính năng cao cấp nhất, không giới hạn số lượng thành viên, dung lượng lưu trữ hay số lượng dự án.
- **Vô hiệu hóa toàn bộ cơ chế thương mại:**
  - Tắt các tiến trình nền cron job kiểm tra hết hạn bản quyền hoặc hạn dùng thử (trial expiration).
  - Loại bỏ hoàn toàn các modal nâng cấp gói: `SeatLimitModal`, `GlobalUpgradeModal`, `TrialAlert`, popups AppSumo.
  - Vô hiệu hóa `LicenseExpiryGuard`.
- **Bảo mật truy cập nội bộ:**
  - Đóng luồng đăng ký tài khoản tự do ngoài Internet (Public Signup) – chỉ cho phép người dùng được mời bởi Admin hoặc đăng nhập qua Google OAuth domain nội bộ.
  - Tách biệt và vô hiệu hóa các container Client Portal bên ngoài không sử dụng.

### ✅ Phase 4: Bản địa hóa & Trải nghiệm Người dùng (Localization & UI Polish)
- **Form đăng nhập 1 bước:** Chuyển đổi từ luồng đăng nhập 2 bước phức tạp sang form 1 bước trực quan (Email + Mật khẩu + nút Đăng nhập Google) giúp nhân sự đăng nhập nhanh chóng.
- **Ngôn ngữ Tiếng Việt mặc định:** Hệ thống tự động ưu tiên Tiếng Việt (`vi`) ngay khi mở trang lần đầu, đồng thời trang bị nút chuyển nhanh ngôn ngữ (`LanguageSwitcherButton`) trên thanh điều hướng.
- **Chuẩn hóa Thuật ngữ Chuyên ngành:**
  - Rà soát và dịch lại hơn 400 cụm từ trên toàn bộ các phân hệ: Trang chủ (Home), Dự án (Projects), Chi tiết công việc (Task Drawer), Bảng Kanban, Bộ lọc (Filters), Báo cáo & Thống kê (Reporting), Cài đặt hệ thống (Settings), Trung tâm quản trị (Admin Center).
  - Tinh chỉnh CSS/Layout để các nút bấm, nhãn trạng thái và menu không bị vỡ giao diện hay xuống dòng đột ngột khi hiển thị tiếng Việt.
- **Seed dữ liệu chuẩn:** Tạo sẵn danh mục trạng thái công việc và template quy trình chuẩn cho Alpha Work.

---

## 3. CÁC HẠNG MỤC TIẾP THEO (NEXT STEPS - PHASE 5)

1. **Kiểm thử E2E Thực tế (End-to-End User Journeys):**
   - Luồng mời nhân sự qua email và thiết lập phòng ban/chức danh.
   - Luồng lập dự án mới, phân công đầu việc, gán hạn hoàn thành và mức độ ưu tiên.
   - Luồng tương tác thời gian thực: Kéo thả trạng thái trên Kanban, trao đổi bình luận công việc, đính kèm tài liệu.
2. **Cấu hình Tên miền Nội bộ & Chứng chỉ SSL:**
   - Trỏ domain chính thức cho Frontend (ví dụ: `work.alphabooks.vn` hoặc subdomain chỉ định).
   - Trỏ domain API cho Backend (ví dụ: `api-work.alphabooks.vn`).
3. **Backup & Vận hành:**
   - Kiểm tra kịch bản sao lưu dữ liệu tự động trên Supabase (Point-in-time Recovery).
   - Hoàn thiện tài liệu hướng dẫn sử dụng nhanh (Runbook) cho quản trị viên và nhân sự.

---

## 4. TÓM TẮT TRẠNG THÁI MÃ NGUỒN

- **Working Directory:** Sạch sẽ (`working tree clean`), không có xung đột mã nguồn.
- **Git HEAD:** `37a053f2` (`fix(ui/i18n): refine and polish Vietnamese terminology and optimize layouts to prevent text wrapping`).
- **Độ sẵn sàng:** 100% các tính năng core nội bộ đã được cấu hình và hoạt động ổn định trên kiến trúc Cloud.
