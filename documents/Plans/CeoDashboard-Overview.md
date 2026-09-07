# CEO Dashboard — bản mô tả 5 khối (bảng "Tổng quan điều hành")

> Trạng thái: **ĐÃ CHỐT & CÀI ĐẶT** (07/09/2026, người dùng chốt: kỳ mặc định 7 ngày; giữ chỉ tiêu N0≥30 · N1≥80 · N2=100; **có tiền** theo `baseCost`; **có** khối Nhân sự; thêm khối Vận hành theo ngày + Kết luận/Việc cần làm theo luật). Bỏ bước vẽ Superdesign — dựng thẳng bằng recharts theo hệ thiết kế. Hiện trạng và định nghĩa số: `documents/FunctionDescription/CeoDashboard.md`.

## Nguyên tắc

- Trả lời **5 câu hỏi buổi sáng của CEO**, mỗi câu một khối, đọc xong trong 30 giây, chiếu được lên màn hình họp.
- Mỗi khối = **một số lớn + một câu xu hướng** (so kỳ trước hoặc so chỉ tiêu) + một biểu đồ nhỏ theo thời gian + tối đa một bảng ngắn. Không phễu 8 ô, không dải pill, không thao tác sửa.
- Kỳ mặc định: **tuần này** (7 ngày liền kề tính cả CN, giống SLA Telegram), so với 7 ngày trước đó. Có chuyển Hôm nay / Tuần / Tháng.
- **Mọi số đến từ một endpoint tổng hợp mới `GET /v1/ceo/overview?from&to`** (gom các hàm BE đã có, không tính mới ở FE). Endpoint này đồng thời được mô tả trong `documents/AgentGuide/` để Agent báo cáo cùng số — đây là "sự thật chung". Bấm vào số nào cũng mở được danh sách đơn đứng sau số đó (trang xưởng / danh sách đơn với đúng bộ lọc).
- Phạm vi số: loại đơn hủy, đơn chưa map xưởng, xưởng US (Orders.md §19/§21) — đúng bộ lọc chuẩn của mọi thống kê.

## Khối 1 — Sản lượng: "Tuần này ta làm được bao nhiêu?"

| Thành phần | Nội dung | Nguồn BE |
|---|---|---|
| Số lớn | Đơn **ra xưởng** (đóng hàng xong) trong kỳ | `getLifecycleOverview.throughput` (`fulfillmentCompletedAt` trong kỳ) |
| Câu xu hướng | "↑ 12% so với tuần trước · 1.240 đơn vào / 1.180 đơn ra" | cùng aggregate chạy 2 kỳ (kỳ này + kỳ trước) |
| Biểu đồ | Cột đôi theo ngày: đơn vào (`inProductionAt`) vs đơn ra, 14 ngày | `buildReportDayWindows` + `$facet` theo ngày VN (khuôn `daily-orders-aggregator`) |
| Bảng ngắn | Theo xưởng: vào / ra / tồn cuối kỳ | `getFactoryOverview` hoặc nhánh `factories` của aggregator |

Ý CEO đọc được: xưởng đang xả nhanh hơn hay chậm hơn nhịp đơn vào (tồn tăng hay giảm).

## Khối 2 — Đúng hẹn: "Ta có giao đúng hẹn không?"

| Thành phần | Nội dung | Nguồn BE |
|---|---|---|
| Số lớn | **% đơn ra trong N2** (2 ngày kể từ vào SX) của cohort 7 ngày | `aggregateSla()` — `SLA_TARGETS` N0≥30 · N1≥80 · N2=100 |
| Câu xu hướng | "N0 34% · N1 81% · N2 96% — thiếu chỉ tiêu N2 4 điểm, kẹt ở Ép (ML)" | cùng hàm, `slaFactories` + "kẹt ở chặng nào" |
| Biểu đồ | 3 vạch N0/N1/N2 so với 3 vạch chỉ tiêu; dưới là 7 cột nhỏ %N2 từng ngày | cohort theo ngày của `aggregateSla` |
| Bảng ngắn | Đơn **quá hạn** (N3+) đang tồn: tuổi, khách, xưởng, chặng — tối đa 5 dòng + "xem tất cả" | `getOverdueAlert()` + danh sách đơn `getOrders` lọc tuổi |

Đây là khối quan trọng nhất với khách Mỹ; đặt to nhất, có màu cảnh báo khi hụt chỉ tiêu.

## Khối 3 — Chất lượng: "Chỗ nào đang hỏng?"

| Thành phần | Nội dung | Nguồn BE |
|---|---|---|
| Số lớn | **Tỉ lệ đơn phải làm lại** trong kỳ (đơn có lỗi xưởng / đơn ra) | `getErrorStats(from,to)` + throughput khối 1 |
| Câu xu hướng | "3,1% · ↓ 0,6 điểm so tuần trước · nguồn lỗi: design 58% · xưởng 30% · tool 12%" | `getErrorStats` chia theo `productionErrorSource` |
| Biểu đồ | Cột chồng lỗi theo ngày, màu theo nguồn lỗi; hoặc theo công đoạn phát hiện | `getStageErrorDaily` |
| Bảng ngắn | Top 5 loại sản phẩm / top 5 người có lỗi nhiều nhất (chuyển tab) | `getErrorStats.byType`, `getPersonErrorOverview` |

Không hiện "8 đơn chưa soát" — đó là việc của trưởng ca, không phải tín hiệu cho CEO.

## Khối 4 — Khách hàng: "Ai đang nuôi ta, ai đang rời?"

