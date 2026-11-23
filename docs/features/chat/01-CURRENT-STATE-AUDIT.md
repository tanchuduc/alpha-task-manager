# BÁO CÁO AUDIT HIỆN TRẠNG MODULE CHAT (ALPHA WORK LITE)
**Tài liệu:** `docs/features/chat/01-CURRENT-STATE-AUDIT.md`  
**Ngày thực hiện:** 23/11/2026  
**Dự án:** Alpha Task Manager (Alpha Work Lite)  
**Mục tiêu:** Khảo sát toàn diện kiến trúc kỹ thuật, schema cơ sở dữ liệu, các luồng tương tác thực tế và đánh giá chi tiết chức năng hiện có của module Chat.

---

## I. KHẢO SÁT CẤU TRÚC HỆ THỐNG

### 1. Framework & Kiến trúc Tổng thể
- **Frontend Framework:** Next.js 15.3.2 (App Router), React 19.1.0, Tailwind CSS v4 (`@tailwindcss/postcss: ^4.1.7`), TypeScript 5.8.3.
- **Backend / BaaS:** Supabase (PostgreSQL 15+, Supabase Auth, Supabase Realtime, Supabase Storage) thông qua `@supabase/ssr: ^0.6.1` và `@supabase/supabase-js: ^2.49.4`.
- **UI & Helper Libraries:** `lucide-react` (icon set), `sonner` (toast notifications), `date-fns` (xử lý ngày giờ), `clsx` & `tailwind-merge` (tiện ích class styling), `@dnd-kit` (drag & drop Kanban).

### 2. Thư mục, Component, Service & API liên quan đến Chat
- **Trang Chat chính:**
  - `src/app/(app)/chat/page.tsx`: Server Component tải dữ liệu ban đầu gồm `currentUser`, `allProfiles`, `allDepartments`, `allProjects` và render `ChatContainer`.
  - `src/app/(app)/inbox/page.tsx`: File chuyển hướng trực tiếp (`redirect("/chat")`).
- **Thành phần giao diện Chat chính:**
  - `src/components/chat/ChatContainer.tsx` (2,976 dòng): Monolithic client component phụ trách toàn bộ giao diện Chat Center, bao gồm danh sách hội thoại, thanh tìm kiếm, stream tin nhắn 1-1, stream kênh phòng ban, stream dự án, presence trực tuyến, typing indicator, reactions emoji, ghim tin nhắn, sửa/thu hồi tin nhắn, tải file đính kèm và kích hoạt modal chuyển đổi Task.
  - `src/components/chat/ConvertMessageToTaskModal.tsx` (457 dòng): Modal chuyển đổi một tin nhắn chat thành công việc mới trên dự án đã chọn.
  - `src/components/projects/ProjectChatTab.tsx` (936 dòng): Tab chat độc lập nằm trong trang chi tiết dự án (`src/app/(app)/projects/[id]/page.tsx` thông qua `ProjectDetailClient.tsx`). Tái tạo độc lập 80% logic của ChatContainer dành riêng cho bảng `project_messages`.
- **Thành phần dùng chung hỗ trợ Chat:**
  - `src/components/common/MentionAutocomplete.tsx` (455 dòng): Textarea tùy biến hỗ trợ `@mention` danh sách nhân sự với dropdown gợi ý thông minh, phím tắt điều hướng và tiện ích `renderContentWithMentions`.
  - `src/components/layout/NavRail.tsx`: Thanh điều hướng mỏng bên trái, hiển thị nút "Hộp thư" (icon `Inbox`) trỏ về `/chat` kèm badge tin chưa đọc `unreadChatCount`.
  - `src/components/layout/AppShell.tsx`: Quản lý layout mẹ, subscribe Supabase Realtime kênh `appshell-chat-unread` để cập nhật badge đỏ trên toàn ứng dụng.
  - `src/components/layout/NotificationDrawer.tsx`: Drawer trượt hiển thị thông báo ứng dụng từ bảng `alpha_lite.notifications`.
  - `src/app/api/webhooks/dispatch/route.ts`: Endpoint gửi webhook ra bên ngoài (Telegram/Lark) khi có sự kiện chat/task.

