# NHẬT KÝ QUYẾT ĐỊNH KIẾN TRÚC (DECISION LOG / ADRs)
**Tài liệu:** `docs/features/chat/09-DECISION-LOG.md`  
**Dự án:** Alpha Task Manager — Phân hệ Unified Chat & Collaboration  
**Mục tiêu:** Ghi nhận các quyết định kiến trúc cốt lõi, lý do lựa chọn, các phương án thay thế bị bác bỏ và các vấn đề cần Product Owner phê duyệt.

---

## I. DANH SÁCH BẢN GHI QUYẾT ĐỊNH KIẾN TRÚC (ADRs)

### ADR-01: Chuyển đổi sang mô hình Unified Polymorphic Conversations
- **Trạng thái:** ĐỀ XUẤT (Chờ duyệt).
- **Ngữ cảnh:** Hệ thống hiện tại tách thành 3 bảng riêng: `direct_messages`, `channel_messages`, `project_messages`. Không thể tạo nhóm tự do (Group Chat), trùng lặp code lớn (hơn 3,900 dòng giữa `ChatContainer` và `ProjectChatTab`), phân mảnh logic realtime.
- **Quyết định:** Tạo 2 bảng trung tâm:
  1. `alpha_lite.conversations`: Lưu mọi cuộc hội thoại (Direct 1-1, Group tự do, Project Chat, Department Chat).
  2. `alpha_lite.messages`: Lưu mọi tin nhắn thuộc về cuộc hội thoại.
  3. `alpha_lite.conversation_members`: Quản lý thành viên, vai trò, trạng thái đã đọc và cài đặt ghim/mute.
- **Phương án thay thế đã xem xét:** Giữ 3 bảng cũ và tạo thêm bảng thứ 4 `group_messages`. (Bị bác bỏ do làm trầm trọng hóa technical debt và N+1 queries).
- **Hệ quả:** Code frontend được thu gọn từ 3,900 dòng xuống dưới 1,200 dòng module hóa; hỗ trợ 100% tính năng Group Chat tự do và dễ dàng mở rộng.

---

### ADR-02: Cơ chế tích hợp 2 chiều Chat ↔ Task bằng `task_chat_links` & Interactive Task Card
- **Trạng thái:** ĐỀ XUẤT (Chờ duyệt).
- **Ngữ cảnh:** Hiện tại việc chuyển tin nhắn thành Task chỉ là dán text thô vào mô tả task và gửi markdown link vào chat. Không có khóa ngoại, không xem lại được tin nhắn gốc một cách trực quan, không có trạng thái thời gian thực.
- **Quyết định:**
  1. Tạo bảng liên kết `alpha_lite.task_chat_links` lưu quan hệ `{ task_id, conversation_id, source_message_id }`.
  2. Bổ sung loại tin nhắn `message_type = 'task_card'` trong bảng `messages`.
  3. Xây dựng component `TaskCardMessage.tsx` hiển thị mã task, tiêu đề, assignee, due date và live badge trạng thái (Todo, Doing, Done). Click vào mở thẳng Task Drawer.
  4. Bổ sung nút "Xem tin nhắn gốc" trong `TaskDrawer.tsx`.
- **Hệ quả:** Kết nối xuyên suốt vòng đời công việc: Trao đổi ý tưởng (Chat) → Khởi tạo công việc (Task) → Theo dõi tiến độ (Card trực tiếp trong Chat) → Hoàn thành nghiệm thu.

---

### ADR-03: Khóa chặt phân quyền Project Chat theo `project_members`
- **Trạng thái:** BẮT BUỘC AN NINH (Security Hard Boundary).
- **Ngữ cảnh:** `project_messages` đang dùng policy `pm_active_staff` cho phép mọi nhân viên công ty đọc và đăng tin vào bất kỳ dự án nào, kể cả các dự án cơ mật.
- **Quyết định:** Viết lại RLS Policy trên `conversations` và `messages` của dự án, bắt buộc kiểm tra xem người dùng hiện tại có nằm trong bảng `alpha_lite.project_members` của dự án đó hay không. Khi một nhân sự bị xóa khỏi dự án, quyền chat của họ bị thu hồi tức thì.
- **Hệ quả:** Bịt kín lỗ hổng bảo mật rò rỉ thông tin dự án mật.

---

### ADR-04: Bảo mật Supabase Storage cho tệp đính kèm (Private Bucket + Signed URLs)
- **Trạng thái:** BẮT BUỘC AN NINH (Security Hard Boundary).
- **Ngữ cảnh:** Bucket `attachments` đang là `public: true`. Bất kỳ tệp nhạy cảm nào gửi qua chat đều có thể bị truy cập công khai qua Internet nếu lộ link URL.
- **Quyết định:**
  1. Cấu hình bucket thành `public: false` (Private).
  2. Client tải file thông qua API tạo **Supabase Signed URL** có thời hạn (ví dụ: 60 phút).
  3. Trước khi cấp Signed URL, server/RLS kiểm tra quyền của người dùng đối với cuộc trò chuyện chứa tệp đó.
- **Hệ quả:** Đảm bảo dữ liệu tác quyền, hợp đồng, bảng lương trao đổi qua chat được bảo vệ an toàn tuyệt đối.

---

