# Nối nhóm Zalo ↔ khách hàng (Zalo Group Mapping) — Function Description

> **File FE:** `apps/web/src/pages/zalo-groups/index.tsx`, `ZaloGroupEditDialog.tsx`, `SuggestionsDialog.tsx`
> **File BE:** `apps/api/src/modules/zalo-group/` — `zalo-group.service.ts`, `zalo-summary.service.ts`, `zalo-group.controller.ts`, `zalo-group-link.entity.ts`, `zalo-group-summary.entity.ts`
> **Script:** `apps/api/scripts/sync-zalo-groups.mjs`, `apps/api/scripts/summarize-zalo-groups.mjs`
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
| GET | `/v1/zalo-groups/summaries?mucDo&conViec&search` | Bảng tóm tắt tình hình, gấp lên đầu |
| GET | `/v1/zalo-groups/summary-queue` | Nhóm chờ tóm tắt + mốc tin cần lấy từ (cho script) |
| POST | `/v1/zalo-groups/summarize` | Tóm tắt một nhóm từ đoạn hội thoại được đẩy sang |
| PATCH | `/v1/zalo-groups/summaries/:groupGlobalId/task` | Tick / bỏ tick một việc |

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

## 5b. Tóm tắt tình hình nhóm

Bảng `zalo_group_summaries`, một bản ghi hiện hành cho mỗi nhóm.

**Mô hình:** `claude-opus-5` qua `@anthropic-ai/sdk` (đổi được bằng `ZALO_SUMMARY_MODEL`),
`thinking: adaptive`, `effort: medium` (`ZALO_SUMMARY_EFFORT`). Dùng structured
output (`output_config.format` kiểu `json_schema`) để mô hình trả đúng khuôn thay
vì phải dò JSON trong văn bản trả về.

**Cần `ANTHROPIC_API_KEY`** trong `apps/api/.env.<NODE_ENV>`. Thiếu khoá thì
endpoint trả 503 kèm câu chỉ rõ phải đặt biến nào — không để nó nổi lên thành
500 "Internal server error" không manh mối.

Bốn chốt lấy từ `thghub`:

1. **Cuốn chiếu, không phải "N tin gần nhất".** Mỗi lượt nhận bản tóm tắt lần
   trước + tin MỚI kể từ `denMocTin`. Đo trên 191 nhóm bên thghub: cửa sổ "60 tin
   gần nhất" cho nhóm bận chỉ thấy 1,6 ngày lịch sử còn nhóm im thấy 16,2 ngày —
   nhóm càng bận càng mù, mà đó đúng là nhóm dễ có việc treo.
2. **Đọc lại từ đầu mỗi 7 ngày** (`docDayDuLuc`, đổi bằng `ZALO_SUMMARY_REREAD_DAYS`).
   Tóm tắt cuốn chiếu có bệnh trôi dần — một kết luận sai được chép lại mãi.
3. **Việc cần làm ra checklist, không phải văn xuôi.** thghub chạy thử 6 nhóm:
   văn xuôi 3–4 dòng đọc thì hiểu nhưng không làm theo được.
4. **Ô `nghiNgo`** — việc đã tick xong mà mô hình không thấy bằng chứng. Thiếu ô
   này thì việc tick khống bị `gopChecklist` nuốt mất, tệ hơn cả không có nút tick.

`gopChecklist()` giữ trạng thái tick của việc trùng nội dung qua các lượt — nếu
không, mỗi lượt tóm tắt lại xoá sạch công người vận hành đã tick.

**Chốt riêng tư kiểm HAI lần:** ở hàng đợi (`getQueue`) và ở chính
`summarize()`. Endpoint gọi trực tiếp được, mà đọc nhầm nhóm `internal` là đọc
đời tư nhân viên.

**Bỏ qua nhóm im > 14 ngày** (`ZALO_SUMMARY_IDLE_DAYS`) — không tốn tiền gọi mô
hình cho nhóm chẳng có gì thay đổi.

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
| P2 | Tóm tắt cuốn chiếu nội dung nhóm + màn hình Tình hình | ✅ xong (chờ `ANTHROPIC_API_KEY` để chạy thật) |
| P3 | Báo cáo cho Chủ tịch — cắm vào `ScheduledReportsModule` | chưa làm |
| P4 | Nhắc việc hai chiều: checklist → nhắn ngược vào nhóm Zalo | chưa làm |

**Việc chặn P2:** OnosFactory chưa gọi được engine Zalo. Máy `onoshub` có
tailscale (`100.124.188.28`) nhưng ở tailnet khác `onosceo` (`100.78.72.36`), và
engine chỉ nghe `127.0.0.1:4000`. Đến khi hai máy chung tailnet thì mọi đường
đọc chat đều phải đi vòng qua SSH như `sync-zalo-groups.mjs` đang làm.

