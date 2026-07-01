# Plan: Hủy đơn + Đổi design (Admin) — menu "..." mỗi hàng

> **Trạng thái:** CHƯA implement — chờ confirm.
> **Yêu cầu gốc:** Mỗi đơn ở MỌI bảng có nút **"..."** (sticky cuối hàng, **chỉ Admin**) → 2 action **Đổi design** + **Hủy đơn**, mỗi cái mở **dialog** để user thấy rõ.

---

## 0. Quyết định đã chốt (từ hỏi–đáp)

| Điểm | Chốt |
|---|---|
| "Đổi design" nghĩa là | Đổi **URL file design + mockup**; dialog chỉ hiện **các vị trí design đơn ĐANG CÓ** + mockup |
| Lưu URL | Ghi thẳng URL raw mới; **giữ URL cũ trong OrderLog** (before/after) để tra lại qua "Lịch sử đơn" |
| Điều kiện HỦY ("chưa vào in") | Đã vào In nhưng **chưa bắt đầu in** vẫn hủy được; **chặn** khi: đang in / đã in / qua In sang stage sau / **cần làm lại (rework)** |
| Đơn sau khi hủy | **Vẫn hiện** trong mọi bảng + **badge "Đã hủy" + row mờ**; **KHÔNG loại** khỏi thống kê/filter (đếm bình thường ở mọi bảng) |
| Phạm vi | **Tất cả bảng** (table + card list), **chỉ Admin** |

### Quy tắc `canCancelOrder(order)`
```
ok = !order.cancelledAt
  && order.designerStatus !== 'rework'
  && (
       !order.currentFulfillmentStage
       || (order.currentFulfillmentStage === 'print'
           && order.fulfillmentStages?.print?.status === 'waiting')
     )
```
- **Cho hủy:** chưa vào pipeline In, HOẶC đang ở In trạng thái `waiting` (chưa bấm Bắt đầu).
- **Chặn:** `print` in-progress/done/rework · currentFulfillmentStage ≠ print (đã qua In) · `designerStatus='rework'` (cần làm lại) · đã hủy sẵn.
- Lý do chặn (message trả về / tooltip FE): map theo nhánh fail để hiện đúng ("Đơn đang in", "Đã qua In", "Đơn cần làm lại", "Đơn đã hủy").
- **1 nguồn sự thật:** viết hàm này ở BE (`order.service.ts`) VÀ 1 bản mirror ở FE util (`apps/web/src/utils/orderActions.ts`) — comment link 2 nơi để sync.

---

## 1. Backend

### 1.1 Shared DTO (`packages/shared/dtos/production-order.dto.ts`)
- **Thêm vào `ProductionOrderZod`** (response) — HIỆN CHƯA CÓ:
  ```ts
  cancelledAt: z.date().optional(),
  cancelReason: z.string().optional(),
  ```
  (đặt cạnh `status`). → FE nhận để render badge.
- **Cancel DTO:**
  ```ts
  export const CancelOrderZod = z.object({ reason: z.string().min(1).max(200) });
  export class CancelOrderDto extends createZodDto(extendApi(CancelOrderZod)) {}
  export const CancelOrderResZod = ResZod.extend({ data: ProductionOrderZod });
  export class CancelOrderResDto extends createZodDto(extendApi(CancelOrderResZod)) {}
  ```
- **Đổi design DTO:**
  ```ts
  export const UpdateOrderDesignZod = z.object({
    mockupUrl: z.string().max(2000).optional(),
    designs: DesignFieldsZod.partial().optional(),   // chỉ các vị trí gửi lên
  });
  export class UpdateOrderDesignDto extends createZodDto(extendApi(UpdateOrderDesignZod)) {}
  // res reuse ProductionOrderZod
  ```

### 1.2 OrderLog action enum (`packages/shared/dtos/order-log.dto.ts`)
- Thêm 2 action: `ORDER_LOG_ACTIONS = [..., 'transfer', 'cancel', 'update_design']`.
- `OrderLogTimelineDialog.tsx` (FE): thêm nhãn + màu cho 2 action mới (map render).
- *(Phương án nhẹ hơn nếu không muốn đụng enum: reuse `action='update'` với `field='cancelledAt'` / `field='designs'`. Nhưng thêm action rõ ràng hơn cho audit → khuyến nghị thêm.)*

