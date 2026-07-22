# Ưu tiên gán xưởng theo khách hàng — Function Description

> **File FE:** `apps/web/src/pages/settings/index.tsx` + `apps/web/src/components/settings/CustomerAssignmentConfig.tsx` + `apps/web/src/services/customer.ts` + `apps/web/src/services/customerAssignment.ts`
> **File BE:** `apps/api/src/modules/customer/` (entity + repository + service + controller + module) + `apps/api/src/modules/customer-assignment/` (service + controller + module) + `apps/api/src/modules/order/order.service.ts` → hook trong `importOrders`
> **Route:** `/adm/settings` (gate quyền `role.manage`)
> **API:** `GET/POST /v1/customers`, `POST /v1/customers/sync`, `GET/PUT /v1/customer-assignment/config`

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
| GET | `/v1/customer-assignment/config` | `@Auth([Admin])` | Lấy cấu hình |
| PUT | `/v1/customer-assignment/config` | `@Auth([Admin])` | Lưu (validate 1-khách-1-xưởng) |

Collection `customers`: `{ userSku, userEmail, source: 'sync'|'manual'|'register', password, fullName, phone, status }`,
**unique index `{ userSku: 1, userEmail: 1 }`**. Từ khi có Customer Portal
(xem [`CustomerPortal.md`](CustomerPortal.md)), bảng này dùng CHUNG cho cả
mục đích dedup gán xưởng VÀ tài khoản đăng nhập khách hàng — record tạo qua
sync/thêm tay có `password=''` (chưa đăng ký), `userSku` không còn bắt buộc
(khách tự đăng ký có thể chưa có lịch sử đơn hàng).

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
- Header + nút **Lưu**. Thanh công cụ: `ui/switch` bật/tắt + nút **Sync khách hàng** +
  nút **Thêm khách** (`ui/dialog` userSku + userEmail).
- Mỗi xưởng 1 card: `components/common/MultiSelectFilter` (popover search + checkbox,
  label `userSku · email`). Khách đã gán xưởng khác → **loại khỏi options** (đảm bảo
  1 khách 1 xưởng); khách của chính xưởng vẫn hiện để bỏ chọn.
- Stack FE thực tế là shadcn `ui/*` + lucide (KHÔNG dùng antd).
- **Lưu** → `saveConfig({ enabled, factories })` (chỉ gửi xưởng có ≥ 1 khách).

## 5. Backend logic

### 5.1 `CustomerService`
- `list(dto)`: filter `search` regex trên userSku/userEmail, sort userSku.
- `create(dto)`: normalize (email lowercase+trim); chặn trùng cặp → `BadRequest`;
  `source='manual'`.
- `sync()`: aggregate `orders` `$group` theo `{ userSku, $toLower(userEmail) }`
  (bỏ userSku rỗng) → `bulkWrite` upsert `$setOnInsert` (không đụng bản ghi cũ).

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