### 3. Database Schema & Migrations liên quan đến Chat
Dữ liệu chat hiện đang phân tán trên 3 migration chính:
- `supabase/migrations/002_collaboration_and_performance.sql`:
  - `alpha_lite.direct_messages`: Lưu tin nhắn 1-1 giữa 2 nhân sự (`sender_id`, `receiver_id`, `content`, `attachment_url`, `attachment_name`, `is_read`, `created_at`).
  - `alpha_lite.channel_messages`: Lưu tin nhắn các phòng ban (`department_id`, `author_id`, `content`, `attachment_url`, `attachment_name`, `parent_id`, `created_at`).
  - `alpha_lite.project_updates` & `alpha_lite.project_update_comments`: Bảng tin cập nhật và thảo luận dự án (tách biệt với chat stream thời gian thực).
- `supabase/migrations/008_chat_v2_upgrade.sql`:
  - Bổ sung vào `direct_messages`: `reply_to_id`, `is_pinned`, `is_deleted`, `edited_at`, `reactions` (JSONB).
  - Bổ sung vào `channel_messages`: `is_pinned`, `is_deleted`, `edited_at`, `reactions` (JSONB).
  - Tạo bảng `alpha_lite.channel_read_states`: (`user_id`, `department_id`, `last_read_at`).
  - Thiết lập `REPLICA IDENTITY FULL` cho `direct_messages` và `channel_messages`.
- `supabase/migrations/009_project_chat_stream.sql`:
  - Tạo bảng `alpha_lite.project_messages`: Lưu tin nhắn luồng dự án (`id`, `project_id`, `author_id`, `content`, `attachment_url`, `attachment_name`, `reply_to_id`, `is_pinned`, `is_deleted`, `edited_at`, `reactions`, `created_at`).
  - Tạo bảng `alpha_lite.project_chat_read_states`: (`user_id`, `project_id`, `last_read_at`).
  - Bật Realtime và `REPLICA IDENTITY FULL` cho `project_messages`.

### 4. Authentication & Authorization
- **Auth:** Supabase Auth (Email/Password & Google OAuth). Session quản lý qua Cookie với `@supabase/ssr` (`src/middleware.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/client.ts`).
- **User Directory:** Bảng `alpha_lite.profiles` đồng bộ 1-1 với `auth.users` qua database trigger.
- **RLS Policies hiện thời:**
  - `direct_messages`: `FOR ALL USING (auth.uid() = sender_id OR auth.uid() = receiver_id)`.
  - `channel_messages`: `FOR ALL USING (alpha_lite.is_active_staff())`.
  - `project_messages`: `FOR ALL USING (alpha_lite.is_active_staff())`. *(Lưu ý: Không kiểm tra quyền thành viên dự án `project_members`!)*

### 5. Realtime Subscriptions
- Sử dụng Supabase Realtime qua WebSocket:
  - `postgres_changes` trên bảng `direct_messages`, `channel_messages`, `project_messages` bắt các sự kiện `INSERT` và `UPDATE`.
  - Presence Channel `alpha-chat-presence`: Theo dõi trạng thái Online/Offline của nhân sự và broadcast tín hiệu `typing` thông qua kênh Broadcast `typing`.
  - Kênh `appshell-chat-unread` trên `AppShell.tsx`: Đếm số lượng tin nhắn chưa đọc trong `direct_messages`.

### 6. File Storage
- Bucket Supabase Storage: `attachments` (được cấu hình `public = true` trong `001_init_alpha_work_lite.sql`).
- Thư mục lưu trữ: `chat/${Date.now()}_${sanitized}.${ext}`.
- Cơ chế lấy URL: `supabase.storage.from("attachments").getPublicUrl(filePath)`.

