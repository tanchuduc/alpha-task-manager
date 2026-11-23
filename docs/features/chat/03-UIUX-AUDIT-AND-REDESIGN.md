# ĐÁNH GIÁ UI/UX HIỆN TẠI VÀ BẢN THIẾT KẾ NÂNG CẤP (3-COLUMN REDESIGN)
**Tài liệu:** `docs/features/chat/03-UIUX-AUDIT-AND-REDESIGN.md`  
**Dự án:** Alpha Task Manager — Phân hệ Unified Chat & Collaboration  
**Mô hình tham chiếu:** Lark Messenger & IDEAS WorkChat (Theo ảnh tư liệu người dùng cung cấp)

---

## I. ĐÁNH GIÁ UI/UX HIỆN TẠI (THANG ĐIỂM 0 – 5)

| STT | Tiêu chí đánh giá | Điểm (0-5) | Bằng chứng từ mã nguồn & Phân tích trải nghiệm |
|:---:|---|:---:|---|
| **1** | **Information Architecture (Kiến trúc thông tin)** | **2.5 / 5** | Phân tầng chưa tối ưu. `ChatContainer.tsx` (dòng 1799) chia sidebar thành 3 tab cứng ("1-1", "Phòng ban", "Dự án"). Người dùng không có một màn hình tổng hợp để xem tất cả tin nhắn mới nhất đến từ ai, mà phải bấm lần lượt qua từng tab để kiểm tra badge chưa đọc. |
| **2** | **Navigation (Điều hướng & Tìm kiếm)** | **2.5 / 5** | Thanh tìm kiếm (`ChatContainer.tsx` dòng 1787) chỉ lọc danh sách profile hoặc department đã tải trong RAM. Không tìm kiếm được nội dung tin nhắn. Nút "Hộp thư" trong `NavRail.tsx` điều hướng sang `/chat`, trong khi route `/inbox` bị redirect về `/chat` mà không có giao diện Inbox thực sự. |
| **3** | **Visual Hierarchy (Phân cấp thị giác)** | **3.5 / 5** | Thiết kế sạch sẽ theo chuẩn Alpha Books (màu cam `#F26522` / `brand`, font sans, bo góc rounded-xl, dark mode tốt). Bong bóng chat phân biệt rõ tin của tôi (nền cam/xanh) vs đối phương (nền xám). Header rõ ràng tên đối tác/kênh. |
| **4** | **Conversation Experience (Trải nghiệm đọc/viết)** | **3.5 / 5** | Đã có emoji reactions (quick reaction bar khi hover), trích dẫn trả lời (reply quote), sửa tin nhắn inline, thu hồi tin nhắn. Hỗ trợ dán ảnh qua clipboard (Ctrl+V). Khung soạn thảo có `@mention` tự động. Điểm trừ: chưa có công cụ định dạng rich-text, chưa có phím tắt thao tác nhanh. |
| **5** | **Group Management (Quản lý nhóm)** | **0.5 / 5** | Hoàn toàn chưa có giao diện quản lý nhóm. Chỉ có 5 phòng ban tĩnh. Không có nút "Tạo nhóm mới", không có màn hình xem danh sách thành viên nhóm, không thể đổi ảnh đại diện hay quyền nhóm. |
| **6** | **Project Integration (Tích hợp Dự án)** | **3.0 / 5** | Đã tích hợp tab "Trò chuyện" trong trang chi tiết dự án (`ProjectChatTab.tsx`). Có thể chuyển đổi qua lại giữa `/chat?project=id` và `/projects/[id]?tab=chat`. Tuy nhiên, hai màn hình này có layout khác nhau, code bị trùng lặp lớn và thiếu Context Panel chứa thông tin dự án. |
| **7** | **Task Integration (Tương tác Công việc)** | **2.0 / 5** | Đã có modal chuyển tin nhắn thành Task (`ConvertMessageToTaskModal.tsx`). Tuy nhiên kết quả trả về trong chat chỉ là dòng text markdown thô sơ (`[Tạo việc thành công: ...](url)`). Không có thẻ công việc trực quan (Task Card), không hiển thị người nhận việc, hạn chót hay trạng thái làm việc thực tế. Không thể chia sẻ Task từ Task Drawer vào Chat. |
| **8** | **Responsive Design (Desktop & Mobile)** | **3.0 / 5** | Trên mobile (`ChatContainer.tsx` dòng 1764), hệ thống ẩn sidebar bằng cờ `mobileShowSidebar`. Nhưng trên màn hình điện thoại, header không có nút Back chuẩn, khung soạn tin dễ bị bàn phím che khuất, chưa có swipe gesture để trả lời tin. |
| **9** | **Accessibility (Khả năng tiếp cận)** | **3.0 / 5** | Hỗ trợ bàn phím cơ bản (Enter để gửi, Shift+Enter xuống dòng, mũi tên chọn `@mention`). Tuy nhiên chưa gắn đầy đủ thẻ `aria-label` cho các nút icon hành động trên tin nhắn (reply, pin, react, delete). |
| **10**| **Design Consistency (Độ nhất quán)** | **3.5 / 5** | Màu sắc, typography, border và dark mode đồng bộ tốt với các trang Home và Projects của Alpha Task Manager. Cần tiếp tục duy trì token màu cam `#F26522` thương hiệu. |

