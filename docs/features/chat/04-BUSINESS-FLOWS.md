# ĐẶC TẢ CHI TIẾT CÁC LUỒNG TÍCH HỢP (BUSINESS FLOWS)
**Tài liệu:** `docs/features/chat/04-BUSINESS-FLOWS.md`  
**Dự án:** Alpha Task Manager — Phân hệ Unified Chat & Collaboration  
**Mục tiêu:** Định nghĩa chuẩn xác 8 luồng nghiệp vụ tương tác giữa Chat — Project — Task — Notification.

---

## NGUYÊN TẮC CỐT LÕI VỀ NGHIỆP VỤ
1. **Phân định rạch ròi giữa Chat Messages và Task Comments:**
   - **Chat Messages (`alpha_lite.messages`):** Là kênh giao tiếp tương tác thời gian thực, trao đổi đa chiều của nhóm/dự án/cá nhân.
   - **Task Comments (`alpha_lite.task_comments`):** Là nhật ký thảo luận chuyên biệt của 1 đầu việc cụ thể trong Task Drawer.
   - Không tự ý biến mỗi Task thành một nhóm chat riêng biệt gây bùng nổ số lượng phòng chat (chat room explosion).
2. **Quyền riêng tư & Kế thừa quyền:**
   - Quyền truy cập Project Chat bắt buộc phải kế thừa nghiêm ngặt từ `project_members`.
   - Quyền xem Task Card trong Chat phải tuân thủ quyền hạn dự án của người xem.

---

## FLOW 1: TẠO PROJECT → TỰ ĐỘNG CÓ PROJECT CHAT

- **Actor:** Quản trị viên (Admin) hoặc Trưởng dự án (Project Manager).
- **Trigger:** Người dùng tạo mới một Dự án thành công trên trang `/projects` (bằng form trống hoặc từ Project Template).
- **Preconditions:** Dự án được lưu vào cơ sở dữ liệu `alpha_lite.projects` với trạng thái `active`.
- **Happy Path:**
  1. Trigger database `after_project_insert` hoặc Service logic tự động tạo 1 bản ghi trong bảng `alpha_lite.conversations`:
     - `type = 'project'`
     - `project_id = NEW.id`
     - `title = NEW.name`
     - `created_by = NEW.created_by`
  2. Người tạo dự án được tự động thêm vào `alpha_lite.conversation_members` với `role = 'owner'`.
  3. Hệ thống sinh 1 tin nhắn hệ thống (`message_type = 'system_event'`): *"🎉 Dự án đã được khởi tạo. Không gian trao đổi chính thức bắt đầu tại đây."*
  4. Cuộc trò chuyện tự động xuất hiện trong danh mục "Dự án" trên thanh điều hướng Chat Center và tab "Trò chuyện" trong Project Detail.
- **Alternative Flow:** Nếu dự án được tạo từ Template có sẵn danh sách thành viên mẫu, toàn bộ thành viên đó được đồng bộ ngay vào `conversation_members`.
- **Error Cases:**
  - Lỗi mạng hoặc transaction rollback: Toàn bộ quá trình tạo dự án và tạo conversation bị hủy, không để lại dữ liệu mồ côi.
- **Permission Rules:** Chỉ Admin hoặc Project Manager có quyền tạo Project.
- **Data Changes:**
  - `INSERT` vào `alpha_lite.projects`.
  - `INSERT` vào `alpha_lite.conversations` (type: `'project'`).
  - `INSERT` vào `alpha_lite.conversation_members` (chủ dự án).
- **Acceptance Criteria:**
  - Vào `/projects/[id]` thấy tab "Trò chuyện" đã sẵn sàng, không cần thao tác tạo thêm phòng chat.
  - Vào `/chat`, lọc theo "Dự án" thấy xuất hiện đúng tên dự án mới tạo.

---

## FLOW 2: THÊM NHÂN SỰ VÀO PROJECT → CẬP NHẬT QUYỀN CHAT

