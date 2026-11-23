# KẾ HOẠCH VÀ KỊCH BẢN KIỂM THỬ TOÀN DIỆN (TEST PLAN)
**Tài liệu:** `docs/features/chat/08-TEST-PLAN.md`  
**Dự án:** Alpha Task Manager — Phân hệ Unified Chat & Collaboration  
**Mục tiêu:** Định nghĩa bộ test cases chuẩn xác để nghiệm thu từng tính năng trước khi đưa vào sản xuất.

---

## I. CHIẾN LƯỢC KIỂM THỬ (TEST STRATEGY)

1. **Phân tách môi trường:**
   - Mọi kiểm thử chức năng và kiểm thử phá hủy bảo mật chỉ được thực hiện trên môi trường Staging/Local hoặc database test riêng biệt. Tuyệt đối không thử nghiệm payload độc hại trên database production.
2. **Nguyên tắc phân biệt trạng thái kiểm chứng:**
   - **VERIFIED WORKING:** Đã chạy thực tế bằng 2 tài khoản test đồng thời và có log ghi nhận thành công.
   - **CODE EXISTS:** Đã kiểm tra logic code hợp lệ, typecheck đạt 0 lỗi nhưng chưa chạy runtime thực tế do thiếu tài khoản test.
   - **NOT TESTED:** Chưa kiểm thử hoặc chưa có môi trường thực thi.
3. **Quality Gate 12 Tiêu chí nghiệm thu bắt buộc:**
   - Đạt 100% build sạch, không lỗi kiểu TypeScript (`npm run typecheck`), không rò rỉ RLS, không làm hồi quy các tính năng Task và Project hiện hữu.

---

## II. MA TRẬN KỊCH BẢN KIỂM THỬ (TEST SCENARIO MATRIX)

### Phân hệ 1: Bảo mật & Phân quyền (Security & Permissions)

| Test ID | Kịch bản kiểm thử | Tiền điều kiện | Các bước thực hiện | Kết quả mong đợi | Ưu tiên | Trạng thái |
|---|---|---|---|---|:---:|:---:|
| **SEC-01** | Kiểm tra quyền riêng tư chat 1-1 | Có 3 tài khoản: User A, User B, User C | User C dùng token của mình gọi query `SELECT * FROM messages WHERE conversation_id = [DM A-B]` | Kết quả trả về `[]` (rỗng) hoặc lỗi 403 Forbidden. C không thể đọc tin nhắn giữa A và B. | **P0** | NOT TESTED |
| **SEC-02** | Kiểm tra bảo vệ sửa tin nhắn của đối phương | User A gửi 1 tin nhắn cho User B | User B dùng Postman / Supabase Client gửi lệnh UPDATE `content` của tin nhắn đó | Cơ sở dữ liệu từ chối (0 rows affected hoặc RLS violation). User B không thể sửa tin của User A. | **P0** | NOT TESTED |
| **SEC-03** | Kiểm tra chặn truy cập khi bị xóa khỏi Dự án | User A là thành viên Dự án X; sau đó bị xóa khỏi dự án | 1. Xóa User A khỏi `project_members`<br>2. User A thử gửi hoặc đọc tin trong Project Chat X | User A không nhìn thấy cuộc trò chuyện trong danh sách và bị RLS chặn đọc/ghi tin nhắn. | **P0** | NOT TESTED |
| **SEC-04** | Kiểm tra bảo mật tệp đính kèm | User A gửi 1 tệp nội bộ trong chat 1-1 với User B | 1. Lấy đường dẫn tệp trong storage<br>2. Mở đường dẫn đó trên trình duyệt ẩn danh (chưa đăng nhập) | Trình duyệt trả về lỗi `403 Access Denied` hoặc `401 Unauthorized`. File không được công khai. | **P0** | NOT TESTED |
| **SEC-05** | Chống giả mạo người gửi (`sender_id`) | User A đang đăng nhập | User A gửi request INSERT tin nhắn với `sender_id = [ID của User B]` | Cơ sở dữ liệu báo lỗi vi phạm RLS `WITH CHECK (auth.uid() = sender_id)`. | **P0** | NOT TESTED |

---

### Phân hệ 2: Chat 1-1 & Kênh Thời Gian Thực (Direct Chat & Realtime)

