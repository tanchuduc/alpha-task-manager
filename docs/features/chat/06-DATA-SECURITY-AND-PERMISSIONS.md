# KIỂM TOÁN DỮ LIỆU, BẢO MẬT VÀ PHÂN QUYỀN (DATA SECURITY & PERMISSIONS)
**Tài liệu:** `docs/features/chat/06-DATA-SECURITY-AND-PERMISSIONS.md`  
**Dự án:** Alpha Task Manager — Phân hệ Unified Chat & Collaboration  
**Mục tiêu:** Kiểm toán chi tiết 10 rủi ro an ninh, cấu trúc database, realtime và giải pháp khắc phục triệt để.

---

## I. KIỂM TOÁN 10 TIÊU CHÍ AN NINH ĐẶC BIỆT (PHASE C3 AUDIT)

### 1. Người dùng A có đọc được chat 1:1 của B và C không?
- **Hiện trạng:** **ĐƯỢC BẢO VỆ**.
- **Bằng chứng mã nguồn:** Trong `supabase/migrations/002_collaboration_and_performance.sql` (Line 114-115):
  ```sql
  CREATE POLICY "dm_participants" ON alpha_lite.direct_messages
    FOR ALL USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
  ```
  Postgres RLS ở cấp cơ sở dữ liệu ngăn chặn người thứ ba query trực tiếp bản ghi nếu họ không phải là người gửi hoặc người nhận.
- **Rủi ro tiềm ẩn:** Policy này thiếu mệnh đề `WITH CHECK (auth.uid() = sender_id)` đối với thao tác INSERT và UPDATE. Người nhận `receiver_id` có thể gửi request UPDATE để sửa nội dung tin nhắn của người gửi!
- **Giải pháp khắc phục:** Tách thành các policy riêng biệt: SELECT cho cả 2 người, INSERT cho sender, UPDATE chỉ cho sender sửa tin của chính mình.

### 2. Thành viên đã rời nhóm có còn truy cập nội dung nhóm không?
- **Hiện trạng:** **CHƯA CÓ GROUP CHAT**. Kênh phòng ban thì mở cho toàn bộ nhân viên công ty (`alpha_lite.is_active_staff()`).
- **Mục tiêu trong kiến trúc mới:** Khi thành viên bị xóa khỏi `conversation_members`, policy RLS trên bảng `messages` sẽ lập tức từ chối truy cập:
  ```sql
  CREATE POLICY "member_read_messages" ON alpha_lite.messages
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM alpha_lite.conversation_members cm
        WHERE cm.conversation_id = messages.conversation_id
          AND cm.user_id = auth.uid()
      )
    );
  ```
  Ngay khi bản ghi thành viên bị xóa, truy vấn SELECT của họ trả về rỗng (`[]`).

### 3. Người bị xóa khỏi Project có còn đọc Project Chat không?
- **Hiện trạng:** **LỖ HỔNG NGHIÊM TRỌNG (VULNERABLE)**.
- **Bằng chứng mã nguồn:** Trong `supabase/migrations/009_project_chat_stream.sql` (Line 39-41):
  ```sql
  CREATE POLICY "pm_active_staff" ON alpha_lite.project_messages
    FOR ALL USING (alpha_lite.is_active_staff());
  ```
  Chính sách này cho phép bất kỳ nhân viên nào trong công ty có tài khoản active đều đọc được toàn bộ tin nhắn của mọi dự án! Dù nhân viên đó bị xóa khỏi dự án hoặc chưa bao giờ là thành viên dự án, họ vẫn có thể query và xem toàn bộ thảo luận nội bộ.
- **Giải pháp khắc phục:** RLS trên hội thoại dự án bắt buộc phải kiểm tra bảng `project_members`:
  ```sql
  CREATE POLICY "project_members_only" ON alpha_lite.messages
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM alpha_lite.conversations c
        JOIN alpha_lite.project_members pm ON pm.project_id = c.project_id
        WHERE c.id = messages.conversation_id
          AND pm.user_id = auth.uid()
      )
      OR alpha_lite.is_admin()
    );
  ```

### 4. Người không có quyền Task có xem được Task Card không?
- **Hiện trạng:** Hiện tại chỉ gửi markdown link `[Tạo việc: ...](url)`. Bất kỳ ai click vào link nếu không có quyền trong dự án sẽ bị `TaskDrawer` chặn hoặc báo lỗi.
- **Mục tiêu trong kiến trúc mới:**
  - Trên Thẻ Task Card trong Chat chỉ hiển thị các thông tin tóm tắt an toàn (Mã task, Tiêu đề, Badge trạng thái, Người làm).
  - Không nhúng thông tin nhạy cảm (chi phí, tài liệu mật) vào metadata tin nhắn.
  - Khi click mở Task Drawer, quyền truy cập chi tiết được bảo vệ nghiêm ngặt bởi RLS của bảng `tasks`.

