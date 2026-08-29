# Nối nhóm Zalo ↔ khách hàng (Zalo Group Mapping) — Function Description

> **File FE:** `apps/web/src/pages/zalo-groups/index.tsx`, `ZaloGroupEditDialog.tsx`, `SuggestionsDialog.tsx`
> **File BE:** `apps/api/src/modules/zalo-group/zalo-group.service.ts`, `zalo-group.controller.ts`, `zalo-group-link.entity.ts`
> **Script:** `apps/api/scripts/sync-zalo-groups.mjs`
> **Route:** `/adm/zalo-groups`
> **API:** `GET /v1/zalo-groups`, `GET /v1/zalo-groups/coverage`, `GET /v1/zalo-groups/suggestions`, `POST /v1/zalo-groups/sync`, `PATCH /v1/zalo-groups/:id`

## 1. Overview

Nối mỗi **nhóm Zalo** với **khách hàng (seller)** trong OnosFactory, để về sau
làm được báo cáo và nhắc việc dựa trên cả hai vế: nhóm đang tồn đọng gì × khách
đó đang có bao nhiêu đơn kẹt ở chặng nào.

Dữ liệu Zalo **không nằm trong hệ thống này**. Nó sống ở máy `onosceo`: engine
`ghcr.io/zero-126/zalo-engine` + Postgres riêng (database `zalo`, schema `ceo`
cho trợ lý Chủ tịch). OnosFactory chỉ giữ phần mình sở hữu — nhóm đó thuộc về
ai, ai chịu trách nhiệm, có được đưa vào phân tích không.

Trước đây mối nối này nằm ở bảng `ceo.khach` trên `onosceo` (4 dòng, khoá theo
`hoi_thoai_id`). Cả 4 mã trong đó đều khớp `userSku` bên OnosFactory, nên dữ
liệu cũ nhập lại được.

**Quy mô đo ngày 29/08/2026:** 157 dòng hội thoại nhóm trên `onosceo` = **147
nhóm thật**; OnosFactory có **132 khách**, **134 `userSku`** xuất hiện trong đơn.

## 2. Luồng hoạt động

1. Chạy `scripts/sync-zalo-groups.mjs` — đọc Postgres của engine qua SSH, **gộp
   dòng hội thoại theo `group_global_id`**, rồi POST vào `/zalo-groups/sync`.
2. Nhóm mới vào với `kind = 'unreviewed'`.
3. Người vận hành mở danh sách, dùng `/zalo-groups/suggestions` để lấy các cặp
   nhóm ↔ khách hệ thống đoán được, **duyệt từng cặp** rồi `PATCH` để gắn.
4. Nhóm không thuộc khách nào thì vẫn phải xét: đặt `kind` thành `operation`
   (nhóm vận hành) hoặc `internal` (riêng tư) — có vậy danh sách chờ mới cạn.
5. `/zalo-groups/coverage` trả bảng phủ sóng để biết còn bao nhiêu chưa xong.

### Vì sao khoá theo `groupGlobalId` chứ không phải id hội thoại

Engine lưu **một bản ghi hội thoại cho mỗi nick công ty** có mặt trong nhóm.
Nhóm "Phát triển hệ thống AI" có 2 nick nên hiện thành 2 dòng. Khoá theo hội
thoại nghĩa là người vận hành phải gắn cùng một nhóm nhiều lần, và sót một lần
là phân tích hụt dữ liệu của nick đó. `external_thread_id` cũng không dùng làm
khoá được — mỗi nick một mã khác nhau.

Đây là bài học lấy nguyên từ `thghub` (migration `20260824_zalo_group_seller_map`,
bên đó 212 dòng = 85 nhóm thật).

## 3. API / Schema

