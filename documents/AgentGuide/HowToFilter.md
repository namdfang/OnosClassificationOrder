# Cách viết điều kiện lọc

> Bạn biết dữ liệu nằm ở bảng nào ([`DataDictionary.md`](DataDictionary.md)) và mỗi giá trị nghĩa là gì
> ([`ValueSemantics.md`](ValueSemantics.md)). File này dạy bạn **lấy ra đúng thứ cần**.
>
> Cú pháp là **cú pháp MongoDB** — bạn đã quen nó. Mọi ví dụ dưới đây chép nguyên vào lời gọi là chạy.

---

## 1. Ba dạng viết điều kiện

```jsonc
{ "status": "active" }                          // bằng đúng giá trị này
{ "productionId": { "$eq": "SQ-01964-03971" } } // y hệt câu trên, viết dài
{ "quantity": { "$gte": 1, "$lte": 9 } }        // hai điều kiện trên cùng một trường
```

Ghép nhiều trường bằng `$and` / `$or` / `$nor`:

```jsonc
{ "$and": [ { "userSku": "ABC" }, { "quantity": { "$gte": 5 } } ] }
```

Nhiều trường trong **cùng một object** cũng ngầm là "và":

```jsonc
{ "userSku": "ABC", "status": "active" }
```

---

## 2. Toán tử dùng được

| Toán tử | Nghĩa |
|---|---|
| `$eq` `$ne` | bằng · khác |
| `$gt` `$gte` `$lt` `$lte` | lớn hơn · lớn hơn hoặc bằng · nhỏ hơn · nhỏ hơn hoặc bằng |
| `$in` `$nin` | thuộc danh sách · không thuộc danh sách |
| `$exists` | trường có giá trị hay không (`true` / `false`) |
| `$startsWith` | bắt đầu bằng chuỗi này |
| `$and` `$or` `$nor` `$not` | ghép điều kiện |

**Ngoài bảng này là không dùng được.** Gửi toán tử khác — kể cả toán tử MongoDB có thật như `$regex`,
`$expr`, `$where`, `$text` — sẽ nhận lỗi `INVALID_QUERY`. Đó không phải hệ thống hỏng; đó là ranh giới.

### `$startsWith` thay cho `$regex`

Không có `$regex`. Muốn tìm theo phần đầu của một chuỗi thì dùng `$startsWith`, và **truyền chuỗi
thường**, không phải mẫu:

```jsonc
{ "productionId": { "$startsWith": "SQ-019" } }   // ĐÚNG
{ "productionId": { "$startsWith": ".*SQ.*" } }   // SAI — sẽ tìm chuỗi bắt đầu bằng ký tự ".*SQ.*"
```

Hệ thống hiểu giá trị bạn đưa là **văn bản nguyên vẹn**, không phải biểu thức. Đây là chủ ý: nó khiến
một mẫu phức tạp không thể làm nghẽn máy chủ dữ liệu.

### Không có `$between`

Khoảng giá trị viết bằng hai toán tử trên cùng một trường:

```jsonc
{ "inProductionAt": { "$gte": "2026-08-01", "$lte": "2026-08-18" } }
```

Ngày tháng truyền dạng chuỗi ISO (`YYYY-MM-DD`), hệ thống tự hiểu là ngày. Ngày sai định dạng bị từ
chối thẳng chứ không âm thầm trả về kết quả rỗng.

---

## 3. Bốn câu hỏi thật của khách, và lời gọi tương ứng

### "Đơn SQ-01964-03971 của tôi đang ở đâu?"

```jsonc
{ "table": "orders",
  "filter": { "productionId": "SQ-01964-03971" },
  "select": { "fields": ["productionId","status","designerStatus","currentFulfillmentStage",
                         "fulfillmentCompletedAt","heldAt","holdReason","cancelledAt","cancelReason"] } }
```

Đọc kết quả theo đúng thứ tự ở [`ValueSemantics.md`](ValueSemantics.md) §1 — hủy trước, giữ sau, rồi
mới tới công đoạn.

### "Liệt kê đơn của tôi"

```jsonc
{ "table": "orders",
  "filter": { "$and": [ { "userSku": "ABC" },
                        { "cancelledAt": { "$exists": false } },
                        { "factoryId": { "$exists": true } } ] },
  "select": { "fields": ["productionId","type","currentFulfillmentStage","inProductionAt"],
              "sort": [{ "field": "inProductionAt", "dir": "desc" }], "limit": 20 } }
```