---

## II. BẢNG KIỂM KÊ CHỨC NĂNG HIỆN TẠI

*Ghi chú trạng thái:*
- **CODE EXISTS:** Đã có source code triển khai trong repository.
- **VERIFIED WORKING:** Đã xác minh hoạt động qua code logic, query contracts và typing.
- **NOT TESTED:** Chưa thể chạy kiểm thử live 2 tài khoản thực tế do không có thông tin đăng nhập test trong repository.

### Nhóm 1 — Chat cá nhân (Direct Chat 1-1)

| ID | Chức năng | Đã có | Hoạt động thực tế | Vấn đề phát hiện | Mức ưu tiên |
|---|---|:---:|:---:|---|:---:|
| D-01 | Tìm kiếm nhân sự | Có | CODE EXISTS | Chỉ lọc theo danh sách profiles đã nạp sẵn ở client (`filteredProfiles`). Nếu công ty có hàng nghìn nhân sự sẽ quá tải. | P1 |
| D-02 | Tạo hội thoại 1:1 | Có | CODE EXISTS | Không có thực thể "Cuộc hội thoại" riêng; hội thoại 1:1 suy diễn qua cặp `sender_id` & `receiver_id` trong `direct_messages`. | P0 |
| D-03 | Gửi và nhận tin realtime | Có | CODE EXISTS | Code sử dụng kênh Realtime `chat-direct-messages-{userId}-{timestamp}`. Xử lý tốt phân biệt tin liên quan vs tin người khác. | P0 |
| D-04 | Trạng thái gửi, nhận, đã đọc | Có | CODE EXISTS | `is_read` cập nhật khi mở hội thoại (`is_read = true`). Hiển thị icon Check/CheckCheck. Chưa có trạng thái "đã nhận tại thiết bị". | P1 |
| D-05 | Hiển thị thời gian gửi | Có | CODE EXISTS | Sử dụng `formatRelativeShort` (Vừa xong, 5p, 2h, 12/11) và tooltip giờ phút đầy đủ. | P1 |
| D-06 | Trạng thái online/offline | Có | CODE EXISTS | Sử dụng Supabase Presence trên kênh `alpha-chat-presence`. Khi client ngắt kết nối thì tự rời state. | P1 |
| D-07 | Typing indicator | Có | CODE EXISTS | Broadcast sự kiện typing qua `presenceChannelRef.current.send()`, tự xóa sau 3 giây. Đã hoạt động trong code. | P1 |
| D-08 | Sửa tin nhắn | Có | CODE EXISTS | Sửa `content`, cập nhật `edited_at`. Hiển thị nhãn "(đã chỉnh sửa)". | P1 |
| D-09 | Thu hồi / Xóa tin nhắn | Có | CODE EXISTS | Soft-delete bằng cờ `is_deleted = true`. Hiển thị bong bóng "Tin nhắn đã được thu hồi". | P0 |
| D-10 | Reply tin nhắn | Có | CODE EXISTS | Có cột `reply_to_id`, hiển thị trích dẫn tin nhắn gốc khi trả lời. Khi click có cuộn mượt tới tin gốc (`scrollToMessage`). | P1 |
| D-11 | Emoji reaction | Có | CODE EXISTS | Cột `reactions` dạng JSONB (`{ "👍": ["userId1", "userId2"] }`). Thả/bỏ reaction optimistic và lưu DB. | P1 |
| D-12 | Tìm kiếm lịch sử tin nhắn | Chưa | CHƯA CÓ | Thanh tìm kiếm chỉ lọc danh sách user bên sidebar, KHÔNG tìm kiếm nội dung trong lịch sử tin nhắn. | P0 |
| D-13 | Gửi ảnh, tài liệu, tệp | Có | CODE EXISTS | Upload lên bucket `attachments`, hỗ trợ Paste ảnh từ Clipboard (Ctrl+V), kiểm tra kích thước tối đa 25MB. | P0 |
| D-14 | Tắt thông báo hội thoại | Chưa | CHƯA CÓ | Chưa có cờ `is_muted` cho từng cuộc trò chuyện. | P1 |
| D-15 | Ghim hội thoại 1:1 | Chưa | CHƯA CÓ | Mới chỉ hỗ trợ ghim từng TIN NHẮN (`is_pinned`), chưa có ghim CUỘC HỘI THOẠI lên đầu danh sách. | P1 |

