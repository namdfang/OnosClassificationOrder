# Ưu tiên gán xưởng theo khách hàng — Function Description

> **File FE:** `apps/web/src/pages/settings/index.tsx` + `apps/web/src/components/settings/CustomerAssignmentConfig.tsx` + `apps/web/src/components/settings/CustomerFactoryKanban.tsx` + `apps/web/src/components/settings/CustomerListDialog.tsx` + `apps/web/src/services/customer.ts` + `apps/web/src/services/customerAssignment.ts`
> **File BE:** `apps/api/src/modules/customer/` (entity + repository + service + controller + module) + `apps/api/src/modules/customer-assignment/` (service + controller + module) + `apps/api/src/modules/order/order.service.ts` → hook trong `importOrders`
> **Route:** `/settings` (gate quyền `role.manage`)
> **API:** `GET/POST /v1/customers`, `POST /v1/customers/sync`, `PATCH /v1/customers/:id/tier`, `POST /v1/customers/import-tiers`, `GET/PUT /v1/customer-assignment/config`

## 1. Overview

Thêm một **tầng ưu tiên gán xưởng theo khách hàng**, đứng **trên** việc map xưởng
theo product config lúc **import đơn mới**.

- **Công tắc bật/tắt** (`enabled`):
  - **Tắt** → import lấy `factoryId` theo product config như cũ.
  - **Bật** → mỗi đơn, nếu cặp **(userSku, userEmail)** khớp một khách đã gán trong
    config → **ép `factoryId`** theo xưởng của khách, **bỏ qua** factory của product
    config. Khách **không** được gán → **vẫn rơi về product config**.
- **Bất biến:** 1 khách chỉ thuộc **1 xưởng** (validate BE lúc lưu + FE lúc chọn).
- **Chỉ ép `factoryId`** — `machineTypeId / fabricType / toolResult / machineNumber`
  vẫn lấy từ product config của sản phẩm. Áp cả đơn **chưa map** product config.
- Khóa nhận diện khách = **cặp (userSku, userEmail)** — hàm `customerMatchKey`
  (userSku nguyên văn đã trim; email so sánh không phân biệt hoa/thường).

Chưa có bảng khách hàng sẵn → có nút **Sync** quét `orders` gom distinct
(userSku, userEmail) và nút **Thêm** khách thủ công.

### Tier khách hàng (VIP 0..5 + khách lẻ)

Mỗi khách có thể có **tier VIP 0 → VIP 5** (6 mức, badge màu); `tier = null` =
**khách lẻ** (chưa xếp hạng — mặc định mọi khách). Tier hiện **chỉ để hiển thị /
quản lý** (chưa ảnh hưởng logic gán xưởng hay ưu tiên đơn). Xem/sửa qua nút
**Danh sách khách** (dialog bảng khách: search + filter theo tier + đổi tier từng
khách) và **Import tier** hàng loạt từ file `TÊN TÀI KHOẢN | VIP n`.

## 2. Luồng hoạt động

1. Admin vào `/settings` → section "Ưu tiên gán xưởng theo khách hàng".
2. **Sync khách hàng** (`POST /v1/customers/sync`): quét `orders`, upsert distinct
   cặp (userSku, userEmail) vào `customers`. **Chỉ thêm mới**, không xóa khách cũ /
   khách nhập tay.
3. (Tùy chọn) **Thêm khách** thủ công (`POST /v1/customers`, `source='manual'`).
4. Bật công tắc + chọn khách cho từng xưởng → **Lưu** (`PUT /v1/customer-assignment/config`).
5. Khi **import đơn mới** (`importOrders`): nếu config bật → dựng map
   `customerMatchKey → factoryId` (1 lần trước vòng lặp); mỗi đơn khớp → ép `factoryId`.