## Một lệnh gọi cho AI agent — `GET /v1/agent/seller-support`

> **BE:** `apps/api/src/modules/agent-api/agent-seller-support.service.ts`
> **Tuyến:** `apps/api/src/modules/agent-api/agent-api.controller.ts` → `getSellerSupport()`
> **DTO:** `packages/shared/dtos/agent-api.dto.ts` (`AgentSellerSupportQueryZod` / `AgentSellerSupportItem`)
> **Xác thực:** header `X-Agent-Api-Key` (không JWT), cùng hạn mức với các tuyến agent khác.

### Vì sao có

Agent trả lời khách / báo cáo chủ tịch cần 4 nguồn cùng lúc: tóm tắt nhóm Zalo,
phân loại nhóm, số liệu đơn của khách đó, và sản phẩm họ hay đặt. Trước đó agent
phải tự ghép 4 bảng — bốn vòng gọi cho một câu hỏi, và mỗi chỗ ghép sai là một
câu trả lời sai gửi tới khách. Tuyến này gộp lại thành một lệnh.

### Tham số

| Tham số | Ý nghĩa |
| --- | --- |
| `mucDo` | Lọc `gap` / `can-chu-y` / `binh-thuong` |
| `userSku` | Lọc một khách |
| `limit` | Mặc định 50, trần 200 |
| `kemSanPham=false` | Bỏ phần sản phẩm cho nhẹ |

### Trả về mỗi nhóm

- `tomTat` — nội dung do mô hình soạn, kèm **`tomTatLuc`**: agent PHẢI xem mốc này
  trước khi tin, vì tóm tắt có thể cũ nhiều ngày nếu lịch chạy hỏng (mà hỏng thì
  im lặng, không báo lỗi).
- `donHang` — số liệu đọc **sống** lúc gọi: `tongDon` / `dangLam` / `dangLoi` /
  `dangGiu` / `tonLauNhatNgay`. Khác với con số trong `tomTat` vốn là ảnh chụp
  lúc mô hình chạy.
- `sanPhamHay` — 5 sản phẩm khách đặt nhiều nhất 30 ngày.

### Hai bẫy đã dẫm phải

**Chốt riêng tư nằm ở khâu ghi, không ở tài liệu.** Nguồn là
`zalo_group_summaries`, mà bảng đó chỉ chứa nhóm `seller`/`operation` — tóm tắt
bị XOÁ khi nhóm chuyển sang `internal`. Nên nhóm cá nhân nhân viên không bao giờ
lọt ra tuyến này, kể cả khi người gọi quên lọc.

**`$ifNull` là bắt buộc trong phép gộp.** Nhiều đơn KHÔNG CÓ trường `heldAt` /
`productionError` / `fulfillmentCompletedAt` chứ không phải bằng `null`. Trong
biểu thức gộp của MongoDB, trường thiếu không bằng `null`, nên `$eq` sai ở mọi
dòng còn `$ne` đúng ở mọi dòng. Bản đầu báo 4.496 đơn "đang giữ" trong khi thực
tế là 0.

## Gán người phụ trách + nối danh tính (chuẩn bị cho agent nhắn vào nhóm)

> **FE:** `apps/web/src/pages/zalo-groups/index.tsx` (cột "Người phụ trách") ·
> `apps/web/src/pages/zalo-groups/IdentitiesPanel.tsx` (cột "Tài khoản hệ thống")
> **BE:** không đổi — `ownerUserId` và `userId` đã có sẵn trong entity lẫn DTO từ đầu,
> chỉ chưa có chỗ nhập.

### Vì sao cần

Agent đọc được vấn đề trong nhóm vận hành, nhưng muốn **báo cáo và tag đúng người**
thì phải trả lời được hai câu: nhóm này ai phụ trách, và nick Zalo kia là nhân viên nào.
Trước task này cả hai đều trống — 0/53 nhóm có người phụ trách, 0/251 danh tính nối
với tài khoản.

Bằng chứng cho thấy thiếu bước này thì gửi tin vô nghĩa: nhóm `VNP/ONOS vận hành ship`
đã có "Trợ Lý AI" báo 2 việc quá hạn từ 22/08, **treo 9 ngày không ai xác nhận** —
vì tin gửi chung chung, không tag ai cụ thể.

### Thiết kế

Chọn **ngay trên danh sách**, không qua hộp thoại. Gán 53 nhóm mà phải mở 53 lần
hộp thoại thì thực tế không ai làm hết.

Lưu **ngay khi chọn**, không có nút Lưu; cập nhật màn hình trước rồi mới gọi API,
hỏng thì trả lại giá trị cũ. Ô chọn chặn nổi bọt sự kiện để bấm vào không mở luôn
ngăn chi tiết bên phải.

