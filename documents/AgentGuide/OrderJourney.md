# Hành trình một đơn — từ lúc khách đặt tới lúc giao

> [`ValueSemantics.md`](ValueSemantics.md) cho bạn biết **một giá trị nghĩa là gì**. File này cho bạn
> biết **đơn đang ở đâu trong cả chặng đường**, để trả lời được hai câu khách hỏi nhiều nhất:
> *"đơn tôi tới đâu rồi"* và *"còn bao lâu nữa"*.
>
> Đọc file này **sau** khi đã biết thứ tự đọc một đơn ở `ValueSemantics.md` §1. Thứ tự đó vẫn là luật:
> đơn hủy và đơn bị giữ phải kiểm **trước**, vì một đơn bị giữ vẫn còn nguyên công đoạn cũ trong dữ
> liệu và bạn sẽ nói nhầm là nó đang chạy.

---

## 1. Tám chặng, theo đúng thứ tự

Một đơn bình thường đi qua **tám chặng**. Hai chặng đầu là chuẩn bị file in, sáu chặng sau là ở xưởng.

| # | Chặng | Đang làm gì | Nói với khách |
|---|---|---|---|
| 1 | Soát tool | Kiểm file thiết kế khách gửi có in được không | "Đơn của bạn đang được kiểm tra file thiết kế." |
| 2 | Thiết kế | Dựng/chỉnh file in cho đúng khuôn sản phẩm | "Bộ phận thiết kế đang chuẩn bị file in." |
| 3 | In | In hình lên vật liệu | "Đơn của bạn đang ở khâu in." |
| 4 | Ép | Ép nhiệt cho hình bám vào vải | "Đơn đang ở khâu ép." |
| 5 | QC sau ép | Kiểm chất lượng bản in sau khi ép | "Đơn đang được kiểm tra chất lượng." |
| 6 | May nhận vào | Chuyển sang bộ phận may | "Đơn đã chuyển sang bộ phận may." |
| 7 | May xuất ra | May xong, ra khỏi chuyền may | "Đơn đang hoàn tất khâu may." |
| 8 | Đóng hàng | Đóng gói, chuẩn bị giao | "Đơn đang được đóng gói." |

Xong chặng 8 thì đơn **hoàn tất sản xuất**.

**Đừng đọc tên mã tiếng Anh cho khách nghe.** Bảng mã ↔ tên công đoạn nằm ở `ValueSemantics.md` §3;
file này không chép lại để hai chỗ không bao giờ lệch nhau.

---

## 2. Đơn đang ở chặng nào — đọc theo đúng thứ tự này

| Bước | Kiểm | Kết luận |
|---|---|---|
| 1 | `cancelledAt` có giá trị | Đơn đã hủy — §5 |
| 2 | `heldAt` có giá trị | Đơn đang bị giữ — §4. **Chặng cũ trong dữ liệu không còn là sự thật hiện tại** |
| 3 | `fulfillmentCompletedAt` có giá trị | Xong chặng 8, hoàn tất sản xuất |
| 4 | `currentFulfillmentStage` có giá trị | Đang ở một trong sáu chặng xưởng (3–8) |
| 5 | `designerStatus` khác `done` | Đang ở chặng 2 (thiết kế) |
| 6 | `toolCheckedAt` rỗng | Đang ở chặng 1 (soát tool) |

Bước 5 và 6 hay bị đảo. Cứ theo đúng thứ tự trên: chặng thiết kế bắt đầu **sau** khi soát tool xong, nên
`designerStatus` đang chạy thì đơn chắc chắn đã qua chặng 1.

---

## 3. "Còn mấy chặng nữa?" — đếm được, nhưng đừng quy ra thời gian

Số chặng còn lại = `8` trừ số thứ tự chặng hiện tại ở §1.

| Đơn đang ở | Còn lại |
|---|---|
| Soát tool | 7 chặng |
| Thiết kế | 6 chặng |
| In | 5 chặng |
| Ép | 4 chặng |
| QC sau ép | 3 chặng |
| May nhận vào | 2 chặng |
| May xuất ra | 1 chặng |
| Đóng hàng | Chặng cuối |

**Số chặng KHÔNG phải thời gian.** Mỗi chặng dài ngắn khác nhau, và một đơn bị đẩy lại (§6) sẽ đi qua
cùng một chặng hai lần. Khách hỏi *"bao giờ xong"* thì trả lời theo `ImportantNotes.md` §2 — đó là câu
bạn không tự suy ra được, kể cả khi biết chính xác đơn đang ở chặng nào.

Sản phẩm có nêu **cam kết thời gian sản xuất và thời gian giao tối đa** (`maxProductionTime`,
`maxShippingTime` của `productConfigs`, tính bằng ngày). Đây là **cam kết chung của loại sản phẩm**,
không phải dự báo cho đơn cụ thể này. Nói được ở dạng *"loại sản phẩm này cam kết sản xuất tối đa N
ngày"*, **không** được nói *"đơn của bạn còn N ngày nữa"*.

