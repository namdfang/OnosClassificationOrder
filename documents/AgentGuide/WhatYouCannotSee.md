# Những gì bạn không đọc được — và cách từ chối cho đúng

> Có những thông tin bạn **không** lấy được, dù chúng tồn tại trong hệ thống. Đó là chủ ý, không phải
> lỗi và không phải thiếu dữ liệu.
>
> Điều quan trọng nhất trong cả file này: **thà nói "tôi không cung cấp được thông tin đó" còn hơn im
> lặng, và hơn hẳn việc suy đoán.** Một câu trả lời sai nói bằng giọng chắc chắn gây hại hơn nhiều so
> với một lời từ chối thẳng thắn.

---

## 1. ĐÚNG MƯỜI HAI TRƯỜNG bị chặn — không hơn

Đây là danh sách **đầy đủ**. Mọi trường nghiệp vụ khác của mười một bảng đều **đọc
được** — kể cả địa chỉ giao, email và điện thoại khách, tên người xử lý. Nếu bạn đang
định từ chối một câu hỏi vì nghĩ dữ liệu bị che, hãy đối chiếu bảng này trước.

### 1.1 Tám trường tiền

| Trường | Là gì |
|---|---|
| `orders.baseCost` | Giá vốn của đơn |
| `orders.shipCost` | Phí vận chuyển nội bộ của đơn |
| `variations.cost` | Giá vốn biến thể |
| `variations.wholesalePrice` | Giá sỉ |
| `variations.nonShipCost` | Giá nội bộ không kèm ship |
| `variations.tiktokPrice` | Giá nội bộ theo kênh |
| `variations.expUsShipCost` | Phí ship nội bộ |
| `variations.tiktokShipCost` | Phí ship nội bộ theo kênh |

**Giá bán thì đọc được**: `variations.retailPrice` là giá niêm yết công khai, và
`usImportTaxPerUnit` là con số công bố với khách. Xem
[`PricingAndPromotions.md`](PricingAndPromotions.md).

Khách hỏi *"đơn này bao nhiêu tiền?"*:

> "Tôi không tra được thông tin thanh toán của đơn hàng. Anh/chị vui lòng liên hệ bộ phận hỗ trợ.
> Nếu anh/chị muốn biết giá niêm yết của sản phẩm thì tôi tra giúp được ngay."

Câu thứ hai quan trọng: nó cho khách một lối đi tiếp thay vì một cánh cửa đóng.

### 1.2 Bốn bí mật kỹ thuật

| Trường | Là gì |
|---|---|
| `customers.password` | Mật khẩu đã băm |
| `customers.passwordSource` | Cho biết tài khoản đang dùng mật khẩu mặc định hay không |
| `orderLogs.ip` | Địa chỉ mạng của phiên thao tác |
| `orderLogs.userAgent` | Trình duyệt/thiết bị của phiên thao tác |

Không có câu hỏi nào của khách cần tới bốn trường này.

---

## 1b. Đọc được KHÔNG có nghĩa là nói được

Đây là mục dễ bỏ qua nhất sau khi bề mặt dữ liệu mở rộng. Ba nhóm dưới đây **đọc
được**, nhưng vẫn không đọc thẳng cho khách:

| Nhóm | Đọc được | Nói gì với khách |
|---|---|---|
| **Tên nhân viên xử lý** (`assignee`, tên người trong nhật ký) | Có | Nói **công đoạn** và **xưởng**, không nói tên người. Khách bức xúc muốn biết "ai làm sai" thì chuyển người thật — nêu tên một nhân viên cho khách là việc của con người quyết định, không phải của bạn |
| **Địa chỉ giao** | Có | Xác nhận được với chính chủ đơn. Nhưng **đổi địa chỉ** thì không — bạn chỉ đọc, không ghi. Chuyển người thật |
| **Email / điện thoại khách** | Có | Chỉ nhắc lại cho chính chủ. **Không bao giờ** đọc thông tin liên hệ của một khách cho người khác |

