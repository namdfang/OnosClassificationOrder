# Order Log — Function Description

> **File BE:** `apps/api/src/modules/order-log/` (`entity`, `repository`, `service`, `module`)
> **File FE:** `apps/web/src/components/orders/OrderLogTimelineDialog.tsx`
> **Shared:** `packages/shared/dtos/order-log.dto.ts`
> **API:** `GET /v1/orders/:id/logs`
> **Trigger:** mọi mutation trên Order module (Phase 3)

---

## 1. Overview

Audit trail cho mọi thay đổi trên `OrderEntity`. Mỗi log record bao gồm:
- ai (userId + snapshot fullName/email/roleCode)
- khi nào (createdAt từ BaseEntity)
- hành động (`create | update | delete | import | bulk_update`)
- thay đổi gì (field + before/after)
- nơi xuất phát (ip + userAgent)

Mục tiêu: forensic — không xóa, không TTL (volume xưởng nhỏ, cần dữ liệu lịch sử dài hạn).

---

## 2. Schema `OrderLogEntity`

```ts
@DatabaseEntity({ collection: 'orderLogs' })
{
  orderId: string;          // ref OrderEntity, index
  userId?: string;          // ref UserEntity, index
  userName?: string;        // snapshot fullName
  userEmail?: string;       // snapshot email
  roleCode?: string;        // snapshot role.name (vd 'Designer'), index
  action: 'create' | 'update' | 'delete' | 'import' | 'bulk_update';  // index
  field?: string;           // field name khi update/bulk_update, index
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
  // createdAt từ BaseEntity
}
// Compound index: { orderId: 1, createdAt: -1 } — phục vụ timeline query
```

> User info được **snapshot** (copy giá trị tại thời điểm thay đổi) thay vì chỉ lưu `userId`, để timeline vẫn đọc được sau khi user bị đổi tên / xóa.

---

## 3. Service `OrderLogService`

| Method | Mục đích |
|--------|----------|
| `write({ orderId, action, field?, before?, after?, ctx? })` | Ghi 1 row. Try-catch nuốt lỗi (logging không bao giờ block user action). |
| `writeMany(rows)` | Bulk insert (import / bulk_update). |
| `listByOrder(orderId, dto)` | Query logs theo orderId + filter `action` / `field` + paginate, sort `createdAt desc`. |

`AuditContext` truyền vào `write` từ controller:
```ts
type AuditContext = {
  user?: UserDocument;     // @AuthUser()
  ip?: string;             // @ClientIp()
  userAgent?: string;      // @UserAgent()
}
```

---

## 4. Mọi điểm gọi `write` / `writeMany`

| Mutation | Action | Body log |
|----------|--------|----------|
| `OrderService.deleteOrder(id, ctx)` | `delete` | không có field/before/after |
| `OrderService.updateField(id, dto, role, ctx)` | `update` | `{ field, before: orderCũ[field], after: newValue }` |
| `OrderService.bulkUpdateField(dto, role, ctx)` | `bulk_update` | 1 row per matched order, mỗi row có `before/after` riêng |
| `OrderService.importOrders(dto, ctx)` | `import` | 1 row per inserted/updated order. `after = { productionId, type, isMapped, _subAction: 'create'|'update' }` |

Trong mọi case, log push **fire-and-forget** (`void`) để không chặn response.

---

## 5. Endpoint

`GET /v1/orders/:id/logs?page=1&limit=200&action=&field=&sort=createdAt&order=desc`

| Quyền | Role |
|-------|------|
| Xem log | SuperAdmin / Admin / Manager / Support |
| Designer / Fulfillment | ❌ (chỉ thấy log của đơn họ đang xử lý — sẽ cấp permission `order.log.view` ở Phase 0 RBAC nếu cần) |

Response: `{ success, data: ProductionOrderLog[], total }`

---

## 6. Frontend `OrderLogTimelineDialog`

### 6.1 Props
```ts
{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId?: string;       // _id của order
  productionId?: string;  // hiển thị trong tiêu đề
}
```

### 6.2 UI
- shadcn `Dialog` max-w-2xl.
- Header: icon `History` + `Lịch sử thay đổi — {productionId}`.
- Subhead: số bản ghi + nút "Tải lại".
- Body: `<ol>` timeline có thanh trục dọc (border-l) + dot ở mỗi entry.
- Mỗi entry:
  - Badge action (`Tạo` / `Cập nhật` / `Bulk` / `Import` / `Xóa`).
  - Tên field (label tiếng Việt từ map `FIELD_LABEL`).
  - Diff `before → after` (mã hex strikethrough đỏ + giá trị mới xanh).
  - Footer: `userName · roleCode · ip`.
  - Timestamp định dạng `vi-VN`.
- Auto-fetch khi `open=true`, clear logs khi đóng.

### 6.3 Cách gọi
Trong `ListOrderTab.tsx`, mỗi row có nút icon `History`:
```tsx
<Hint content="Lịch sử thay đổi">
  <Button variant="ghost" size="icon" onClick={() => onHistory(it._id, it.productionId)}>
    <History size={14} />
  </Button>
</Hint>
```
Khi user click → `openHistory(id, productionId)` set state → dialog mở → fetch.

---

## 7. Performance notes

- Endpoint dùng compound index `(orderId, createdAt: -1)` — query timeline 1 đơn rất nhanh kể cả khi orderLogs collection lớn.
- Audit write fire-and-forget → không tăng latency API mutation.
- Bulk update / import dùng `writeMany` (1 `insertMany`) thay vì N round-trips.

---

## 8. Liên hệ

| Module | Mối quan hệ |
|--------|-------------|
| Order | OrderService inject `OrderLogService` qua `OrderLogModule`. Mọi mutation phải gọi log. |
| Auth | `@AuthUser()`, `@ClientIp()`, `@UserAgent()` cung cấp `AuditContext`. |
| RBAC (Phase 0) | Sẽ thay role-array trong controller bằng permission `order.log.view`. |
| OrderTableWorkshop (Phase 4) | Sẽ tái dùng `OrderLogTimelineDialog` — cùng signature. |