### 5. File đính kèm có thể truy cập qua URL không được cấp quyền không?
- **Hiện trạng:** **LỖ HỔNG NGHIÊM TRỌNG (VULNERABLE)**.
- **Bằng chứng mã nguồn:** Trong `supabase/migrations/001_init_alpha_work_lite.sql` (Line 476-488):
  ```sql
  INSERT INTO storage.buckets (id, name, public) VALUES ('attachments', 'attachments', true);
  ```
  Và trong `ChatContainer.tsx` (Line 1005-1010):
  ```typescript
  const { data: publicUrlData } = supabase.storage.from("attachments").getPublicUrl(filePath);
  ```
  Bucket đang ở chế độ công khai (`public = true`). Bất kỳ ai có đường link URL (kể cả người ngoài công ty, không đăng nhập) đều có thể xem hoặc tải tệp đính kèm.
- **Giải pháp khắc phục:**
  - Chuyển bucket `attachments` thành `public: false` (Private Bucket).
  - Tạo bảng quản lý tệp `message_attachments` được bảo vệ bằng RLS.
  - Client chỉ lấy file thông qua **Signed URL** có thời hạn (ví dụ: hết hạn sau 60 phút) được sinh ra sau khi đã xác thực quyền thành viên hội thoại.

### 6. Search API có rò rỉ nội dung chat không?
- **Hiện trạng:** Hiện tại chưa có Full-text Search API; việc tìm kiếm chỉ là filter mảng profiles trên trình duyệt.
- **Mục tiêu trong kiến trúc mới:** Khi xây dựng Database Function tìm kiếm toàn văn (`search_messages`), hàm này bắt buộc phải chạy dưới quyền của `auth.uid()` (Security Invoker) và có mệnh đề kiểm tra tư cách thành viên `conversation_members`, tuyệt đối không dùng `SECURITY DEFINER` không kiểm soát để tránh rò rỉ nội dung chat của người khác.

### 7. Có thể giả mạo `sender_id` hoặc `conversation_id` không?
- **Hiện trạng:**
  - Trong `direct_messages`: RLS `dm_participants` cho phép insert nếu `auth.uid() = sender_id OR auth.uid() = receiver_id`. Về mặt lý thuyết, nếu không ép buộc `sender_id = auth.uid()` thì người dùng A có thể insert một bản ghi mà họ đặt `sender_id` là B và `receiver_id` là A!
- **Giải pháp khắc phục:** Thêm database trigger hoặc RLS `WITH CHECK`:
  ```sql
  CREATE POLICY "messages_insert_own" ON alpha_lite.messages
    FOR INSERT WITH CHECK (
      auth.uid() = sender_id
      AND EXISTS (
        SELECT 1 FROM alpha_lite.conversation_members cm
        WHERE cm.conversation_id = messages.conversation_id
          AND cm.user_id = auth.uid()
      )
    );
  ```
  Ràng buộc này triệt tiêu 100% khả năng mạo danh người khác gửi tin nhắn hoặc gửi tin vào hội thoại mà mình không phải thành viên.

### 8. XSS, Malicious Attachments & Input Validation
- **XSS:** Hiện tại React tự động escape HTML khi render chuỗi trong JSX. Hàm `renderContentWithMentions` chỉ bọc các chuỗi con bằng thẻ `<span>`, không dùng `dangerouslySetInnerHTML` nên an toàn trước XSS cơ bản.
- **Malicious Attachments:** Chưa có whitelist loại tệp. Người dùng có thể upload file `.exe`, `.bat`, `.html`, `.svg` chứa script độc hại. Cần bổ sung MIME-type validation và giới hạn dung lượng ở cả client và Supabase Storage policy.
- **Input Validation:** Khung soạn thảo đã loại bỏ khoảng trắng rỗng (`trimmed`), chống gửi tin nhắn trống.

### 9. RLS có bảo vệ được dữ liệu ở tầng Database không?
- **Đánh giá:** RLS của Supabase được kích hoạt trên hầu hết các bảng, tuy nhiên còn nhiều lỗ hổng do viết policy quá rộng (`alpha_lite.is_active_staff()`) thay vì kiểm tra quan hệ phân quyền chi tiết. Việc nâng cấp lên `conversations` + `conversation_members` sẽ cho phép viết các policy RLS tinh chuẩn và chặt chẽ ở cấp độ từng dòng dữ liệu (Row Level).

### 10. Admin có quyền đọc chat riêng tư ngoài chính sách cho phép không?
- **Chính sách:** Theo chuẩn bảo mật doanh nghiệp hiện đại, Super Admin quản trị hạ tầng cơ sở dữ liệu KHÔNG nên có quyền đọc trộm nội dung chat 1-1 giữa các nhân sự trừ khi có yêu cầu điều tra tuân thủ pháp lý chính thức.
- **Thiết lập:**
  - Đối với Direct Messages (1-1): Policy RLS chỉ cho phép 2 bên tham gia đọc tin, Admin hệ thống không được cấp quyền bypass đọc nội dung 1-1 của nhân viên.
  - Đối với Project Chat và Department Chat: Admin và Manager có quyền kiểm duyệt để phục vụ quản trị dự án công ty.