| Method | Path | Mô tả |
|---|---|---|
| GET | `/v1/zalo-groups?kind&customerId&unlinked&search&page&limit&sort&order` | Danh sách nhóm. `unlinked=true` → chỉ nhóm chưa gắn khách |
| GET | `/v1/zalo-groups/coverage` | Bảng phủ sóng: tổng nhóm, đếm theo phân loại, khách đã/chưa có nhóm |
| GET | `/v1/zalo-groups/suggestions` | Gợi ý ghép nhóm ↔ khách theo tên nhóm. Cap 200, điểm ≥ 0.5 |
| POST | `/v1/zalo-groups/sync` | Nạp nhóm từ engine. **Không** đụng `kind`/`customerId`/`ownerUserId` đã gắn |
| PATCH | `/v1/zalo-groups/:id` | Gắn/gỡ khách, đổi phân loại, chỉ định người phụ trách |

Entity `zalo_group_links` (`apps/api/src/modules/zalo-group/zalo-group-link.entity.ts`):

```ts
{
  groupGlobalId: string;      // UNIQUE + index — khoá thật của nhóm bên engine
  title?: string;             // ảnh chụp tên nhóm lúc đồng bộ
  kind: ZaloGroupKind;        // unreviewed | seller | operation | internal
  customerId?: string;        // ref CustomerEntity — RỖNG được, và rỗng có nghĩa
  userSku?: string;           // ảnh chụp lúc gắn — đơn nối với khách qua userSku
  ownerUserId?: string;       // người chịu trách nhiệm, do quản lý chỉ định
  conversationIds: string[];  // các dòng hội thoại gộp về nhóm này
  memberNicks: string[];      // nick công ty đang trong nhóm — đọc từ Zalo
  lastMessageAt?: Date;
  note?: string;
  linkedByUserId?: string; linkedAt?: Date; syncedAt?: Date;
}
```

Index: `groupGlobalId` (unique), `kind`, `customerId`, `userSku`, `ownerUserId`,
`lastMessageAt`, và index ghép `{ kind: 1, lastMessageAt: -1 }` cho danh sách chờ gắn.

`ZaloGroupKind` (`packages/shared/enums/zalo-group-kind.ts`) — 4 giá trị, kèm
`ZALO_GROUP_ANALYZABLE_KINDS` là danh sách DUY NHẤT được phép đọc nội dung chat.

## 4. UI Components

Trang `/adm/zalo-groups`, namespace i18n `zaloGroups`, quyền `page.zalo_groups`.

**`index.tsx`** — 5 ô phủ sóng trên đầu (tổng nhóm · chưa xét · đã gắn · khách có
nhóm · khách chưa có nhóm; ô cảnh báo tô hổ phách khi > 0), bộ lọc (tìm theo tên,
chọn phân loại, nút bật/tắt "chỉ nhóm chưa gắn"), rồi bảng nhóm. Mỗi dòng hiện
tên nhóm + số hội thoại + nick trong nhóm, badge phân loại, mã khách, mốc tin cuối.

**`SuggestionsDialog.tsx`** — duyệt gợi ý hàng loạt. Mọi dòng **tick sẵn** vì
phần lớn đạt 0.95; người duyệt chỉ bỏ tick dòng đáng ngờ thay vì phải tick hàng
chục dòng đúng — nhưng vẫn phải bấm nút, không có gì tự gắn. Một dòng hỏng không
làm dừng cả lô.

**`ZaloGroupEditDialog.tsx`** — gắn tay một nhóm. Đổi phân loại khỏi "nhóm khách"
thì tự gỡ khách đang chọn: BE sẽ từ chối nếu để lẫn, báo lỗi ở FE thì người dùng
phải sửa hai lần. Danh sách khách lọc phía client (132 khách thì tải một lượt rẻ
hơn gọi API mỗi lần gõ).

## 5. Backend logic

**`syncGroups()`** — upsert theo `groupGlobalId`. `$set` chỉ ghi phần đọc từ
Zalo (tiêu đề, nick, mốc tin); `kind` nằm trong `$setOnInsert` nên **chạy lại
đồng bộ không kéo nhóm đã xét về lại 'chưa xét'**. Không có chốt này thì không
ai dám chạy đồng bộ lần hai.

**`updateLink()`** — hai ràng buộc chéo trường, đặt ở service vì chúng liên quan
đồng thời `kind` và `customerId`:

- `kind='seller'` mà không có khách → chặn. Nhóm nằm trong diện phân tích doanh
  thu nhưng không quy được về ai là bản ghi vô nghĩa.
