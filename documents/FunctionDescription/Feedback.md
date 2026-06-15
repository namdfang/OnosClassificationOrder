# Feedback System — Function Description

> **Folder BE:** `apps/api/src/modules/feedback/`
> **Folder FE:** `apps/web/src/pages/feedback/`, `apps/web/src/components/feedback/`
> **Shared:** `packages/shared/dtos/feedback.dto.ts`, `packages/shared/constants/feedback.ts`
> **Route chính:** `/feedback`
> **Floating entry:** nút tròn góc phải dưới mọi trang đã đăng nhập (đặt trong `MainLayout`)

---

## 1. Overview

Module **Feedback** cho phép mọi user gửi góp ý/báo bug/đề xuất tính năng cho đội dev, kèm ảnh minh họa, có thể chọn ẩn danh. Admin trả lời được và conversation diễn ra dạng **chat thread** (gửi qua lại nhiều lượt, kèm ảnh trong từng reply).

Triết lý UX: vibe **dí dỏm** — dev xưng "em", user xưng "sếp" → khuyến khích người dùng dễ chia sẻ.

### Đặc tính chính

- **Floating button** truy cập nhanh ở mọi trang, ẩn ở login (vì login không vào `MainLayout`).
- **Anonymous mode**: user chọn ẩn danh → tên ẩn với mọi viewer non-admin; **Admin luôn thấy tên thật** + badge "Ẩn danh".
- **Image upload**: paste Ctrl+V, kéo thả, click chọn từ máy — multi-image, có thumbnail + preview group.
- **Chat thread** 2 chiều: admin và owner (user gửi feedback) đều reply được, kèm ảnh trong từng tin nhắn.
- **Dark theme** cho feedback ẩn danh (Drawer chuyển nền slate-800/900) → phân biệt visual với feedback thường.
- **Auto-refresh** mỗi 5 phút (silent, không hiện loading) ở page list + drawer list + drawer detail.
- **Status workflow**: Open → InProgress (khi admin reply lần đầu) → Resolved / Closed.

---

## 2. Cấu trúc Files

### Backend (`apps/api/src/modules/feedback/`)

```
modules/feedback/
├── feedback.module.ts        → NestJS module + Mongoose register (Feedback, User, Image)
├── feedback.controller.ts    → 5 REST endpoints
├── feedback.service.ts       → Business logic + visibility/anonymous logic
├── feedback.entity.ts        → Mongoose schema: feedbacks collection + embedded replies
└── feedback.repository.ts    → Extends DatabaseRepositoryAbstract
```

### Frontend (`apps/web/src/components/feedback/` + `pages/feedback/`)

```
components/feedback/
├── FeedbackFloatingButton.tsx → Nút tròn cố định góc phải dưới
├── FeedbackDrawer.tsx         → Drawer 720px, 3 tabs (Gửi / Của tôi / Tất cả — admin)
├── FeedbackForm.tsx           → Form tạo mới (type, title, content, images, anonymous)
├── FeedbackList.tsx           → Table hiển thị danh sách feedback
└── FeedbackDetail.tsx         → Drawer 640px chat thread + reply composer

pages/feedback/
└── index.tsx                  → Trang `/feedback` full view: tabs + filter + pagination
```

### Shared (`packages/shared/`)

```
constants/feedback.ts          → enum FeedbackType, FeedbackStatus
dtos/feedback.dto.ts           → Zod schemas + DTO classes
enums/image-type.ts            → Thêm ImageType.Feedback
```

---

## 3. Data Model

### Enum

```ts
enum FeedbackType {
  Bug, Feature, Improvement, Compliment, Other
}

enum FeedbackStatus {
  Open, InProgress, Resolved, Closed
}
```