**ĐIỂM TRUNG BÌNH HIỆN TẠI:** **2.7 / 5.0** (Cần nâng cấp toàn diện để đạt chuẩn Modern Enterprise Collaboration).

---

## II. ĐỊNH HƯỚNG GIAO DIỆN MỚI (LARK & IDEAS WORKCHAT BENCHMARK)

Dựa trên phân tích 2 ảnh giao diện tư liệu thực tế từ **IDEAS WorkChat** và **Lark Messenger**, hệ thống mới sẽ áp dụng **Bố cục 3 cột chuyên nghiệp (Desktop 3-Column Layout)**:

```
+-------------------+---------------------------------------+---------------------+
| CỘT 1: CHAT NAV   | CỘT 2: ACTIVE CONVERSATION            | CỘT 3: CONTEXT PANEL|
| (W: 320px - 360px)| (W: Flexible / Chiếm toàn bộ giữa)    | (W: 320px, Collapsed)|
+-------------------+---------------------------------------+---------------------+
| [Search...] [+]   | [Avatar] [Tên Chat] [Thành viên] [Q][i]| [Thông tin nhóm/DA] |
| [Tất cả] [Chưa đọc]| ------------------------------------- | [Thành viên (25)]   |
| [1-1] [Nhóm] [DA] | [Tin nhắn đối tác]                     | - Mai Thị Nữ        |
| ----------------- |   - Reactions: 👍 1 ❤️ 1             | - Trịnh Đình Thanh  |
| * SI IDEAS (14:22)| [Tin nhắn tôi]                         | ------------------- |
|   Chào bạn! Tôi.. | [THẺ CÔNG VIỆC - TASK CARD]           | [Thẻ Công việc (8)] |
| * Kế toán (15:27) |   ┌─────────────────────────────────┐ | - Duyệt bìa sách    |
|   Thanh: Nay cảm..|   │ 🏷️ TK-04: Thiết kế bìa sách      │ | - Gửi bản thảo in   |
| * Sách Alpha (09h)|   │ 👤 Phụ trách: Mai Thị Nữ        │ | ------------------- |
|   Phúc: Đã duyệt..|   │ 📅 Hạn: 28/11 • 🔴 Khẩn cấp     │ | [Tệp đính kèm (14)] |
|                   |   │ Trạng thái: [Đang làm ▼]        │ | - HopDong_v2.pdf    |
|                   |   └─────────────────────────────────┘ | - Bia_Final.png     |
|                   | ------------------------------------- | ------------------- |
|                   | [⚡ Lệnh AI] [🏷️ Gắn Task] [📎] [😊]   | [Tin đã ghim (3)]   |
|                   | [Nhập tin nhắn, @nhắc tên...      ] [▶]| - Thông báo sinh nhật|
+-------------------+---------------------------------------+---------------------+
```

---

## III. MÔ TẢ CHI TIẾT CÁC CỘT TRONG BỐ CỤC MỚI

### 1. Cột 1 — Chat Navigation (Bên trái)
- **Header:**
  - Tiêu đề "Alpha WorkChat" / "Trò chuyện".
  - Nút **[+] Tạo mới**: Dropdown gồm "Tạo nhóm chat mới" hoặc "Nhắn tin trực tiếp".
  - Nút chuyển đổi nhanh: "Hội thoại gần đây" và "Danh bạ nhân sự (23)".
- **Ô tìm kiếm:** "Tìm kiếm cuộc trò chuyện, nhân sự, nội dung tin nhắn..."
- **Thanh lọc thông minh (Pill Filters):**
  - `Tất cả` | `Chưa đọc` | `1-1` | `Nhóm` | `Dự án`.