- **Actor:** Trưởng dự án (Project Manager) hoặc Quản trị viên (Admin).
- **Trigger:** Quản trị viên thêm một nhân sự vào danh sách thành viên dự án (`project_members`).
- **Preconditions:** Dự án đang hoạt động (`active`), nhân sự có tài khoản hợp lệ trong `profiles`.
- **Happy Path:**
  1. Database trigger hoặc Project Service bắt sự kiện `INSERT` trên `alpha_lite.project_members`.
  2. Tìm kiếm cuộc trò chuyện tương ứng với `project_id` trong `alpha_lite.conversations`.
  3. Tự động `INSERT` nhân sự mới vào `alpha_lite.conversation_members` với `role = 'member'`, `joined_at = now()`.
  4. Hệ thống phát một tin nhắn hệ thống vào nhóm chat: *"👋 [Tên nhân sự] đã tham gia vào dự án."*
  5. Nhân sự mới đăng nhập vào `/chat` sẽ nhìn thấy ngay cuộc trò chuyện dự án xuất hiện trong danh sách của mình.
- **Alternative Flow:** Nếu nhân sự đã từng ở trong dự án trước đó và được thêm lại: Kích hoạt lại bản ghi thành viên, cập nhật `joined_at`.
- **Error Cases:** Nhân sự bị vô hiệu hóa (`is_active = false`): Báo lỗi, không cho phép thêm vào dự án hoặc chat.
- **Permission Rules:** Chỉ thành viên có quyền quản trị dự án mới được thêm người.
- **Data Changes:**
  - `INSERT` vào `alpha_lite.project_members`.
  - `INSERT` vào `alpha_lite.conversation_members`.
  - `INSERT` tin nhắn hệ thống vào `alpha_lite.messages`.
- **Acceptance Criteria:**
  - Nhân sự mới lập tức nhận được tin nhắn thời gian thực trong Project Chat.
  - Kiểm tra RLS: Nhân sự mới thực hiện SELECT `messages` của dự án thành công.

---

## FLOW 3: XÓA NHÂN SỰ KHỎI PROJECT → THU HỒI QUYỀN CHAT VÀ FILE

- **Actor:** Trưởng dự án (Project Manager) hoặc Quản trị viên (Admin).
- **Trigger:** Nhân sự bị xóa hoặc rút khỏi dự án (`DELETE FROM alpha_lite.project_members`).
- **Preconditions:** Nhân sự đang là thành viên của dự án.
- **Happy Path:**
  1. Database trigger `on_project_member_deleted` tự động xóa bản ghi của nhân sự trong `alpha_lite.conversation_members` tương ứng với dự án đó.
  2. Realtime channel gửi tín hiệu thu hồi quyền tới client của nhân sự bị xóa.
  3. Trên giao diện của nhân sự bị xóa: Dự án lập tức biến mất khỏi danh sách Chat. Nếu họ đang mở màn hình chat dự án, hệ thống hiển thị thông báo: *"Bạn không còn quyền truy cập vào cuộc trò chuyện của dự án này"* và tự động điều hướng về `/chat`.
  4. Lớp bảo mật RLS lập tức chặn mọi request SELECT/INSERT `messages` của nhân sự đó với cuộc trò chuyện dự án.
  5. Các liên kết file đính kèm riêng tư của dự án không còn truy cập được từ tài khoản này.
- **Alternative Flow:** Nếu người bị xóa là Chủ dự án (Owner): Hệ thống yêu cầu chuyển giao vai trò Owner cho thành viên khác trước khi xóa.
- **Error Cases:** Mất kết nối mạng khi đang thực hiện: Rollback transaction, không để tình trạng người bị xóa khỏi dự án nhưng vẫn chat được.
- **Permission Rules:** Thành viên thông thường không thể tự xóa thành viên khác.
- **Data Changes:**
  - `DELETE FROM alpha_lite.project_members WHERE project_id = ... AND user_id = ...`.
  - `DELETE FROM alpha_lite.conversation_members WHERE conversation_id = ... AND user_id = ...`.
- **Acceptance Criteria:**
  - Nhân sự bị xóa thử gọi API đọc tin nhắn dự án sẽ nhận mã lỗi `403 Forbidden` hoặc kết quả trả về `[]` từ RLS.
  - Tab "Trò chuyện" trong `/projects/[id]` bị ẩn hoặc khóa truy cập đối với nhân sự này.

---