## 3. API / Schema

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| GET | `/v1/customers` | `@Auth([Admin])` | Danh sách khách (query `search` optional) |
| POST | `/v1/customers` | `@Auth([Admin])` | Thêm khách thủ công (userSku + userEmail) |
| POST | `/v1/customers/sync` | `@Auth([Admin])` | Sync từ orders → `{ scanned, created, existing, total }` |
| PATCH | `/v1/customers/:id/tier` | `@Auth([Admin])` | Sửa tier 1 khách (`{ tier: 0..5 \| null }`, null = khách lẻ) |
| POST | `/v1/customers/import-tiers` | `@Auth([Admin])` | Import tier hàng loạt (`{ rows: [{userSku, tier}] }`, max 2000) → `{ matchedSkus, updatedCustomers, skippedSkus }` |
| GET | `/v1/customer-assignment/config` | `@Auth([Admin])` | Lấy cấu hình |
| PUT | `/v1/customer-assignment/config` | `@Auth([Admin])` | Lưu (validate 1-khách-1-xưởng) |

Collection `customers`: `{ userSku, userEmail, source: 'sync'|'manual', tier: number|null }`,
**unique index `{ userSku: 1, userEmail: 1 }`**. Zod: `CustomerTierZod`
(int 0..5, coerce) + constants `CUSTOMER_TIERS` / `CUSTOMER_TIER_MIN/MAX` +
`UpdateCustomerTier*` / `ImportCustomerTiers*` DTOs.

Config lưu blob JSON trong `system_configs` (key `customer_assignment_config`,
Redis-cache 1h). Shared DTO `packages/shared/dtos/customer.dto.ts` +
`customer-assignment.dto.ts`:

```ts
CustomerAssignmentConfig = {
  enabled: boolean;
  factories: Array<{ factoryId: string; customerIds: string[] }>;
  updatedAt?: string;
}
customerMatchKey(userSku, userEmail) // khóa so khớp chung BE/FE
```

Constant `CUSTOMER_ASSIGNMENT_CONFIG_KEY = 'customer_assignment_config'`.

## 4. UI Components

`CustomerAssignmentConfig.tsx`:
- Mount: `factory.getFactories()` + `customer.list()` + `customerAssignment.getConfig()`.
- Header + nút **Lưu** (kèm chip cam "● Chưa lưu" khi dirty). Thanh công cụ:
  `ui/switch` bật/tắt + nút **Sync khách hàng** + **Thêm khách** (`ui/dialog`
  userSku + userEmail) + **Danh sách khách** (mở `CustomerListDialog`).
- Gán khách ↔ xưởng bằng **kanban kéo thả** (`CustomerFactoryKanban.tsx`, xem dưới).
- **Dirty tracking**: `snapshot(enabled, alloc)` (sort ids + bỏ xưởng rỗng) so với
  `baseline` (set lúc load + sau save). Khi dirty: `beforeunload` (đóng tab/reload
  → confirm mặc định browser) + capture-phase click listener trên `a[href]`
  (`window.confirm`) chặn điều hướng trong app — BrowserRouter không có API block.
- Stack FE thực tế là shadcn `ui/*` + lucide (KHÔNG dùng antd).
- **Lưu** → `saveConfig({ enabled, factories })` (chỉ gửi xưởng có ≥ 1 khách) →
  cập nhật baseline.

`CustomerFactoryKanban.tsx` (thay grid MultiSelectFilter cũ):
- Cột đầu **"Chưa gán"** (`UNASSIGNED_COL='__unassigned__'`, khách không nằm trong
  alloc nào) + 1 cột / xưởng. Grid `xl:grid-cols-4`, mỗi cột cao cố định
  `h-[70vh]` scroll riêng, hiện toàn bộ khách. Section này đặt TRÊN
  `DesignerAssignmentConfig` trong `/settings` (`pages/settings/index.tsx`).
- Mỗi khách 1 card: userSku + email + `TierBadge` (import từ `CustomerListDialog`).
- **Sort trong cột**: có tier lên đầu theo **VIP 0 → VIP 5** (`tierRank`, khách lẻ
  rank 999 xuống cuối), cùng nhóm xếp A→Z theo userSku. Thứ tự trong cột KHÔNG
  lưu — luôn auto-sort.
- **Search 1 ô cho mọi cột** (userSku/email, client-side); card không khớp bị ẩn,
  header cột hiện `khớp/tổng`.