- **Danh sách cuộc trò chuyện:**
  - Avatar đại diện (kèm chấm xanh trạng thái online đối với 1-1).
  - Tên đối tác / Tên nhóm / Tên dự án.
  - Tag phân loại: `#Dự án`, `#Nhóm`, `#Phòng ban`, hoặc `#Bot AI`.
  - Dòng xem trước tin nhắn cuối cùng (nếu là tin thu hồi: *"Tin nhắn đã được thu hồi"*).
  - Thời gian tin nhắn cuối (14:22, Hôm qua, 12/11).
  - Badge đếm số tin chưa đọc (màu cam nổi bật).
  - Biểu tượng Ghim (nếu cuộc trò chuyện được ghim lên đầu).

### 2. Cột 2 — Conversation Stream (Cột giữa)
- **Header hội thoại:**
  - Avatar + Tên cuộc trò chuyện.
  - Số lượng thành viên (với Group/Project) kèm link xem chi tiết.
  - Trạng thái hoạt động (Online, Vừa xong, hoặc "Đang nhập...").
  - Thanh công cụ góc phải:
    - 🔍 Tìm kiếm trong hội thoại.
    - 📌 Nút mở danh sách tin đã ghim.
    - ℹ️ Nút bật/tắt Cột 3 (Context Panel).
- **Vùng hiển thị tin nhắn (Message Stream):**
  - Phân tách theo ngày ("Hôm nay", "Hôm qua", "Thứ Hai, 20/11/2026").
  - Bong bóng tin nhắn với Avatar, Tên người gửi, Chức danh.
  - Thanh Quick Actions khi hover trên từng tin:
    - Thả cảm xúc nhanh (👍, ❤️, 😂, 🎉, 🔥, 👀).
    - Trả lời (Reply / Quote).
    - Tạo Task từ tin nhắn (Nút `CheckSquare` mở modal tạo việc).
    - Ghim tin nhắn (Pin).
    - Thao tác khác (Sao chép, Chỉnh sửa, Thu hồi).
  - **Thẻ công việc tương tác (Interactive Task Card):**
    - Hiển thị trực tiếp khi có thành viên chia sẻ Task vào chat hoặc vừa tạo Task từ chat.
    - Hiển thị: Mã task, Tiêu đề, Dự án liên quan, Người phụ trách, Hạn chót, Mức độ ưu tiên.
    - Badge trạng thái trực tiếp: Cập nhật thời gian thực khi trạng thái task thay đổi bên Kanban/List.
    - Nút bấm "Mở chi tiết" (mở Task Drawer ngay trong phiên làm việc).
- **Thanh soạn thảo thông minh (Rich Message Composer):**
  - Hàng nút thao tác nhanh (như hình mẫu IDEAS WorkChat):
    - `😊` Chọn Emoji.
    - `📎` Đính kèm tệp/tài liệu (Word, Excel, PDF, Zip).
    - `🖼️` Đính kèm ảnh (hỗ trợ Ctrl+V dán ảnh clipboard).
    - `🏷️ ERP / TASK TAG`: Bật popup chọn Task hiện có trong dự án để gửi thẻ Task Card vào chat.
    - `⚡ LỆNH AI`: Gọi tính năng trợ lý (Tóm tắt hội thoại, Trích xuất công việc).
  - Ô nhập liệu: Tự động co giãn chiều cao (auto-expand textarea), hỗ trợ gõ `@` kích hoạt gợi ý thông minh, gõ `@all` để thông báo toàn bộ thành viên nhóm.
  - Hướng dẫn nhập: "Enter để gửi, Shift+Enter xuống dòng".

### 3. Cột 3 — Context Panel (Bên phải - Có thể đóng/mở)
- **Header:** "Thông tin hội thoại", nút `X` để thu gọn.
- **Phần 1: Thông tin chung:**
  - Avatar lớn, Tên nhóm/dự án, Mô tả ngắn.
  - Nút Tắt chuông thông báo (Mute), Ghim hội thoại (Pin to top).
- **Phần 2: Thành viên (Members):**
  - Danh sách thành viên tham gia, trạng thái Online.
  - Phân rõ vai trò: Chủ nhóm (Owner), Quản trị viên (Admin), Thành viên.
  - Nút "+ Thêm thành viên" (chỉ hiển thị nếu có quyền).
- **Phần 3: Công việc liên quan (Associated Tasks):**
  - Liệt kê toàn bộ các Task đã được tạo hoặc chia sẻ trong cuộc trò chuyện này.
  - Hiển thị thanh tiến độ tóm tắt: Đã xong 5/8 việc.
- **Phần 4: Tệp & Đa phương tiện (Files & Media):**
  - Danh sách file đã chia sẻ trong nhóm (Tên, Dung lượng, Người gửi, Ngày gửi).
  - Nút tải xuống trực tiếp.
