# Từ điển dữ liệu cho AI agent

> Bảng nào dùng để trả lời câu hỏi gì, trường nào nghĩa là gì, và tra thế nào.
> Đọc kèm [`ImportantNotes.md`](ImportantNotes.md) — không có nó thì mọi con số bạn đếm ra đều có nguy cơ sai.

---

## 0. Cách gọi

Ba năng lực, dưới `/api/v1/agent`, đều cần header `X-Agent-Api-Key`:

| Gọi gì | Dùng khi |
|---|---|
| `GET /agent/tables` | Xem đọc được những bảng nào |
| `GET /agent/tables/:table/rows?limit=&cursor=` | Đọc thô, phân trang theo con trỏ |
| `POST /agent/query` | Lọc, sắp xếp, đếm, nhóm, tổng hợp — **dùng cái này là chính** |
| `GET /agent/docs` · `GET /agent/docs/:slug` | Danh mục tài liệu và nội dung từng file |

Hình dạng của `POST /agent/query`:

```jsonc
{
  "table": "orders",
  "filter": { "and": [ { "field": "userSku", "op": "eq", "value": "ABC" } ] },
  "select":    { "fields": ["productionId", "currentFulfillmentStage"], "sort": [{ "field": "inProductionAt", "dir": "desc" }], "limit": 20 },
  "aggregate": { "groupBy": ["currentFulfillmentStage"], "metrics": [{ "op": "count", "as": "n" }] }
}
```

`select` và `aggregate` **loại trừ nhau**. Toán tử lọc: `eq · ne · in · nin · gt · gte · lt · lte · between · exists · startsWith`. Metric: `count · sum · avg · min · max`.

Lô mặc định 50 dòng, trần 200 — xin nhiều hơn thì bị kẹp xuống trần và `meta.limitApplied` cho biết mức thực tế.

---

## 1. `orders` — đơn sản xuất

**Bảng chính.** Gần như mọi câu hỏi "đơn của tôi thế nào" đều bắt đầu ở đây.

| Trường | Nghĩa |
|---|---|
| `productionId` | Mã đơn khách dùng để tra — **khoá tra chính** |
| `userSku` | Mã tài khoản khách; nối sang `customers.userSku` |
| `userEmail` | **Lọc được, không đọc được.** Dùng khi bạn đã biết email từ cuộc trò chuyện |
| `type` | Tên sản phẩm dạng chữ, khớp `productConfigs.fullName` |
| `color`, `size`, `quantity`, `printMethod` | Thuộc tính đơn |
| `status` | Trạng thái từ hệ thống nguồn — **không** phải trạng thái sản xuất |
| `designerStatus` | `unassigned` · `assigned` · `in-progress` · `done` · `rework` |
| `currentFulfillmentStage` | Công đoạn xưởng hiện tại; **rỗng có hai nghĩa** — xem `ImportantNotes.md` §3 |
| `fulfillmentCompletedAt` | Có giá trị = đã xong Đóng hàng |
| `cancelledAt` / `cancelReason` | Có giá trị = **đã hủy**, bị loại khỏi mọi thống kê |
| `heldAt` / `holdReason` | Có giá trị = **đang bị giữ**, không chạy tiếp |
| `factoryId` | Xưởng; **rỗng = chưa gán xưởng**, bị loại mặc định |
| `inProductionAt` | Ngày vào sản xuất — trục thời gian của hầu hết thống kê |
| `toolResult`, `productionError`, `errorFile` | **Mã**, tra nghĩa ở `workshopConfigs` |
| `*Note` | Ghi chú gõ tay; email/điện thoại đã bị che. **Không lọc được** |
| `priority` | Mức ưu tiên |

**Không có ở đây:** địa chỉ giao, tiền, tên người xử lý. Xem `ImportantNotes.md` §2.

### Ví dụ

**"Đơn XQ-91783-27005 của tôi đang ở đâu?"**

