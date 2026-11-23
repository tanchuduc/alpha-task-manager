# THIẾT KẾ KIẾN TRÚC MỤC TIÊU (TARGET ARCHITECTURE)
**Tài liệu:** `docs/features/chat/05-TARGET-ARCHITECTURE.md`  
**Dự án:** Alpha Task Manager — Phân hệ Unified Chat & Collaboration  
**Mô hình:** Unified Polymorphic Collaboration Architecture

---

## I. KIẾN TRÚC HIỆN TẠI VS KIẾN TRÚC ĐỀ XUẤT

### 1. Kiến trúc phân mảnh hiện tại (Current Fragmented Architecture)

Hiện tại, hệ thống tách rời thành 3 bảng dữ liệu vật lý riêng biệt không có thực thể cuộc trò chuyện chung:

```mermaid
flowchart TD
    subgraph Client["Next.js App Router (Frontend)"]
        CC["ChatContainer.tsx (2976 dòng monolith)"]
        PCT["ProjectChatTab.tsx (936 dòng copy logic)"]
        AS["AppShell.tsx (Badge unread)"]
    end

    subgraph SupabaseDB["Supabase PostgreSQL (alpha_lite)"]
        DM[("direct_messages\n(1-1 Chat)")]
        CM[("channel_messages\n(Department Chat)")]
        PM[("project_messages\n(Project Chat)")]
        CRS[("channel_read_states")]
        PCRS[("project_chat_read_states")]
        NOTIF[("notifications")]
    end

    subgraph Storage["Supabase Storage"]
        ATT[("Bucket: attachments\n(PUBLIC = TRUE - Rò rỉ)")]
    end

    CC -->|Query & Realtime| DM
    CC -->|Query & Realtime| CM
    CC -->|Query & Realtime| PM
    PCT -->|Query & Realtime| PM
    AS -->|Realtime Unread| DM
    CC -->|Upload Public| ATT
```

**Nhược điểm kiến trúc hiện tại:**
- **Code Bloat & Trùng lặp:** Logic load tin, subscribe realtime, upload file, reactions, pins bị duplicate giữa `ChatContainer.tsx` và `ProjectChatTab.tsx`.
- **Không có thực thể Conversation:** Không thể quản lý Group Chat tự do, không lưu được metadata nhóm, không thể ghim hoặc tắt chuông hội thoại.
- **Rò rỉ bảo mật RLS:** `project_messages` mở cho toàn công ty đọc (`alpha_lite.is_active_staff()`), bucket file là public.
- **Không có liên kết cấu trúc với Task:** Chỉ dùng markdown text link.

---

### 2. Kiến trúc hợp nhất đề xuất (Proposed Unified Architecture)

Chuyển đổi sang mô hình **Unified Polymorphic Conversations**, chuẩn hóa toàn bộ giao tiếp vào một luồng dữ liệu duy nhất:

```mermaid
flowchart TD
    subgraph Frontend["Next.js 15 Presentation Layer"]
        subgraph ChatApp["Chat Center (/chat) & Project Tab (/projects/id)"]
            Nav["ChatSidebar (Cột 1: Navigation & Filters)"]
            MsgArea["ChatMessageArea (Cột 2: Stream, Composer & Task Card)"]
            ContextP["ChatContextPanel (Cột 3: Members, Files, Tasks)"]
        end
        TaskDrw["TaskDrawer (Chi tiết công việc & Nút Share)"]
        Shell["AppShell & NavRail (Global Unread Sync)"]
    end

    subgraph Services["Core Application Services / Hooks"]
        ChatSvc["useUnifiedChat / ChatService"]
        TaskSvc["TaskIntegrationService"]
        RealtimeSvc["SupabaseRealtimeManager (Multiplexed)"]
    end

    subgraph UnifiedDB["Supabase PostgreSQL (alpha_lite)"]
        CONV[("conversations\n(type: direct | group | project)")]
        CMEM[("conversation_members\n(role, last_read, is_pinned, is_muted)")]
        MSG[("messages\n(type: text | task_card | file | system)")]
        MATT[("message_attachments\n(metadata & private storage path)")]
        TLINK[("task_chat_links\n(task_id <-> conversation_id <-> msg_id)")]
        TASKS[("tasks")]
    end

    subgraph SecureStorage["Supabase Storage (Secure)"]
        SEC_ATT[("Bucket: attachments (PRIVATE)\n(Signed URLs / Token Check)")]
    end

    Nav & MsgArea & ContextP --> ChatSvc
    TaskDrw --> TaskSvc
    ChatSvc & TaskSvc --> RealtimeSvc
    RealtimeSvc <--> CONV & CMEM & MSG & TLINK
    TaskSvc <--> TASKS & TLINK
    ChatSvc --> SecureStorage
```