### Mongoose Schema — `FeedbackEntity` (collection: `feedbacks`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `userId` | string (ref UserEntity) | ✅ | Owner — luôn lưu thật, không bao giờ null |
| `isAnonymous` | boolean | ✅ | default `false` |
| `type` | FeedbackType | ✅ | enum |
| `title` | string | ❌ | optional |
| `content` | string | ✅ | max 5000 chars |
| `imageIds` | string[] | ✅ | default `[]`, ref `images` |
| `status` | FeedbackStatus | ✅ | default `Open` |
| `replies` | `FeedbackReplyEmbedded[]` | ✅ | default `[]`, embedded subdocs |
| `createdAt` / `updatedAt` | Date | auto | từ DatabaseEntityAbstract |

**Virtuals**: `user` → UserEntity, `images` → ImageEntity[]

**Indexes**: `{ userId: 1, createdAt: -1 }`, `{ status: 1, createdAt: -1 }`

### Embedded Subdoc — `FeedbackReplyEmbedded`

Mỗi reply là 1 subdoc trong `feedback.replies[]` (schema có `_id: true` → mỗi reply có ObjectId riêng).

| Field | Type | Notes |
|---|---|---|
| `content` | string | nội dung reply |
| `imageIds` | string[] | ảnh đính kèm (ref `images`) |
| `repliedById` | string | user ID người gửi |
| `repliedAt` | Date | thời gian gửi |
| `isAdminReply` | boolean | snapshot tại thời điểm reply (admin = true) |

> **Vì sao snapshot `isAdminReply`?** Tránh phải populate role mỗi lần build response. Role admin tại thời điểm reply chính là role admin lúc đó — không cần re-check.

---

## 4. API Endpoints (`/v1/feedbacks`)

| Method | Path | Mô tả | Auth |
|---|---|---|---|
| `POST` | `/feedbacks` | Tạo feedback mới | Mọi user đăng nhập |
| `GET` | `/feedbacks` | List feedback (admin: all, user: own) | Mọi user đăng nhập |
| `GET` | `/feedbacks/:id` | Detail | Owner hoặc admin |
| `PATCH` | `/feedbacks/:id/reply` | Push reply vào thread | Owner hoặc admin |
| `PATCH` | `/feedbacks/:id/status` | Đổi trạng thái | Admin |

### Query params cho GET `/feedbacks`

```
page=1
limit=20
scope=mine | (omit)  // admin: omit→all, mine→own; non-admin: luôn lọc own
type=Bug | Feature | ...
status=Open | InProgress | ...
```

### Response shape

```ts
{
  success: true,
  data: Feedback[],
  total: number,
  unrepliedCount?: number  // chỉ trả cho admin = count(status === Open)
}
```

---

## 5. Service Logic (`feedback.service.ts`)

### `createFeedback(dto, user)`
- Lưu với `userId = user._id` (luôn — bất kể anonymous).
- `replies: []`, `status: Open`.

### `getFeedbacks(dto, user)`
- **Non-admin**: filter `userId = user._id` (chỉ thấy của mình).
- **Admin với `scope=mine`**: filter own. Không có scope → all.
- Batch-load: tất cả user trong `userIds` (owners + repliers) qua **1 query**. Tất cả image qua **1 query**. Avoid N+1.
- `unrepliedCount = count(status === Open)` — chỉ trả cho admin (admin reply sẽ chuyển Open → InProgress).

### `replyFeedback(id, dto, user)`
- Authorize: `isAdmin || feedback.userId === user._id`.
- Push reply vào `replies[]` qua `$push`. Status logic:
  - Admin reply + Open → InProgress
  - Còn lại → giữ nguyên status
- Update query phải dùng explicit `$push` + `$set` (mongoose mixed operator có thể không hoạt động ổn):
  ```ts
  { $push: { replies: newReply }, $set: { status: newStatus } }
  ```

### `updateStatus(id, dto, user)`
- Chỉ admin.

### Anonymous logic — `buildResponse()`

```ts
const showUserInfo = isAdminViewer || !feedback.isAnonymous;
```

- `userName`, `userEmail` của owner: chỉ trả khi `showUserInfo`.
- `replies[].repliedByName`: trả khi `showUserInfo || reply.isAdminReply` (admin reply luôn lộ tên).
- Owner viewing own anonymous: `showUserInfo = false` → tên ẩn → UI hiện "Sếp ẩn danh" (nhất quán vibe).

