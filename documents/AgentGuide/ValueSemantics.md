# Ý nghĩa của từng giá trị — và nói gì với khách

> [`DataDictionary.md`](DataDictionary.md) cho bạn biết **trường nào ở đâu**. File này cho bạn biết
> **giá trị đó nghĩa là gì với khách hàng**, và câu nào nên nói ra.
>
> Nguyên tắc xuyên suốt: khách không quan tâm tên kỹ thuật. Họ hỏi *"đơn tôi đến đâu rồi"*, không hỏi
> *"currentFulfillmentStage của tôi là gì"*. Đừng đọc mã cho khách nghe.

---

## 1. Thứ tự đọc một đơn — làm đúng thứ tự này, đừng làm khác

Một đơn có thể vừa đang ở công đoạn nào đó, vừa bị giữ, vừa đã hủy. Nếu bạn đọc sai thứ tự thì sẽ nói
với khách rằng đơn "đang may" trong khi thật ra nó đã bị hủy ba hôm trước.

| Thứ tự | Kiểm gì | Nếu có giá trị thì đơn đang ở tình trạng đó, **dừng lại, không đọc tiếp** |
|---|---|---|
| 1 | `cancelledAt` | Đơn **đã hủy**. Nói rõ, kèm `cancelReason` nếu có |
| 2 | `heldAt` | Đơn **đang bị giữ**, không chạy tiếp. Nói lý do ở `holdReason` |
| 3 | `fulfillmentCompletedAt` | Đơn **đã hoàn tất sản xuất** (xong công đoạn cuối) |
| 4 | `currentFulfillmentStage` | Đơn đang ở **công đoạn xưởng** — xem §3 |
| 5 | `designerStatus` | Chưa vào xưởng, đang ở **khâu thiết kế** — xem §2 |

Trường rỗng ở bước 1–3 nghĩa là "không rơi vào tình trạng đó", nên đi tiếp. Đến bước 4 mà
`currentFulfillmentStage` rỗng thì **không** kết luận vội: rỗng có hai nghĩa khác nhau, xem
[`ImportantNotes.md`](ImportantNotes.md) §3.

---

## 2. `designerStatus` — khâu thiết kế file in

Sáu giá trị. Đây là giai đoạn **trước** khi đơn xuống xưởng.

| Giá trị | Nghĩa thật | Nói với khách |
|---|---|---|
| `unassigned` | Chưa giao cho nhân viên thiết kế nào | "Đơn của bạn đã tiếp nhận, đang chờ phân công thiết kế." |
| `assigned` | Đã giao, người đó chưa bắt đầu | "Đơn đang chờ tới lượt xử lý thiết kế." |
| `in-progress` | Đang làm file in | "Bộ phận thiết kế đang xử lý file in cho đơn của bạn." |
| `done` | Xong file in, đơn chuyển xuống xưởng | "File in đã hoàn tất, đơn đã chuyển sang sản xuất." |
| `rejected` | Người được giao đã trả lại, cần giao cho người khác | "Đơn đang được chuyển sang nhân viên khác xử lý." — **đừng** nói "bị từ chối", khách sẽ hiểu là đơn có vấn đề |
| `rework` | Xưởng phát hiện lỗi thuộc về file in, đang làm lại | "File in đang được chỉnh lại để đảm bảo chất lượng trước khi in." |

`rejected` và `rework` **không** phải lỗi của khách và không có nghĩa đơn bị hủy. Cả hai chỉ là việc
nội bộ đang được xử lý. Nói theo hướng đơn vẫn đang chạy, vì đúng là như vậy.

---

## 3. `currentFulfillmentStage` — sáu công đoạn xưởng

Đơn đi tuần tự qua sáu công đoạn. Mã lưu trong dữ liệu là chuỗi tiếng Anh; **luôn** dịch sang tên công
đoạn khi nói với khách.

| Mã | Công đoạn | Nói với khách |
|---|---|---|
| `print` | In | "Đơn của bạn đang ở khâu in." |
| `press` | Ép | "Đơn đang ở khâu ép." |
| `qc-post-press` | QC sau ép | "Đơn đang được kiểm tra chất lượng sau khi ép." |
| `sew-in` | May nhận vào | "Đơn đã chuyển sang bộ phận may." |
| `sew-out` | May xuất ra | "Đơn đang hoàn tất khâu may." |
| `pack` | Đóng hàng | "Đơn đang được đóng gói." |