### ADR-05: Tái cấu trúc Giao diện sang Bố cục 3 Cột (Lark & IDEAS WorkChat Benchmark)
- **Trạng thái:** ĐỀ XUẤT (Chờ duyệt).
- **Ngữ cảnh:** Giao diện cũ chia làm 3 tab cứng ở sidebar, không có luồng "Tất cả", bên phải chỉ có ngăn kéo tin ghim tạm thời. Không đáp ứng trải nghiệm làm việc tập trung của doanh nghiệp.
- **Quyết định:** Xây dựng bố cục 3 cột chuẩn Enterprise:
  - Cột 1: Chat Navigation & Pill Filters (`Tất cả`, `Chưa đọc`, `1-1`, `Nhóm`, `Dự án`).
  - Cột 2: Active Conversation Stream với Thẻ Task Card và Rich Composer (`⚡ LỆNH AI`, `🏷️ ERP/TASK TAG`, `📎`).
  - Cột 3: Collapsible Context Panel (Thông tin nhóm, Thành viên, File/Media, Associated Tasks, Pinned Messages).
- **Hệ quả:** Trải nghiệm người dùng chuyên nghiệp, đồng bộ thông tin đa chiều mà không cần rời màn hình chat.

---

### ADR-06: Chiến lược Di trú Dữ liệu An toàn (Non-destructive Dual-write & Backfill)
- **Trạng thái:** ĐÃ DUYỆT (Approved).
- **Ngữ cảnh:** Hệ thống đã có dữ liệu trao đổi thực tế trên các bảng cũ. Không được phép làm mất tin nhắn hoặc gián đoạn hoạt động.
- **Quyết định:**
  1. Giữ nguyên 100% các bảng cũ trong quá trình phát triển Sprint S1 - S6.
  2. Viết migration tạo schema mới độc lập.
  3. Viết script SQL backfill idempotent để chuyển toàn bộ dữ liệu lịch sử sang bảng mới.
  4. Chỉ switch giao diện sang bảng mới khi đã đối soát khớp 100% số lượng tin nhắn.
- **Hệ quả:** Rủi ro gián đoạn bằng 0%. Có thể rollback về phiên bản cũ ngay lập tức nếu cần.

---

### ADR-07: Loại bỏ hoàn toàn Kênh Chat Cố định của Phòng ban (Department Chat)
- **Trạng thái:** ĐÃ DUYỆT BỞI PRODUCT OWNER (Approved on 23/11/2026).
- **Ngữ cảnh:** Product Owner chỉ đạo loại bỏ tính năng kênh chat cố định của Phòng ban, chỉ giữ lại đúng 3 hình thức giao tiếp:
  1. **Direct Chat (1:1):** Nhắn tin trực tiếp giữa hai nhân sự.
  2. **Group Chat tự do:** Tạo nhóm trao đổi linh hoạt, tự quản lý thành viên và quyền hạn.
  3. **Project Chat:** Gắn liền với từng dự án, tự động đồng bộ theo `project_members`.
- **Quyết định:**
  1. Loại bỏ giá trị `'department'` khỏi enum `conversation_type`. Trường `conversations.type` chỉ nhận: `'direct' | 'group' | 'project'`.
  2. Bỏ cột `department_id` trong bảng `alpha_lite.conversations`.
  3. Bỏ tab/filter "Phòng ban" trong Chat Center. Thanh bộ lọc chỉ còn: `Tất cả` | `Chưa đọc` | `1-1` | `Nhóm` | `Dự án`.
  4. Dữ liệu tin nhắn phòng ban cũ từ bảng `channel_messages` (nếu cần bảo lưu lịch sử) sẽ được chuyển đổi thành các Group Chat thông thường mang tên phòng ban tương ứng (ví dụ nhóm "Ban Biên tập", "Marketing & Truyền thông"), không duy trì logic cứng cho phòng ban trong hệ thống chat mới.
- **Hệ quả:**
  - Mô hình dữ liệu gọn gàng hơn, giảm bớt sự ràng buộc giữa sơ đồ tổ chức phòng ban và không gian chat.
  - Phù hợp hoàn hảo với trải nghiệm hiện đại của Lark Messenger & Slack (nơi các kênh giao tiếp đều là Group/Channel linh hoạt hoặc Project/Workspace).

---

## II. DANH SÁCH QUYẾT ĐỊNH ĐÃ ĐƯỢC PRODUCT OWNER PHÊ DUYỆT

Product Owner đã chính thức phê duyệt các định hướng sau vào ngày 23/11/2026:

1. ✅ **Mô hình Dữ liệu Hợp nhất (Unified Schema):** Chuyển đổi sang 2 bảng trung tâm `conversations` và `messages`.
2. ✅ **3 Hình thức Giao tiếp chuẩn:** Chỉ duy trì **1:1**, **Group Chat tự do**, và **Project Chat**. Loại bỏ hoàn toàn kênh cố định của Phòng ban.
3. ✅ **Bố cục Giao diện 3 Cột (Lark / IDEAS WorkChat Benchmark):** Áp dụng bố cục Desktop 3 cột (Navigation & Filters | Active Stream & Task Card | Context Panel).
4. ✅ **Khóa chặt Quyền hạn Project Chat:** Ràng buộc quyền chat dự án nghiêm ngặt theo `project_members`.
5. ✅ **Bảo mật Kho lưu trữ Tệp (Private Storage):** Chuyển đổi bucket `attachments` sang Private và truy cập qua Signed URLs có thời hạn.
6. ✅ **Lộ trình Triển khai (Roadmap S0 – S8):** Sẵn sàng kích hoạt Sprint S1.