### URL transform
- Image objects đi qua `parseUrls()` để gắn CDN_URL prefix.

---

## 6. Frontend Components

### `FeedbackFloatingButton.tsx`
- Vị trí: `position: fixed`, `bottom: 6` `right: 6`, `z-50`.
- Icon `MessageSquareHeart` (lucide-react).
- Tooltip: *"Sếp có gì hay ho/cay cú muốn nói? Click em đây nè"*
- Mounted trong `MainLayout` → auto ẩn ở login (login không qua layout).

### `FeedbackDrawer.tsx`
- Width 720px (rộng vì chứa Table).
- 3 tabs: **Sếp gửi feedback** | **Feedback của sếp** | **Tất cả sếp** (chỉ admin, có Badge `unrepliedCount`).
- Tab Create dùng `FeedbackForm`, 2 tab còn lại dùng `FeedbackList`.
- Nút refresh ở `extra` slot khi không ở tab Create.
- Auto-refresh: setInterval 5 phút, đọc `activeTabRef.current` để fetch đúng tab.

### `FeedbackForm.tsx`
- Field:
  - **Type** (Select): 5 options với icon + label dí dỏm (vd "Bug — Sếp tóm được con bọ rồi nè")
  - **Title** (Input, optional, max 200)
  - **Content** (TextArea, required, max 5000)
  - **Images** (multi-upload): paste/drag/click
  - **Anonymous** (Checkbox)
- Upload flow:
  ```
  File → FormData (file + type=Feedback) → upload.uploadImage → image._id
  → push vào replyImages state → submit kèm imageIds[]
  ```
- Paste handler: `document.addEventListener('paste')` đọc `clipboardData.items`, lọc `image/*`.
- Drag-drop: container div với `onDragOver` + `onDrop`.
- Submit: gọi `feedback.createFeedback({ ...values, imageIds })`.

### `FeedbackList.tsx` (Table)
- Columns:
  1. **Loại** (width 130): Tag Type + Tag "Ẩn danh" (nếu có)
  2. **Nội dung**: title + content (line-clamp-2)
  3. **Ảnh** (width 200): grid 4 thumbnail 40×40, "+N" nếu hơn 4
  4. **Người gửi** (conditional `showOwner`, width 180): name + email; "Ẩn danh" nếu undefined
  5. **Trạng thái** (width 130): Tag Status + Tag số reply
  6. **Tạo lúc** (width 150): formatted date
- Click row → open detail. Click thumbnail → preview group (stopPropagation).
- `scroll x: 800` để mobile scroll ngang.

### `FeedbackDetail.tsx` (Chat Thread Drawer)
- Width 640px, có 3 sections:
  1. **Header section** (top, fixed): tags type/status/anonymous, title, owner info box (admin only), nội dung gốc, ảnh gốc, timestamp.
  2. **Thread area** (middle, scrollable): bubble chat
     - Bubble của mình → bên phải, màu primary
     - Bubble người khác → bên trái (gray default, slate-700 nếu anonymous)
     - Avatar: `ShieldCheck` (admin) / `User` (sếp)
     - Mỗi bubble có content + grid ảnh + tên + Bot icon nếu admin + timestamp
     - Auto-scroll xuống reply mới qua `threadEndRef.scrollIntoView`
  3. **Composer** (bottom, fixed): textarea + thumbnail row + nút Đính ảnh + nút Gửi
     - Paste handler attached khi drawer open AND user có quyền reply
     - **Ctrl+Enter** = gửi nhanh
- Refresh button ở `extra` slot. Auto-refresh 5 phút qua `onUpdated()`.
- **Anonymous dark theme** khi `feedback.isAnonymous`:
  | Phần | Bình thường | Ẩn danh |
  |---|---|---|
  | Header bar | mặc định | `#0f172a` slate-900 + text trắng |
  | Body bg | trắng | `#1e293b` slate-800 |
  | Owner box | gray-50 | slate-700 |
  | Thread area | gray-50 | slate-900 |
  | Composer | white | slate-800 |
  | Other bubble | gray-100 | slate-700 |
  | Title | "Chi tiết feedback" | + tag "Chế độ ẩn danh" |