Xong `pack` thì `fulfillmentCompletedAt` có giá trị và đơn coi như hoàn tất sản xuất.

**Dữ liệu cũ có thể mang mã không còn dùng** — `qc-sorting`, `qc-post-sew`, `qc`, `sew`. Gặp mã lạ
ngoài sáu mã trên thì **đừng đoán**: nói "đơn đang trong quá trình sản xuất tại xưởng" và không nêu
công đoạn cụ thể.

### Trạng thái bên trong một công đoạn

| Giá trị | Nghĩa |
|---|---|
| `waiting` | Đã tới công đoạn này, chưa có ai bắt đầu |
| `in-progress` | Đang làm |
| `done` | Xong công đoạn này, chuyển tiếp |
| `rework` | Bị đẩy lại từ công đoạn sau vì phát hiện lỗi, đang làm lại |

`rework` ở đây nghĩa là **đơn quay lại một bước**, chưa hỏng và chưa hủy. Với khách: "đơn đang được xử
lý lại một công đoạn để đảm bảo chất lượng".

---

## 4. `priority` — mức ưu tiên

Lưu bằng **số**, không phải chữ.

| Giá trị | Nghĩa |
|---|---|
| `1` | Thấp |
| `2` | Bình thường |
| `3` | Cao |

Đây là thông tin **điều độ nội bộ**. Đừng chủ động nói với khách rằng đơn của họ ở mức ưu tiên thấp —
câu đó không giúp gì cho họ và dễ gây khó chịu. Chỉ dùng để tự hiểu vì sao một đơn chạy nhanh hơn đơn
khác.

---

## 5. Mã lỗi và mã kết quả — luôn phải tra, không bao giờ đọc thẳng

`toolResult`, `productionError`, `errorFile` lưu **mã**, không phải chữ đọc được. Tra nghĩa ở bảng
`workshopConfigs` theo `code`, rồi mới nói.

Đọc mã thô cho khách nghe là cách chắc chắn khiến họ hoang mang. `productionError` có giá trị không có
nghĩa đơn hỏng — phần lớn là lỗi đã được phát hiện và đang xử lý nội bộ.

`workshopConfigs.errorSource` cho biết lỗi thuộc về ai: `designer` (khâu thiết kế), `factory` (xưởng),
`tool-check` (khâu soát file). **Đây là thông tin nội bộ.** Khách chỉ cần biết đơn đang được xử lý,
không cần biết bộ phận nào sai.

---

## 6. Trường ngày tháng — cái nào là trục thời gian

| Trường | Là mốc gì |
|---|---|
| `createdAt` | Lúc đơn vào hệ thống |
| `inProductionAt` | Lúc đơn **vào sản xuất** — đây là trục thời gian của hầu hết thống kê |
| `toolCheckedAt` | Lúc soát file in xong lần đầu |
| `fulfillmentCompletedAt` | Lúc xong công đoạn cuối |
| `cancelledAt` | Lúc hủy |

Khách hỏi "đơn tôi đặt bao lâu rồi" thì tính từ `createdAt`. Khách hỏi "bao giờ xong" thì **không tự
suy ra** — xem [`ImportantNotes.md`](ImportantNotes.md) §2 về những câu không trả lời được.

---

## 7. Trường rỗng nghĩa là gì

Rỗng **không** đồng nghĩa với "không có". Ba cách hiểu khác nhau:

| Trường rỗng | Nghĩa |
|---|---|
| `cancelledAt`, `heldAt`, `fulfillmentCompletedAt` | Đơn **không** rơi vào tình trạng đó — đây là trường hợp bình thường |
| `currentFulfillmentStage` | **Hai nghĩa**: chưa xuống xưởng, hoặc đã xong hết. Phân biệt bằng `fulfillmentCompletedAt` |
| `factoryId` | Đơn **chưa được gán xưởng** — loại đơn này bị loại khỏi thống kê mặc định, xem `ImportantNotes.md` §1.2 |

Gặp trường rỗng mà không chắc nghĩa nào thì nói "tôi chưa có thông tin đó", đừng suy đoán.
