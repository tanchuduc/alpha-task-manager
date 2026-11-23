# KẾ HOẠCH VÀ LỘ TRÌNH TRIỂN KHAI NÂNG CẤP (UPGRADE ROADMAP)
**Tài liệu:** `docs/features/chat/07-UPGRADE-ROADMAP.md`  
**Dự án:** Alpha Task Manager — Phân hệ Unified Chat & Collaboration  
**Nguyên tắc:** Chia nhỏ theo Sprint, kiểm thử độc lập, đảm bảo an toàn dữ liệu và không làm gián đoạn hệ thống hiện tại.  
**Trạng thái ban đầu:** `NOT STARTED` cho toàn bộ các Task kỹ thuật (Chờ phê duyệt).

---

## TỔNG QUAN CÁC SPRINT TRIỂN KHAI

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ S0: Audit, Kiến trúc & Phê duyệt Thiết kế (HOÀN THÀNH)                      │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ S1: Database Migration, Unified Schema & RLS Security Hardening (P0)         │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ S2: Unified Core Chat Engine & Direct Chat (1-1) Refactor (P0)              │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ S3: Phân hệ Group Chat độc lập & Quản lý Thành viên Nhóm (P0)               │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ S4: Project Chat Strict Membership & Đồng bộ Dự án (P0)                     │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ S5: Tích hợp 2 chiều Chat ↔ Task & Thẻ công việc tương tác (Task Card) (P0) │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ S6: Context Panel 3 Cột, Kho Tệp Media & Full-Text Search (P0-P1)           │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ S7: Hoàn thiện UI/UX 3-Column Desktop, Mobile Responsive & QA Toàn diện (P1)│
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ S8: Tính năng Cộng tác Nâng cao (Thread, Web Push, AI Summary) (P1-P2)      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## CHI TIẾT CÁC TÁC VỤ THEO SPRINT

### SPRINT S0: AUDIT HIỆN TRẠNG & PHÊ DUYỆT THIẾT KẾ
*Mục tiêu: Đánh giá mã nguồn, xác định rủi ro, thiết kế kiến trúc mục tiêu và lập hồ sơ kỹ thuật.*

| Task ID | Nhiệm vụ | Mức ưu tiên | Phụ thuộc | File / Module ảnh hưởng | Tiêu chí nghiệm thu (Acceptance Criteria) | Phương pháp kiểm chứng | Rủi ro | Độ phức tạp | Rollback Strategy | Trạng thái |
|---|---|:---:|---|---|---|---|:---:|:---:|---|:---:|
| **S0-01** | Full Audit Codebase & Schema | P0 | Không | Toàn bộ codebase chat & migrations | Báo cáo chi tiết hiện trạng, lỗi bảo mật và kiểm kê tính năng. | Đối soát mã nguồn | Thấp | M | Không ảnh hưởng | **HOÀN THÀNH** |
| **S0-02** | Xây dựng Bộ tài liệu kỹ thuật | P0 | S0-01 | `docs/features/chat/*` | Hoàn thành 9 tài liệu kiến trúc, luồng nghiệp vụ, bảo mật, roadmap. | Review tài liệu | Thấp | M | Không ảnh hưởng | **HOÀN THÀNH** |
| **S0-03** | Trình duyệt Kế hoạch & Kiến trúc | P0 | S0-02 | Toàn bộ hồ sơ | Product Owner xem xét và phê duyệt trước khi viết code. | Quyết định của PO | Trung bình | S | Tiếp tục điều chỉnh thiết kế | **HOÀN THÀNH** |

---

### SPRINT S1: DATABASE MIGRATION, UNIFIED SCHEMA & SECURITY HARDENING
*Mục tiêu: Tạo các bảng dữ liệu thống nhất, thiết lập RLS bảo mật triệt để và backfill dữ liệu cũ.*

