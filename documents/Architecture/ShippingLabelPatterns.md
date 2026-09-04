# Mua nhãn vận chuyển — khuôn thiết kế bắt buộc

> **Dành cho:** dev đang làm mảng shipping của OnosFactory (`apps/api/src/modules/shipping-vnp/`).
> **Đây không phải mô tả tính năng** — mô tả tính năng ở [`../FunctionDescription/VnpShipping.md`](../FunctionDescription/VnpShipping.md).
> Tài liệu này chỉ nói **cách dựng cho đúng**: tám khuôn rút ra từ một hệ mua nhãn khác đã chạy
> thật nhiều tháng với hàng nghìn nhãn. Mỗi khuôn ở đây đều là **thứ đã hỏng ngoài production ở
> đâu đó rồi mới thành luật** — không phải lý thuyết đẹp.

---

## 0. Nguyên tắc gốc

Mua nhãn là nghiệp vụ **hai hệ thống, một sự thật**: nhãn nằm bên hãng vận chuyển, sổ nằm bên
mình, tiền rời ví ở giữa. Gần như mọi sự cố đều rơi vào **khe giữa hai bên** chứ không nằm trong
logic nghiệp vụ.

Nên khi viết bất kỳ đoạn nào của luồng này, câu hỏi phải hỏi không phải "chạy đúng chưa" mà:

> **Tiến trình chết đúng ở dòng này thì mình mất gì, và ai dọn?**

Ba kiểu mất, xếp theo độ đau:

| Mất gì | Vì sao đau | Khuôn chặn |
|---|---|---|
| Nhãn có thật bên hãng, sổ mình trống trơn | Đã trả tiền, không có mã để tra, không hủy được, không ai biết để dọn | §1 |
| Cùng một kiện mua hai nhãn | Trả tiền hai lần, dán nhầm nhãn = hàng đi sai | §2 |
| Hoàn/hủy nhầm nhãn đang trên đường giao | Hàng mất, khách không nhận được, không đòi lại được | §4 |

Ngược lại, mất một dòng log hay một lần cập nhật bảng phụ thì **không đau** — và chính vì thế nó
tuyệt đối không được phép làm hỏng phần đã xong (§5).

---

## 1. Vòng đời phải có bước GIỮ CHỖ, và phải ghi chìa trước

**Sai (đang là hiện trạng của `shipping-vnp.service.ts` → `createShipment()`):**

```
gọi hãng tạo nhãn ──► nhận tracking + label ──► ghi pack ──► ghi shipment ──► ghi snapshot lên order
                                                    ▲
                              chết ở đây = nhãn có thật, tiền đã trừ, sổ KHÔNG có gì
```

**Đúng:**

```
① tạo bản ghi trạng thái "đang mua"  (chưa gọi hãng, chưa động tiền)
② gọi hãng
③ 🔴 GHI NGAY mã định danh bên hãng (shipmentId) vào bản ghi — vẫn đang "đang mua"
④ chốt sang "đã tạo" bằng CẬP NHẬT CÓ ĐIỀU KIỆN (chỉ chuyển khi vẫn còn "đang mua")
⑤ cron dọn bản ghi kẹt "đang mua" quá N phút
```

Ba chi tiết không được bỏ:

- **Bước ③ tách khỏi ④.** Ghi mã của hãng là việc riêng, làm sớm nhất có thể. Nếu gộp vào bước
  chốt và bước chốt hỏng, mình mất luôn cái mã — nhãn thật bên hãng trở thành **vô hình** với cả
  cron dọn.
- **Bước ④ phải là cập nhật có điều kiện** (`updateOne({ _id, status: 'purchasing' }, …)` rồi kiểm
  `modifiedCount === 0`), không phải ghi đè trần. Cron dọn cũng ghi vào đúng dòng đó; hai nơi cùng
  ghi mà chỉ một nơi có chốt là để dành một cuộc đua cho tương lai.