Hai điều kiện `$exists` là **bắt buộc** với mọi câu hỏi kiểu thống kê — xem
[`ImportantNotes.md`](ImportantNotes.md) §1. Thiếu chúng là đếm cả đơn đã hủy và đơn chưa vào sản xuất.

### "Tôi còn bao nhiêu đơn chưa xong, đang ở những khâu nào?"

```jsonc
{ "table": "orders",
  "filter": { "$and": [ { "userSku": "ABC" },
                        { "cancelledAt": { "$exists": false } },
                        { "factoryId": { "$exists": true } },
                        { "fulfillmentCompletedAt": { "$exists": false } } ] },
  "aggregate": { "groupBy": ["currentFulfillmentStage"], "metrics": [{ "op": "count", "as": "n" }] } }
```

Kết quả trả về mã công đoạn — **dịch sang tên tiếng Việt** trước khi nói với khách.

### "Tháng này tôi đặt bao nhiêu đơn?"

```jsonc
{ "table": "orders",
  "filter": { "$and": [ { "userSku": "ABC" },
                        { "cancelledAt": { "$exists": false } },
                        { "inProductionAt": { "$gte": "2026-08-01", "$lte": "2026-08-31" } } ] },
  "aggregate": { "metrics": [{ "op": "count", "as": "n" }] } }
```

---

## 4. Lỗi thường gặp và cách sửa

| Bạn nhận được | Nghĩa là | Sửa thế nào |
|---|---|---|
| `INVALID_QUERY` — *old filter syntax* | Bạn viết `{field, op, value}` — **cú pháp cũ, đã bỏ** | Viết lại theo §1 |
| `INVALID_QUERY` — *Operator ... not supported* | Toán tử ngoài bảng §2 | Xem lại §2; `$regex` thì đổi sang `$startsWith` |
| `FIELD_NOT_ALLOWED` — *authentication secret or session trace* | Bạn chạm vào một trong bốn tên bị chặn (`password`, `passwordSource`, `ip`, `userAgent`) | Không có đường vòng. Mọi trường khác đều lọc được |
| `FIELD_NOT_ALLOWED` — *is free text* | Bạn đang lọc trên ghi chú | Không lọc được. Tra bằng mã đơn hoặc mã khách rồi **đọc** ghi chú |
| `FIELD_NOT_ALLOWED` — *is not available* | Trường không có, hoặc bạn không được đọc | Xem [`WhatYouCannotSee.md`](WhatYouCannotSee.md) |
| `INVALID_QUERY` — *nested deeper than* | Cây điều kiện quá sâu | Gộp lại; hiếm khi cần quá hai tầng |
| `QUERY_TIMEOUT` | Truy vấn quá nặng | Thu hẹp điều kiện, thêm mốc thời gian, giảm `limit` |

Một lỗi **không** phải là dấu hiệu hệ thống hỏng — nó là câu trả lời rằng lời gọi của bạn cần sửa. Đọc
`message`, sửa, gọi lại.

---

## 5. Ba thói quen giúp bạn không trả lời sai

1. **Luôn kèm hai điều kiện loại trừ** (`cancelledAt` chưa có, `factoryId` đã có) cho mọi câu hỏi đếm
   hay liệt kê. Đây là nguồn sai số lớn nhất — [`ImportantNotes.md`](ImportantNotes.md) §1.
2. **Xin đúng trường mình cần** trong `select.fields`. Với `GET /agent/tables/{bang}/rows`, tham số
   `fields` nhận CẢ hai cách viết: `fields=productionId,type,factoryId` hoặc lặp
   `fields=productionId&fields=type`. Không khai `fields` là trả **toàn bộ trường** của mỗi dòng
   (bảng `orders` là 42 trường) — đó là cách nhanh nhất để biến một câu hỏi nhỏ thành vài trăm nghìn
   dòng dữ liệu. Lấy tất cả rồi tự lọc là cách khiến bạn vô tình
   đọc thấy thứ không nên nhắc tới khi nói với khách.
3. **Một câu trả lời, một lời gọi.** Nếu thấy mình gọi ba bốn lần cho một câu hỏi, gần như chắc chắn có
   một điều kiện `$and` gộp lại được — và ít lời gọi hơn thì cũng ít cơ hội sai hơn.