- DnD: `@dnd-kit/core` (`useDraggable` card + `useDroppable` cột + `DragOverlay`,
  PointerSensor distance 4 — cùng pattern kanban Fulfillment). Kéo tự do giữa mọi
  cột; thả vào cột → `onMove(customerId, factoryId|null)` → parent gỡ khách khỏi
  mọi list rồi thêm vào đích (tự đảm bảo 1 khách 1 xưởng). Thay đổi chỉ trong
  state, phải bấm **Lưu** mới ghi config.

`CustomerListDialog.tsx` (mở từ nút **Danh sách khách** trên toolbar):
- Bảng khách: search (SKU/email, client-side) + hàng chip filter theo tier
  (Tất cả / Khách lẻ / VIP 0..5, kèm số lượng) + cột Tier là `TierBadge` màu
  (VIP 0 cyan, 1 emerald, 2 sky, 3 violet, 4 fuchsia, 5 amber/vàng; khách lẻ
  xám) — bấm badge mở native `<select>` phủ trong suốt để đổi tier
  (`PATCH /customers/:id/tier`, toast + reload).
- Dialog con **Import tier**: upload `.xlsx/.xls/.csv/.txt` hoặc dán text; parse
  FE (`parseTierText` regex `^(sku)[\s,;]+VIP [0-5]$` / `parseTierGrid` 2 cột
  xlsx qua thư viện `xlsx`), tự bỏ dòng header "TÊN TÀI KHOẢN", báo số dòng
  hợp lệ/không hợp lệ trước khi gửi → `POST /customers/import-tiers` → hiện
  kết quả `updatedCustomers` + danh sách `skippedSkus` bị bỏ qua.

## 5. Backend logic

### 5.1 `CustomerService`
- `list(dto)`: filter `search` regex trên userSku/userEmail, sort userSku.
- `create(dto)`: normalize (email lowercase+trim); chặn trùng cặp → `BadRequest`;
  `source='manual'`.
- `sync()`: aggregate `orders` `$group` theo `{ userSku, $toLower(userEmail) }`
  (bỏ userSku rỗng) → `bulkWrite` upsert `$setOnInsert` (không đụng bản ghi cũ).
- `updateTier(id, dto)`: `findByIdAndUpdate` set `tier` (null = khách lẻ) → 404 nếu không có.
- `importTiers(dto)`: dedupe SKU trong file (dòng sau thắng) → load toàn bộ
  `userSku` hiện có, dựng map `lower(sku) → các sku thật` → mỗi SKU khớp
  (KHÔNG phân biệt hoa/thường) 1 op `updateMany({userSku ∈ actual}, {$set:{tier}})`
  qua bulkWrite (gán cho MỌI email trùng SKU); SKU không có → `skippedSkus`,
  **không tự tạo khách mới**.

### 5.2 `CustomerAssignmentService`
- `getConfig()` / `saveConfig(dto)` — validate 1 `customerId` không ở ≥ 2 xưởng
  (và không lặp trong cùng xưởng) → `BadRequest`. Lưu `system_configs`.
- `getImportOverride()`: nếu `!enabled` → `{ enabled:false, map:empty }`. Ngược lại
  fetch customers theo `customerIds`, dựng `Map<customerMatchKey, factoryId>`.

### 5.3 Hook trong `OrderService.importOrders`
- Trước vòng lặp: `const customerOverride = await customerAssignmentService.getImportOverride()`.
- Trong loop, sau đoạn map product config: nếu `enabled` & khớp
  `customerMatchKey(row.userSku, row.userEmail)` → `factoryId = forced`. Đoạn tính
  `factoryCount` / `data.factoryId` / `originalFactoryId` dùng `factoryId` đã ép.

## 6. Performance notes
- Config cache Redis 1h → đọc gần free ở hook import.
- Import: `getImportOverride` = 1 `getConfig` (cache) + 1 `find` customers (chỉ khi
  bật). Map dựng 1 lần, match O(1) mỗi dòng.
- Sync: 1 aggregate distinct + 1 bulkWrite upsert (nút bấm thủ công).

## 7. Permissions
- Cấu hình + customers CRUD: `@Auth([Admin])` (FE gate `role.manage`).
- Ép xưởng chạy server-side trong `importOrders` theo actor import.
