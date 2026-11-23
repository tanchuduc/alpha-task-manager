# MA TRẬN PHÂN TÍCH KHOẢNG CÁCH (GAP ANALYSIS) VÀ ĐỀ XUẤT NÂNG CẤP
**Tài liệu:** `docs/features/chat/02-FUNCTIONAL-GAP-ANALYSIS.md`  
**Dự án:** Alpha Task Manager — Phân hệ Unified Chat & Collaboration  
**Tham chiếu UX:** Lark Messenger & IDEAS WorkChat

---

## I. MA TRẬN KHOẢNG CÁCH TỔNG THỂ (GAP ANALYSIS MATRIX)

| Mã | Tính năng | Hiện trạng (Current State) | Mục tiêu (Target State — Lark/IDEAS) | Khoảng cách (Gap) | Ưu tiên | Đề xuất giải pháp |
|---|---|---|---|---|:---:|---|
| **F-01** | Mô hình dữ liệu hội thoại | Phân mảnh 3 bảng riêng: `direct_messages`, `channel_messages`, `project_messages`. | Mô hình hội thoại hợp nhất: bảng `conversations` (đa hình: 1-1, group, project) và `conversation_members`. | Không có entity cuộc hội thoại; không quản lý được metadata nhóm, không mở rộng được. | **P0** | **Refactor cấu trúc (Hợp nhất)** |
| **F-02** | Chat 1:1 cá nhân | Hoạt động qua `direct_messages` (Reactions, Reply, Pins, Edit, Unsend, Typing, Presence). | Hoạt động trơn tru trong luồng hợp nhất, bổ sung trạng thái đã nhận/đã đọc chuẩn, mute, ghim hội thoại. | Thiếu ghim hội thoại, thiếu tắt chuông, thiếu tìm kiếm lịch sử chat. | **P0** | **Giữ nguyên core logic + Mở rộng** |
| **F-03** | Group Chat (Nhóm tự do) | **Hoàn toàn chưa có** (chỉ có kênh phòng ban cứng). | Tạo nhóm tự do, đặt tên, ảnh đại diện, thêm/bớt thành viên, phân quyền Owner/Admin/Member, giải tán nhóm. | Thiếu 100% nghiệp vụ nhóm chat độc lập. | **P0** | **Xây mới hoàn toàn (New)** |
| **F-04** | Project Chat đồng bộ quyền | Có bảng `project_messages`, nhưng RLS cho phép toàn bộ nhân viên công ty truy cập. | Mỗi dự án có đúng 1 nhóm chat chính. Thành viên chat tự động đồng bộ theo `project_members`. Khi thêm/xóa thành viên dự án, quyền chat cập nhật tức thì. | Rò rỉ bảo mật dự án riêng tư; không đồng bộ quyền theo thành viên dự án. | **P0** | **Sửa lỗi & Bảo mật lại (Fix & Protect)** |
| **F-05** | Chat Center (3 cột) | Giao diện 2 cột (`ChatContainer.tsx` 2976 dòng). Sidebar chia 3 tab cứng, không có luồng "Tất cả". Bên phải chỉ có popup tin ghim. | Bố cục 3 cột chuẩn Enterprise (Left: Smart Navigation & Filters; Middle: Active Chat Stream; Right: Collapsible Context Panel). | Thiếu bộ lọc Unread/All/Group/Project; thiếu Context Panel (Thông tin, Thành viên, File, Task). | **P0** | **Refactor giao diện (3-Column Layout)** |
| **F-06** | Tạo Task từ tin nhắn | Có modal `ConvertMessageToTaskModal.tsx`, nhưng chỉ chèn text vào description và post markdown link. | Tạo Task giữ liên kết khóa ngoại 2 chiều (`task_chat_links`). Tự động hiển thị Thẻ công việc (Task Card) tương tác ngay trong luồng chat. | Mất liên kết cấu trúc; không có thẻ công việc; không đồng bộ trạng thái task vào chat. | **P0** | **Mở rộng & Nâng cấp (Extend)** |
| **F-07** | Chia sẻ Task vào Chat | **Chưa có**. Người dùng phải copy paste URL thủ công từ trình duyệt. | Nút "Chia sẻ vào Chat" ngay trong Task Drawer và List View. Cho phép chọn hội thoại đích và gửi thẻ Task Card kèm lời nhắn. | Không có công cụ chia sẻ công việc nhanh. | **P0** | **Xây mới (New)** |
| **F-08** | Tương tác thẻ Task trong Chat | Chỉ hiển thị markdown link dạng text. | Hiển thị Interactive Task Card: Tiêu đề, Dự án, Người phụ trách, Hạn chót, Mức ưu tiên, Trạng thái (Live Badge). Click vào mở thẳng Task Drawer. | Tin nhắn không có tính tương tác; không phản ánh thay đổi tiến độ. | **P0** | **Xây mới Component (New)** |
| **F-09** | File & Media Management | Upload lên Supabase Storage bucket `attachments`. File phân tán trong tin nhắn. | Quản lý tệp tập trung tại Context Panel bên phải (Tab Files/Media); kiểm tra quyền truy cập qua signed URL / private bucket. | Bucket đang public 100% gây rò rỉ tài liệu; người dùng không tìm lại được file cũ nếu không cuộn chat. | **P0** | **Bảo mật & Bổ sung Panel** |
| **F-10** | Tìm kiếm tin nhắn & Lịch sử | Chỉ tìm kiếm client-side theo tên user/phòng ban bên thanh sidebar. | Tìm kiếm toàn văn (Full-text search) nội dung tin nhắn, tìm kiếm file, tìm kiếm hội thoại nhanh với phím tắt. | Không tìm kiếm được nội dung trao đổi công việc cũ. | **P0** | **Xây mới API/Query (New)** |
| **F-11** | Thread / Nhánh thảo luận | Chỉ hỗ trợ trích dẫn tin nhắn cũ (`reply_to_id`). | Hỗ trợ mở Thread Drawer bên phải để thảo luận chuyên sâu một chủ đề mà không làm trôi dòng chat chính (kiểu Slack/Lark). | Chat nhóm đông người dễ bị loãng thông tin và trôi việc. | **P1** | **Xây mới (New)** |
| **F-12** | Ghim hội thoại & Tắt thông báo | Chưa có cho cấp độ cuộc trò chuyện. | Ghim hội thoại (Pin to top), Tắt chuông (Mute conversation), Đánh dấu chưa đọc (Mark as unread). | Người dùng khó tổ chức hộp thư công việc quan trọng. | **P1** | **Bổ sung vào Schema & UI** |
| **F-13** | Web Push Notification | Chỉ có thông báo nội bộ qua bảng `notifications` và webhook Telegram/Lark. | Thông báo đẩy trình duyệt (HTML5 Web Push Notifications) khi tab không active hoặc thu nhỏ. | Bỏ lỡ tin nhắn khẩn cấp khi làm việc trên cửa sổ khác. | **P1** | **Xây mới (New)** |
| **F-14** | Thẻ lệnh nghiệp vụ (ERP/Task Tag) | Gõ text thủ công hoặc dùng cú pháp `@`. | Thanh tác vụ nhanh trong composer (như hình mẫu IDEAS WorkChat: `⚡ LỆNH AI`, `🏷️ ERP/TASK TAG`, `📅 TẠO HẸN`). | Trải nghiệm soạn thảo còn cơ bản, chưa chuyên biệt cho doanh nghiệp. | **P1** | **Xây mới (New)** |
| **F-15** | AI Assistant trong Chat | Chưa có. | Trợ lý ảo SI IDEAS / Alpha AI Bot hỗ trợ: Tóm tắt hội thoại, Tự động trích xuất Task từ tin nhắn, Trả lời tiến độ dự án. | Chưa tận dụng năng lực AI nâng cao hiệu suất làm việc nhóm. | **P2** | **Tích hợp mở rộng trong tương lai** |