| Test ID | Kịch bản kiểm thử | Tiền điều kiện | Các bước thực hiện | Kết quả mong đợi | Ưu tiên | Trạng thái |
|---|---|---|---|---|:---:|:---:|
| **RT-01** | Gửi và nhận tin 2 chiều tức thì | 2 trình duyệt mở 2 tài khoản A và B | 1. A gửi tin nhắn "Xin chào B"<br>2. B quan sát màn hình chat | Màn hình B xuất hiện tin nhắn của A dưới 500ms, không cần reload trang. | **P0** | NOT TESTED |
| **RT-02** | Trạng thái đang nhập (Typing indicator) | A và B đang mở hội thoại với nhau | A bắt đầu gõ phím vào khung soạn thảo | Màn hình B hiển thị "A đang nhập..." và tự động biến mất sau 3 giây dừng gõ. | **P1** | NOT TESTED |
| **RT-03** | Thả cảm xúc Emoji (Reactions) | Đã có tin nhắn trong hội thoại | A bấm thả biểu cảm ❤️ vào tin nhắn | Cả A và B đều thấy biểu cảm ❤️ tăng số đếm lên 1 theo thời gian thực. Bấm lại thì hủy reaction. | **P1** | NOT TESTED |
| **RT-04** | Thu hồi tin nhắn (Unsend) | A đã gửi 1 tin nhắn | A bấm nút Thu hồi trên tin nhắn của mình | Tin nhắn chuyển thành "Tin nhắn đã được thu hồi" trên cả màn hình của A và B. | **P0** | NOT TESTED |
| **RT-05** | Đồng bộ trạng thái đã đọc giữa 2 tab | A mở 2 tab trình duyệt trên máy tính | B gửi tin nhắn mới cho A (hiển thị badge cam). A mở đọc tin ở Tab 1 | Tab 2 của A tự động xóa badge chưa đọc mà không cần reload. | **P1** | NOT TESTED |
| **RT-06** | Mất kết nối mạng và kết nối lại | Đang mở cuộc trò chuyện | 1. Ngắt kết nối mạng client (Offline)<br>2. Gửi thử 1 tin nhắn<br>3. Bật lại mạng | Tin nhắn ở trạng thái "Đang gửi...", khi có mạng trở lại tự động gửi thành công mà không mất nội dung. | **P1** | NOT TESTED |

---

### Phân hệ 3: Group Chat & Quản lý Nhóm (Group Collaboration)

| Test ID | Kịch bản kiểm thử | Tiền điều kiện | Các bước thực hiện | Kết quả mong đợi | Ưu tiên | Trạng thái |
|---|---|---|---|---|:---:|:---:|
| **GRP-01** | Tạo nhóm chat mới | User A đăng nhập | Bấm [+] -> Tạo nhóm mới -> Nhập "Nhóm Hội Chợ Sách", chọn B và C -> Bấm Tạo | Nhóm mới được tạo; A, B, C đều nhìn thấy nhóm trong danh sách với đầy đủ thành viên. | **P0** | NOT TESTED |
| **GRP-02** | Thêm thành viên vào nhóm | A là Chủ nhóm (Owner) | Mở Context Panel -> Bấm "+ Thêm thành viên" -> Chọn User D | D nhận được tin nhắn hệ thống chào mừng, xuất hiện nhóm trong danh sách của D. | **P0** | NOT TESTED |
| **GRP-03** | Xóa thành viên khỏi nhóm | A là Owner, muốn xóa B | A mở danh sách thành viên -> Chọn B -> Bấm "Xóa khỏi nhóm" | B bị xóa khỏi nhóm, nhóm biến mất khỏi màn hình của B; B không thể đọc thêm tin nhắn mới. | **P0** | NOT TESTED |
| **GRP-04** | Thành viên rời nhóm | B muốn rời nhóm | B mở Thông tin nhóm -> Bấm "Rời khỏi nhóm" | B rời nhóm thành công, nhóm ghi nhận tin nhắn hệ thống "B đã rời khỏi nhóm". | **P1** | NOT TESTED |
| **GRP-05** | Nhắc tên toàn nhóm (@all) | Trong nhóm có 10 người | A gõ `@all` và gửi thông báo khẩn | Toàn bộ 9 thành viên còn lại đều nhận được thông báo nhắc tên nhóm. | **P1** | NOT TESTED |

---

### Phân hệ 4: Tích hợp Chat ↔ Task & Project Chat