## FLOW 4: CHỌN TIN NHẮN → TẠO TASK KÈM LIÊN KẾT GỐC

- **Actor:** Bất kỳ thành viên nào có quyền tạo task trong cuộc trò chuyện (Direct, Group hoặc Project).
- **Trigger:** Người dùng hover vào 1 tin nhắn và bấm vào icon **[✓ Tạo việc]** (`CheckSquare`).
- **Preconditions:** Tin nhắn không phải là tin đã bị thu hồi (`is_deleted = false`).
- **Happy Path:**
  1. Giao diện mở modal `ConvertMessageToTaskModal` với dữ liệu điền sẵn:
     - Tiêu đề: Lấy dòng đầu tiên của tin nhắn.
     - Dự án: Mặc định chọn dự án hiện tại (nếu đang ở Project Chat) hoặc dự án gần nhất.
     - Người nhận việc: Mặc định chọn người gửi tin nhắn (hoặc bản thân người bấm).
     - Mô tả: Chứa nội dung trích dẫn tin nhắn gốc kèm trích xuất tệp đính kèm (nếu có).
  2. Người dùng tinh chỉnh tiêu đề, chọn Hạn chót (Due date), Mức ưu tiên (Priority), Giai đoạn (Phase).
  3. Bấm "Tạo công việc ngay":
     - Hệ thống tạo Task trong `alpha_lite.tasks`.
     - Hệ thống lưu một bản ghi liên kết vào `alpha_lite.task_chat_links`:
       `{ task_id, conversation_id, source_message_id, created_by }`.
     - Hệ thống gửi tự động một **Thẻ công việc (Interactive Task Card)** vào cuộc trò chuyện hiện tại với nội dung:
       *"📌 Đã tạo công việc từ tin nhắn của @NgườiGửi"*.
  4. Người được giao việc nhận được thông báo: *"Bạn vừa được giao một công việc mới từ cuộc trò chuyện"*.
- **Alternative Flow:** Người dùng bỏ chọn ô *"Gửi thẻ công việc vào chat"*: Hệ thống chỉ tạo Task âm thầm và lưu liên kết gốc, không spam tin nhắn vào nhóm.
- **Error Cases:** Người dùng chưa nhập tiêu đề hoặc chưa chọn dự án: Form báo lỗi validation tại chỗ.
- **Permission Rules:** Người dùng phải có quyền tạo việc trong dự án đã chọn.
- **Data Changes:**
  - `INSERT` vào `alpha_lite.tasks`.
  - `INSERT` vào `alpha_lite.task_chat_links`.
  - `INSERT` vào `alpha_lite.messages` (type: `'task_card'`).
- **Acceptance Criteria:**
  - Trong Task Drawer của công việc mới tạo: Có một mục nổi bật *"💬 Tạo từ tin nhắn của [Tên] lúc [Giờ]"* kèm nút *"Xem tin nhắn gốc"* (click vào sẽ cuộn và highlight tin nhắn gốc trong chat).
  - Trong luồng chat: Hiển thị Thẻ Task Card với đầy đủ trạng thái.

---

## FLOW 5: TỪ TASK DETAIL → CHIA SẺ TASK VÀO CHAT

- **Actor:** Người phụ trách công việc, người giao việc hoặc thành viên dự án.
- **Trigger:** Trong `TaskDrawer` (Chi tiết công việc), người dùng bấm nút **[📤 Chia sẻ vào Chat]**.
- **Preconditions:** Task tồn tại hợp lệ trong cơ sở dữ liệu.
- **Happy Path:**
  1. Hệ thống mở popup modal `ShareTaskToChatModal`.
  2. Hiển thị danh sách các cuộc trò chuyện gần đây của người dùng (1-1, Nhóm, Dự án) kèm ô tìm kiếm hội thoại.
  3. Người dùng chọn 1 hoặc nhiều cuộc trò chuyện nhận thẻ Task.
  4. Người dùng nhập lời nhắn kèm theo (tùy chọn): *"Nhờ team ưu tiên duyệt gấp việc này trước 17h hôm nay nhé!"*.
  5. Bấm "Gửi vào Chat":
     - Hệ thống gửi tin nhắn loại `task_card` kèm lời nhắn vào các cuộc trò chuyện đã chọn.
     - Lưu liên kết vào `alpha_lite.task_chat_links`.
     - Toàn bộ thành viên trong cuộc trò chuyện nhận được Thẻ Task Card ngay lập tức qua Realtime.
