# Products — Function Description

> **File FE:** `apps/web/src/pages/products/index.tsx`
> **File BE:** `apps/api/src/modules/product-config/`, `factory/`, `machine-type/`
> **Route:** `/products`
> **API:** `/v1/product-configs`, `/v1/factories`, `/v1/machine-types`

---

## 1. Overview

Module **Products** quản lý 3 entity liên quan đến cấu hình sản xuất:

- **Product Config** — map `fullName` (tên đầy đủ sản phẩm) → `factory` + `machineType` (phòng / loại máy in) + `machineNumber` (số máy) + default `fabricType` + default `toolResult`
- **Factory** — danh sách xưởng sản xuất (mặc định ML/TN/US)
- **Machine Type** — danh sách "Phòng" / loại máy in (ICL / IEN / HT…)

UI chia 2 tab:
- **Config tab** — CRUD product config + import từ Google Sheets + xóa toàn bộ
- **Xưởng tab** — CRUD factory & machine type (2 bảng chia đôi màn hình)

---

## 2. Tab `Config` (`apps/web/src/pages/products/ProductConfigTab.tsx`)

### 2.1 Tính năng
| Chức năng | Mô tả |
|-----------|-------|
| List | Bảng phân trang `limit=100`, sort theo `createdAt` desc |
| Search | Substring match `fullName` hoặc `shortName` (case-insensitive) |
| Filter | Query string `factoryId`, `machineTypeId` |
| Inline edit | Dropdown chọn `fabricType` + `toolResult` + `level` cho mỗi dòng, ô nhập `mockup` (URL, cột đầu) → PATCH `/v1/product-configs/:id` |
| **Mockup** | Cột **đầu tiên** — string URL ảnh; hiển thị thumbnail 56×56 (click mở tab mới) + ô `Input` sửa inline, lưu on-blur khi đổi |
| **Level** | Select 1 trong **10 level cố định** (`PRODUCT_LEVELS` ở shared) — badge màu gradient dễ→khó (xanh lá `#22C55E` → đỏ đậm `#7F1D1D`). Lưu ngay khi chọn |
| **Edit dialog** (`ProductConfigEditDialog.tsx`) | Nút ✏️ (`Pencil`) mỗi dòng mở modal chỉnh **mockup + level + fabricType + toolResult + guide** cùng lúc, bấm **Lưu** → 1 PATCH; có nút **Xóa sản phẩm** (destructive) ở footer. **Đây là nơi duy nhất sửa `guide`** (cột Hướng dẫn hiện **tạm ẩn** khỏi bảng). |
| **Hướng dẫn** (`guide`) | Free-text ghi chú/hướng dẫn sản phẩm — **cột trong bảng tạm ẩn**; chỉ sửa qua Edit dialog (textarea). |
| Delete (1 dòng) | Nút xóa ở bảng **tạm ẩn**, thay bằng nút Edit; xóa (soft delete `deletedAt`) chuyển vào **footer Edit dialog** |
| **Xóa tất cả** | Confirm → DELETE `/v1/product-configs/all` (hard-delete `deleteMany({})`) — dùng khi reset từ đầu |
| Import | Dialog paste 7 cột tab-separated → bulk upsert by `fullName` |

### 2.2 Schema `ProductConfigEntity`
```ts
{
  fullName: string;        // Tên đầy đủ (vd: "All-over Print Hockey Jersey"), unique key khi upsert
  shortName: string;       // Tên viết tắt uppercase
  machineNumber?: string;  // Số máy in (vd "94", "27"). Empty ⇒ sản phẩm không có tool
  factoryId: ObjectId;     // ref FactoryEntity (xưởng — vd Mê Linh / Thái Nguyên / US)
  machineTypeId: ObjectId; // ref MachineTypeEntity (phòng — loại máy in: ICL / IEN / HT)
  fabricType?: string;     // workshop_config code (category=fabric_type) — default fabric copy vào order
  toolResult?: string;     // workshop_config code (category=tool_result) — default tool status copy vào order
  mockup?: string;         // URL ảnh mockup — hiển thị cột đầu bảng config (thumbnail + edit inline)
  level?: number;          // Cấp độ 1..10 (PRODUCT_LEVELS ở shared) — badge màu gradient
  guide?: string;          // Hướng dẫn/ghi chú sản phẩm (free-text textarea)
}
```