| Task ID | Nhiệm vụ | Mức ưu tiên | Phụ thuộc | File / Module ảnh hưởng | Tiêu chí nghiệm thu (Acceptance Criteria) | Phương pháp kiểm chứng | Rủi ro | Độ phức tạp | Rollback Strategy | Trạng thái |
|---|---|:---:|---|---|---|---|:---:|:---:|---|:---:|
| **S1-01** | Migration tạo bảng `conversations` & `conversation_members` | P0 | S0-03 | `supabase/migrations/011_unified_chat_schema.sql` | Bảng tạo thành công với đầy đủ indexes, foreign keys, unique constraint cặp 1-1. | Kiểm tra migration SQL | Trung bình | M | `DROP TABLE` các bảng mới | **HOÀN THÀNH** |
| **S1-02** | Migration tạo bảng `messages`, `message_attachments`, `task_chat_links` | P0 | S1-01 | `supabase/migrations/011_unified_chat_schema.sql` | Tạo thành công bảng messages với `REPLICA IDENTITY FULL` và Realtime publication. | Kiểm tra migration SQL | Trung bình | M | `DROP TABLE` | **HOÀN THÀNH** |
| **S1-03** | Thiết lập RLS Policies bảo mật đa tầng | P0 | S1-02 | `011_unified_chat_schema.sql` | Policy kiểm tra `conversation_members` và `project_members`. Chặn đứng rò rỉ chat dự án và mạo danh sender. | Review RLS policies | Cao | M | Rollback policy | **HOÀN THÀNH** |
| **S1-04** | Viết script Backfill chuyển dữ liệu cũ sang mới | P0 | S1-03 | `supabase/migrations/012_backfill_chat_data.sql` | 100% tin nhắn từ `direct_messages`, `channel_messages`, `project_messages` được sao chép toàn vẹn sang `messages`. | Review script backfill idempotent | Cao | L | Dữ liệu cũ còn nguyên | **HOÀN THÀNH** |
| **S1-05** | Cập nhật TypeScript Database Types | P0 | S1-02 | `src/types/database.ts` | Khai báo đầy đủ các interface `Conversation`, `ConversationMember`, `Message`, `TaskChatLink`. | `npm run typecheck` đạt 0 lỗi | Thấp | S | Revert git diff | **HOÀN THÀNH** |

---

### SPRINT S2: UNIFIED CORE CHAT ENGINE & DIRECT CHAT (1-1)
*Mục tiêu: Xây dựng service chat hợp nhất, refactor khung chat chính và hoàn thiện nhắn tin 1-1.*

| Task ID | Nhiệm vụ | Mức ưu tiên | Phụ thuộc | File / Module ảnh hưởng | Tiêu chí nghiệm thu (Acceptance Criteria) | Phương pháp kiểm chứng | Rủi ro | Độ phức tạp | Rollback Strategy | Trạng thái |
|---|---|:---:|---|---|---|---|:---:|:---:|---|:---:|
| **S2-01** | Cập nhật TypeScript Database Types | P0 | S1-02 | `src/types/database.ts` | Khai báo đầy đủ các interface `UnifiedConversation`, `UnifiedMessage`, `TaskChatLink`. | `npm run typecheck` đạt 0 lỗi | Thấp | S | Revert git diff | **HOÀN THÀNH** |
| **S2-02** | Xây dựng Hook `useUnifiedChat` & Realtime Service | P0 | S2-01 | `src/lib/chat/useUnifiedChat.ts` | Quản lý state tải tin, phân trang cursor, gửi tin optimistic, nhận realtime, presence và typing. | Typecheck & build passed | Trung bình | L | Revert file mới | **HOÀN THÀNH** |
| **S2-03** | Module hóa `ChatMessageArea.tsx` & `ChatContextPanel.tsx` | P0 | S2-02 | `src/components/chat/ChatMessageArea.tsx`, `ChatContextPanel.tsx` | Tách rời khu vực stream tin nhắn, render reactions, quote reply, edit/unsend và context panel. | Next.js build pass 100% | Trung bình | M | Revert component | **HOÀN THÀNH** |
| **S2-04** | Tái cấu trúc Chat 1-1 & Bố cục 3 Cột | P0 | S2-03 | `src/components/chat/ChatContainer.tsx`, `ChatSidebar.tsx` | Thu gọn monolith từ 2,976 dòng xuống 190 dòng, tích hợp ChatSidebar, ChatMessageArea, ContextPanel. | `npm run build` thành công | Trung bình | M | Git restore | **HOÀN THÀNH** |

---

### SPRINT S3: GROUP CHAT ĐỘC LẬP & QUẢN LÝ THÀNH VIÊN
*Mục tiêu: Bổ sung hoàn chỉnh phân hệ Nhóm chat tự do theo đúng tiêu chuẩn Lark / IDEAS WorkChat.*

