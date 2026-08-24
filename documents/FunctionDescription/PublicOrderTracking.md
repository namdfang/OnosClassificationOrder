# Public Order Tracking — Function Description

> **File FE:** `apps/web/src/pages/track/index.tsx` (+ `apps/web/src/services/publicTrack.ts`, i18n namespace `track`)
> **File BE:** `apps/api/src/modules/customer-portal/public-track.service.ts` + `public-track.controller.ts`
> **Route:** `/track` (ô nhập mã) và `/track/:productionId` (kết quả) — KHÔNG gate auth
> **API:** `GET /api/v1/public/track/:code`

## 1. Overview

Trang tra cứu đơn **công khai**: dán mã sản xuất vào URL (`/track/RA-05217-56631`) là
thấy đơn đang ở đâu, không cần đăng nhập, không cần API key. Cửa vào chính là mã đơn,
nên khách có thể gửi thẳng link cho người mua cuối của họ.

Hai mã được đặt ở vị trí trung tâm của trang (yêu cầu gốc của tính năng):

- **`productionId`** — mã sản xuất `XX-#####-#####`, cấp NGAY lúc tạo/import đơn ở
  Customer Portal (xem `CustomerOrderIntake.md`), đi xuyên suốt portal → xưởng. Chính
  là `:productionId` trên URL.
- **`externalId`** — "Platform ID", mã đơn của sàn, có ở đơn nhập từ sheet
  (`OrderEntity.externalId`, cột `Order ID` của template import). Đơn đẩy từ portal
  chưa điền trường này nên trang tự ẩn ô khi trống.

Khác 3 đường xem đơn đã có:

| Đường                                | Ai xem                     | Khác biệt                                                                |
| ------------------------------------ | -------------------------- | ------------------------------------------------------------------------ |
| `/customer/orders/:productionId`     | Khách ĐÃ đăng nhập         | Xem + **sửa** design/địa chỉ, thấy giá, chỉ đơn của chính mình            |
| `GET /v1/open-api/orders/:ref`       | Khách qua API key (ORD-4)  | Máy-đọc-máy, chỉ đơn của chính khách                                      |
| **`/track/:productionId`** (file này) | **Bất kỳ ai có mã**        | Chỉ ĐỌC, danh sách trắng field hẹp, không giá, không sửa                  |

**Lối vào vật lý:** xưởng in tem 4×6cm dán lên kiện hàng, mã QR trên tem trỏ thẳng vào
`/track/<productionId>` — người mua cuối quét là ra trang này. Xem `Orders.md §16.6`
(mục "In nhãn khách" trong menu "..." mỗi hàng đơn). Đổi đường dẫn route ở đây là làm
chết QR trên những con tem ĐÃ dán lên hàng đang đi đường, nên `/track/:productionId`
phải coi là đường dẫn vĩnh viễn.

## 2. Luồng hoạt động

1. Người dùng mở `/track` → nhập mã → FE `navigate('/track/<mã>')` (một component phục
   vụ cả 2 route, `useParams().productionId` quyết định hiển thị ô nhập hay kết quả).
2. FE gọi `GET /public/track/:code` (`RepositoryRemote.publicTrack.getTrack`).
3. BE `PublicTrackService.getTrack()`:
   - Chặn mã sai định dạng bằng `CODE_PATTERN` (`/^[A-Za-z0-9][A-Za-z0-9-]{2,39}$/`) —
     **trước** khi chạm DB.
   - Song song: tìm `OrderEntity` theo `productionId` (regex `^…$` case-insensitive) và
     `customer_orders` theo `items.productionId`.
   - Không thấy cả hai → `NotFoundException` với **đúng thông báo** như mã sai định dạng.
   - Có `OrderEntity` → trạng thái + chặng tính bằng chính các hàm portal dùng
     (`deriveItemStatus` / `computeCurrentStage` / `isReworkBadge` +
     `OrderService.getLifecycleTrack`), rồi thay nhãn 8 chặng bằng
     `CUSTOMER_STAGE_LABELS` (ngôn ngữ khách, không phải thuật ngữ nội bộ).
   - Chỉ có staging (đơn chưa push) → `status = pending|cancelled|refunded`, `stages = []`.
4. FE render: khối mã đơn + badge trạng thái → tiến trình 8 chặng → sản phẩm / mốc thời
   gian / giao hàng → các item còn lại cùng đơn (mỗi item là 1 link `/track/<mã>` khác).

## 3. API / Schema

| Method | Path                    | Mô tả                                                                             |
| ------ | ----------------------- | --------------------------------------------------------------------------------- |
| GET    | `/v1/public/track/:code` | Tra 1 đơn theo `productionId`. `@Auth([], [], { public: true })` + `@Throttle` 30 lượt/phút/IP |

DTO ở `packages/shared/dtos/customer-order.dto.ts` (`PublicOrderTrackZod` /
`GetPublicOrderTrackResDto`) — **danh sách trắng tường minh**:

```ts
{
  productionId: string;          // mã sản xuất — định danh chính
  externalId?: string;           // Platform ID (mã sàn)
  orderId?: string;              // mã đơn của khách
  identifier?: string; orderName?: string;

  status: CustomerOrderStatus;   // pending | processing | in-production | fulfilled | completed | refunded | cancelled
  onHold: boolean; holdKind?: 'waiting-design' | 'waiting-address' | 'other';
  rework: boolean; pushed: boolean; completed: boolean;
  currentStageKey?: string;      // FE dịch nhãn theo ngôn ngữ người xem
  currentStageLabel?: string; currentStageAt?: Date;

  product: { type?, color?, size?, quantity?, sku?, merchantSku?, printMethod?, mockupUrl? };
  dates: { orderAt?, pushedAt?, inProductionAt?, fulfillmentCompletedAt?, cancelledAt? };
  tracking?: { number?, carrier?, url? };        // KHÔNG có labelUrl
  destination?: { city?, state?, country? };     // KHÔNG có tên/đường/phone/email
  stages: LifecycleTrackStage[];                 // rỗng khi chưa push
  siblings: { productionId, type?, color?, size?, quantity?, status, currentStageKey?, currentStageLabel? }[];
}
```

**Cố ý KHÔNG có** (đọc được ở DB nhưng không được nói ra): giá/`priceSnapshot`/`baseCost`,
tên nhân viên (`assignee`, designer), `factoryId`, link file thiết kế (`designs`),
`labelUrl`, nguyên văn `holdReason`/`cancelReason`/`productionErrorNote`, địa chỉ ship
đầy đủ. Thêm field mới phải trả lời được: *người lạ cầm mã đơn có được biết thứ này không?*

## 4. UI Components

- `apps/web/src/pages/track/index.tsx` — 1 component cho cả `/track` và `/track/:productionId`.
  - `CodeField` — mã + nút chép (mã sản xuất cỡ lớn, các mã còn lại cỡ thường).
  - `Field` — ô "nhãn — giá trị", tự ẩn khi rỗng.
  - `StageIcon` + danh sách 8 chặng dọc (done / current / error / rework / pending).
  - `SectionCard` — khung các khối Sản phẩm / Mốc thời gian / Giao hàng / Item cùng đơn.
- Tái dùng primitive public dùng chung: `PublicHeader`, `PublicFooter`, `BackToTop`,
  `ProductImage`, `Spinner` (`apps/web/src/components/public/`).
- Nhãn chặng dịch theo **key** (`LIFECYCLE_STAGE_KEYS`) qua `track.progress.stages.*`,
  nhãn tiếng Việt từ BE chỉ là đường lui.
- Lối vào: link "Tra cứu đơn hàng" ở cột *Đặt đơn* của `PublicFooter`
  (`landing.footer.links.track`).

## 5. Backend logic

- `PublicTrackService` (`apps/api/src/modules/customer-portal/public-track.service.ts`)
  - `PUBLIC_ORDER_FIELDS` — `$select` hẹp trên `OrderEntity`, không có designer/xưởng/giá.
  - `holdKindOf()` — mirror `CustomerOrderEventService.holdKindOf`, quy `holdReason` nội
    bộ về 3 nhóm an toàn (`packages/shared/constants/hold-reason.ts`).
  - `buildSiblings()` — 1 query `$in` cho toàn bộ item còn lại, không N+1 theo từng mã.
- Các hàm derive được **export lại** từ `customer-order.service.ts`
  (`PROD_DERIVE_FIELDS`, `ProdDeriveFields`, `computeCurrentStage`, `deriveItemStatus`,
  `isReworkBadge`, `CUSTOMER_STAGE_LABELS`) để trang công khai và portal không bao giờ
  cho hai đáp án khác nhau về cùng một đơn. `computeCurrentStage()` nay trả thêm `key`.
- Test: `apps/api/src/modules/customer-portal/public-track.spec.ts` — soi ĐỆ QUY toàn bộ
  payload theo cả tên field lẫn giá trị chuỗi, nên field nhạy cảm mới thêm sẽ bị bắt kể
  cả khi test không nhắc tên nó; kèm 2 ca chống dò mã.

## 6. Performance notes

- 1 lượt tra = **2 query song song** (orders + staging) + 1 `getLifecycleTrack` + tối đa
  1 query gộp cho siblings. Không aggregation, không `$lookup`.
- Cả 2 query đều đi vào index: `orders.productionId` (unique) và
  `customer_orders.items.productionId`. Regex neo `^…$` không phải prefix-scan toàn
  collection vì mã tra là chuỗi đầy đủ.
- `@Throttle({ limit: 30, ttl: 60_000 })` là lớp chặn duy nhất: `RateLimiterGuard` đếm
  theo token/user nên **bỏ qua route public** — bỏ `@Throttle` là mở cửa dò mã hàng loạt.

## 7. Permissions

- Không role, không permission, không JWT, không API key — `@Auth([], [], { public: true })`.
- Bù lại: chỉ ĐỌC, danh sách trắng field hẹp, mọi nhánh thất bại trả cùng một 404 (mã sai
  định dạng / mã không tồn tại không phân biệt được từ ngoài), và siết nhịp theo IP.
- Mọi lượt tra đều ghi log Winston (`method`/`url`/`code`/`ip`) để soi được khi có dấu
  hiệu quét mã.