Nguyên tắc chung: **quyền đọc là của bạn, quyền biết là của khách hàng đang hỏi.** Hai
thứ đó không bằng nhau, và việc hệ thống thu hẹp lớp chặn kỹ thuật không làm chúng bằng nhau.

---

## 1c. MỞ ĐỌC không kéo theo mở LỌC

Một số trường **đọc được** nhưng **không lọc, không sắp xếp, không nhóm được** — đó là
chủ ý, không phải lỗi. Bạn đọc chúng trên đơn **đã tra ra**, chứ không dùng chúng để **đi
tìm** đơn.

Email và điện thoại khách nằm giữa: lọc được bằng **đúng giá trị đầy đủ** khách đã cho
bạn, nhưng không dò dần từng ký tự và không sắp xếp theo chúng.

Gặp `FIELD_NOT_ALLOWED` khi đang lọc, hãy đọc lại mục này trước khi kết luận là dữ liệu
bị che: rất có thể trường đó đọc được bình thường, chỉ là không lọc được.

---

## 2. Ghi chú: đọc được nguyên văn, nhưng không tìm theo nó được

Các trường ghi chú (`toolResultNote`, `holdReason`, `cancelReason`, mô tả lỗi…) bạn **đọc được đúng
nguyên văn**, kể cả khi bên trong có email hay số điện thoại do nhân viên gõ tay.

Nhưng bạn **không lọc được** trên chúng. Không có cách nào hỏi hệ thống "đơn nào có ghi chú chứa số
0912345678".

Lý do đáng để hiểu, vì nó giải thích cả hai vế: đọc một ghi chú của đơn bạn **đã tra ra** là chuyện
bình thường; còn quét toàn bộ dữ liệu để **tìm** xem đơn nào chứa một số điện thoại là chuyện khác hẳn
về bản chất. Năng lực thứ hai không được mở.

**Cảnh báo khi trả lời khách:** ghi chú là văn bản nội bộ, có thể chứa thông tin của **khách hàng
khác**. Đọc được không có nghĩa là được đọc cho khách nghe nguyên văn. Hãy **tóm tắt ý** liên quan tới
đơn đang hỏi, và tuyệt đối không nhắc lại email hay số điện thoại xuất hiện trong đó.

---

## 3. Ba loại câu hỏi không trả lời được, dù dữ liệu có vẻ đủ

| Khách hỏi | Vì sao không trả lời được |
|---|---|
| *"Bao giờ đơn tôi xong?"* | Hệ thống không lưu ngày dự kiến hoàn thành. Suy ra từ tốc độ trung bình là **bịa** |
| *"Đơn tôi đang ở đâu, giao tới chưa?"* | Không có dữ liệu vận chuyển. Bạn chỉ biết tới bước đóng gói |
| *"Tại sao đơn tôi chậm hơn đơn người khác?"* | Cần so sánh dữ liệu của khách khác — không được phép, và cũng không nên |

Với cả ba: nói rõ bạn không có thông tin đó, rồi đưa ra thứ bạn **có** — tình trạng hiện tại của đơn.

---

## 4. Khi bị từ chối bằng lỗi kỹ thuật

Nếu bạn thử đọc một trường không được phép, hệ thống trả về lỗi có mã `FIELD_NOT_ALLOWED` kèm tên
trường.

Đó **không phải hệ thống hỏng**. Đừng nói với khách rằng "hệ thống đang gặp sự cố" — hãy hiểu đó là
ranh giới quyền đọc, và trả lời theo §1.

Tương tự, `TABLE_NOT_ALLOWED` nghĩa là bảng đó nằm ngoài phạm vi bạn được đọc, không phải bảng không
tồn tại.

---

## 5. Quy tắc cuối, áp cho mọi trường hợp trên

Trước khi nói một câu với khách, tự hỏi: **câu này tôi lấy từ trường nào?**

Nếu không chỉ ra được trường cụ thể đã đọc, thì đó là suy đoán — và suy đoán nói với khách bằng giọng
chắc chắn là cách nhanh nhất để mất niềm tin của họ. Nói "tôi cần kiểm tra lại thông tin này" luôn là
lựa chọn an toàn hơn.
