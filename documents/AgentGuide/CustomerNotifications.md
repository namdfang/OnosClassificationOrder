# Thông báo hệ thống đã gửi cho khách

> Trả lời câu: *"hệ thống đã báo gì cho tôi, lúc nào"* — và câu khó hơn đứng ngay sau nó: *"sao tôi
> không nhận được thông báo nào cả?"*
>
> Bảng `customer_notifications` là **thông báo đã gửi tới khách**, không phải ghi chú nội bộ. Đây là
> khác biệt quan trọng: nội dung ở đây khách **đã đọc thấy rồi**, nên nhắc lại là an toàn — khác hẳn
> ghi chú trên đơn (xem [`WhatYouCannotSee.md`](WhatYouCannotSee.md) §2).

---

## 1. Tra thông báo của một khách

Thông báo nối với khách qua `customerId`, trỏ tới `customers._id`. Vậy nên **hai bước**, không phải
một:

1. Tra `customers` để lấy `_id` của khách (theo `userSku`, hoặc theo email khách vừa cho — xem
   [`HowToLookUp.md`](HowToLookUp.md) §2).
2. Tra `customer_notifications` theo `customerId` bằng chính giá trị đó.

```jsonc
{ "customerId": "<_id của khách>" }
```

Sắp theo `createdAt` giảm dần để lấy thông báo mới nhất trước.

---

## 2. `customerId` rỗng nghĩa là gửi cho TẤT CẢ khách

Đây là bẫy dễ vấp nhất của bảng này.

| `customerId` | Nghĩa |
|---|---|
| Có giá trị | Thông báo gửi **riêng** cho đúng khách đó |
| **Rỗng** | Thông báo **chung**, gửi cho **mọi khách** — khách đang hỏi cũng đã nhận |

Nghĩa là lọc đúng `customerId` của khách sẽ **bỏ sót** toàn bộ thông báo chung. Khách hỏi *"hệ thống có
báo gì cho tôi không"* mà bạn chỉ tra thông báo riêng thì có thể trả lời "không có" trong khi họ vừa
nhận một thông báo chung tuần trước.

Muốn đủ thì lấy **cả hai nhóm**: thông báo có `customerId` đúng bằng khách đó, **và** thông báo không
có `customerId`.

---

## 3. Nội dung thông báo

| Trường | Là gì |
|---|---|
| `title` | Tiêu đề khách đã nhận |
| `body` | Nội dung khách đã nhận |
| `createdAt` | **Thời điểm gửi** |

`title` và `body` đọc được và **nhắc lại cho khách được** — đó chính là thứ họ đã nhận. Vẫn nên tóm tắt
theo lời của mình khi nội dung dài, nhưng không có rào cản nào cấm bạn đọc lại nó.

**Không lọc, không sắp xếp, không nhóm theo nội dung.** `title` và `body` là văn bản tự do; tìm theo
nội dung bị từ chối và đó là chủ ý. Cần lọc thì lọc theo `customerId` và `createdAt`.

---

## 4. "Đã gửi" KHÔNG có nghĩa là "khách đã đọc"

Bảng này ghi việc hệ thống **đã gửi**. Thứ gần nhất với "đã đọc" mà bạn có là
`customers.notificationsReadAt` — **lần cuối khách MỞ DANH SÁCH thông báo**, không phải dấu đã đọc
của từng thông báo. Suỷ ra được đúng một điều: thông báo gửi **sau** mốc đó thì chắc chắn khách
chưa mở tới. Chiều ngược lại **không suy được**: mở danh sách không có nghĩa là đã đọc cái nào.

Vì vậy, cả hai câu dưới đây đều sai:

- **Đừng nói** *"chúng tôi đã báo cho bạn rồi mà"* — nghe như đổ lỗi cho khách về một việc bạn không
  kiểm chứng được.
- **Đừng nói** *"bạn đã đọc thông báo này rồi"* — mốc trên không chứng minh điều đó.

Cách nói đúng: *"ngày … hệ thống có gửi cho bạn một thông báo về …"*, rồi tóm tắt nội dung. Nêu **sự
việc đã gửi**, không nêu **kết luận về khách**.

---

## 5. Bảng này KHÔNG chứa gì

| Khách hỏi | Sự thật |
|---|---|
| "Ai gửi thông báo này cho tôi?" | Tên nhân viên đã gửi (`createdByName`) **đọc được**, nhưng với khách thì nói "hệ thống gửi" — xem [`WhatYouCannotSee.md`](WhatYouCannotSee.md) §1b |
| "Sao tôi không nhận được email/tin nhắn?" | Bảng này chỉ ghi thông báo **trong hệ thống**. Việc email hay tin nhắn có tới nơi không thì nó **không biết** — chuyển cho nhân viên hỗ trợ |
| "Đơn của tôi đổi trạng thái sao không thấy báo?" | Không phải mọi thay đổi trên đơn đều sinh thông báo. **Không có thông báo không có nghĩa là đơn không chạy** — tra thẳng tiến độ đơn theo [`OrderJourney.md`](OrderJourney.md) rồi trả lời bằng tiến độ thật |

Dòng cuối là dòng hay dùng nhất: khách thường suy ra tình trạng đơn từ việc *có hay không có* thông
báo. Suy luận đó không đúng, và bạn có nguồn tốt hơn hẳn để trả lời — chính là đơn.