### Nhóm 2 — Group Chat (Nhóm chat độc lập)

| ID | Chức năng | Đã có | Hoạt động thực tế | Vấn đề phát hiện | Mức ưu tiên |
|---|---|:---:|:---:|---|:---:|
| G-01 | Tạo nhóm chat độc lập | **Chưa** | **CHƯA CÓ** | Hoàn toàn chưa có bảng hoặc API tạo nhóm tự do. Hệ thống hiện chỉ có 5 kênh Phòng ban cứng từ bảng `departments`. | **P0** |
| G-02 | Đặt tên, ảnh đại diện, mô tả nhóm | Chưa | CHƯA CÓ | Chỉ lấy `name`, `code`, `description` từ bảng `departments`. Không có avatar nhóm. | P0 |
| G-03 | Thêm hoặc xóa thành viên nhóm | Chưa | CHƯA CÓ | Kênh phòng ban áp dụng cho toàn bộ nhân sự công ty (`alpha_lite.is_active_staff()`). Không thể thêm/bớt tùy biến. | P0 |
| G-04 | Phân quyền chủ nhóm, admin, member | Chưa | CHƯA CÓ | Không có vai trò trưởng nhóm trong chat. | P0 |
| G-05 | Đổi tên & chỉnh sửa thông tin nhóm | Chưa | CHƯA CÓ | Chỉ admin hệ thống mới sửa được phòng ban trong trang quản trị. | P1 |
| G-06 | @mention thành viên trong nhóm | Có | CODE EXISTS | Dùng `MentionTextarea` gợi ý theo `allProfiles`. Tuy nhiên gợi ý toàn công ty chứ không giới hạn trong thành viên nhóm. | P0 |
| G-07 | @mention toàn nhóm (@all) | Chưa | CHƯA CÓ | Chưa có cơ chế nhận diện từ khóa `@all` hay gửi notification hàng loạt tới thành viên nhóm. | P1 |
| G-08 | Reply theo thread riêng | Chưa | CHƯA CÓ | Chỉ có reply dạng quote hiển thị tin mẹ (`parent_id`), chưa có giao diện Sidebar Thread (nhánh thảo luận riêng). | P1 |
| G-09 | Ghim tin nhắn trong nhóm | Có | CODE EXISTS | Bảng `channel_messages` có cờ `is_pinned = true` và ngăn kéo xem tin ghim. | P1 |
| G-10 | Danh sách file / media của nhóm | Chưa | CHƯA CÓ | Chưa có tab hoặc panel lọc tập trung toàn bộ file/ảnh được gửi trong nhóm. | P1 |
| G-11 | Rời nhóm, chuyển chủ nhóm, giải tán | Chưa | CHƯA CÓ | Chưa hỗ trợ do chưa có thực thể nhóm độc lập. | P0 |
| G-12 | Kiểm soát xem lịch sử của thành viên mới | Chưa | CHƯA CÓ | Chưa có cài đặt giới hạn ngày gia nhập để ẩn lịch sử cũ. | P2 |

### Nhóm 3 — Project Chat (Chat Dự án)