### `pages/feedback/index.tsx`
- Trang `/feedback` full view (link từ sidebar menu).
- Layout: BreadCrumb + SectionTitle + 2 nút (Làm mới + Sếp góp ý phát) + Tabs + Filter + Table + Pagination.
- Modal cho form gửi mới (`width=640`, `destroyOnClose`, title "Sếp tâm sự với em đi").
- Tabs:
  - Admin: "Tất cả sếp than thở" (default) + "Feedback của sếp"
  - User thường: chỉ "Feedback của sếp"
- Filter: Select type + Select status (đều `allowClear`).
- Auto-refresh 5 phút qua `fetchRef.current()` (avoid stale closure).

---

## 7. Auto-Refresh Pattern

3 nơi tự refresh, mỗi nơi `setInterval(callback, 5 * 60 * 1000)`:

| Nơi | Refresh gì | Pattern |
|---|---|---|
| `pages/feedback/index.tsx` | List feedback theo filter hiện tại | `fetchRef.current()` lưu hàm mới nhất; interval đọc ref |
| `FeedbackDrawer.tsx` | Tab list đang active | `activeTabRef.current` để biết tab nào fetch |
| `FeedbackDetail.tsx` | Detail feedback hiện tại | Gọi `onUpdated()` → parent refetch + truyền lại |

**Silent refresh**: tất cả interval gọi với `showLoading = false` → không hiện spinner → không gây flicker khi user đang đọc/gõ. Chỉ **click button** mới hiện loading.

**Reply input không bị mất** khi refresh: `replyContent` là local state, chỉ reset khi `feedback._id` đổi (chuyển sang feedback khác).

---

## 8. Permission & Visibility

### Phân quyền backend

| Endpoint | Admin | Owner | User khác |
|---|---|---|---|
| `POST /feedbacks` | ✅ | ✅ (cho mình) | ✅ (cho mình) |
| `GET /feedbacks` (scope=all) | ✅ | ❌ (forced to own) | ❌ (forced to own) |
| `GET /feedbacks` (scope=mine) | ✅ | ✅ | ✅ |
| `GET /feedbacks/:id` | ✅ | ✅ (own only) | ❌ |
| `PATCH /reply` | ✅ | ✅ (own only) | ❌ |
| `PATCH /status` | ✅ | ❌ | ❌ |

### Logic ẩn danh

- **Frontend FilterForm**: Anonymous checkbox visible cho mọi user.
- **Backend lưu**: `userId` luôn lưu thật bất kể anonymous (để tracing nội bộ).
- **Backend trả response**:
  - `userName`/`userEmail` = `undefined` cho non-admin viewer của anonymous feedback.
  - `replies[].repliedByName` = `undefined` cho reply của owner (non-admin) trong anonymous feedback, khi viewer non-admin.
  - Admin reply luôn lộ tên admin.
  - Admin viewer luôn thấy tất cả tên thật (+ badge "Ẩn danh" làm indicator).
- **Frontend hiển thị**: 
  - Bubble fallback `name || (feedback.isAnonymous ? 'Sếp ẩn danh' : 'Sếp')`
  - List fallback "Ẩn danh" khi userName undefined.

### Cache cô lập
- Không dùng Redis cache cho module này (data thay đổi nhiều, volume thấp).

---

## 9. Image Upload Flow

```
[User] paste/drag/click file (image/*)
  ↓
FormData { file, type: 'Feedback' }
  ↓
POST /v1/upload/image
  ↓
[Backend UploadService]
  - Resize → preview (1200w) + thumb (300w)
  - Upload R2 bucket folder 'feedback-images'
  - Insert ImageEntity với url/previewUrl/thumbUrl
  ↓
Response: { _id, url, previewUrl, thumbUrl }
  ↓
[Frontend] push vào replyImages / form images state
  ↓
Submit feedback/reply với imageIds: [...]
```