```jsonc
{ "table": "orders",
  "filter": { "field": "productionId", "op": "eq", "value": "XQ-91783-27005" },
  "select": { "fields": ["productionId","status","designerStatus","currentFulfillmentStage",
                         "fulfillmentCompletedAt","heldAt","holdReason","cancelledAt","factoryId"] } }
```

Đọc kết quả theo thứ tự: `cancelledAt` có giá trị → đơn đã hủy. `heldAt` có giá trị → đang bị giữ, nói lý do. `fulfillmentCompletedAt` có giá trị → đã xong. Còn lại → nói công đoạn hiện tại.

**"Tôi còn bao nhiêu đơn chưa xong?"**

```jsonc
{ "table": "orders",
  "filter": { "and": [
    { "field": "userSku", "op": "eq", "value": "ABC" },
    { "field": "cancelledAt", "op": "exists", "value": false },
    { "field": "factoryId", "op": "exists", "value": true },
    { "field": "fulfillmentCompletedAt", "op": "exists", "value": false } ] },
  "aggregate": { "groupBy": ["currentFulfillmentStage"], "metrics": [{ "op": "count", "as": "n" }] } }
```

---

## 2. `orderLogs` — nhật ký thao tác trên đơn

Dùng để kể lại **đơn đã đi qua những chặng nào, lúc nào**. Không có danh tính người thực hiện — đó là chủ ý, không phải thiếu dữ liệu.

| Trường | Nghĩa |
|---|---|
| `orderId` | Trỏ tới `orders._id` |
| `action` | Loại thao tác: `import`, `update`, `hold`, `unhold`, ... |
| `field` | Tên trường bị đổi |
| `before` / `after` | Giá trị cũ/mới — **chỉ có** với các trường tình trạng sản xuất được phép |
| `valueOmitted: true` | Giá trị bị lược có chủ ý, **không phải** giá trị rỗng |

**"Đơn tôi có bị làm lại lần nào không?"**

```jsonc
{ "table": "orderLogs",
  "filter": { "and": [ { "field": "orderId", "op": "eq", "value": "<orders._id>" },
                       { "field": "field", "op": "in", "value": ["productionError","toolResult","printStatus"] } ] },
  "select": { "sort": [{ "field": "createdAt", "dir": "asc" }], "limit": 50 } }
```

---

## 3. `customers` — tài khoản khách

`userSku` và `fullName` đọc được (để gọi đúng tên khách). `userEmail` và `phone` chỉ **lọc** được.

**"Tôi là ai trong hệ thống?"** — có email từ cuộc trò chuyện:

```jsonc
{ "table": "customers",
  "filter": { "field": "userEmail", "op": "eq", "value": "khach@example.com" },
  "select": { "fields": ["_id","userSku","fullName","tier","status"] } }
```

Lấy `userSku` rồi dùng nó để tra đơn ở bảng `orders`.

---

## 4. `productConfigs` — sản phẩm và biến thể

| Trường | Nghĩa |
|---|---|
| `fullName` | Tên sản phẩm, khớp `orders.type` |
| `printArea` | Danh sách mã vị trí in |
| `maxProductionTime` / `maxShippingTime` | Cam kết sản xuất / giao (ngày) |
| `variations.sku` / `variations.attributes` | Biến thể |
| `variations.retailPrice` | **Giá niêm yết — trường giá duy nhất trả về** |

Mọi trường giá khác (giá vốn, giá sỉ, giá sàn) đều không tồn tại đối với bạn.

**"Sản phẩm Hoodie có những size nào, giá bao nhiêu?"**

```jsonc
{ "table": "productConfigs",
  "filter": { "field": "fullName", "op": "startsWith", "value": "Hoodie" },
  "select": { "fields": ["fullName","variations.sku","variations.attributes","variations.retailPrice"] } }
```

---

## 5. `workshopConfigs` — bảng tra nghĩa các mã

**Bảng quan trọng thứ hai sau `orders`.** Mọi mã trên đơn đều dịch ở đây.