| Task ID | Nhiệm vụ | Mức ưu tiên | Phụ thuộc | File / Module ảnh hưởng | Tiêu chí nghiệm thu (Acceptance Criteria) | Phương pháp kiểm chứng | Rủi ro | Độ phức tạp | Rollback Strategy | Trạng thái |
|---|---|:---:|---|---|---|---|:---:|:---:|---|:---:|
| **S3-01** | Xây dựng Modal `CreateGroupModal.tsx` | P0 | S2-04 | `src/components/chat/CreateGroupModal.tsx` | Cho phép nhập tên nhóm, mô tả, chọn avatar và tích chọn danh sách nhân sự tham gia nhóm ban đầu. | Kiểm tra UI & submit DB | Thấp | M | Xóa component | **HOÀN THÀNH** |
| **S3-02** | API / Database Functions Quản lý Nhóm | P0 | S3-01 | `src/lib/chat/group-actions.ts` | Nghiệp vụ thêm thành viên, xóa thành viên, bổ nhiệm Admin, rời nhóm và giải tán nhóm. | Chạy test chức năng quyền hạn | Trung bình | M | Revert file | **HOÀN THÀNH** |
| **S3-03** | Hiển thị Group Chat trong Chat Navigation | P0 | S3-02 | `src/components/chat/ChatSidebar.tsx` | Nhóm hiển thị tag `#Nhóm`, số thành viên, badge chưa đọc và xem trước tin nhắn mới nhất. | Kiểm tra hiển thị sidebar | Thấp | S | Revert UI | **HOÀN THÀNH** |

---

### SPRINT S4: PROJECT CHAT STRICT MEMBERSHIP & ĐỒNG BỘ DỰ ÁN
*Mục tiêu: Đảm bảo Project Chat đồng bộ chặt chẽ với thành viên dự án và bảo mật tuyệt đối.*

| Task ID | Nhiệm vụ | Mức ưu tiên | Phụ thuộc | File / Module ảnh hưởng | Tiêu chí nghiệm thu (Acceptance Criteria) | Phương pháp kiểm chứng | Rủi ro | Độ phức tạp | Rollback Strategy | Trạng thái |
|---|---|:---:|---|---|---|---|:---:|:---:|---|:---:|
| **S4-01** | Database Triggers đồng bộ `project_members` ↔ Chat | P0 | S1-03 | `014_project_chat_sync_triggers.sql` | Khi thêm/xóa thành viên trong dự án, bản ghi trong `conversation_members` tự động đồng bộ 100%. | Test thêm/xóa member dự án | Cao | M | `DROP TRIGGER` | **HOÀN THÀNH** |
| **S4-02** | Tích hợp Chat Tab trong `ProjectDetailClient.tsx` | P0 | S4-01 | `src/components/projects/ProjectDetailClient.tsx`, `ProjectChatTab.tsx` | Nút mở Chat Center toàn màn hình, điều hướng 2 chiều mượt mà giữa Project Detail và Chat Center. | Test mở tab Trò chuyện trong DA | Trung bình | M | Revert component | **HOÀN THÀNH** |
| **S4-03** | Xử lý trạng thái khi Project Archive / Complete | P1 | S4-02 | `src/lib/chat/project-chat.ts` | Khi dự án archive, conversation chuyển sang chế độ Chỉ đọc (Read-only), hiển thị banner thông báo. | Test chuyển trạng thái DA | Thấp | S | Revert logic | **HOÀN THÀNH** |

---

### SPRINT S5: TÍCH HỢP 2 CHIỀU CHAT ↔ TASK & THẺ CÔNG VIỆC TƯƠNG TÁC
*Mục tiêu: Đột phá trải nghiệm cộng tác giữa Chat và Quản lý công việc.*