### 1.3 Service (`apps/api/src/modules/order/order.service.ts`)
- **`canCancelOrder(order): { ok: boolean; reason?: string }`** (private helper, theo quy tắc §0).
- **`cancelOrder(id, dto: CancelOrderDto, ctx: AuditContext): Promise<OrderDocument>`**
  1. `findById` → 404 nếu không có.
  2. `canCancelOrder` → `BadRequestException(reason)` nếu `!ok`.
  3. `findByIdAndUpdate $set { cancelledAt: new Date(), cancelReason: dto.reason }` `{ new: true }`.
  4. `orderLogService.write({ orderId, action:'cancel', field:'cancelledAt', before:null, after:<now>, note: dto.reason, ctx })`.
  5. `invalidateListCache()`.
- **`updateOrderDesign(id, dto: UpdateOrderDesignDto, ctx): Promise<OrderDocument>`**
  1. `findById` → 404.
  2. Build `$set`:
     - `dto.mockupUrl` != null → `mockupUrl = mockupOriginalUrl = dto.mockupUrl` (raw).
     - mỗi key trong `dto.designs` → `designs.<k> = designsOriginal.<k> = value` (raw, KHÔNG qua R2 — theo chốt "lưu thẳng url").
  3. Capture `before` = giá trị cũ (mockupUrl + các designs.<k> bị đổi) để log.
  4. `findByIdAndUpdate $set ...`.
  5. `orderLogService.write({ action:'update_design', field:'designs', before, after, ctx })` → **URL cũ nằm ở đây**.
  6. `invalidateListCache()`.
- **KHÔNG** đụng bất kỳ filter/aggregation nào để loại `cancelledAt` (chốt: đếm cả đơn hủy).

### 1.4 Controller (`apps/api/src/modules/order/order.controller.ts`)
```ts
@Post(':id/cancel')
@Auth([RoleType.SuperAdmin, RoleType.Admin])
@ApiOperation({ summary: 'Cancel order (chỉ khi chưa bắt đầu in)' })
async cancelOrder(@Param('id') id, @Body() dto: CancelOrderDto, @AuthUser() user, @ClientIp() ip, @UserAgent() ua)

@Patch(':id/design')
@Auth([RoleType.SuperAdmin, RoleType.Admin])
@ApiOperation({ summary: 'Đổi URL design/mockup' })
async updateOrderDesign(@Param('id') id, @Body() dto: UpdateOrderDesignDto, @AuthUser() user, ...)
```
- Logging Winston bắt buộc (theo convention controller).
- Response `{ success: true, data }`.

---

## 2. Frontend

### 2.1 Util mirror (`apps/web/src/utils/orderActions.ts`) — MỚI
- `canCancelOrder(row): { ok: boolean; reason?: string }` — mirror BE (§0). Dùng cho disable + tooltip trong menu.
- `isCancelled(row): boolean` = `!!row.cancelledAt`.

### 2.2 Component `OrderRowActionsMenu.tsx` — MỚI (`apps/web/src/components/orders/`)
- Props: `{ order: WorkshopOrderRow; onChanged: () => void }`.
- Gate: `const { isAdmin } = usePermission(); if (!isAdmin) return null;`
- Render `DropdownMenu` (shadcn có sẵn) trigger nút `MoreHorizontal` (lucide, `size=16`, `variant=ghost`).
- Items:
  - **Đổi design** → mở `EditOrderDesignDialog`.
  - **Hủy đơn** → mở `CancelOrderDialog`. Nếu `!canCancelOrder(order).ok` → item **disabled** + tooltip `reason`.
- State dialog nội bộ component.

### 2.3 `CancelOrderDialog.tsx` — MỚI
- Hiện: productionId + type + size/color (đọc thông tin đơn).
- `Textarea` lý do (bắt buộc, ≤200, hiển thị đếm ký tự).
- Nút "Hủy đơn" (destructive) → `RepositoryRemote.order.cancelOrder(id, { reason })` → toast success + `onChanged()` + đóng. `handleAxiosError` khi lỗi.

### 2.4 `EditOrderDesignDialog.tsx` — MỚI
- Fetch/nhận order → liệt kê **chỉ các key có trong `order.designs`** (vị trí đang có) + 1 field **Mockup**.
- Mỗi field = `Input` prefill URL hiện tại (mockup từ `mockupOriginalUrl`, design từ `designsOriginal.<k>` fallback `designs.<k>`).
- Ghi chú nhỏ: "URL cũ được lưu trong Lịch sử đơn".
- Nút Lưu → chỉ gửi field có thay đổi → `RepositoryRemote.order.updateOrderDesign(id, { mockupUrl?, designs? })` → toast + `onChanged()`.
- (Optional) preview ảnh mới qua `ImagePreviewDialog` — có thể thêm sau.