- **Alternative Flow:** Nếu chia sẻ vào Project Chat của chính dự án chứa Task: Tự động highlight task trong tab Project Chat.
- **Error Cases:** Chia sẻ vào một cuộc trò chuyện có thành viên không thuộc dự án bí mật: Hệ thống cảnh báo: *"Một số thành viên trong nhóm này không có quyền truy cập dự án của công việc. Bạn có chắc chắn muốn chia sẻ?"*.
- **Permission Rules:** Người chia sẻ phải có quyền xem Task đó.
- **Data Changes:**
  - `INSERT` vào `alpha_lite.messages` (message_type: `'task_card'`, metadata chứa snapshot `{ taskId, title, status, priority, dueDate, assignee }`).
- **Acceptance Criteria:**
  - Kiểm tra cuộc trò chuyện đích: Thẻ Task Card xuất hiện tức thì, định dạng chuẩn đẹp, bấm vào mở thẳng Task Drawer.

---

## FLOW 6: TỪ THẺ TASK TRONG CHAT → MỞ CHI TIẾT TASK

- **Actor:** Bất kỳ thành viên nào trong cuộc trò chuyện nhìn thấy Thẻ Task Card.
- **Trigger:** Người dùng click vào Thẻ Task Card hoặc nút "Xem chi tiết công việc" trên thẻ.
- **Preconditions:** Người dùng có quyền truy cập vào dự án chứa Task đó.
- **Happy Path:**
  1. Giao diện mở ngay `TaskDrawer` của công việc đó ở chế độ lớp phủ (Slide-over drawer) mà **không làm mất ngữ cảnh phiên chat hiện tại**.
  2. Người dùng có thể xem đầy đủ thông tin: Mô tả, Checklists, Custom Fields, Timeline hoạt động, Tệp đính kèm và bình luận công việc.
  3. Nếu người dùng đổi trạng thái công việc (ví dụ: chuyển từ `Đang làm` sang `Hoàn thành`):
     - Dữ liệu task được lưu vào DB.
     - Realtime broadcast sự kiện cập nhật task.
     - Thẻ Task Card đang hiển thị trong stream chat lập tức đổi màu badge từ Vàng sang Xanh lá cây (`Hoàn thành`) mà không cần tải lại trang!
- **Alternative Flow:** Người dùng bấm icon "Mở trong tab mới" (`ExternalLink`): Hệ thống mở trang `/projects/[id]?task=[taskId]` trong tab trình duyệt mới.
- **Error Cases:** Người xem không có quyền trong dự án chứa Task: Hiển thị thông báo nhã nhặn: *"Bạn không có quyền truy cập chi tiết công việc này. Vui lòng liên hệ Trưởng dự án."*.
- **Permission Rules:** Tuân thủ phân quyền RBAC dự án của Task.
- **Data Changes:** Không có thay đổi dữ liệu khi chỉ xem; nếu đổi trạng thái task sẽ kích hoạt `UPDATE alpha_lite.tasks`.
- **Acceptance Criteria:**
  - Click mở mượt mà dưới 300ms.
  - Trạng thái công việc đồng bộ 2 chiều tức thì giữa Task Drawer và Thẻ Chat.

---

## FLOW 7: PROJECT HOÀN THÀNH / ARCHIVE → XỬ LÝ TRẠNG THÁI CHAT