| ID | Chức năng | Đã có | Hoạt động thực tế | Vấn đề phát hiện | Mức ưu tiên |
|---|---|:---:|:---:|---|:---:|
| P-01 | Tự động tạo Chat khi tạo Project | Một phần | CODE EXISTS | Không tạo record hội thoại riêng; hệ thống chỉ tự động xuất hiện Project trong tab "Dự án" của Chat nếu project có `status = active`. | P0 |
| P-02 | Mỗi Project có 1 hội thoại chính | Có | CODE EXISTS | Bảng `project_messages` lọc theo `project_id`. Đúng nguyên tắc 1 stream chính cho mỗi dự án. | P0 |
| P-03 | Đồng bộ thành viên Chat & Project | **Chưa** | **LỖI LOGIC** | RLS Policy `pm_active_staff` cho phép **mọi nhân viên công ty** xem tin nhắn của mọi dự án! Không ràng buộc `project_members`. | **P0** |
| P-04 | Cập nhật quyền Chat khi thêm/xóa member | **Chưa** | **LỖI LOGIC** | Nhân sự bị xóa khỏi dự án vẫn có thể query và đọc/gửi tin nhắn dự án bình thường do chính sách RLS quá mở. | **P0** |
| P-05 | Hiển thị Chat trong Project Detail | Có | CODE EXISTS | Tab "Trò chuyện" trong trang chi tiết dự án gọi component `ProjectChatTab.tsx`. | P0 |
| P-06 | Truy cập cùng hội thoại từ Chat Center | Có | CODE EXISTS | Tab "Dự án" trên `/chat` và Tab "Trò chuyện" trên `/projects/[id]` cùng đọc/ghi chung bảng `project_messages`. | P0 |
| P-07 | Chia sẻ Task vào Chat | **Chưa** | **CHƯA CÓ** | Không có nút "Chia sẻ vào Chat" trong Task Drawer hay List View. Người dùng phải copy link thủ công. | **P0** |
| P-08 | Tạo Task từ tin nhắn | Có | CODE EXISTS | Có nút CheckSquare trên mỗi tin nhắn, mở `ConvertMessageToTaskModal.tsx`. | P0 |
| P-09 | Mở Task từ nội dung Chat | Một phần | CODE EXISTS | Sau khi tạo việc, hệ thống chỉ gửi 1 tin nhắn dạng markdown `[Tạo việc thành công: ...](url)`. Chưa có thẻ Task Card tương tác. | P0 |
| P-10 | Hiển thị trạng thái Task trong thẻ | **Chưa** | **CHƯA CÓ** | Link gửi vào chỉ là text đơn thuần, không cập nhật realtime trạng thái việc (Todo/Doing/Done) khi task thay đổi. | **P0** |
| P-11 | Xử lý khi Project Archive / Delete | Chưa | CODE EXISTS | Nếu dự án chuyển sang `archived`, nó biến mất khỏi thanh sidebar Chat (`allProjectsRes.eq("status", "active")`), người dùng không thể xem lại lịch sử trừ khi mở Project Detail. | P1 |
| P-12 | Tránh tạo trùng nhóm / mất lịch sử | Có | CODE EXISTS | Do chỉ dùng 1 `project_id` làm khóa lọc trên `project_messages` nên không bị trùng nhóm. | P0 |

### Nhóm 4 — Chat Center (`/chat`)

