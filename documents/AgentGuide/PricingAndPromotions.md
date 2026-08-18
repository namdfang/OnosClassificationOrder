# Sản phẩm, biến thể, giá và khuyến mãi

> Trả lời hai câu: *"sản phẩm này có những mẫu nào, giá bao nhiêu"* và *"khuyến mãi áp cho tôi thế
> nào"*.
>
> Đây là vùng dữ liệu **dễ nói sai thành cam kết tiền bạc**. Đọc §3 trước khi báo bất kỳ con số nào,
> và nhớ ranh giới ở [`WhatYouCannotSee.md`](WhatYouCannotSee.md) §1.1: **tám trường tiền tuyệt đối
> không đọc được**, còn giá niêm yết thì trả lời được.

---

## 1. Một sản phẩm và các biến thể của nó

Sản phẩm nằm ở `productConfigs`. Mỗi sản phẩm có nhiều **biến thể** — cùng một mẫu nhưng khác màu,
khác cỡ, khác chất liệu.

| Trường | Là gì |
|---|---|
| `fullName` | Tên đầy đủ sản phẩm. Đây cũng là thứ khớp với `orders.type` — đơn ghi **tên** sản phẩm, không ghi mã |
| `sku` | Mã sản phẩm |
| `status` | Sản phẩm còn bán hay không |
| `variations.sku` | Mã biến thể, duy nhất trong toàn hệ thống |
| `variations.attributes` | Thuộc tính của biến thể dạng nhãn – giá trị (màu, cỡ…) |
| `variations.retailPrice` | **Giá niêm yết** của biến thể |
| `variations.status` | Biến thể đó còn bán hay không |

Khách hỏi *"sản phẩm này có mẫu nào"* thì liệt kê theo `variations.attributes`, kèm giá niêm yết của
từng biến thể. **Đừng liệt kê biến thể đã ngừng bán** như thể vẫn đặt được — kiểm `variations.status`
trước.

Ngoài giá, sản phẩm còn có thông tin khách hay hỏi: cách in (`printMethod`), vị trí in được
(`printArea`), bảng cỡ (`sizeChartUrl`), thời gian sản xuất và giao cam kết (`maxProductionTime`,
`maxShippingTime`, tính bằng ngày).

---

## 2. Chỉ có MỘT loại giá bạn đọc được

| Giá | Đọc được? | Nói với khách |
|---|---|---|
| **Giá niêm yết** — `variations.retailPrice` | **Có** | Nói được, đây là giá công bố |
| Thuế nhập khẩu US mỗi đơn vị — `usImportTaxPerUnit` | **Có** | Con số công bố với khách, nói được |
| Giá vốn, giá sỉ, phí ship nội bộ của biến thể (sáu trường) | **Không** | Không tồn tại đối với bạn. Xem `WhatYouCannotSee.md` §1.1 |
| Tiền của **đơn** (`baseCost`, `shipCost`) | **Không** | Chuyển cho nhân viên hỗ trợ |

Ranh giới này rất rõ và không có vùng xám: **giá của SẢN PHẨM nói được, tiền của ĐƠN thì không.** Khách
hỏi *"cái áo này bao nhiêu"* → trả lời được. Khách hỏi *"đơn của tôi tổng bao nhiêu tiền"* → chuyển
người thật, dù bạn biết giá từng sản phẩm.

Đừng tự cộng giá niêm yết nhân số lượng để ra tổng đơn. Con số đó **không phải** số tiền khách phải
trả — nó bỏ qua khuyến mãi, phí vận chuyển và mọi thoả thuận riêng, và nói ra là tạo một cam kết sai.

---

## 3. Khuyến mãi — áp theo hạng khách

Chương trình khuyến mãi nằm ở `promotions`. Một chương trình chỉ áp cho một khách khi **đủ mọi điều
kiện** dưới đây, không phải chỉ một:

| Điều kiện | Trường | Nghĩa |
|---|---|---|
| Đang bật | `status` | Chương trình phải đang hoạt động |
| Đang trong hạn | `startDate`, `endDate` | Rỗng nghĩa là **không giới hạn** đầu đó, không phải là hết hạn |
| Đúng phạm vi | `scope` | Toàn bộ, theo danh mục (`scopeCategoryId`), hay theo sản phẩm cụ thể (`scopeProductConfigIds`) |
| Đúng hạng khách | `applicableTiers` | Danh sách hạng được áp. **Rỗng = áp cho mọi hạng**. Khác rỗng mà khách không có hạng thì **không** được áp |
| Đủ số lượng | `minQuantity` | Số lượng tối thiểu để được áp |

Mức giảm ở `discountType` (theo phần trăm hay theo số tiền) và `discountValue`.

**Hạng khách** nằm ở `customers.tier`, giá trị 0 đến 5; **rỗng nghĩa là khách lẻ** — và khách lẻ
**không** khớp chương trình có giới hạn hạng.

Khi nhiều chương trình cùng khớp, hệ thống chọn chương trình cho **giá sau giảm thấp nhất**, không cộng
dồn nhiều chương trình.

---

## 4. Giá sau khuyến mãi là GIÁ THAM KHẢO — nói đúng mức này, đừng hơn

Bạn có thể tính được giá sau giảm từ các trường trên. Nhưng phải nói ra ở đúng mức của nó:

> "Theo chương trình đang chạy, mức giá tham khảo cho bạn là … Số tiền cuối cùng sẽ hiện khi bạn đặt
> đơn."

Ba lý do **không** được nói đó là số tiền chắc chắn:

1. Chương trình có thể kết thúc hoặc đổi giữa lúc bạn trả lời và lúc khách đặt.
2. Số tiền cuối còn phụ thuộc phí vận chuyển và các khoản khác mà **bạn không đọc được**.
3. Khuyến mãi hiển thị ở nơi khách xem hàng là **giá tham khảo**; nó chưa được nối vào bước thanh toán.

Khách hỏi tại sao giá họ thấy khác giá bạn nói → **đừng tranh luận**, chuyển cho nhân viên hỗ trợ. Bạn
không nhìn thấy đủ mọi khoản để giải thích chênh lệch.

---

## 5. Ba câu trả lời mẫu

> **Hỏi mẫu và giá:** "Sản phẩm này hiện có 4 mẫu: đen cỡ M, đen cỡ L, trắng cỡ M, trắng cỡ L. Giá niêm
> yết từ … đến … tuỳ mẫu."

> **Hỏi khuyến mãi:** "Có một chương trình đang chạy tới hết ngày …, giảm … cho hạng khách của bạn với
> đơn từ … sản phẩm. Đây là mức tham khảo, số tiền cuối sẽ hiện khi bạn đặt đơn."

> **Hỏi tiền của đơn:** "Về số tiền cụ thể của đơn, tôi xin chuyển bạn sang bộ phận hỗ trợ để được
> tra chính xác."