Cột "Tài khoản hệ thống" chỉ hiện ô chọn với danh tính `staff` / `ai-support` —
khách nối qua `customerId` ở chỗ khác, hiện ô ở đó chỉ gây nhầm.

### Còn thiếu để agent nhắn được vào nhóm

Engine Zalo bên `onosceo` **đã có sẵn đường gửi**: `POST /api/public/messages/send`
(xác thực `X-Api-Key`, đã gửi 977 tin từ 2 tài khoản công ty). Hệ thống Onos chưa
gọi sang. Nối được nhưng nên chạy chế độ **soạn sẵn — người duyệt — mới gửi**:
agent tự nhắn vào nhóm vận hành mà sai một lần thì sau đó không ai đọc tin nó nữa.

### Hai sửa đổi từ phản hồi của dev tích hợp (31/08)

**Ngừng gửi `stackTrace` ra thân phản hồi.** Trước đó MỌI endpoint công khai trả
về đường dẫn `/root/.vibedev/repos/onos/...` cùng cấu trúc mã cho bất kỳ ai gọi —
kể cả khi chỉ gõ sai khoá API. Nguyên nhân: hai filter ở `packages/core/filters/`
gắn điều kiện vào `isDevelopment`, mà **production của hệ thống này chạy với
`NODE_ENV=development`** (env chỉ dùng để chọn file cấu hình, không phản ánh môi
trường thật). Lỗi này đã tồn tại trên production thật từ trước, không phải mới.

Sửa: thêm `ApiConfigService.exposeStackTrace` — công tắc TƯỜNG MINH `EXPOSE_STACK_TRACE=true`,
mặc định tắt, truyền vào cả `CustomExceptionFilter`, `UnprocessableEntityFilter`
và `AgentExceptionFilter`. Vết lỗi vẫn ghi ra log máy chủ như cũ. **Không đổi chữ
ký hàm trong `packages/core`** — chỉ đổi giá trị truyền vào ở `main-nest.ts`.

**Thêm `tomTat.tomTatTre`** (`AGENT_TOM_TAT_HAN_GIO = 24` giờ). Có `tomTatLuc` rồi
vẫn cần cờ này: so mốc là thứ client dễ quên nhất, mà quên thì agent trả lời khách
bằng dữ liệu cũ với giọng chắc chắn. Tính ở máy chủ thì mọi client được bảo vệ như
nhau. Đề xuất của dev tích hợp — họ đã dính đúng lỗi đó ở hệ báo cáo bên mình.

## Vận hành trên production (từ 02/09/2026)

Hai máy, chia việc theo mạng — không gộp được vì **production không SSH sang
`onosceo`** (nguồn tin nhắn Zalo), chỉ máy hub sang được.

| Việc | Chạy ở | Lịch | Ghi chú |
| --- | --- | --- | --- |
| Kéo đơn OnosPod + phục hồi đơn giữ | production (`crontab` root) | `*/30`, `17 * * * *` | gọi `localhost:3007`, cần `ONOSPOD_*_TOKEN` |
| Đồng bộ nhóm → danh tính → xếp hàng tóm tắt | **hub** `/root/onos-jobs/zalo-daily.sh` | `0 7 * * *` giờ VN | đăng nhập `api.onosfactory.com`, log `/var/log/onos-zalo-daily.log` |
| Worker tóm tắt (BullMQ + Claude) | production, trong tiến trình API | theo hàng đợi | cần `CLAUDE_CLI_PATH`, `ZALO_SUMMARY_MODEL=sonnet`, `ZALO_SUMMARY_TIMEOUT_SEC=150`, và `~/.claude/.credentials.json` |

Ba bước của lịch hub **phải theo thứ tự**: đồng bộ nhóm cập nhật `lastMessageAt`;
không có nó thì hàng đợi tóm tắt luôn rỗng và báo "không có gì" — hỏng im lặng.

**Hai chỗ đã dẫm phải khi dựng:**

- `CLAUDE_CLI_PATH` phải là đường dẫn **ổn định** dưới
  `~/.local/share/fnm/node-versions/<v>/installation/...`. `command -v claude`
  trong shell trả về `/run/user/0/fnm_multishells/...` — thư mục tạm theo phiên,
  PM2 sinh worker sẽ không thấy. File đích tên `claude.exe` nhưng là ELF thật,
  không cần `node` trong PATH.
- Phiên Claude chép từ hub là **phiên đăng nhập, sẽ hết hạn**. Hết hạn thì worker
  hỏng im lặng; cờ `tomTatTre` trên endpoint agent là lưới an toàn duy nhất.
  Đường dài nên thay bằng `ANTHROPIC_API_KEY`.

`EXPOSE_STACK_TRACE` để trống trên production (mặc định tắt).