---

## II. PHÂN HẠNG TÍNH NĂNG THEO MỨC ƯU TIÊN

### 1. Nhóm P0 — MVP Bắt Buộc (Core Foundation & Integration)
Các tính năng bắt buộc phải có để hoàn thiện hệ sinh thái Unified Collaboration:
- **P0.1: Chuyển đổi mô hình dữ liệu sang Unified Conversations** (`conversations`, `conversation_members`, `messages`, `message_attachments`).
- **P0.2: Bảo mật & Phân quyền RLS nghiêm ngặt** (Bịt lỗ hổng đọc trộm chat dự án và công khai storage).
- **P0.3: Xây dựng tính năng Group Chat** (Tạo nhóm, sửa tên/ảnh, thêm/xóa thành viên, quyền Owner/Member).
- **P0.4: Đồng bộ hoàn toàn Project Chat với Project Members** (Tự động đồng bộ quyền, hiển thị trong Project Detail và Chat Center).
- **P0.5: Tích hợp 2 chiều Chat ↔ Task**:
  - Tạo Task từ tin nhắn với liên kết khóa ngoại.
  - Chia sẻ Task vào Chat từ Task Drawer.
  - Hiển thị Thẻ công việc (Interactive Task Card) với trạng thái trực tiếp trong dòng chat.