- **Bước ⑤ bắt buộc có**, kể cả khi tin rằng ③④ không bao giờ hỏng. Bản ghi kẹt "đang mua" là
  **bằng chứng duy nhất** rằng có thể tồn tại một nhãn mồ côi; không có cron thì không ai đi tìm.

Cron dọn làm gì: với mỗi bản ghi kẹt, hỏi hãng theo mã đã ghi ở ③ → hãng có nhãn thì chốt nốt cho
đủ sổ; hãng bảo không có thì đánh dấu hỏng. **Tuyệt đối không xoá bản ghi kẹt** — xoá là mất dấu
tiền đã tiêu.

---

## 2. Chống mua trùng bằng RÀNG BUỘC DUY NHẤT, không bằng "đọc rồi ghi"

Hiện tại onos chặn bằng cách đọc nhóm đơn xem đã có vận đơn chưa rồi mới mua. Hai lần bấm cách
nhau vài trăm mili-giây lọt cả hai, vì giữa lúc đọc và lúc ghi không có gì giữ chỗ.

Khuôn đúng:

- Đường mua nhận **một khoá idempotency** do bên gọi cấp (`merchantRef` / `requestId`), lưu cùng
  bản ghi, có **unique index** trên `(chủ thể, khoá)`.
- Gọi lại cùng khoá → **trả về đúng nhãn của lượt trước**, không tạo nhãn thứ hai, không ném lỗi.
- Bắt cả lỗi vi phạm unique ở tầng dưới (E11000) và quy nó về nhánh "trả nhãn cũ" — cuộc đua thắng
  ở tầng DB, không ở tầng code.

Việc này **chưa gấp khi còn con người bấm nút**, nhưng thành bắt buộc ngay khi nối tự động vào
công đoạn Đóng hàng: lúc đó cái bấm nút là một job, và job thì retry.

---

## 3. Tách trạng thái MUA khỏi trạng thái HÃNG

Một cột `status` không gánh được hai câu hỏi khác nhau:

| Câu hỏi | Ai trả lời | Trường |
|---|---|---|
| Mình đã mua xong nhãn chưa, có hủy chưa? | Hệ mình | `status`: `purchasing` · `created` · `cancelling` · `cancelled` · `failed` |
| Hàng đang ở đâu, hãng nói gì? | Hãng | `carrierStatus` (text thô của hãng) · `carrierNote` (lý do, vd địa chỉ nghi sai) · `scannedAt` · `carrierSyncedAt` |

Vì sao phải tách:

- **`scannedAt` (lần quét thật đầu tiên) là chốt an toàn của §4.** Không có nó thì không có cách
  nào biết nhãn còn hủy được hay không.
- **`carrierNote` là thứ ops đọc để cứu đơn** ("địa chỉ người nhận có thể sai") — gộp vào enum
  trạng thái của mình là mất sạch.
- **`carrierSyncedAt` là chỉ mục của cron.** Index `(status, carrierSyncedAt)` cho cron quét đúng
  phần cần hỏi, thay vì quét cả bảng.

Đặt index **theo đường cron sẽ quét**, không phải theo trực giác: mỗi cron một index, viết chú
thích ngay cạnh nói cron nào dùng.

---

## 4. Hủy nhãn: kiểm trước, và khi không biết thì chọn hướng không mất tiền

Hủy là chỗ dễ mất tiền nhất vì nó **im lặng**: hủy nhầm một nhãn đang trên đường giao thì hàng cứ
đi, chỉ có mình mất dấu.

Trình tự bắt buộc:

```
① hỏi hãng: nhãn này đã bị quét vào mạng lưới chưa?
   ├─ đã quét            → TỪ CHỐI hủy (không phải "hủy rồi báo lỗi sau")
   ├─ hãng nói không có  → nhãn đã chết sẵn, đi thẳng sang bước ghi sổ
   └─ KHÔNG hỏi được (mạng lỗi/500) → 🔴 TỪ CHỐI hủy
② chuyển sang trạng thái trung gian "đang hủy"
③ gọi hãng hủy
④ chỉ khi hãng XÁC NHẬN nhãn đã chết mới chuyển "đã hủy" + mở đường hoàn tiền
```