| ID | Chức năng | Đã có | Hoạt động thực tế | Vấn đề phát hiện | Mức ưu tiên |
|---|---|:---:|:---:|---|:---:|
| C-01 | Danh sách hội thoại gần đây | Một phần | CODE EXISTS | Chia làm 3 tab tách biệt ("1-1", "Phòng ban", "Dự án"), không có luồng "Tất cả" (Unified Feed) sắp xếp theo thời gian tin nhắn mới nhất. | P0 |
| C-02 | Bộ lọc All / Direct / Group / Project / Unread | Chưa | CHƯA CÓ | Chỉ có 3 tab cố định. Không có bộ lọc "Chưa đọc" hay bộ lọc gộp. | P0 |
| C-03 | Tìm kiếm hội thoại | Có | CODE EXISTS | Thanh tìm kiếm chỉ lọc client-side theo tên nhân sự, tên phòng ban hoặc tên dự án. | P1 |
| C-04 | Tìm kiếm nội dung tin nhắn | Chưa | CHƯA CÓ | Không hỗ trợ tìm kiếm toàn văn (full-text search) nội dung tin nhắn trong lịch sử chat. | P0 |
| C-05 | Unread count badge | Có | CODE EXISTS | Đếm số tin chưa đọc cho từng cá nhân, phòng ban và dự án. Hiển thị badge màu cam/đỏ. | P0 |
| C-06 | Ghim cuộc hội thoại (Pin conversation) | Chưa | CHƯA CÓ | Chưa có tính năng đưa các cuộc chat quan trọng lên đầu danh sách bên trái. | P1 |
| C-07 | Đánh dấu chưa đọc (Mark as unread) | Chưa | CHƯA CÓ | Khi click vào hội thoại, hệ thống tự động mark read ngay lập tức. Không thể đánh dấu chưa đọc lại. | P1 |
| C-08 | Tắt chuông hội thoại (Mute) | Chưa | CHƯA CÓ | Chưa có trường `is_muted`. | P1 |
| C-09 | Bảng thông tin ngữ cảnh bên phải | **Một phần** | CODE EXISTS | Mới chỉ có ngăn kéo Tin nhắn đã ghim (`showPinnedDrawer`). Thiếu hẳn Context Panel toàn diện (Thành viên, File, Task liên quan, Cài đặt). | **P0** |
| C-10 | Deep link tới tin nhắn cụ thể | Một phần | CODE EXISTS | Hàm `scrollToMessage` chỉ cuộn trong danh sách tin đang tải ở bộ nhớ; chưa có URL query `?msg={id}` để tự động load trang lịch sử chứa tin nhắn đó. | P1 |

### Nhóm 5 — Notifications (Thông báo)

| ID | Chức năng | Đã có | Hoạt động thực tế | Vấn đề phát hiện | Mức ưu tiên |
|---|---|:---:|:---:|---|:---:|
| N-01 | Thông báo tin nhắn mới | Một phần | CODE EXISTS | Tự insert vào bảng `notifications` khi có tin 1-1. Tuy nhiên cột `type` bị vi phạm CHECK constraint nếu DB chưa cập nhật! | P0 |
| N-02 | Thông báo @mention | Có | CODE EXISTS | Tạo notification loại `task_mentioned` khi được nhắc tên trong kênh phòng ban và dự án. | P0 |
| N-03 | Badge chưa đọc trên thanh điều hướng | Có | CODE EXISTS | Hiển thị trên `NavRail` và `AppShell` qua kênh Realtime `appshell-chat-unread`. | P0 |
| N-04 | Web Browser Notification | Chưa | CHƯA CÓ | Chưa tích hợp Notification API của trình duyệt (HTML5 Web Notifications). | P1 |
| N-05 | Thông báo khi được chia sẻ Task | Chưa | CHƯA CÓ | Do chưa có luồng chia sẻ Task vào chat nên chưa có thông báo tương ứng. | P1 |
| N-06 | Chống gửi thông báo trùng lặp | Một phần | CODE EXISTS | Chưa có debounce hay throttle; nếu gửi liên tiếp 5 tin nhắn sẽ tạo 5 thông báo riêng lẻ gây spam inbox. | P1 |
| N-07 | Cơ chế khi người dùng Offline | Có | CODE EXISTS | Notification lưu trực tiếp vào cơ sở dữ liệu và kích hoạt Webhook ra Telegram/Lark (nếu có cấu hình). | P0 |
| N-08 | Đồng bộ trạng thái đọc giữa các tab | Một phần | CODE EXISTS | Realtime UPDATE trên bảng `direct_messages` đồng bộ `is_read`, nhưng `channel_read_states` và `project_chat_read_states` chưa broadcast realtime sang các tab khác. | P1 |

