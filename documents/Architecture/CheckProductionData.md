# Check Production Data — kiểm tra dữ liệu THẬT trên server

> Khi cần trả lời "số này đúng không / đơn này đang ở đâu / khách này có bao nhiêu đơn", **không đoán và không tin DB local**.
> Quy trình chuẩn: **đọc logic code trước → gọi Agent API production để lấy số thật → đối chiếu**.
> Bộ Agent API là API **chỉ đọc**, đã mở hết mọi collection/trường (`API-19`) nên đủ để tự kiểm tra mà không cần ai cấp quyền thêm.

---

## 1. Quy trình 3 bước

1. **Đọc logic code** của tính năng nghi ngờ (service/aggregation dựng ra con số đó) — vd `order.service.ts → getDashboard()`, `designer-stats.service.ts`. Ghi lại đúng bộ filter mà code dùng.
2. **Dựng lại đúng bộ filter đó** bằng `POST /agent/query` trên production và so số.
3. Lệch → bug ở code hoặc ở dữ liệu; trùng → con số đúng, vấn đề nằm ở chỗ khác (cache FE, quyền, khoảng ngày).

**Đừng dùng DB local** (`mongodb://localhost:27017/onosfactory`) để kết luận: đó là bản dev/sync, số liệu lệch server là chuyện bình thường.

---

## 2. Truy cập

| Môi trường | Base URL | Khoá |
| --- | --- | --- |
| Production | `https://api.onosfactory.com/api/v1/agent` | Khoá prod — **KHÔNG nằm trong repo**. Xem `~/.claude/projects/d--Onos/memory/onosfactory-prod-agent-api.md`, hoặc hỏi người vận hành. |
| Local dev | `http://localhost:3007/api/v1/agent` | `AGENT_API_KEY` trong `apps/api/.env` (khác khoá prod). |

Header xác thực: `X-Agent-Api-Key: <key>`. Không dùng JWT, không dùng permission-catalog.
Hạn mức: `AGENT_API_RATE_LIMIT_PER_MIN` = **600 lượt/phút** (`apps/api/src/modules/agent-api/agent-api.constants.ts`).

Đặt khoá vào biến shell rồi mới gọi, đừng dán thẳng khoá vào lệnh sẽ đi vào log:

```bash
K='<paste key>'
H="X-Agent-Api-Key: $K"
BASE=https://api.onosfactory.com/api/v1/agent
```

---

## 3. Năm endpoint (`agent-api.controller.ts`)

| Endpoint | Dùng khi |
| --- | --- |
| `GET /agent/tables` | Xem có những bảng nào + từng bảng có trường gì (`readableFields`) |
| `GET /agent/tables/:table/rows` | Đọc thô vài bản ghi để xem hình dạng dữ liệu |
| `POST /agent/query` | **Việc chính** — lọc / sắp xếp / nhóm-đếm để đối chiếu số |
| `GET /agent/docs` + `GET /agent/docs/:slug` | Tài liệu markdown đã bundle cho agent (`documents/AgentGuide/`) |

### 3.1 Xem bảng & trường

```bash
curl -s -H "$H" "$BASE/tables" | jq -r '.data[] | "\(.key)\t\(.fieldCount)"'
curl -s -H "$H" "$BASE/tables" | jq '.data[] | select(.key=="orders") | .readableFields'
```

31 bảng hiện có: `orders`, `orderLogs`, `customers`, `customer_orders`, `customer_payments`, `customer_notifications`, `users`, `userLogs`, `roles`, `customRoles`, `permissions`, `departments`, `factories`, `machineTypes`, `productConfigs`, `productCategories`, `collections`, `promotions`, `workshopConfigs`, `system_configs`, `design_files`, `r2DesignObjects`, `images`, `uniqueImages`, `notifications`, `mailHistory`, `mailTemplates`, `actions`, `counters`, `cronjobs`, `agentApiLogs`.

Bảng nào registry chưa mô tả (`fieldCount: 0`) **vẫn đọc/lọc/nhóm được đầy đủ** — cứ `rows?limit=1` để xem nó có trường gì.

### 3.2 Đọc thô

```bash
curl -s -H "$H" "$BASE/tables/factories/rows?limit=2"
curl -s -H "$H" "$BASE/tables/factories/rows?limit=2&fields=name&fields=shortName"
```

Phân trang **theo con trỏ**: lấy `data.nextCursor` của lượt trước truyền vào `?cursor=` lượt sau (không có `skip`/`page`).

### 3.3 Truy vấn (lọc + nhóm)

`filter` là **cú pháp MongoDB** với toán tử `$` trong danh sách trắng (`$and`/`$or`/`$not`/`$eq`/`$ne`/`$gt`/`$gte`/`$lt`/`$lte`/`$in`/`$nin`/`$regex`/`$exists`). `select` và `aggregate` **loại trừ nhau**.