> **Lưu ý:** `ProductConfigEntity` bị ràng buộc `assertSameType<ProductConfig, ProductConfigEntity>()` (2 chiều) — thêm field mới **BẮT BUỘC** sửa đồng bộ cả `packages/shared/dtos/product-config.dto.ts` (`ProductConfigZod` + Create/Update) lẫn entity, nếu không sẽ fail compile. `service.updateProductConfig` spread `...dto` nên field mới tự pass-through, không cần sửa service. 10 level cố định + màu định nghĩa ở `packages/shared/constants/product-level.ts` (`PRODUCT_LEVELS`, `PRODUCT_LEVEL_MAP`).

Cột `fabricType` + `toolResult` cho phép admin set sẵn loại vải / kết quả tool mặc định. Khi import order khớp `type` → product, BE auto-copy 2 cột này vào order (chỉ insert, không ghi đè), để Workshop view group được. UI bảng config có dropdown chọn fabric / tool inline.

### 2.3 Import flow (`ImportProductConfigDialog.tsx`)
```
User paste TSV vào textarea
  → parseRows() detect header bằng keyword ("Tên đầy đủ", "Phòng"…) → skip dòng đầu nếu match
  → Preview số dòng hợp lệ
  → Submit → POST /v1/product-configs/import
  → BE upsert by fullName → trả về { imported, updated, skipped[] }
  → Toast: "Imported X, updated Y, Z cảnh báo" + console.warn nếu có skip
```

Schema TSV (7 cột, tab-separated):
```
Tên đầy đủ | Tên viết tắt | Máy | Xưởng | Loại vải | Kết quả Tool | Phòng
```
- **Máy** (`machineNumber`) — vd "94", "27". Empty ⇒ default `toolResult = no-tool`. **Không khớp ⇒ auto-create** entry trong `workshop_config.machine` (code `machine-{slug}`, color xám `#6B7280`); ProductConfig lưu workshop_config code. FE resolve code → name + color qua `workshopConfigStore` để render badge.
- **Xưởng** (`factoryLabel`) — match `FactoryService.findByLabel()`: tolerant với prefix "Xưởng " và case (vd "MÊ LINH" match "Xưởng Mê Linh"). Match shortName trước, fallback regex name.
- **Loại vải** (`fabricLabel`) — match `workshop_config` (category=fabric_type) qua `name` case-insensitive. **Không khớp ⇒ auto-create** entry mới (slugified code, icon `Shirt`, isActive=true) rồi gán cho product. Sau import FE force-reload `workshopConfigStore` để dropdown thấy fabric mới.
- **Kết quả Tool** (`toolResultLabel`) — match workshop_config (category=tool_result). Empty ⇒ default `has-tool` nếu Máy có giá trị. Empty + Máy trống ⇒ default `no-tool`.
- **Phòng** (`departmentLabel`) — match `MachineTypeService.findByLabel()`: shortName trước, fallback name case-insensitive (vd "IN và CẮT LASER" match "In và cắt laser"). Không khớp ⇒ skip dòng.

---

## 3. Tab `Xưởng` (`apps/web/src/pages/products/FactoryTab.tsx`)

### 3.1 Layout
3 bảng xếp dọc (`space-y-6`):
- **Xưởng** (Factory) — CRUD shortName/name/isActive
- **Loại máy** (MachineType / Phòng) — CRUD shortName/name/isActive
- **Loại vải** (Fabric — workshop_config category=fabric_type) — CRUD code/name/icon/isActive, dùng `IconPicker` và slugify tự động. Sync `workshopConfigStore`. Đây là **cùng dataset** với tab Loại vải ở trang Workshop Config, đặt ở đây để admin tiện thao tác sau khi import. Có nút **"Reset từ seed"** → `POST /v1/workshop-config/reset/fabric_type` hard-delete toàn bộ category rồi re-insert 22 fabric từ `WORKSHOP_CONFIG_SEED` (POLY 2 DA, MÈ 64, LỤA 4B, LỤA VÂN GỖ, THUN LẠNH, NỈ BÔNG, MÈ CARO, LỤA NGỌC TRAI, LƯỚI, THÔ MỘC, LỤA, CANVAS, THUN BỘT, PHI BÓNG, 60% COTTON 40% POLY, LÔNG- CHĂN, ÁO: LỤA 4B- QUẦN: MÈ CARO, VẢI MÈ MỚI, MIX VẢI + LƯỚI, MÈ CA SẤU, THÊU, GIẢ LEN).

