# Lưu ý quan trọng cho AI agent

> Đọc file này **trước** khi trả lời khách bằng bất kỳ con số nào lấy từ dữ liệu thô.
> Đây là tài liệu bắt buộc của bộ API nội bộ `API-1`.

---

## 1. Ba quy tắc loại trừ ngầm — nguồn sai số lớn nhất

Hệ thống loại một số nhóm đơn ra khỏi thống kê theo những quy tắc **không nhìn thấy được từ dữ liệu thô**. Đếm thẳng trên `orders` mà không áp các điều kiện dưới đây sẽ ra **con số khác** với con số hiển thị trên màn hình nội bộ — rồi bạn nói con số sai đó cho khách.

### 1.1 Đơn đã hủy — `cancelledAt`

Đơn có `cancelledAt` khác rỗng bị loại khỏi **mọi công đoạn và mọi thống kê**. Nó không nằm trong bất kỳ hàng chờ nào, không tính vào năng suất, không tính vào tồn.

```jsonc
{ "cancelledAt": { "$exists": false } }
```

### 1.2 Đơn chưa gán xưởng — `factoryId` rỗng

Đơn chưa map được xưởng bị loại **mặc định** khỏi mọi danh sách và mọi API nội bộ; nhân viên chỉ xem được qua một menu riêng. Nếu bạn đếm cả nhóm này, số của bạn sẽ **lớn hơn** số trên màn hình.

```jsonc
{ "factoryId": { "$exists": true } }
```

### 1.3 Xưởng ngoài luồng sản xuất

Đơn thuộc xưởng có `shortName = "US"` bị loại khỏi **mọi** thống kê và danh sách. Xưởng này nằm ngoài luồng sản xuất của nhà máy.

Cách áp: tra `factories` lấy `_id` của xưởng có `shortName = "US"`, rồi loại nó ra:

```jsonc
{ "factoryId": { "$nin": ["<_id của xưởng US>"] } }
```

**Ba điều kiện trên gần như luôn phải đi cùng nhau.** Mẫu chuẩn khi đếm bất cứ thứ gì trên `orders`:

```jsonc
{
  "$and": [
    { "cancelledAt": { "$exists": false } },
    { "factoryId": { "$exists": true } },
    { "factoryId": { "$nin": ["<_id xưởng US>"] } }
  ]
}
```

---

## 2. Ranh giới — ba loại câu hỏi bạn KHÔNG trả lời được

Đây không phải giới hạn kỹ thuật tạm thời mà là quyết định có chủ ý. Gặp ba loại này thì **chuyển cho người thật**, đừng suy đoán và đừng nói vòng vo.

| Khách hỏi | Vì sao không trả lời được | Nói gì với khách |
|---|---|---|
| "Đơn của tôi giao tới địa chỉ nào?" | Toàn bộ khối địa chỉ giao bị che, kể cả quốc gia và tỉnh | Chuyển cho nhân viên hỗ trợ |
| "Đơn này bao nhiêu tiền?" | Mọi trường tiền của đơn và giá vốn sản phẩm đều bị che | Chuyển cho nhân viên hỗ trợ. **Giá niêm yết** của sản phẩm trong `productConfigs.variations[].retailPrice` thì trả lời được |
| "Ai đang làm đơn của tôi?" | Mọi dấu vết danh tính nhân viên bị che ở tất cả các bảng | Trả lời đơn đang ở **công đoạn** nào, **xưởng** nào — đó là thứ khách thực sự cần biết |

Email và điện thoại khách **lọc được** (bạn đã biết giá trị từ cuộc trò chuyện) nhưng **không đọc được**. Đừng cố lấy chúng ra bằng cách nhóm, sắp xếp, hay tổng hợp — API từ chối, và đó là chủ ý.

---

## 3. Những trường dễ hiểu sai

| Trường | Bẫy |
|---|---|
| `orders.currentFulfillmentStage` **rỗng** | Hai nghĩa hoàn toàn khác nhau: đơn **chưa vào xưởng**, HOẶC đơn **đã đóng hàng xong**. Phân biệt bằng `fulfillmentCompletedAt`: có giá trị = đã xong |
| `orders.status` | Trạng thái lấy từ hệ thống nguồn, **không** phải trạng thái sản xuất nội bộ. Muốn biết đơn đang ở đâu thì xem `currentFulfillmentStage` và `designerStatus` |
| `orders.heldAt` | Khác rỗng = đơn **đang bị giữ**, không chạy tiếp công đoạn nào. Đây thường là câu trả lời thật cho "sao đơn tôi đứng im" |
| `orders.type` | Là **tên** sản phẩm dạng chữ, khớp với `productConfigs.fullName`, không phải id |
| `orders.toolResult`, `productionError`, `errorFile` | Là **mã**, không phải chữ đọc được. Phải tra `workshopConfigs` theo `code` để lấy `name` |
| `orderLogs` không có `before`/`after` | Không phải lỗi: giá trị cũ/mới chỉ được trả với các trường tình trạng sản xuất nằm trong danh sách cho phép. Trường khác trả kèm `valueOmitted: true` |
| Ghi chú gõ tay | Đọc được **nguyên văn**, kể cả email và số điện thoại nhân viên gõ trong đó. Nhưng **không lọc được** theo nội dung ghi chú, và **không đọc lại nguyên văn cho khách** — ghi chú là văn bản nội bộ, có thể chứa thông tin của khách hàng khác. Xem [`WhatYouCannotSee.md`](WhatYouCannotSee.md) §2 |

---

## 4. Sáu công đoạn xưởng, theo đúng thứ tự

`print` → `press` → `qc-post-press` → `sew-in` → `sew-out` → `pack`

Tiếng Việt: In → Ép → QC sau ép → May nhận vào → May xuất ra → Đóng hàng.

Trước sáu công đoạn này còn hai chặng nữa: **soát tool** (`toolCheckedAt`, `toolResult`) và **thiết kế** (`designerStatus`). Một đơn "chưa vào xưởng" có thể đang nằm ở một trong hai chặng đó — kiểm trước khi kết luận là đơn chưa được xử lý.

---

## 5. Quy tắc tự kiểm trước khi nói với khách

1. Con số nào cũng phải áp đủ **ba điều kiện loại trừ** ở mục 1.
2. Mã nào cũng phải tra `workshopConfigs` ra chữ trước khi nói.
3. Không thấy dữ liệu **không** có nghĩa là không có đơn — kiểm lại xem có phải bạn đang lọc trúng một trong ba nhóm bị loại không.
4. API trả về lỗi `FIELD_NOT_ALLOWED` hay `TABLE_NOT_ALLOWED` nghĩa là **thứ đó cố ý không dành cho bạn**. Đừng tìm đường vòng; chuyển câu hỏi cho người thật.
5. Kết quả rỗng hợp lệ (`items: []` không kèm lỗi) khác hẳn bị từ chối (có `code`). Đừng nói "anh không có đơn nào" khi thực ra bạn bị từ chối truy vấn.