- **P0.6: Tái cấu trúc giao diện 3 cột chuẩn Enterprise (Chat Center)**.
- **P0.7: Tìm kiếm toàn văn (Search) và Bộ lọc hội thoại (All, Direct, Group, Project, Unread)**.
- **P0.8: Chuẩn hóa hệ thống thông báo (Notifications & Unread Sync)**.

### 2. Nhóm P1 — Advanced Collaboration (Nâng cao trải nghiệm)
Các tính năng giúp trải nghiệm tiệm cận Lark Messenger và IDEAS WorkChat:
- **P1.1: Quản trị ngữ cảnh Context Panel bên phải** (Thành viên, Tài liệu/File, Pinned Messages, Liên kết ngoài).
- **P1.2: Thảo luận theo luồng riêng (Thread Drawer)**.
- **P1.3: Ghim cuộc hội thoại (Pin to top), Tắt thông báo (Mute), Đánh dấu chưa đọc (Mark as unread)**.
- **P1.4: Web Push Notification trên trình duyệt**.
- **P1.5: Thanh phím tắt nghiệp vụ trong khung soạn thảo** (`🏷️ Đính kèm Task`, `📎 Tệp tin`).
- **P1.6: @all trong Group Chat & Project Chat** (Có kiểm soát quyền hạn).

### 3. Nhóm P2 — AI & Enterprise Automation (Tương lai)
- **P2.1: AI Conversation Summary** (Tóm tắt các tin nhắn chưa đọc trong nhóm sau kỳ nghỉ).
- **P2.2: AI Task Extraction** (Tự động phát hiện deadline và đầu việc trong tin nhắn để gợi ý tạo task 1-click).
- **P2.3: Alpha Project Bot** (Bot tự động thông báo tiến độ và nhắc hạn vào kênh dự án).

---

## III. NGUYÊN TẮC THIẾT KẾ & ĐỊNH HƯỚNG TRIỂN KHAI

1. **Giữ nguyên những gì đang hoạt động tốt:**
   - Cơ chế Realtime với Supabase (`postgres_changes`, `presence`).
   - Component `@mention` thông minh (`MentionAutocomplete.tsx`).
   - Các tương tác tin nhắn đã làm: Emoji reactions (JSONB), trích dẫn trả lời (Reply quote), thu hồi tin nhắn (Unsend soft-delete), chỉnh sửa tin nhắn.
   - Luồng gửi Webhook ra Telegram/Lark khi có tin nhắn mới.
2. **Refactor hợp nhất, KHÔNG rewrite toàn bộ:**
   - Thay vì vứt bỏ `ChatContainer.tsx`, chúng ta tách nó thành các sub-components module hóa:
     - `ChatSidebar.tsx` (Cột 1: Navigation, Search, Filters, Conversation List).
     - `ChatMessageArea.tsx` (Cột 2: Header, Message Stream, Task Card, Rich Composer).
     - `ChatContextPanel.tsx` (Cột 3: Group/Project Info, Members, Files, Linked Tasks).
     - `TaskCardMessage.tsx` (Component hiển thị card công việc trong chat).
   - `ProjectChatTab.tsx` sẽ tái sử dụng trực tiếp component `ChatMessageArea` thay vì copy-paste code riêng.
3. **Chiến lược dữ liệu tương thích ngược (Dual-write / View-based Migration):**
   - Viết migration tạo các bảng thống nhất `alpha_lite.conversations`, `alpha_lite.messages`.
   - Viết script chuyển đổi (backfill) toàn bộ dữ liệu cũ từ `direct_messages`, `channel_messages`, `project_messages` sang bảng mới mà không làm mất bất kỳ tin nhắn nào của người dùng.