### 3.2 Factory CRUD
| Field | Type | Validation |
|-------|------|------------|
| `name` | string | Required, trim |
| `shortName` | string | Required, uppercase, unique |
| `isActive` | boolean | Default true (switch toggle) |

### 3.3 MachineType CRUD
| Field | Type | Validation |
|-------|------|------------|
| `name` | string | Required, trim |
| `shortName` | string | Required, uppercase, unique |
| `isActive` | boolean | Default true |

### 3.4 Auto-seed
Khi BE khởi động, `FactoryService.onModuleInit()` + `MachineTypeService.onModuleInit()` insert các bản ghi mặc định nếu **shortName chưa tồn tại** (per-record check, không check total). Mặc định:
- **Factory:** PT, ZK, GG
- **MachineType:** DTG, DTF, EMB, SUB

---

## 4. Backend Modules

### 4.1 `product-config/`
| File | Mô tả |
|------|-------|
| `product-config.entity.ts` | Schema + virtual `factory`, `machineType` |
| `product-config.repository.ts` | Extends `DatabaseRepositoryAbstract` |
| `product-config.service.ts` | Logic CRUD + `bulkUpsert()` |
| `product-config.controller.ts` | 6 endpoints: list / create / update / delete / import / lookup-by-type |

### 4.2 `factory/` & `machine-type/`
- Cùng pattern: entity + repo + service + controller
- Service có method `findByShortName()` để Product Config resolve trong import flow
- `findByShortName()` được cache (Redis TTL 5 phút) vì lookup nhiều khi import

### 4.3 Cache
- Key: `factories:all`, `machineTypes:all`, `productConfigs:type:{shortName}`
- Invalidate khi create/update/delete

---

## 5. API endpoints

### 5.1 Product Config
| Method | Path | Body / Query | Mô tả |
|--------|------|--------------|-------|
| GET | `/v1/product-configs` | `?page&limit&search&factoryId&machineTypeId` | List + filter |
| POST | `/v1/product-configs` | CreateProductConfigDto | Tạo |
| PATCH | `/v1/product-configs/:id` | UpdateProductConfigDto | Update |
| DELETE | `/v1/product-configs/:id` | — | Soft delete 1 dòng |
| DELETE | `/v1/product-configs/all` | — | Hard delete toàn bộ (SuperAdmin/Admin) — trả về `{ removed }` |
| POST | `/v1/product-configs/import` | `{ rows: [] }` | Bulk upsert by fullName |

### 5.2 Factory & MachineType
| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/v1/factories` | List all (cache) |
| POST | `/v1/factories` | Create |
| PATCH | `/v1/factories/:id` | Update |
| DELETE | `/v1/factories/:id` | Soft delete |
| GET | `/v1/machine-types` | List all (cache) |
| POST | `/v1/machine-types` | Create |
| PATCH | `/v1/machine-types/:id` | Update |
| DELETE | `/v1/machine-types/:id` | Soft delete |

---

## 6. Quan hệ với Order module

Khi `importOrders()` chạy, mỗi order sẽ:
1. Lookup `ProductConfig` theo `type` (shortName)
2. Nếu match → set `productConfigId`, `factoryId`, `machineTypeId` từ config + `isMapped=true`
3. Nếu không match → `isMapped=false`, frontend hiển thị badge "Chưa map"

Tỉ lệ map tốt là tiền đề cho:
- Dashboard `byFactory` chia chính xác
- Workflow điều phối xưởng đúng

---

## 7. Permissions

| Role | Truy cập |
|------|----------|
| Admin | ✅ full CRUD |
| Manager | ✅ full CRUD |
| User thường | ❌ |
