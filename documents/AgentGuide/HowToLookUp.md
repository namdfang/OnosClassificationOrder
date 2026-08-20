# Tra một đơn, tra một khách — và vì sao có đơn không thấy

> [`HowToFilter.md`](HowToFilter.md) dạy **cú pháp** viết điều kiện lọc. File này trả lời câu đứng
> trước cú pháp: **tra theo trường nào mới đúng**, và khi không thấy gì thì nghĩa là gì.
>
> Nửa sau của file (§4) là phần quan trọng nhất, và cũng là chỗ agent hay nói sai nhất với khách:
> **"hệ thống không có đơn này"** trong khi đơn có thật.

---

## 1. Tra một đơn — theo `productionId`

Mỗi đơn sản xuất có một **mã đơn** duy nhất, dạng chữ và số, khách nhìn thấy được và thường đọc nguyên
mã đó khi hỏi. Nó nằm ở `orders.productionId`.

```jsonc
{ "productionId": "SQ-01964-03971" }
```

Ba điều cần nhớ:

- **Tra bằng mã đầy đủ, không tra bằng một khúc.** Mã có nhiều phần ngăn cách bởi dấu gạch; tra nửa mã
  dễ trúng đơn của khách khác.
- **Một mã ứng với một đơn.** Ra nhiều hơn một dòng nghĩa là điều kiện của bạn sai, không phải hệ thống
  có mã trùng.
- Khách đưa mã kiểu khác (mã đơn hàng của họ, mã vận đơn) thì **đó không phải `productionId`** — chuyển
  cho nhân viên hỗ trợ thay vì đoán.

---

## 2. Tra mọi đơn của một khách — theo `userSku`, không theo tên

Khách được nhận ra bằng **mã tài khoản** `userSku`, không bằng họ tên. Tên trùng nhau là chuyện thường;
mã tài khoản thì không.

```jsonc
{ "userSku": "abc-store" }
```

Khách trong cuộc trò chuyện chỉ cho bạn **email** thì lọc bằng email đúng nguyên văn:

```jsonc
{ "userEmail": "someone@example.com" }
```

**Email và điện thoại đọc được, nhưng chỉ lọc được bằng ĐÚNG giá trị đầy đủ.** Không dò dần từng
ký tự, không sắp xếp và không nhóm theo chúng — API từ chối, và đó là chủ ý. Đọc ra được không có
nghĩa là đọc cho ai cũng được: chỉ nhắc lại liên hệ cho **chính chủ**, xem
[`WhatYouCannotSee.md`](WhatYouCannotSee.md) §1b.

---

## 3. Tra đơn và tra khách cho kết quả khác nhau như thế nào

| Bạn muốn biết | Tra bảng | Theo trường |
|---|---|---|
| Một đơn cụ thể đang ở đâu | `orders` | `productionId` |
| Khách này có bao nhiêu đơn, đang ở những khâu nào | `orders` | `userSku` (hoặc `userEmail`) |
| Khách này là ai, hạng gì | `customers` | `userSku`, hoặc `userEmail` |
| Hệ thống đã báo gì cho khách này | `customer_notifications` | `customerId` — xem [`CustomerNotifications.md`](CustomerNotifications.md) |

**Một tài khoản khách trong `customers` được nhận ra bằng cặp `userSku` + `userEmail`**, không phải chỉ
bằng `userSku`. Cùng một mã tài khoản với hai email khác nhau là **hai bản ghi khách khác nhau**. Khi
tra `customers` mà chỉ có `userSku`, hãy đọc kỹ số dòng trả về: nhiều hơn một dòng nghĩa là bạn chưa xác
định được đúng người, **đừng chọn bừa dòng đầu tiên**.

Ngược lại, để tìm **đơn**, `userSku` thường là đủ.

`customers._id` là thứ nối sang thông báo đã gửi; `customers.userSku` là thứ nối sang đơn. Hai khoá
khác nhau cho hai câu hỏi khác nhau — dùng nhầm sẽ ra rỗng chứ không ra sai, nhưng rỗng cũng đủ khiến
bạn kết luận nhầm.

---

## 4. "Tôi có đơn mà sao anh nói không có?" — bốn lý do, không lý do nào là lỗi của khách

Đây là câu hỏi nguy hiểm nhất trong tài liệu này. Nói *"hệ thống không có đơn này"* nghe rất dứt khoát,
và khi nó sai thì khách mất niềm tin ngay. **Trước khi nói câu đó, loại đủ bốn khả năng dưới đây.**

### 4.1 Đơn còn ở khâu chờ đẩy sản xuất — chưa phải đơn sản xuất

Đơn khách vừa đặt **không lập tức thành đơn sản xuất**. Nó nằm ở khâu chờ trước đó cho tới khi được đẩy
vào sản xuất. Điều làm chuyện này khó nhận ra: **mã đơn được cấp ngay từ lúc khách tạo đơn**, nên khách
đã có mã trong tay và đọc cho bạn — nhưng mã đó **chưa có trong `orders`**.

Bảng đơn chờ đó **không nằm trong số bảng bạn đọc được**. Nghĩa là bạn không phân biệt được "chưa đẩy
sản xuất" với "không tồn tại" — và vì vậy:

> Tra đúng mã mà không thấy gì thì **không được nói là không có đơn**. Hãy nói: *"đơn của bạn chưa vào
> giai đoạn sản xuất nên tôi chưa tra được tiến độ; tôi chuyển cho bộ phận hỗ trợ kiểm tra giúp bạn"*.

### 4.2 Đơn đã hủy

Đơn có `cancelledAt` bị loại khỏi mọi thống kê. Nếu bạn đang đếm hoặc liệt kê kèm điều kiện loại đơn
hủy (`ImportantNotes.md` §1.1) thì đơn đó **có thật nhưng không hiện ra**. Bỏ điều kiện loại hủy rồi tra
lại mã cụ thể là biết ngay.

### 4.3 Đơn chưa được gán xưởng

Đơn chưa gán xưởng (`factoryId` rỗng) bị loại **mặc định** khỏi danh sách và thống kê
(`ImportantNotes.md` §1.2). Đơn vẫn tồn tại, vẫn đang chờ được xếp xưởng. Với khách: *"đơn của bạn đã
tiếp nhận và đang chờ xếp vào xưởng sản xuất"* — **đừng** nói là không có.

### 4.4 Đơn thuộc xưởng ngoài luồng sản xuất

Đơn thuộc xưởng có `shortName` là `US` bị loại khỏi mọi thống kê (`ImportantNotes.md` §1.3). Cũng vậy:
tồn tại, chỉ là không nằm trong con số bạn vừa đếm.

---

## 5. Quy tắc tự kiểm trước khi nói "không có"

1. Tra lại **đúng mã đó**, **không kèm** ba điều kiện loại trừ. Ra dòng → đơn có thật, chỉ bị loại khỏi
   phạm vi thống kê. Nói theo §4.2–4.4.
2. Vẫn rỗng → nhớ §4.1: có thể đơn chưa vào sản xuất. **Chuyển cho người thật**, đừng khẳng định.
3. Phân biệt **rỗng** với **bị từ chối**: kết quả rỗng không kèm lỗi khác hẳn phản hồi có mã lỗi. Bị từ
   chối mà nói "bạn không có đơn nào" là nói sai sự thật (`ImportantNotes.md` §5).
4. Khách đưa mã mà bạn không chắc là mã đơn sản xuất → hỏi lại khách, hoặc chuyển người thật. Đoán mã
   thuộc loại nào là cách tự tạo ra một câu trả lời sai nghe rất tự tin.