---

## 4. Đơn bị giữ — nhánh rẽ hay gặp nhất, và thường là câu trả lời thật

`heldAt` khác rỗng nghĩa là đơn **đứng lại có chủ ý**, không chạy tiếp chặng nào. Đây gần như luôn là
câu trả lời thật cho *"sao đơn tôi đứng im mấy hôm nay"*.

Lý do nằm ở `holdReason` — văn bản người vận hành gõ. **Hai lý do dưới đây là chuyện của khách**, và
với chúng khách tự gỡ được:

| `holdReason` | Nghĩa | Ai gỡ |
|---|---|---|
| `Đợi khách sửa design` | File thiết kế chưa dùng được, hệ thống đang đợi bản mới từ khách | **Khách**. Khách gửi bản thiết kế mới ở nơi họ đặt đơn; hệ thống nhận ra bản mới thì **tự động** gỡ giữ và cho đơn chạy tiếp. Lưu ý: bản in đã soát trước đó coi như bỏ, đơn quay lại chặng soát tool |
| `Đợi khách sửa địa chỉ` | Địa chỉ giao chưa dùng được | **Khách**, cùng cơ chế trên |
| Lý do khác | Việc nội bộ (chờ vật tư, chờ xác nhận, gộp lô…) | **Nhân viên vận hành**. Khách không tự gỡ được |

Ba điều phải nhớ khi nói về đơn bị giữ:

1. **Nói lý do bằng lời của mình.** `holdReason` là ghi chú nội bộ gõ tay, có thể cụt hoặc viết tắt.
   Đọc nguyên văn cho khách là cách chắc chắn gây hiểu nhầm.
2. **Đơn bị giữ không phải đơn hỏng.** Nó vẫn còn nguyên, chỉ đang chờ.
3. Với hai lý do đầu bảng, **việc cần làm là của khách** — nói rõ ra, vì đơn sẽ đứng mãi tới khi họ làm.

---

## 5. Đơn bị hủy

`cancelledAt` khác rỗng nghĩa là đơn **đã hủy hẳn**, không còn nằm trong bất kỳ hàng chờ nào và không
tính vào thống kê nào (`ImportantNotes.md` §1.1). Lý do ở `cancelReason` — cũng là văn bản gõ tay, cũng
diễn đạt lại chứ đừng đọc nguyên văn.

Đơn đã hủy **không tự chạy lại được**. Khách muốn làm lại thì đó là đơn mới; chuyển cho nhân viên hỗ
trợ, đừng hứa là "sẽ khôi phục".

---

## 6. Đơn bị đẩy lại một chặng

Khi một chặng phát hiện lỗi thuộc về chặng trước, đơn **quay ngược lại** chặng đó rồi đi lại từ đấy.

| Dấu hiệu | Nghĩa |
|---|---|
| `designerStatus` = `rework` | Xưởng thấy lỗi thuộc về file in, đơn quay về chặng thiết kế |
| Trạng thái công đoạn = `rework` | Đơn quay lại một chặng xưởng |
| `productionErrorCount` > 0 | Đơn đã từng bị đẩy lại ít nhất một lần |

Với khách, cả ba đều nói theo một hướng: **"đơn đang được xử lý lại một công đoạn để đảm bảo chất
lượng"**. Đúng như vậy, và đó là điều khách cần biết.

**Đừng nói bộ phận nào sai.** Nguồn lỗi (`productionErrorSource`) là thông tin điều hành nội bộ. Khách
cần biết đơn vẫn đang chạy, không cần biết ai làm sai.

**Mã lỗi phải tra ra chữ trước khi nói** — `ValueSemantics.md` §5. Đọc mã thô cho khách là cách nhanh
nhất khiến họ hoảng.

---

## 7. Ba câu trả lời mẫu, ghép đủ mọi thứ ở trên

> **Đơn đang ở chặng xưởng:** "Đơn của bạn đang ở khâu ép, là chặng thứ 4 trong 8 chặng. Sau đó còn
> kiểm tra chất lượng, may và đóng gói."

> **Đơn bị giữ chờ khách:** "Đơn của bạn đang tạm dừng vì hệ thống đang đợi bản thiết kế mới từ phía
> bạn. Khi bạn gửi bản mới, đơn sẽ tự chạy tiếp — bản in sẽ được kiểm lại từ đầu để đảm bảo đúng."

> **Đơn đang làm lại:** "Đơn của bạn đang được xử lý lại một công đoạn để đảm bảo chất lượng. Đơn vẫn
> đang chạy bình thường, không bị hủy."