---

## II. KIỂM TOÁN DATABASE & TỐI ƯU TRUY VẤN (DATABASE AUDIT)

1. **Vấn đề trùng lặp cuộc hội thoại (Duplicate Conversation):**
   - Hiện tại với 1-1 chat, không có ID hội thoại. Mọi truy vấn phải dùng:
     `or(and(sender_id.eq.A,receiver_id.eq.B),and(sender_id.eq.B,receiver_id.eq.A))`.
     Truy vấn này phức tạp và khó tạo index tối ưu.
   - **Giải pháp:** Với mô hình mới, mỗi cặp 1-1 có đúng 1 `conversation_id`. Cặp nhân sự được đảm bảo duy nhất thông qua Unique Constraint:
     `UNIQUE(LEAST(user_a, user_b), GREATEST(user_a, user_b))`.
2. **Vấn đề trùng lặp tin nhắn khi Realtime (Duplicate Messages):**
   - Đôi khi mạng lag, client vừa nhận tin nhắn qua Realtime vừa nhận qua response của lệnh INSERT, dẫn đến tin nhắn bị nhân đôi tạm thời trên giao diện.
   - `ChatContainer.tsx` hiện đã dùng `uniqueMap` dựa trên `id` để khử trùng lặp. Cần tiếp tục duy trì pattern này trên toàn bộ các components mới.
3. **Hiện tượng N+1 Queries khi tải danh sách hội thoại:**
   - Trong `ChatContainer.tsx` (dòng 248-388), hàm `fetchInboxSummaries` thực hiện 6 câu truy vấn SELECT riêng rẽ (tải 300 DMs, tải 300 CMs, tải read states của CMs, tải 300 PMs, tải read states của PMs...). Khi số lượng tin nhắn tăng lên hàng chục nghìn dòng, việc query `limit(300)` rồi dùng Javascript duyệt thủ công trên client sẽ gây đơ trình duyệt và tốn CPU.
   - **Giải pháp:** Tạo Database View `v_user_conversations` hoặc RPC function `get_user_inbox()` thực hiện tổng hợp sẵn (Aggregated Query) phía PostgreSQL, trả về đúng danh sách hội thoại kèm tin nhắn cuối và số tin chưa đọc trong 1 round-trip duy nhất (<50ms).
4. **Vấn đề thiếu Index tối ưu:**
   - Cần bổ sung composite indexes cho các truy vấn tần suất cao:
     - `CREATE INDEX idx_messages_conv_created ON alpha_lite.messages(conversation_id, created_at DESC);`
     - `CREATE INDEX idx_cmem_user_conv ON alpha_lite.conversation_members(user_id, conversation_id);`
     - `CREATE INDEX idx_task_chat_task ON alpha_lite.task_chat_links(task_id);`
5. **Cơ chế tải phân trang (Unbounded Loading):**
   - Hiện tại code đang `limit(200)` cố định. Nếu cuộc trò chuyện có 10.000 tin, người dùng không thể xem lại các tin nhắn cách đây vài tháng.
   - **Giải pháp:** Xây dựng cơ chế Infinite Scroll phân trang ngược (Cursor-based Pagination dựa trên `created_at`), mỗi lần cuộn lên trên sẽ nạp tiếp 30 tin nhắn cũ.

---

## III. KIỂM TOÁN VẬN HÀNH THỜI GIAN THỰC (REALTIME AUDIT)

1. **Rò rỉ Subscription & Memory Leaks:**
   - Trong `ChatContainer.tsx`, mỗi khi component re-render hoặc mount, code tạo các kênh Supabase channel kèm suffix timestamp. Nếu cleanup function không gọi `supabase.removeChannel(channel)` triệt để khi unmount, các WebSocket listeners cũ sẽ bị treo trong bộ nhớ, gây hiện tượng nhận 1 tin nhắn nhưng trigger handler 3-4 lần.
   - **Giải pháp:** Đưa toàn bộ logic quản lý kênh Realtime vào một Custom Hook chuẩn hóa (`useChatRealtime`), sử dụng Singleton Channel Manager để chia sẻ chung 1 connection WebSocket cho toàn ứng dụng.
2. **Thứ tự tin nhắn và Race Conditions:**
   - Khi mạng yếu, nếu người dùng gửi 3 tin liên tiếp, tin thứ hai có thể tới server trước tin thứ nhất.
   - **Giải pháp:** Sử dụng Client Timestamp + Server Sequenced Timestamp kết hợp Optimistic UI với hàng đợi tin gửi (Message Outbox Queue).
3. **Đồng bộ đa tab / thiết bị:**
   - Cần bắt sự kiện `postgres_changes` trên bảng `conversation_members` đối với trường `last_read_at`. Khi người dùng mở đọc tin trên điện thoại, badge đỏ trên tab trình duyệt máy tính lập tức biến mất mà không cần F5 lại trang.