Đếm đơn theo công đoạn fulfillment (bỏ đơn hủy):

```bash
curl -s -X POST -H "$H" -H 'Content-Type: application/json' "$BASE/query" -d '{
  "table": "orders",
  "filter": { "cancelledAt": null },
  "aggregate": {
    "groupBy": ["currentFulfillmentStage"],
    "metrics": [{ "op": "count", "as": "total" }],
    "sort": [{ "field": "total", "dir": "desc" }],
    "limit": 10
  }
}'
```

Lấy vài đơn mới nhất kèm trường cần xem:

```bash
curl -s -X POST -H "$H" -H 'Content-Type: application/json' "$BASE/query" -d '{
  "table": "orders",
  "filter": { "$and": [{ "cancelledAt": null }, { "createdAt": { "$gte": "2026-08-19T00:00:00.000Z" } }] },
  "select": {
    "fields": ["productionId", "productType", "designerStatus", "currentFulfillmentStage", "createdAt"],
    "sort": [{ "field": "createdAt", "dir": "desc" }],
    "limit": 20
  }
}'
```

Tra 1 đơn cụ thể: `{"table":"orders","filter":{"productionId":"TF-33287-70875"}}`.
Giới hạn: `groupBy` ≤ 4 trường, `metrics` ≤ 8 (`count`/`sum`/`avg`/`min`/`max`), `sort` ≤ 3, `fields` ≤ 80.

---

## 4. Bẫy đã dính (đọc trước khi gõ lệnh)

| Bẫy | Đúng phải là |
| --- | --- |
| Viết filter kiểu cũ `{and:[{field,op,value}]}` → `400 INVALID_QUERY` | Cú pháp MongoDB: `{"$and":[{"cancelledAt":null},{"quantity":{"$gte":5}}]}` |
| `?fields=a,b,c` (dấu phẩy) → items trả về **rỗng `{}`** chứ không báo lỗi | Lặp tham số: `?fields=a&fields=b&fields=c`. Hoặc bỏ hẳn `fields` để lấy nguyên bản ghi. |
| Tưởng `_id` là ObjectId 24 hex | Là chuỗi ngắn tự sinh (vd `6BGTULIEJZ3EC8YD`) — copy nguyên văn khi lọc/`cursor`. |
| Đếm "tổng đơn" thô rồi so với Dashboard → lệch | Dashboard **loại mặc định** 3 nhóm, phải lặp lại y hệt trong filter (mục 5). |
| Query xong thấy thiếu `password`/`ip`… | 4 tên `password`/`passwordSource`/`ip`/`userAgent` bị chặn theo tên lá ở mọi bảng, mọi độ sâu. Cố ý. |

---

## 5. Bộ filter chuẩn của `orders` (bắt buộc khi so số với UI)

Mọi thống kê/danh sách mặc định của hệ thống **loại** 3 nhóm đơn — không lặp lại thì số sẽ luôn cao hơn UI:

```json
{ "$and": [
  { "cancelledAt": null },
  { "factoryId": { "$exists": true, "$ne": null } },
  { "factoryId": { "$nin": ["<_id xưởng US>"] } }
]}
```

1. **Đơn hủy** — `cancelledAt` có giá trị (`Orders.md §21`, `CancelledOrders-ExcludeFromStages.md`).
2. **Đơn chưa map xưởng** — thiếu `factoryId`, chỉ xem qua trang `/orders/unmapped` (`Orders.md §19`).
3. **Xưởng ngoài luồng sản xuất** — xưởng `shortName = 'US'` (`apps/api/src/utils/excluded-factory.ts`, `Orders.md §21`). Lấy `_id` của nó bằng:
   `curl -s -H "$H" "$BASE/tables/factories/rows?limit=50" | jq '.data.items[] | select(.shortName=="US")'`

---

## 6. Kỷ luật "đọc được ≠ nói được"

API mở hết dữ liệu, nhưng khi trả lời **khách hàng** thì tiền/giá vốn (`cost`, `wholesalePrice`) và tên nhân viên nội bộ vẫn **cấm nói ra** — xem `documents/AgentGuide/WhatYouCannotSee.md §1b`. Dùng để tự kiểm tra nội bộ thì thoải mái.

---

## 7. Liên quan

- Đặc tả đầy đủ bộ API: [`documents/FunctionDescription/AgentApi.md`](../FunctionDescription/AgentApi.md)
- Trang hướng dẫn trong app (`/adm/settings/agent-api`, có tab "Thử gọi"): [`documents/FunctionDescription/AgentApiGuide.md`](../FunctionDescription/AgentApiGuide.md)
- Tài liệu nghiệp vụ cho agent: [`documents/AgentGuide/`](../AgentGuide/)
- Bẫy cross-cutting khác: [`documents/Architecture/Common_Pitfalls.md`](Common_Pitfalls.md)