---

## II. SO SÁNH ERD HIỆN TẠI VÀ ERD MỤC TIÊU

### 1. ERD Hiện tại (Phân mảnh)
```mermaid
erDiagram
    profiles ||--o{ direct_messages : "sender/receiver"
    departments ||--o{ channel_messages : "contains"
    profiles ||--o{ channel_messages : "authors"
    projects ||--o{ project_messages : "contains"
    profiles ||--o{ project_messages : "authors"
    profiles ||--o{ channel_read_states : "tracks"
    profiles ||--o{ project_chat_read_states : "tracks"

    direct_messages {
        uuid id PK
        uuid sender_id FK
        uuid receiver_id FK
        text content
        boolean is_read
        boolean is_pinned
        boolean is_deleted
        jsonb reactions
    }
    channel_messages {
        uuid id PK
        uuid department_id FK
        uuid author_id FK
        text content
        uuid parent_id
        boolean is_pinned
        boolean is_deleted
        jsonb reactions
    }
    project_messages {
        uuid id PK
        uuid project_id FK
        uuid author_id FK
        text content
        boolean is_pinned
        boolean is_deleted
        jsonb reactions
    }
```

### 2. ERD Mục tiêu (Unified Collaboration Model)
```mermaid
erDiagram
    profiles ||--o{ conversation_members : "joins"
    conversations ||--o{ conversation_members : "has"
    conversations ||--o{ messages : "contains"
    profiles ||--o{ messages : "sends"
    messages ||--o{ message_attachments : "attaches"
    projects ||--o| conversations : "links_to"
    tasks ||--o{ task_chat_links : "referenced_in"
    messages ||--o{ task_chat_links : "generates"
    conversations ||--o{ task_chat_links : "contains"

    conversations {
        uuid id PK
        text type "direct | group | project"
        text title
        text avatar_url
        text description
        uuid project_id FK "nullable (cho project chat)"
        uuid created_by FK
        boolean is_archived
        jsonb metadata
        timestamptz created_at
        timestamptz updated_at
    }

    conversation_members {
        uuid conversation_id PK,FK
        uuid user_id PK,FK
        text role "owner | admin | member"
        timestamptz last_read_at
        boolean is_pinned
        boolean is_muted
        timestamptz joined_at
    }

    messages {
        uuid id PK
        uuid conversation_id FK
        uuid sender_id FK
        text content
        text message_type "text | task_card | file | system_event"
        jsonb metadata "task snapshot, system info"
        uuid reply_to_id FK
        boolean is_pinned
        boolean is_deleted
        timestamptz edited_at
        jsonb reactions
        timestamptz created_at
    }

    message_attachments {
        uuid id PK
        uuid message_id FK
        text file_name
        text file_type
        bigint file_size
        text storage_path
        timestamptz created_at
    }

    task_chat_links {
        uuid id PK
        uuid task_id FK
        uuid conversation_id FK
        uuid message_id FK
        uuid created_by FK
        timestamptz created_at
    }
```

---

## III. ĐÁNH GIÁ ĐÁNH ĐỔI KỸ THUẬT (TECHNICAL TRADE-OFFS)