| Task ID | Nhiệm vụ | Mức ưu tiên | Phụ thuộc | File / Module ảnh hưởng | Tiêu chí nghiệm thu (Acceptance Criteria) | Phương pháp kiểm chứng | Rủi ro | Độ phức tạp | Rollback Strategy | Trạng thái |
|---|---|:---:|---|---|---|---|:---:|:---:|---|:---:|
| **S5-01** | Xây dựng Component `TaskCardMessage.tsx` | P0 | S2-03 | `src/components/chat/TaskCardMessage.tsx` | Render thẻ công việc đẹp mắt với Mã task, Tiêu đề, Dự án, Assignee, Hạn chót và Live Badge trạng thái. | Kiểm tra hiển thị trong stream | Thấp | M | Ẩn thẻ về text thô | **HOÀN THÀNH** |
| **S5-02** | Nâng cấp `ConvertMessageToTaskModal.tsx` | P0 | S5-01 | `src/components/chat/ConvertMessageToTaskModal.tsx` | Tạo task kèm lưu bản ghi liên kết khóa ngoại vào `task_chat_links` và tự động gửi Thẻ Task Card vào chat. | Test tạo việc từ tin nhắn | Trung bình | M | Revert modal | **HOÀN THÀNH** |
| **S5-03** | Nút "Xem tin nhắn gốc" trong `TaskDrawer.tsx` | P0 | S5-02 | `src/components/tasks/TaskDrawer.tsx` | Task Drawer hiển thị ngữ cảnh tin nhắn gốc kèm nút bấm dẫn ngược về vị trí tin nhắn đó trong Chat. | Click mở và cuộn tới tin gốc | Thấp | S | Ẩn block hiển thị | **HOÀN THÀNH** |
| **S5-04** | Xây dựng Modal `ShareTaskToChatModal.tsx` | P0 | S5-01 | `src/components/chat/ShareTaskToChatModal.tsx` | Cho phép chọn cuộc trò chuyện để chia sẻ Task từ Task Drawer hoặc List View kèm lời nhắn. | Test chia sẻ task vào phòng chat | Thấp | M | Xóa modal | **HOÀN THÀNH** |
| **S5-05** | Realtime Sync trạng thái Task vào Thẻ Chat | P0 | S5-01 | `src/components/chat/TaskCardMessage.tsx` | Khi task đổi trạng thái bên Kanban, badge trên thẻ Task Card trong Chat đổi màu ngay lập tức. | Test kéo thả task trên Kanban | Trung bình | M | Tắt realtime task | **HOÀN THÀNH** |

---

### SPRINT S6: CONTEXT PANEL 3 CỘT, KHO TỆP MEDIA & TÌM KIẾM TOÀN VĂN
*Mục tiêu: Hoàn thiện bảng ngữ cảnh bên phải và công cụ tra cứu thông tin.*

| Task ID | Nhiệm vụ | Mức ưu tiên | Phụ thuộc | File / Module ảnh hưởng | Tiêu chí nghiệm thu (Acceptance Criteria) | Phương pháp kiểm chứng | Rủi ro | Độ phức tạp | Rollback Strategy | Trạng thái |
|---|---|:---:|---|---|---|---|:---:|:---:|---|:---:|
| **S6-01** | Xây dựng `ChatContextPanel.tsx` (Cột thứ 3) | P0 | S2-03 | `src/components/chat/ChatContextPanel.tsx` | Hiển thị Thông tin hội thoại, Danh sách thành viên (thêm/rời nhóm), Tab Tệp đính kèm (Media/Docs), Tab Công việc, Tin đã ghim. | Bật/tắt panel mượt mà | Thấp | L | Ẩn panel | **HOÀN THÀNH** |
| **S6-02** | Quản lý Tệp tin tập trung & Lightbox Media | P0 | S6-01 | `src/components/chat/MediaLightboxModal.tsx` | Lọc media/tài liệu, xem trước ảnh toàn màn hình qua Lightbox, tải xuống trực tiếp. | Test xem ảnh và download | Trung bình | M | Fallback link cũ | **HOÀN THÀNH** |
| **S6-03** | In-Conversation Full-Text Search UI | P0 | S1-02 | `src/components/chat/ChatMessageArea.tsx` | Thanh tìm kiếm tin nhắn trong hội thoại, hiển thị đếm kết quả, phím Lên/Xuống cuộn tới tin khớp. | Test tìm kiếm từ khóa tiếng Việt | Trung bình | M | Tắt search box | **HOÀN THÀNH** |
| **S6-04** | Ghim hội thoại (Pin to top) & Tắt chuông (Mute) | P1 | S1-01 | `src/components/chat/ChatSidebar.tsx` | Cho phép ghim các cuộc chat quan trọng lên đầu danh sách và tắt âm thanh thông báo từng hội thoại. | Test ghim và mute hội thoại | Thấp | S | Revert UI | **HOÀN THÀNH** |