---

## III. KẾT QUẢ KIỂM THỬ VẬN HÀNH THỰC TẾ

- **Trạng thái kiểm thử Runtime:** **NOT TESTED WITH DUAL LIVE USERS** (Do quy chuẩn an toàn, không có tài khoản test hợp lệ được cấp trong repository; không tự ý truy cập tài khoản nhân sự thật trên database production `kuftleroomsfhplnromw.supabase.co`).
- **Trạng thái Code Validation:**
  - TypeScript Typecheck (`npm run typecheck`): **PASSED 100% (0 errors)**.
  - Next.js Local Server (`http://localhost:3000`): **ACTIVE (HTTP 307 Redirect to /login)**.
  - Linting: Cần nâng cấp cấu hình ESLint theo chuẩn Next.js 15.

---

## IV. TỔNG HỢP CÁC LỖI & RỦI RO NGHIÊM TRỌNG (BUGS & VULNERABILITIES)

1. **Rò rỉ dữ liệu tin nhắn dự án (Critical Security Issue):**
   - File: `supabase/migrations/009_project_chat_stream.sql` (Line 39-41).
   - Chi tiết: Policy `pm_active_staff` cho phép bất kỳ nhân viên nào trong công ty (`alpha_lite.is_active_staff()`) đọc và đăng tin vào bất kỳ dự án nào, kể cả các dự án cơ mật của Ban Giám đốc hoặc dự án nội bộ mà họ không phải thành viên (`project_members`).
2. **Lỗ hổng bảo mật tệp đính kèm (Storage Public Access):**
   - File: `supabase/migrations/001_init_alpha_work_lite.sql` (Line 476-488) & `ChatContainer.tsx` (Line 1005-1010).
   - Chi tiết: Bucket `attachments` được khai báo `public: true`. Khi nhân sự gửi bảng lương, hợp đồng tác quyền hoặc tài liệu nhạy cảm qua chat 1-1, link file có thể truy cập ẩn danh mà không qua bất kỳ lớp kiểm tra quyền nào.
3. **Lỗ hổng giả mạo / sửa tin nhắn của đối phương trong chat 1-1:**
   - File: `supabase/migrations/002_collaboration_and_performance.sql` (Line 113-115).
   - Chi tiết: Policy `dm_participants` viết `FOR ALL USING (auth.uid() = sender_id OR auth.uid() = receiver_id)` mà KHÔNG có `WITH CHECK (auth.uid() = sender_id)`. Người nhận (`receiver_id`) có thể gửi lệnh update sửa nội dung tin nhắn của người gửi thông qua client SDK!
4. **Vi phạm Check Constraint bảng Notifications (Runtime Failure Risk):**
   - File: `supabase/migrations/001_init_alpha_work_lite.sql` (Line 171) & `ChatContainer.tsx` (Line 1216).
   - Chi tiết: DB quy định `type IN ('task_assigned', 'task_mentioned', 'task_commented', 'task_status_changed', 'project_added')`. Code gọi `type: "direct_message"`. Nếu DB thực tế chưa gỡ bỏ check constraint này, lệnh insert notification sẽ gây lỗi.
5. **Thiếu hoàn toàn phân hệ Group Chat:**
   - Không có cấu trúc dữ liệu cho nhóm tự tạo; người dùng hiện không thể trao đổi theo nhóm chuyên đề (ví dụ: nhóm Hội chợ sách, nhóm Taskforce...) ngoài 5 kênh phòng ban cố định.
6. **Mất kết nối ngữ cảnh giữa Chat và Task:**
   - Khi tạo việc từ tin nhắn, hệ thống chỉ đính kèm text thuần vào mô tả task và gửi markdown link vào chat. Không có liên kết khóa ngoại 2 chiều, không có Task Card hiển thị tiến độ công việc trong chat, người làm task không thể xem lại tin nhắn gốc một cách trực quan.