Hai điểm hay bị làm sai:

- **Fail-closed theo chiều tiền.** Không đọc được hành trình thì coi như *đã quét* và từ chối hủy.
  Ngược chiều với các chốt khác trong hệ (thường "không biết" thì cho qua), nhưng cùng một tinh
  thần: **nghi ngờ thì chọn hướng không mất tiền.**
- **Trạng thái "đang hủy" không phải trang trí.** Đã gọi lệnh hủy nhưng chưa xác nhận nhãn chết là
  trạng thái *chưa biết* — ở đó tuyệt đối không được hoàn tiền, không được coi kiện là xong.

Khi nào hủy được, khi nào không, và mốc nào tính là "đã đi" — hỏi ops trước khi code, đừng suy từ
tài liệu API.

---

## 5. Việc phụ hỏng không được làm hỏng việc chính đã xong

Sau khi nhãn đã chốt (và tiền đã tiêu), luồng thường còn làm thêm: cập nhật số dư để đối soát, ghi
bảng giá, bắn thông báo, gọi webhook. **Tất cả đều là việc phụ.**

Luật:

> Từ dòng chốt trở xuống là **vùng không được ném**. Mỗi việc phụ bọc `try/catch` riêng của nó,
> hỏng thì `logger.warn` rồi đi tiếp.

Cái bẫy thật sự không phải quên `try/catch`, mà là **gộp việc phụ vào chung khối `try` của việc
chính**. Lúc đó việc phụ ném → rơi vào `catch` của việc chính → chạy nhánh đền bù (hủy nhãn, đánh
dấu hỏng) **cho một giao dịch đã thành công**. Kết quả: tiền đã thu, nhãn bị hủy, không hoàn — nặng
hơn hẳn lỗi ban đầu.

Onos đang làm đúng luật này ở chỗ chụp số dư ví sau khi mua (`shipping-vnp.service.ts`, khối
`balanceAfter`). Giữ nguyên tinh thần đó cho mọi thứ thêm vào sau.

---

## 6. Báo giá: học từ giao dịch thật, đừng chờ hãng mở API

Onos đang treo `calculateFee` với lý do "chờ nhà cung cấp". Không cần chờ — cước của các hãng nội
địa Mỹ gần như là **hàm bậc thang xác định** theo (vùng, nấc cân), nên tự dựng được bảng giá từ
chính những lần đã mua:

- Lưu **giá hãng thu thật** của mỗi lần mua, cùng nấc cân (làm tròn LÊN) và vùng đích.
- Bảng giá tự đầy dần: mỗi lần mua mới ghi đè ô tương ứng bằng số thật. Vùng chưa từng bán vẫn
  trống → trả **giá trần** kèm cờ đánh dấu "chưa có số thật", đừng trả giá đoán mà không nói.
- Tách rõ **giá đã báo** (`quoted`) và **giá hãng thu** (`purchase`). Chênh nhau là chuyện bình
  thường ở vùng chưa có dữ liệu; đã báo rồi thì chịu phần chênh và **log cảnh báo**, đừng thu thêm.

Một cái bẫy đã trả giá để biết: **vùng cước là hàm của CẶP (điểm gửi, điểm đến)**, không phải chỉ
của điểm đến. Cùng một mã bưu chính đích cho hai vùng khác nhau khi gửi từ hai kho khác nhau. Onos
có **địa chỉ gửi theo xưởng** nên dính đúng bẫy này: bảng giá phải khoá theo cả đầu gửi, không thì
học vào ô của xưởng khác và làm hỏng giá của mọi xưởng còn lại.

---

## 7. Cron: khoá, lô, và chỉ ghi khi có thay đổi

Cron đồng bộ hành trình là đường **đốt quota và đốt tiền** của hãng, nên:

| Luật | Hiện trạng onos |
|---|---|
| **Phải xác thực** — secret trên query hoặc header, so bằng hằng số | ❌ `GET /shipping-vnp/tracking/cron` đang `@Auth([], [], { public: true })`, ai gọi cũng được, mỗi lượt kéo tới 200 lần gọi ra ngoài |
| Khoá in-flight chống gọi chồng | ✅ đã có |
| Lô có trần + giãn nhịp giữa các lượt gọi | ✅ đã có |
| Dừng theo tuổi và theo trạng thái cuối (đã giao / quá hạn) | ✅ đã có |
| Chỉ ghi lịch sử khi trạng thái **đổi** | ✅ đã có |
| Gọi từng mã thay vì kéo danh sách | ✅ đã có — giữ nguyên, cửa danh sách của các hãng thường không lọc được |

Sửa dòng đầu bảng này là việc rẻ nhất trong cả tài liệu và **nên làm trước mọi thứ khác**, kể cả
khi luồng mua nhãn chưa bật.

---

## 8. Làm việc với API hãng khi tài liệu thiếu

Tài liệu của hãng thường không khai response. Kỷ luật:

- **Đo bằng lệnh gọi thật rồi ghi hình dạng vào chú thích code**, kèm ngày đo. Onos đang làm đúng
  (`// Format thật (xác nhận 24/08): { code:200, result:[{ … }] }`) — giữ thói quen này.
- Có **hàm dò field theo nhiều tên** làm lưới an toàn, nhưng đừng để nó thay thế việc đo: dò được
  mà không biết vì sao dò được thì bản sau của hãng đổi tên là hỏng câm.
- **Phân biệt ba tình huống**, đừng gộp:
  - hãng trả 404 = *hãng nói không có* (nhãn đã chết) → kết luận được;
  - hãng trả 5xx / mạng lỗi = *không hỏi được* → **không kết luận gì**;
  - hãng trả 200 với nội dung lạ = *đổi hợp đồng* → log nguyên văn rồi ném.
- Lỗi mạng thuần thì retry **một lần**, 401 thì đăng nhập lại **một lần** — nhiều hơn là che mất
  sự cố thật.

---

## Hiện trạng OnosFactory và thứ tự đề xuất

| # | Việc | Mức rủi ro nếu bỏ qua | Ghi chú |
|---|---|---|---|
| 1 | Khoá endpoint cron (§7) | Cao, đang hở | ~15 phút, không phụ thuộc phần còn lại |
| 2 | Bước giữ chỗ + ghi mã hãng ngay + chốt có điều kiện + cron dọn (§1) | **Cao nhất** | Phải xong **trước** khi bật mua nhãn thật; sau đó mỗi lần hỏng là tiền thật không dấu vết |
| 3 | Tách `carrierStatus`/`scannedAt` khỏi `status` (§3) | Trung bình | Là tiền đề của mục 4 |
| 4 | Chốt hủy fail-closed + trạng thái "đang hủy" (§4) | Cao khi có đơn chạy thật | Cần hỏi ops mốc "đã đi" |
| 5 | Khoá idempotency đường mua (§2) | Thấp bây giờ, **cao khi tự động hoá** | Bắt buộc trước khi nối vào công đoạn Đóng hàng |
| 6 | Báo giá tự học (§6) | Thấp | Chỉ làm được sau khi đã có nhãn mua thật để học |

---

## Checklist review PR mảng shipping

- [ ] Mỗi lệnh gọi ra hãng: nếu tiến trình chết ngay sau nó, mình còn giữ được mã để tra/hủy không?
- [ ] Bước chốt trạng thái có điều kiện, và có kiểm số bản ghi thực sự đổi không?
- [ ] Có đường nào tạo được hai nhãn cho cùng một kiện không? Chặn bằng gì — code hay unique index?
- [ ] Hủy có kiểm "đã vào mạng lưới" trước không, và khi không hỏi được hãng thì chọn hướng nào?
- [ ] Sau dòng chốt có việc phụ nào nằm trong khối `try` của việc chính không?
- [ ] Endpoint cron có xác thực không? Có trần lô không?
- [ ] Chú thích có ghi hình dạng response thật + ngày đo không?
- [ ] Trạng thái mới thêm có được xử ở cron dọn không, hay lại đẻ ra một loại bản ghi kẹt mới?