| Test ID | Kịch bản kiểm thử | Tiền điều kiện | Các bước thực hiện | Kết quả mong đợi | Ưu tiên | Trạng thái |
|---|---|---|---|---|:---:|:---:|
| **TSK-01** | Tạo Task từ tin nhắn trong chat | Đang có tin nhắn yêu cầu việc | Bấm icon [✓ Tạo việc] trên tin nhắn -> Chọn Dự án, Người làm, Hạn chót -> Bấm Tạo | 1. Task mới xuất hiện trong dự án.<br>2. Thẻ Task Card xuất hiện trong luồng chat.<br>3. Task Drawer có link dẫn ngược về tin nhắn gốc. | **P0** | NOT TESTED |
| **TSK-02** | Chia sẻ Task vào Chat từ Task Drawer | Đang xem chi tiết 1 Task | Bấm nút [📤 Chia sẻ vào Chat] -> Chọn Nhóm chat -> Nhập lời nhắn -> Bấm Gửi | Thẻ Task Card kèm lời nhắn xuất hiện ngay lập tức trong phòng chat đã chọn. | **P0** | NOT TESTED |
| **TSK-03** | Click Thẻ Task Card mở Task Drawer | Đang thấy Thẻ Task trong chat | Click vào Thẻ Task Card | Task Drawer trượt ra mượt mà, hiển thị đầy đủ chi tiết công việc mà không làm mất ngữ cảnh chat. | **P0** | NOT TESTED |
| **TSK-04** | Đồng bộ trực tiếp trạng thái Task | Đang mở cả Chat và Kanban | Đổi trạng thái Task từ "Đang làm" sang "Hoàn thành" trên Kanban | Badge trạng thái trên Thẻ Task Card trong Chat đổi sang màu xanh "Hoàn thành" thời gian thực. | **P0** | NOT TESTED |
| **TSK-05** | Đồng bộ Project Chat tự động | Tạo một Dự án mới "Sách Mới 2026" | Kiểm tra tab "Trò chuyện" trong dự án và mục "Dự án" trong Chat Center | Cuộc trò chuyện chính của dự án tự động sẵn sàng, thành viên dự án tự động có quyền chat. | **P0** | NOT TESTED |

---

### Phân hệ 5: Giao diện & Trải nghiệm Người dùng (UI/UX & Mobile)

| Test ID | Kịch bản kiểm thử | Tiền điều kiện | Các bước thực hiện | Kết quả mong đợi | Ưu tiên | Trạng thái |
|---|---|---|---|---|:---:|:---:|
| **UI-01** | Bố cục 3 cột trên Desktop | Màn hình độ phân giải >= 1280px | Mở trang `/chat` | Hiển thị chuẩn 3 cột: Cột 1 (Sidebar hội thoại), Cột 2 (Vùng tin nhắn chính), Cột 3 (Context Panel). | **P0** | NOT TESTED |
| **UI-02** | Thu gọn / Mở rộng Context Panel | Mở hội thoại bất kỳ | Bấm nút [ℹ️] trên Header | Cột thứ 3 thu gọn mượt mà, Cột thứ 2 tự động mở rộng chiếm diện tích. Bấm lại thì mở ra. | **P1** | NOT TESTED |
| **UI-03** | Bộ lọc hội thoại (Pill Filters) | Có danh sách nhiều hội thoại | Lần lượt bấm: `Tất cả` -> `Chưa đọc` -> `1-1` -> `Nhóm` -> `Dự án` | Danh sách bên dưới lọc chính xác các hội thoại tương ứng, số lượng đếm đúng thực tế. | **P0** | NOT TESTED |
| **UI-04** | Trải nghiệm trên Mobile (Responsive) | Thiết bị di động (chiều rộng 375px) | 1. Mở danh sách hội thoại<br>2. Chọn 1 cuộc chat<br>3. Bấm nút Back [ < ] | 1. Màn hình tin nhắn hiển thị toàn màn hình.<br>2. Bấm Back quay lại danh sách mượt mà, không bị giật layout. | **P1** | NOT TESTED |
| **UI-05** | Dán ảnh từ Clipboard (Ctrl + V) | Có ảnh đang copy trong clipboard | Đang focus ô soạn thảo, nhấn `Ctrl + V` | Ảnh xem trước xuất hiện trong khung soạn thảo kèm nút xóa [X] và sẵn sàng để gửi. | **P0** | NOT TESTED |

---

## III. BIÊN BẢN NGHIỆM THU (ACCEPTANCE SIGNOFF CRITERIA)
Một Sprint chỉ được xem là ĐẠT và cho phép chuyển sang Sprint tiếp theo khi:
1. 100% các Test Cases mức **P0** trong Sprint đó đạt trạng thái **PASS**.
2. Không phát sinh bất kỳ lỗi biên dịch TypeScript (`tsc --noEmit` đạt mã 0).
3. Lệnh build ứng dụng Next.js (`npm run build`) thành công 100%.
4. Không để lộ secret hoặc API service role keys trong client code.
5. Có sự xác nhận bằng văn bản từ Product Owner.