| Thành phần | Nội dung | Nguồn BE |
|---|---|---|
| Số lớn | **Số khách có đơn** trong kỳ (so kỳ trước) | aggregate `orders` theo `userSku` trong kỳ |
| Câu xu hướng | "Top 10 khách chiếm 62% đơn · 3 khách tăng mạnh · 2 khách VIP im lặng 7 ngày" | so đơn từng khách kỳ này vs kỳ trước; VIP từ `customers.tier` |
| Biểu đồ | Thanh ngang top 10 khách theo đơn, tô màu tier VIP, mũi tên ↑↓ so kỳ trước | nhánh `customers` của `daily-orders-aggregator` mở rộng cho mọi khách |
| Bảng ngắn | Khách **ưu tiên** (`customer_priority_config`) có đơn đang kẹt/giữ | `getPriorityCustomers()` + đơn `heldAt`/lỗi của họ; có thể nối `zalo_group_summaries.mucDo` (nhóm nào đang "gấp") |

Đây là khối duy nhất nhìn ra ngoài xưởng; Agent seller-support cũng đang đọc cùng dữ liệu này.

## Khối 5 — Năng lực: "Còn dư hay đang quá tải?"

| Thành phần | Nội dung | Nguồn BE |
|---|---|---|
| Số lớn | **Tồn cuối ngày** (đơn trong xưởng chưa ra) và tuổi tồn trung bình | `getLifecycleOverview` snapshot các chặng |
| Câu xu hướng | "Tồn 412 · ↑ 8% · thiết kế chiếm 31% tồn · Hạnh 58 việc" | snapshot theo chặng + `getAssignBacklog`/`getDailyOverview` theo designer |
| Biểu đồ | Đường tồn cuối ngày 30 ngày, đè lên vùng "đơn vào/ngày" | cần **snapshot tồn hằng ngày** — chưa có, xem mục "Cần thêm" |
| Bảng ngắn | Theo xưởng: đơn ra/ngày TB 7 ngày (sản lượng thực) vs tồn hiện tại → số ngày cần để xả hết | tính từ khối 1 + snapshot |

## Cần thêm ở BE (duy nhất phần chưa có sẵn)

1. **Endpoint `GET /v1/ceo/overview?from&to`** (module mới `ceo-dashboard`, `@Auth([SuperAdmin, Admin])`): gọi các hàm trên cho kỳ này + kỳ trước, trả một JSON 5 khối; cache Redis 5 phút theo `(from,to)`.
2. **Snapshot tồn cuối ngày** (khối 5): cron 23:59 VN ghi `{date, factoryId, stage, count}` vào collection `daily_stage_snapshots`; backfill 30 ngày từ `fulfillmentTimeline`/`inProductionAt` khi triển khai. Không có cái này thì đường tồn 30 ngày phải tính lại từ lịch sử mỗi lần gọi — chậm.
3. Ghi vào `documents/AgentGuide/` cách Agent đọc cùng endpoint (hoặc cùng collection snapshot) để báo cáo Telegram/Zalo khớp số.

## Bố cục (để vẽ)

```
[ Kỳ: Hôm nay | Tuần này | Tháng ]      so với kỳ trước ▾            [ 07/09/2026 · cập nhật 5' ]

┌ 2. ĐÚNG HẸN (to nhất) ───────────────┐ ┌ 1. SẢN LƯỢNG ─────────────────────┐
│ 96%  đơn ra trong 2 ngày   ▼ hụt 4đ  │ │ 1.180 đơn ra  ↑12%  · 1.240 vào   │
│ N0 ▮▮▮ 34/30  N1 ▮▮▮▮▮ 81/80  N2 96/100│ │ ▂▃▅▆▅▇▆▅▆▇█▆▅▇ vào/ra 14 ngày      │
│ quá hạn: 5 đơn — ML 4 · TN 1          │ │ TN 640 ra / 610 vào  · ML 540/630  │
└──────────────────────────────────────┘ └───────────────────────────────────┘
┌ 3. CHẤT LƯỢNG ───────┐ ┌ 4. KHÁCH HÀNG ──────────┐ ┌ 5. NĂNG LỰC ─────────────┐
│ 3,1% làm lại ↓0,6đ   │ │ 48 khách · top10 = 62%  │ │ tồn 412 ↑8% · xả hết ~2,1 ngày│
│ design 58 · xưởng 30 │ │ ▬▬▬▬▬▬ SENP ↑  ▬▬▬ NAM ↓ │ │ ╱╲╱‾‾╲ tồn 30 ngày           │
│ top lỗi: Polo, Hoodie│ │ VIP kẹt: 2 đơn TIENHC    │ │ thiết kế 31% tồn · Hạnh 58    │
└──────────────────────┘ └─────────────────────────┘ └──────────────────────────────┘
```

Hai hướng sẽ vẽ: **(A) "bảng họp buổi sáng"** — nền sáng, chữ lớn, ít màu, in được; **(B) "màn hình treo tường"** — nền tối, số rất lớn, tự đổi kỳ, để trong xưởng/phòng CEO.

## Câu hỏi cần bạn chốt

1. Kỳ mặc định: tuần này (đề xuất) hay hôm nay?
2. Khối 2 dùng đúng bộ chỉ tiêu N0≥30 · N1≥80 · N2=100 đang chạy ở báo cáo Telegram, hay CEO muốn chỉ tiêu khác?
3. Khối 4 có hiện **doanh thu/giá** không? Hiện hệ thống có `baseCost`/giá biến thể nhưng kỷ luật "đọc được ≠ nói được" đang cấm Agent nói tiền — CEO xem thì được, nhưng cần quyết trước khi thiết kế.
4. Có cần khối "Nhân sự" (năng suất designer, công nhân theo công đoạn) như khối thứ 6, hay để trong trang Dashboard vận hành?