- `kind≠'seller'` mà vẫn có khách → chặn, buộc gỡ khách trước.

Lúc gắn, `userSku` được **chụp lại** từ khách. Đơn hàng nối với khách qua
`userSku`/`userEmail` chứ không qua `customerId`, nên thiếu trường này thì mọi
báo cáo nối nhóm ↔ đơn phải tra thêm một vòng sang `customers`.

**`getSuggestions()`** — so tên nhóm (đã bỏ dấu, thường hoá) với `userSku` và
`fullName` của khách. Điểm: khớp `userSku` ≥ 6 ký tự → 0.95; `userSku` ngắn hơn
→ 0.6 (mã 3-4 ký tự dễ trùng ngẫu nhiên trong câu tiếng Việt); khớp `fullName`
≥ 5 ký tự → 0.7.

**Cố ý chỉ gợi ý, không tự gắn.** Tên nhóm do người đặt tay nên đủ kiểu; gắn tự
động sớm muộn cũng quy nhầm doanh thu sang khách khác, mà sai kiểu đó rất khó
phát hiện về sau.

Một khách có thể có **nhiều nhóm** (nhóm BOD + nhóm TOPUP) — unique index đặt
trên `groupGlobalId`, không đặt trên `customerId`.

## 6. Performance notes

- Đồng bộ 147 nhóm: 157 dòng Postgres → 147 lệnh `updateOne` upsert. Đo trên
  dev 29/08: đọc + gộp + đẩy xong dưới 3 giây.
- `getSuggestions()`: 1 lượt đọc nhóm chưa xét + 1 lượt đọc khách, ghép trong bộ
  nhớ — 147 nhóm × 132 khách = 19.404 phép so chuỗi, trả về trong ~1 giây. Khi
  số nhóm lên vài nghìn thì phải chuyển sang lọc trước bằng index text.
- `getCoverage()`: 5 truy vấn chạy song song (`aggregate` + 3 `countDocuments` +
  1 `distinct`), không cache vì gọi theo nhu cầu.

## 7. Permissions

| Nhóm quyền | Role | Được làm gì |
|---|---|---|
| `ZALO_GROUP_VIEW_ROLES` | SuperAdmin, Admin, Manager, SupportManager, Support | Xem danh sách + bảng phủ sóng |
| `ZALO_GROUP_EDIT_ROLES` | SuperAdmin, Admin, Manager | Đồng bộ, xem gợi ý, gắn/gỡ nhóm |

Quyền sửa hẹp hơn quyền xem có chủ ý: gắn sai là quy nhầm doanh thu sang khách khác.

**Chốt riêng tư:** nhóm `kind='internal'` là nhóm cá nhân của nhân viên (nhóm
gia đình, nhóm lớp, tổ dân phố) lẫn trong dữ liệu Zalo. Mọi bước đọc nội dung
chat ở các phase sau **bắt buộc** lọc qua `ZALO_GROUP_ANALYZABLE_KINDS` — đưa
nhóm internal vào mô hình là đọc đời tư nhân viên.

## 8. Lộ trình

| Phase | Nội dung | Trạng thái |
|---|---|---|
| P1 | Mô hình dữ liệu + đồng bộ + gợi ý + API gắn nhóm | ✅ xong |
| P1b | Màn hình gắn nhóm `/adm/zalo-groups` + duyệt gợi ý hàng loạt | ✅ xong |
| P2 | Tóm tắt cuốn chiếu nội dung nhóm (BullMQ) | chưa làm |
| P3 | Báo cáo cho Chủ tịch — cắm vào `ScheduledReportsModule` | chưa làm |
| P4 | Nhắc việc hai chiều: checklist → nhắn ngược vào nhóm Zalo | chưa làm |

**Việc chặn P2:** OnosFactory chưa gọi được engine Zalo. Máy `onoshub` có
tailscale (`100.124.188.28`) nhưng ở tailnet khác `onosceo` (`100.78.72.36`), và
engine chỉ nghe `127.0.0.1:4000`. Đến khi hai máy chung tailnet thì mọi đường
đọc chat đều phải đi vòng qua SSH như `sync-zalo-groups.mjs` đang làm.