### Phương án 1: Hợp nhất đa hình (Unified Polymorphic Model) — **[KHUYẾN NGHỊ]**
- **Cơ chế:** Gộp toàn bộ Direct, Group, Project, Department thành 1 bảng `conversations` và 1 bảng `messages`. Phân loại qua cột `type`.
- **Ưu điểm:**
  - Code frontend tái sử dụng 100%: 1 component `ChatMessageArea` duy nhất render cho mọi loại chat.
  - Hỗ trợ tức thì tính năng Group Chat tự do mà không cần tạo thêm bảng.
  - Dễ dàng mở rộng tính năng: Ghim hội thoại, tắt chuông, tìm kiếm toàn văn, thread đều dùng chung 1 API.
  - Dễ quản lý Realtime: Chỉ subscribe 1 bảng `messages` với filter `conversation_id`.
- **Nhược điểm:**
  - Cần viết migration chuyển dữ liệu cũ (backfill data) và đảm bảo tính liên tục của dữ liệu.
- **Lý do chọn:** Đây là chuẩn kiến trúc của mọi nền tảng chat hiện đại (Slack, Lark, Discord, Telegram). Tiết kiệm chi phí bảo trì lâu dài.

### Phương án 2: Giữ 3 bảng cũ và dựng cầu nối trung gian (Linking Bridge)
- **Cơ chế:** Giữ nguyên `direct_messages`, `channel_messages`, `project_messages`. Tạo thêm bảng `group_messages` riêng và dùng `UNION ALL` ở frontend hoặc database view.
- **Ưu điểm:** Không cần migration dữ liệu cũ.
- **Nhược điểm:**
  - Technical debt ngày càng phình to (4 bảng tin nhắn riêng biệt).
  - Code frontend phải xử lý 4 state mảng khác nhau, logic realtime phân mảnh.
  - Truy vấn tìm kiếm toàn cục cực kỳ chậm vì phải UNION nhiều bảng lớn.
  - Nguy cơ bug không đồng bộ rất cao.
- **Kết luận:** **Bác bỏ Phương án 2.**

---

## IV. ĐẶC TẢ API VÀ HỢP ĐỒNG DỮ LIỆU (SERVICE CONTRACTS)

### 1. Typescript Interfaces
```typescript
export type ConversationType = "direct" | "group" | "project";
export type ConversationMemberRole = "owner" | "admin" | "member";
export type MessageType = "text" | "task_card" | "file" | "system_event";

export interface UnifiedConversation {
  id: string;
  type: ConversationType;
  title: string | null;
  avatar_url: string | null;
  description: string | null;
  project_id: string | null;
  created_by: string | null;
  is_archived: boolean;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
  // Computed client-side fields:
  members?: ConversationMember[];
  lastMessage?: MessagePreview;
  unreadCount: number;
  isPinned: boolean;
  isMuted: boolean;
}

export interface ConversationMember {
  conversation_id: string;
  user_id: string;
  role: ConversationMemberRole;
  last_read_at: string;
  is_pinned: boolean;
  is_muted: boolean;
  joined_at: string;
  profile?: Profile;
}

export interface UnifiedMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: MessageType;
  metadata?: {
    task?: {
      id: string;
      title: string;
      status: string;
      priority: string;
      due_date: string | null;
      assignee_name?: string;
      project_name?: string;
    };
    system_event?: string;
  };
  reply_to_id: string | null;
  is_pinned: boolean;
  is_deleted: boolean;
  edited_at: string | null;
  reactions: Record<string, string[]>;
  created_at: string;
  sender?: Profile;
  attachments?: MessageAttachment[];
}
```

---

## V. LUỒNG TRUYỀN PHÁT THỜI GIAN THỰC (REALTIME SEQUENCE FLOW)

