# Products — Function Description

> **File FE:** `apps/web/src/pages/products/index.tsx`
> **File BE:** `apps/api/src/modules/product-config/`, `factory/`, `machine-type/`
> **Route:** `/products`
> **API:** `/v1/product-configs`, `/v1/factories`, `/v1/machine-types`

---

## 1. Overview

Module **Products** quản lý 3 entity liên quan đến cấu hình sản xuất:

- **Product Config** — map `shortName` (SKU type) → `factory` + `machineType` + `computerType`
- **Factory** — danh sách xưởng sản xuất (PT, ZK, GG...)
- **Machine Type** — danh sách loại in / loại máy (DTG, DTF, EMB, SUB...)

UI chia 2 tab:
- **Config tab** — CRUD product config + import từ Google Sheets
- **Xưởng tab** — CRUD factory & machine type (2 bảng chia đôi màn hình)

---

## 2. Tab `Config` (`apps/web/src/pages/products/ProductConfigTab.tsx`)

### 2.1 Tính năng
| Chức năng | Mô tả |
|-----------|-------|
| List | Bảng phân trang `pageSize=20`, sort theo `createdAt` desc |
| Search | Substring match `shortName` (uppercase) |
| Filter | Dropdown factory + machineType |
| Create | Dialog form: `fullName`, `shortName`, `computerType`, `factoryId`, `machineTypeId` |
| Edit | Click row → mở dialog cùng form, prefilled |
| Delete | Confirm dialog → soft delete (`deletedAt`) |
| Import | Dialog paste data từ Google Sheets (tab-separated) → bulk upsert by `shortName` |

### 2.2 Schema `ProductConfigEntity`
```ts
{
  fullName: string;       // Tên đầy đủ (vd: "Unisex T-Shirt - Cotton 200gsm")
  shortName: string;      // SKU type uppercase, unique (vd: "UNI-TSHIRT-COT200")
  computerType?: string;  // Loại máy tính/tool (optional)
  factoryId: ObjectId;    // ref FactoryEntity
  machineTypeId: ObjectId;// ref MachineTypeEntity
  fabricType?: string;    // workshop_config code (category=fabric_type) — default fabric for orders mapping vào sản phẩm này
}
```

Cột `fabricType` cho phép admin set sẵn loại vải mặc định cho mỗi product. Khi import order khớp `type` → product, BE auto-copy `fabricType` vào order, để tab "Tổng hợp đơn theo ngày" group được. UI bảng config có dropdown chọn fabric inline (lưu PATCH `/v1/product-configs/:id`).

### 2.3 Import flow (`ImportProductConfigDialog.tsx`)
```
User paste TSV vào textarea
  → parseRows() chia tab + dòng, validate header
  → Preview table (10 dòng đầu)
  → Submit → POST /v1/product-configs/import
  → BE upsert by shortName → trả về { created, updated, skipped[] }
  → Toast: "Đã tạo X / cập nhật Y / bỏ qua Z"
```

Schema TSV chấp nhận (header bắt buộc):
```
fullName | shortName | computerType | factory | machineType
```
- `factory` / `machineType` nhập **shortName** (BE tự lookup ObjectId)
- Nếu factory/machineType chưa tồn tại → skip + log lý do

---

## 3. Tab `Xưởng` (`apps/web/src/pages/products/FactoryTab.tsx`)

### 3.1 Layout
Chia đôi grid 2 cột:
- **Trái:** bảng Factory
- **Phải:** bảng MachineType

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
| GET | `/v1/product-configs` | `?page&pageSize&search&factoryId&machineTypeId` | List + filter |
| POST | `/v1/product-configs` | CreateProductConfigDto | Tạo |
| PATCH | `/v1/product-configs/:id` | UpdateProductConfigDto | Update |
| DELETE | `/v1/product-configs/:id` | — | Soft delete |
| POST | `/v1/product-configs/import` | `{ rows: [] }` | Bulk upsert by shortName |
| GET | `/v1/product-configs/by-type/:type` | — | Resolve khi mapping order |

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