- **Phần 5: Tin nhắn đã ghim (Pinned Messages):**
  - Danh sách tin nhắn quan trọng, click vào để cuộn thẳng tới vị trí tin trong lịch sử.

---

## IV. BẢN VẼ WIREFRAME CHI TIẾT (ASCII WIREFRAMES)

### 1. Wireframe: Chat Center Tổng thể (3 Cột)
```
+-----------------------------------------------------------------------------------------------------------------------------------+
|  ALPHA WORK LITE      [🔍 Tìm kiếm toàn cục Ctrl+K]                         [🔔 Thông báo (3)]  [👤 Huỳnh Trọng Phúc (Admin) ▼]   |
+-----------------------------------------------------------------------------------------------------------------------------------+
| [📁 Trang chủ] |  TÌM KIẾM HỘI THOẠI                    |  IDEAS - XUẤT BẢN SÁCH KINH DOANH              [🔍] [📌 (2)] [ℹ️ Đóng/Mở] |
| [📋 Công việc] |  [🔍 Tìm cuộc trò chuyện, nhân sự...]  |  Dự án • 25 thành viên • Trực tuyến: 8 người                     |
| [📂 Dự án]     |  +-----------------------------------+ |------------------------------------------------------------------|
| [💬 Trò chuyện]|  [ Tất cả ] [Chưa đọc] [1-1] [Dự án]   |  --- Hôm nay, 23 tháng 11, 2026 ---                              |
| [📊 Báo cáo]   |  -----------------------------------   |                                                                  |
| [⚙️ Cài đặt]   |  📌 Kế toán - Ban Giám đốc       15:30 |  [Avatar] Mai Thị Nữ (Biên tập viên)  14:15                      |
|                |     Thanh: Đã chuyển khoản tác..    [2]|    Chào anh Phúc, em đã hoàn thành biên tập chương 3 sách mới.   |
|                |                                        |    Em gửi bản thảo đính kèm nhờ anh duyệt tiến độ nhé!           |
|                |  ● IDEAS - Sách Kinh Doanh       14:22 |    📎 BanThao_Chuong3_v2.docx (2.4 MB)                           |
|                |     Nữ: Đã tạo việc thiết kế bìa..  [1]|    👍 2  ❤️ 1                                                    |
|                |                                        |                                                                  |
|                |  ○ Nguyễn Văn A (Thiết kế)       11:05 |  [Avatar] Bạn (Huỳnh Trọng Phúc)  14:20                          |
|                |     File demo em để trong Drive nhé    |    Nhất trí, để anh tạo luôn Task cho đội Thiết kế dàn trang nhé!|
|                |                                        |                                                                  |
|                |  ● Trịnh Đình Thanh              H.qua |  ┌─────────────────────────────────────────────────────────────┐ |
|                |     [Tin nhắn đã thu hồi]              |  │ 🏷️ TASK ĐÃ TẠO TỪ TIN NHẮN                                    │ |
|                |                                        |  │ Tiêu đề: Thiết kế market bìa & Dàn trang Sách Kinh Doanh    │ |
|                |                                        |  │ Người làm: Nguyễn Văn A (Thiết kế)  • Hạn: 28/11/2026       │ |
|                |                                        |  │ Trạng thái: [🟡 ĐANG LÀM]           [ Xem chi tiết việc ↗ ] │ |
|                |                                        |  └─────────────────────────────────────────────────────────────┘ |
|                |                                        |------------------------------------------------------------------|
|                |                                        |  [😊 Icon] [📎 Tệp] [🖼️ Ảnh] [🏷️ Gắn Task] [⚡ Lệnh AI]          |
|                |                                        |  +-------------------------------------------------------------+ |
|                |                                        |  | Nhập @, tin nhắn tới nhóm (Enter để gửi, Shift+Enter xuống) | |
|                |                                        |  +-------------------------------------------------------------+ |
+----------------+----------------------------------------+------------------------------------------------------------------+
```