```mermaid
sequenceDiagram
    autonumber
    actor Alice as Người dùng A (Gửi tin)
    participant ClientA as Trình duyệt A
    participant SupaRT as Supabase Realtime Gateway
    participant Postgres as PostgreSQL Database
    participant ClientB as Trình duyệt B
    actor Bob as Người dùng B (Nhận tin)

    Alice->>ClientA: Nhập tin nhắn & Bấm Gửi
    Note over ClientA: Optimistic UI: Hiển thị ngay tin nhắn trạng thái "sending"
    ClientA->>Postgres: INSERT INTO alpha_lite.messages
    Postgres-->>ClientA: Trả về bản ghi chính thức (status: "sent")
    Postgres->>SupaRT: Postgres WAL Trigger (CDC postgres_changes INSERT)
    SupaRT->>ClientB: Broadcast payload new message (kênh conversation:{id})
    ClientB->>Bob: Render tin nhắn mới, rung âm thanh / phát thông báo
    Note over ClientB: Tự động đánh dấu đã đọc nếu Bob đang active cửa sổ
    ClientB->>Postgres: UPDATE conversation_members SET last_read_at = now()
```

---

## VI. MA TRẬN PHÂN QUYỀN TRUY CẬP (PERMISSION MATRIX)

| Hành động | Direct Chat (1-1) | Group Chat Tự Do | Project Chat |
|---|---|---|---|
| **Xem tin nhắn (Read)** | Chỉ 2 thành viên trong cuộc trò chuyện | Chỉ thành viên có trong `conversation_members` | **Chỉ thành viên thuộc `project_members`** |
| **Gửi tin nhắn (Send)** | 2 thành viên | Thành viên trong nhóm | Thành viên dự án |
| **Chỉnh sửa / Thu hồi tin** | Chỉ tác giả (`auth.uid() = sender_id`) | Chỉ tác giả | Chỉ tác giả |
| **Ghim tin nhắn (Pin)** | Cả 2 thành viên | Owner & Admin nhóm | Trưởng dự án (PM) & Admin |
| **Thêm / Xóa thành viên** | Không áp dụng (luôn là 2 người) | Owner & Admin nhóm | Đồng bộ tự động theo `project_members` |
| **Đổi tên / Ảnh nhóm** | Không áp dụng | Owner & Admin nhóm | Đồng bộ từ thông tin Dự án |
| **Giải tán / Xóa nhóm** | Không áp dụng | Chỉ Owner nhóm | Đi kèm xóa Dự án |

---

## VII. CHIẾN LƯỢC DI TRÚ VÀ TƯƠNG THÍCH NGƯỢC (MIGRATION STRATEGY)

Nhằm đảm bảo an toàn tuyệt đối cho dữ liệu hiện có:
1. **Giai đoạn 1 (Non-destructive Schema Creation):**
   - Chạy migration tạo các bảng mới: `conversations`, `conversation_members`, `messages`, `task_chat_links`.
   - Các bảng cũ (`direct_messages`, `channel_messages`, `project_messages`) vẫn giữ nguyên 100%, không bị sửa đổi cấu trúc.
2. **Giai đoạn 2 (Data Backfill Script):**
   - Chạy script SQL idempotent để chuyển toàn bộ dữ liệu lịch sử cũ sang bảng mới:
     - Tạo cuộc hội thoại cho từng cặp Direct Message có trong `direct_messages`.
     - Tạo cuộc hội thoại cho từng phòng ban trong `departments`.
     - Tạo cuộc hội thoại cho từng dự án trong `projects`.
     - Chuyển toàn bộ các dòng tin nhắn cũ vào bảng `messages` mới.
3. **Giai đoạn 3 (Feature Verification & Switchover):**
   - Triển khai code frontend mới trỏ vào bảng hợp nhất.
   - Kiểm tra đối soát số lượng tin nhắn giữa bảng cũ và bảng mới đạt tỷ lệ khớp 100%.
4. **Chiến lược Rollback khẩn cấp:**
   - Trong trường hợp phát sinh sự cố không mong muốn, hệ thống chỉ cần switch phiên bản frontend cũ trở lại, vì các bảng dữ liệu cũ vẫn nguyên vẹn 100%.