| Trường | Nghĩa |
|---|---|
| `category` | Nhóm mã: `production_error`, `error_file_type`, `fabric_type`, `machine`, ... |
| `code` | Mã lưu trên đơn |
| `name` | Tên đọc được |
| `errorSource` | Nguồn lỗi: `designer` · `factory` · `tool-check` |
| `stage` | Công đoạn gắn với mã lỗi |

**"Đơn tôi lỗi gì?"** — lấy `orders.productionError` rồi tra:

```jsonc
{ "table": "workshopConfigs",
  "filter": { "and": [ { "field": "category", "op": "eq", "value": "production_error" },
                       { "field": "code", "op": "eq", "value": "<mã lấy từ đơn>" } ] },
  "select": { "fields": ["code","name","errorSource","stage"] } }
```

---

## 6. `factories` và `machineTypes` — xưởng và loại máy

Ba trường: `name`, `shortName`, `isActive`. Dùng để dịch `orders.factoryId` sang tên xưởng.

**Luôn cần trước khi thống kê:** lấy `_id` của xưởng `shortName = "US"` để loại ra (xem `ImportantNotes.md` §1.3).

```jsonc
{ "table": "factories", "select": { "fields": ["_id","name","shortName","isActive"] } }
```

---

## 7. `promotions` — chương trình giảm giá

`name`, `code`, `discountType`, `discountValue`, `scope`, `applicableTiers`, `minQuantity`, `startDate`, `endDate`, `status`.

**"Tôi có ưu đãi nào không?"** — lấy `tier` của khách ở `customers` rồi:

```jsonc
{ "table": "promotions",
  "filter": { "and": [ { "field": "status", "op": "eq", "value": "Active" },
                       { "field": "applicableTiers", "op": "in", "value": [2] } ] },
  "select": { "fields": ["name","discountType","discountValue","scope","startDate","endDate"] } }
```

Đây là **giá tham khảo**. Chương trình khuyến mãi chưa được tích hợp vào bước thanh toán, nên đừng cam kết số tiền cuối cùng với khách.

---

## 8. `productCategories` và `collections` — nhóm và bộ sưu tập sản phẩm

Bảng tra nghĩa cho `productConfigs.productCategoryId` và `productConfigs.collectionIds`. Trường: `name`, `shortName`, `isActive` (và `parentId` với danh mục, `description`/`sortOrder` với bộ sưu tập).

---

## 9. `customer_notifications` — thông báo đã gửi cho khách

`title`, `body`, `customerId` (rỗng = gửi cho tất cả khách), `createdAt`. Không kèm tên nhân viên đã gửi.

**"Hệ thống có báo gì cho tôi không?"**

```jsonc
{ "table": "customer_notifications",
  "filter": { "or": [ { "field": "customerId", "op": "eq", "value": "<customers._id>" },
                      { "field": "customerId", "op": "exists", "value": false } ] },
  "select": { "sort": [{ "field": "createdAt", "dir": "desc" }], "limit": 10 } }
```

---

## 10. Sơ đồ nối bảng

```
customers.userSku ──────────► orders.userSku
orders.factoryId ───────────► factories._id
orders.machineTypeId ───────► machineTypes._id
orders.productConfigId ─────► productConfigs._id
orders.type ────────────────► productConfigs.fullName      (nối theo TÊN)
orders.productionError ─────► workshopConfigs.code         (category='production_error')
orders.toolResult ──────────► workshopConfigs.code
orders.errorFile ───────────► workshopConfigs.code
orders._id ─────────────────► orderLogs.orderId
productConfigs.productCategoryId ► productCategories._id
productConfigs.collectionIds ──► collections._id
customers._id ──────────────► customer_notifications.customerId
```

API **không tự nối bảng** — bạn gọi lần lượt rồi ghép ở phía mình. Đó là chủ ý: mỗi lời gọi chỉ chạm một bảng nên lớp che dữ liệu không có kẽ hở nào ở chỗ nối.