### 2.5 Services (`apps/web/src/services/order.ts`)
```ts
const cancelOrder = (id, data /* {reason} */) => callApi(`/${CONFIG.API_VERSION}/orders/${id}/cancel`, 'post', data);
const updateOrderDesign = (id, data) => callApi(`/${CONFIG.API_VERSION}/orders/${id}/design`, 'patch', data);
// export trong object `order`
```

### 2.6 Gắn cột action + badge vào từng bảng

**Cột action sticky phải** — thêm 1 `<TableHead>` cuối (className `sticky right-0 z-30 bg-card w-10`) + `<TableCell>` cuối mỗi row (`sticky right-0 z-10 <rowBg>`) render `<OrderRowActionsMenu order={row} onChanged={refetch}/>`. Chỉ thêm khi `isAdmin` (ẩn cả cột nếu không phải admin để không chiếm chỗ).

**Badge "Đã hủy" + row mờ** — helper class `CANCELLED_ROW_CLASS = 'opacity-50'` + badge đỏ "Đã hủy" ở cell productionId (hoặc cột đầu). Áp trong resolve `rowBgClass`/render từng bảng (giống pattern `NO_TOOL_ROW_CLASS`).

| Bảng | File | Cách gắn |
|---|---|---|
| Bảng Workshop | `apps/web/src/pages/orders/OrderTableWorkshop.tsx` | Thêm head/cell sticky phải (đã có sticky trái sẵn) + badge |
| Tab C (theo xưởng) | `apps/web/src/pages/home/OrderFactoryTab.tsx` | Tương tự (reuse `WORKSHOP_COLS`) |
| Nhật ký bù lỗi | `apps/web/src/pages/orders/ErrorLogTab.tsx` | Tương tự |
| Mini list (Tab B) | `apps/web/src/pages/home/status/OrdersMiniTable.tsx` | Tương tự (bảng nhỏ) |
| Trang In (Fulfillment) | `apps/web/src/pages/fulfillment/my-tasks/PrintOrderTable.tsx` | Đã có `extraRowAction` sticky phải → render thêm `OrderRowActionsMenu` cạnh action In hiện có (hoặc gộp) |
| List Order (card) | `apps/web/src/pages/orders/ListOrderTab.tsx` | Nút "..." góc trên-phải mỗi card (không phải table) + badge "Đã hủy" |

> Lưu ý reuse: 4 bảng đầu + PrintOrderTable đều là `<table>`. Có thể bọc chung 1 helper render cột action để đỡ lặp, nhưng mỗi bảng có cấu trúc row riêng → chấp nhận thêm ~5 dòng/ bảng.

---

## 3. Permissions
- Cả 2 endpoint: `@Auth([SuperAdmin, Admin])`.
- FE: menu chỉ render khi `usePermission().isAdmin`. Không thêm permission catalog mới (dùng role gate cho gọn) — *nếu muốn granular hơn sau này thì thêm `order.cancel` / `order.edit_design` vào catalog.*

---

## 4. Edge cases / lưu ý
- **Đơn đã hủy** vẫn cho "Đổi design"? → **KHÔNG** (menu "Đổi design" cũng nên disable khi `isCancelled`). Hoặc cho phép? → **chốt: disable cả 2 action khi đã hủy** (đơn hủy read-only). *(nếu muốn cho sửa design đơn đã hủy thì bỏ gate — cần confirm)*
- Cancel là **soft** (set `cancelledAt`), KHÁC `deleteOrder` (soft delete `deletedAt`, đã có sẵn, Admin). Không đụng deleteOrder.
- `designs` là nested object → `$set` theo dotted path `designs.front` an toàn (giống các hook khác).
- Cache list: invalidate sau cancel/đổi design.
- Badge cần `row.cancelledAt` có trong response → phụ thuộc mục §1.1 (thêm vào ProductionOrderZod).

---

## 5. Thứ tự triển khai (khi được confirm)
1. Shared: `ProductionOrderZod` (+cancelledAt/cancelReason) + `CancelOrderDto` + `UpdateOrderDesignDto` + `ORDER_LOG_ACTIONS` (+2). → `pnpm --filter shared build`.
2. BE: `canCancelOrder` + `cancelOrder` + `updateOrderDesign` + 2 controller endpoints.
3. FE util `orderActions.ts` + services + 3 component (Menu, CancelDialog, EditDesignDialog).
4. Gắn cột action + badge vào 6 bảng.
5. Doc `Orders.md` (mục mới + Feature mapping) + `OrderLog.md` (2 action mới).
6. Typecheck `apps/api` (`tsconfig.build.json`) + `apps/web` (`--noEmit`).

## 6. Deploy
- **Có đổi `shared`** → build lại shared + api + web, restart API + PM2 (không chỉ web).

## 7. Sau khi làm xong
Xóa file plan này (hoặc note DONE).