- **Actor:** Quản trị viên (Admin) hoặc Trưởng dự án (Project Manager).
- **Trigger:** Dự án được chuyển trạng thái sang `completed` hoặc `archived`.
- **Preconditions:** Dự án đang ở trạng thái `active`.
- **Happy Path:**
  1. Trạng thái `is_archived = true` được cập nhật trong bảng `alpha_lite.conversations` của dự án đó.
  2. Hệ thống phát một tin nhắn hệ thống vào phòng chat:
     *"📁 Dự án này đã được lưu trữ (Archived). Cuộc trò chuyện được chuyển sang chế độ Chỉ đọc (Read-only)."*
  3. Khung soạn thảo tin nhắn (Composer) ở phía dưới chuyển thành thanh thông báo: *"Dự án đã lưu trữ. Bạn chỉ có thể xem lại lịch sử trò chuyện."*
  4. Tất cả các nút hành động (Gửi tin, Tạo task, Thả cảm xúc, Ghim) tạm thời bị vô hiệu hóa.
  5. Cuộc trò chuyện vẫn xuất hiện trong danh sách khi người dùng chọn bộ lọc "Lưu trữ" hoặc tìm kiếm trong lịch sử.
- **Alternative Flow:** Khi dự án được Khôi phục lại (`Unarchive / Active`):
  - Khôi phục `is_archived = false`.
  - Khung soạn thảo tin nhắn được mở khóa trở lại bình thường.
- **Error Cases:** Xóa vĩnh viễn dự án (`DELETE`): Toàn bộ tin nhắn và conversation của dự án bị xóa theo cascade (hoặc soft-delete nếu bật cờ).
- **Permission Rules:** Chỉ Admin hoặc Project Manager mới có quyền Archive dự án.
- **Data Changes:**
  - `UPDATE alpha_lite.conversations SET is_archived = true WHERE project_id = ...`.
- **Acceptance Criteria:**
  - Không thể gửi thêm tin nhắn vào dự án đã archive.
  - Toàn bộ lịch sử tin nhắn và tệp đính kèm cũ vẫn tra cứu và tải về được 100%.

---

## FLOW 8: THÔNG BÁO TIẾN ĐỘ & DEADLINE → ĐÚNG NGƯỜI, KHÔNG SPAM

- **Actor:** Hệ thống tự động (Cron job / Recurring Engine / Database Trigger).
- **Trigger:**
  - Có người `@mention` hoặc nhắc tên nhóm `@all`.
  - Công việc bị quá hạn (Overdue) hoặc sắp đến hạn trong vòng 24 giờ.
  - Có tin nhắn mới trong cuộc trò chuyện 1-1.
- **Preconditions:** Người nhận có bật thông báo trong cài đặt cá nhân (`notification_prefs`).
- **Happy Path:**
  1. Hệ thống kiểm tra cấu hình thông báo của người nhận:
     - Nếu người dùng đang mở đúng cuộc trò chuyện đó (Active focus): Không phát âm thanh hoặc không gửi popup trùng lặp.
     - Nếu người dùng đang ở tab khác hoặc offline: Tạo bản ghi vào `alpha_lite.notifications`, tăng badge chưa đọc trên `NavRail`.
     - Kích hoạt Web Push Notification trình duyệt nếu được cấp quyền.
  2. **Cơ chế chống spam (Debounce & Throttling):**
     - Nếu 1 người gửi liên tiếp 5 tin nhắn trong vòng 1 phút trong cùng 1 hội thoại: Hệ thống gộp thành 1 thông báo duy nhất: *"[Tên người gửi] đã gửi 5 tin nhắn mới"*.
     - Thông báo thay đổi trạng thái task: Chỉ thông báo cho Người phụ trách (Assignee) và Người giao việc (Creator), không broadcast vào toàn nhóm chat nếu không thực sự cần thiết.
- **Alternative Flow:** Nếu người dùng đã cài đặt Mute cuộc trò chuyện (`is_muted = true`): Vẫn tăng số đếm chưa đọc nhưng không phát âm thanh hoặc popup push notification.
- **Error Cases:** Lỗi push notification service: Ghi log lỗi vào hệ thống, đảm bảo không làm gián đoạn luồng gửi tin nhắn chính.
- **Permission Rules:** Áp dụng theo cấu hình quyền hạn và cài đặt riêng tư của người dùng.
- **Data Changes:**
  - `INSERT` hoặc `UPDATE` vào `alpha_lite.notifications`.
- **Acceptance Criteria:**
  - Người dùng không bị nhận hàng loạt thông báo rác khi chat nhóm sôi động.
  - Nhấp vào thông báo sẽ mở ngay lập tức đúng cuộc trò chuyện và cuộn tới đúng tin nhắn tương ứng.