`ImageType.Feedback` config (upload.service.ts):
- Allowed: jpg/jpeg/png/gif/webp
- Min: 50×50 — Max: 10000×10000
- Preview: quality 85, width 1200
- Thumbnail: quality 75, width 300

---

## 10. UX & Tone Decisions

### Persona setup
- **Dev**: "em" (humble, lễ phép, addressing user)
- **User**: "sếp" (boss, được respect)

→ Tạo dynamic dễ chịu, encourage feedback honest.

### Sample copy

| Vị trí | Text |
|---|---|
| Floating button tooltip | "Sếp có gì hay ho/cay cú muốn nói? Click em đây nè" |
| Modal title (Page) | "Sếp tâm sự với em đi" |
| Drawer title | "Bảng tâm sự với người lạ" |
| Type label Bug | "Bug — Sếp tóm được con bọ rồi nè" |
| Validate type empty | "Sếp chọn 1 cái cho em dễ phân loại nhé" |
| Validate content empty | "Sếp viết gì đó đi, không thì em fix bằng cảm xúc à?" |
| Toast success create | "Em ghi nhận rồi! Cảm ơn sếp đã chỉ điểm cho đội dev." |
| Toast warn no image | "Em chỉ nhận ảnh thôi sếp ạ, file khác em không hiểu đâu." |
| Toast success upload | "Em đã thêm {N} ảnh cho sếp rồi ạ." |
| Empty list — user | "Sếp chưa than thở gì — chắc xài mượt quá nhỉ?" |
| Empty list — admin | "Chưa sếp nào chê gì cả. Đáng nghi quá ta." |
| Empty thread — user | "Chưa có phản hồi. Đội dev đang đọc kỹ feedback của sếp... chắc vậy." |
| Empty thread — admin | "Chưa ai nói gì cả. Admin mở màn nhé." |
| Submit button (form) | "Gửi cho em xử lý" |
| Submit button (reply) | "Gửi" |
| Anonymous checkbox | "Sếp muốn giấu mặt? Tick vào đây gửi ẩn danh (nhưng Admin vẫn nhìn ra sếp đấy nhé)" |

---

## 11. Setup & Deployment Notes

### Khi đổi DTO trong `packages/shared`
**Bắt buộc rebuild shared** trước khi restart API:
```bash
pnpm --filter shared build
```

Vì backend NestJS load shared từ `dist/index.cjs` (built artifact), không phải source. Nodemon chỉ watch `apps/api/src/`, không watch `packages/shared/dist/` → cần restart API thủ công sau rebuild.

Verify:
```bash
grep "FeedbackStatus\|FeedbackType" packages/shared/dist/index.cjs | head
```

### Cache khi đổi env (R2/CDN)
Không cần xử lý đặc biệt vì không dùng Redis cache cho module này.

### Sidebar menu
- `permissionMap['/feedback'] = []` → mọi role thấy menu.
- Icon `MessageSquareHeart`.

---

## 12. Known Limitations / Future Work

1. **Không có notification realtime** khi admin reply — user phải mở drawer/page và đợi auto-refresh hoặc click làm mới. Có thể tích hợp với module `notifications` hiện có sau.
2. **Replies không phân trang** — feedback có 100+ replies sẽ load hết. Hiện tại OK vì volume thấp, sau cần thêm limit + load more.
3. **Không có edit/delete reply** — đã gửi là final. Cân nhắc thêm nếu user phản hồi cần feature này.
4. **Anonymous viewer leak qua URL** — nếu admin paste link feedback ẩn danh cho người khác, người đó (nếu là user) chỉ thấy nội dung nếu là owner, ngược lại 403. An toàn.
5. **Không xóa ảnh khỏi R2** khi user remove khỏi form trước khi submit → ảnh orphan trong storage. Cleanup job riêng có thể chạy định kỳ check images không có reference.
6. **No analytics** — bao nhiêu feedback theo type/status theo thời gian, ai gửi nhiều nhất → nếu cần dashboard sau.