### 2. Wireframe: Modal "Tạo Task từ Tin nhắn" (Convert Modal)
```
+------------------------------------------------------------------------+
|  TẠO CÔNG VIỆC TỪ TIN NHẮN TRÒ CHUYỆN                              [X] |
+------------------------------------------------------------------------+
|  Nguồn tin nhắn:                                                       |
|  ┌──────────────────────────────────────────────────────────────────┐  |
|  │ "Em gửi bản thảo đính kèm nhờ anh duyệt tiến độ nhé!"             │  |
|  │ — Gửi bởi: Mai Thị Nữ lúc 14:15 (23/11/2026)                      │  |
|  └──────────────────────────────────────────────────────────────────┘  |
|                                                                        |
|  * Tên công việc:                                                      |
|  [ Duyệt bản thảo chương 3 & Lên kế hoạch dàn trang                  ] |
|                                                                        |
|  * Thuộc dự án:                               * Giai đoạn dự án:       |
|  [ Sách Kinh Doanh 2026                ▼]     [ Biên tập nội dung    ▼]|
|                                                                        |
|  * Người phụ trách:                           * Hạn hoàn thành:        |
|  [ Mai Thị Nữ                          ▼]     [ 28/11/2026 17:00    📅]|
|                                                                        |
|  Mức độ ưu tiên:                              Nhãn (Labels):           |
|  [ 🔴 Khẩn cấp                         ▼]     [ Bản thảo, Xuất bản   ▼]|
|                                                                        |
|  Mô tả chi tiết:                                                       |
|  +------------------------------------------------------------------+  |
|  | Cần đối chiếu nội dung tác quyền với file đính kèm.              |  |
|  | 🔗 Tin nhắn gốc: msg_9824bf20...                                 |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
|  [v] Tự động gửi thẻ Thẻ Task (Task Card) vào cuộc trò chuyện sau khi tạo|
|                                                                        |
|                                  [ Hủy bỏ ]   [  Tạo công việc ngay  ] |
+------------------------------------------------------------------------+
```

---

## V. THIẾT KẾ CHO GIAO DIỆN DI ĐỘNG (MOBILE RESPONSIVE SPECIFICATION)

1. **Chế độ xem Danh sách (Mobile Conversation List):**
   - Chiếm 100% viewport.
   - Header hiển thị logo Alpha, avatar cá nhân và nút tìm kiếm.
   - Thanh bộ lọc ngang cuộn được: `Tất cả` | `Chưa đọc` | `Dự án` | `Nhóm` | `1-1`.
   - Chạm vào bất kỳ cuộc trò chuyện nào sẽ chuyển màn hình sang Conversation Detail.
2. **Chế độ xem Tin nhắn (Mobile Active Stream):**
   - Nút `[ < Trở lại ]` bên trái header để quay về danh sách hội thoại.
   - Tiêu đề hiển thị tên nhóm/người nhận, chạm vào tiêu đề mở **Bottom Drawer** xem Thông tin nhóm, Thành viên, File và Task.
   - Bong bóng chat tự động căn chỉnh lề (tối đa 85% chiều rộng màn hình).
   - Thanh soạn thảo cố định đáy màn hình (Bottom Sticky with `safe-area-inset-bottom`), hỗ trợ mở bàn phím mà không đẩy layout vỡ.
3. **Thao tác chạm (Touch Gestures):**
   - Vuốt sang phải trên bong bóng tin nhắn để kích hoạt tính năng Trả lời (Swipe-to-reply).
   - Nhấn giữ (Long-press) để mở menu ngữ cảnh nổi (React, Copy, Ghim, Thu hồi, Tạo Task).

---

## VI. DANH MỤC THÀNH PHẦN GIAO DIỆN CẦN XÂY DỰNG & TÁI SỬ DỤNG

### 1. Thành phần tái sử dụng từ mã nguồn hiện tại:
- `MentionAutocomplete.tsx`: Tái sử dụng logic parse `@mention`, phím tắt chọn profile.
- `src/lib/utils.ts`: Tái sử dụng `getInitials`, `cn`, các hàm format ngày giờ `formatRelativeVi`.
- Hệ thống Icon `lucide-react`: `MessageSquare`, `FolderKanban`, `Send`, `Paperclip`, `CheckSquare`, `Pin`, `Reply`, `Smile`.
- Toaster thông báo: `sonner`.

### 2. Thành phần mới cần xây dựng (Modular Components):
1. `ChatSidebar`: Quản lý danh sách hội thoại, tìm kiếm, bộ lọc tab.
2. `ChatMessageArea`: Vùng hiển thị tin nhắn, auto-scroll, phân nhóm ngày, trích dẫn.
3. `ChatContextPanel`: Cột thứ 3 quản lý thông tin thành viên, danh sách file, pinned notes.
4. `TaskCardMessage`: Thẻ hiển thị công việc trong stream chat, có live badge trạng thái.
5. `ShareTaskToChatModal`: Modal chọn cuộc trò chuyện để chia sẻ Task từ Task Drawer.
6. `CreateGroupModal`: Modal tạo nhóm chat mới, chọn avatar, mô tả và thêm thành viên ban đầu.
7. `ThreadDrawer`: Ngăn kéo xem và trả lời theo nhánh thảo luận riêng biệt.