---

### SPRINT S7: HOÀN THIỆN UI/UX 3 CỘT, RESPONSIVE MOBILE & QA TOÀN DIỆN
*Mục tiêu: Đạt chuẩn trải nghiệm người dùng cao cấp và nghiệm thu Quality Gate 12 tiêu chí.*

| Task ID | Nhiệm vụ | Mức ưu tiên | Phụ thuộc | File / Module ảnh hưởng | Tiêu chí nghiệm thu (Acceptance Criteria) | Phương pháp kiểm chứng | Rủi ro | Độ phức tạp | Rollback Strategy | Trạng thái |
|---|---|:---:|---|---|---|---|:---:|:---:|---|:---:|
| **S7-01** | Hoàn thiện Bố cục 3 Cột Desktop (`ChatContainer.tsx`) | P0 | S6-01 | `src/components/chat/ChatContainer.tsx` | Bố cục 3 cột đồng nhất, thanh lọc Tabs (Tất cả, Chưa đọc, 1-1, Nhóm, Dự án) mượt mà. | Kiểm tra layout 1280px, 1440px | Thấp | M | Revert file | **HOÀN THÀNH** |
| **S7-02** | Tối ưu hóa Giao diện Mobile & Touch Gestures | P1 | S7-01 | `src/components/chat/ChatContainer.tsx` | Điều hướng mượt giữa Danh sách ↔ Tin nhắn, Drawer thông tin trượt từ cạnh phải trên mobile (< 1024px). | Test trên màn hình 375px - 768px | Thấp | M | Revert mobile UI | **HOÀN THÀNH** |
| **S7-03** | Accessibility & Keyboard Navigation | P1 | S7-01 | Các components chat | Đầy đủ phím tắt Esc đóng modal/search, Enter/Shift+Enter, focus states mượt mà. | Kiểm tra bằng phím Tab & Esc | Thấp | S | Revert attributes | **HOÀN THÀNH** |
| **S7-04** | Chạy toàn bộ Regression Test & Kiểm toán An ninh | P0 | S7-01 | Toàn bộ dự án | Đạt 100% Quality Gate 12 tiêu chí: không hồi quy tính năng cũ, build thành công, typecheck 0 lỗi. | Test Suite & Build verify | Trung bình | M | Điều chỉnh bug | **HOÀN THÀNH** |

---

### SPRINT S8: CỘNG TÁC NÂNG CAO (ADVANCED COLLABORATION)
*Mục tiêu: Mở rộng tính năng tiệm cận Lark Messenger và chuẩn bị cho tự động hóa AI.*

| Task ID | Nhiệm vụ | Mức ưu tiên | Phụ thuộc | File / Module ảnh hưởng | Tiêu chí nghiệm thu (Acceptance Criteria) | Phương pháp kiểm chứng | Rủi ro | Độ phức tạp | Rollback Strategy | Trạng thái |
|---|---|:---:|---|---|---|---|:---:|:---:|---|:---:|
| **S8-01** | Thread / Nhánh thảo luận chuyên sâu | P1 | S7-01 | `src/components/chat/ThreadDrawer.tsx` | Mở ngăn kéo thảo luận riêng cho từng tin nhắn mẹ mà không làm trôi dòng chat chính. | Test trả lời theo thread | Trung bình | L | Tắt tính năng thread | NOT STARTED |
| **S8-02** | Web Push Notification trên Trình duyệt | P1 | S7-01 | `src/lib/notifications/web-push.ts` | Gửi popup thông báo khi người dùng đang ở cửa sổ khác, nhấp vào mở thẳng hội thoại. | Test khi tab bị ẩn | Thấp | M | Tắt quyền push | NOT STARTED |
| **S8-03** | Phím tắt thao tác nhanh (Lệnh AI & ERP Tag) | P2 | S7-01 | Composer toolbar | Nút chọn nhanh Task để gắn vào tin nhắn, nút gọi AI Bot tóm tắt hội thoại. | Test click thao tác | Thấp | M | Ẩn nút trên toolbar | NOT STARTED |
