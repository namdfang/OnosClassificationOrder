# CEO Dashboard — agent đọc cùng số với lãnh đạo

> Hai lệnh gọi, chỉ đọc, cùng khoá `X-Agent-Api-Key`:
> - `GET /api/v1/agent/ceo-overview?from=YYYY-MM-DD&to=YYYY-MM-DD` — bộ số 7 khối + kết luận theo luật (`findings`).
> - `GET /api/v1/agent/ceo-report?from&to` — nhận định tiếng Việt hệ thống đã viết cho kỳ đó (null nếu chưa có).
>
> Đây là **đúng số CEO đang nhìn** trên bảng điều hành nội bộ. Khi báo cáo ngày/tuần/tháng, dùng hai lệnh này thay vì tự cộng từ `orders` — cộng tay sẽ lệch (bộ lọc đơn hủy/xưởng US/đơn treo, luật chặng, luật "đủ tuổi" của SLA).

## Kỳ nào gọi thế nào

| Báo cáo | `from` / `to` (giờ VN) | Đã có nhận định sẵn lúc |
|---|---|---|
| Ngày | cùng một ngày (thường là hôm qua) | 07:00 sáng hôm sau |
| Tuần | thứ Hai → Chủ nhật tuần trước | 07:10 thứ Hai |
| Tháng | mùng 1 → ngày cuối tháng trước | 07:20 mùng 1 |
| Tùy chọn | bất kỳ, tối đa 92 ngày | chưa có — chỉ có số (`ceo-overview`); nhận định do người bấm "Cập nhật nhận định" trên dashboard |

Kỳ so sánh (`period.prevFrom`/`prevTo`) luôn là **kỳ liền trước**: báo cáo ngày so với **hôm qua** (tiến độ). Báo cáo ngày còn có `production.reference` = cùng thứ tuần trước + trung bình 7 ngày (nhịp): chỉ gọi là "sụt/tăng năng lực" khi lệch cùng chiều so với cả hôm qua lẫn TB 7 ngày (≥20%), còn lại mô tả là dao động theo nhịp tuần.

Với báo cáo ngày, **SLA đánh giá lô đơn vào ngày D−2** (`sla.cohortFrom`) — nói rõ "lô vào ngày …"; `sla.mature = 0` nghĩa là chưa có lô đủ tuổi, không nêu % đúng hẹn. Kết luận về khách tăng/giảm, tập trung khách, giá trị đơn chỉ xuất hiện ở kỳ ≥ 7 ngày — báo cáo ngày đừng tự suy những chuyện đó từ số một ngày (khách đẩy đơn theo lô). `period.weekday` (0=CN..6=T7): cuối tuần vào/ra thấp là nhịp bình thường.

## Cách dùng khi trả lời

1. **Có `report`** → trích `tomTat`, `ketLuan`, `viecCanLam`, `ruiRo`, `diemSang` **nguyên văn**; số cốt lõi lấy ở `report.soLieu` (in, out, revenue, n2Pct, errorRatePct, backlog, overdue). Không viết lại số theo cách khác.
2. **Chưa có `report`** → dùng `ceo-overview`: diễn giải `findings` (bảng mã dưới) + số trong các khối; nói rõ "chưa có nhận định của hệ thống cho kỳ này".
3. Tiền (`revenue`) là **giá trị đơn theo baseCost, USD** — gọi đúng tên, không gọi là doanh thu. Khách bên ngoài không được nghe con số này (xem `WhatYouCannotSee.md`); đây là số cho CEO/nội bộ.

## Định nghĩa số (rút gọn; đầy đủ ở `documents/FunctionDescription/CeoDashboard.md` §3)

- `production.in` = đơn vào sản xuất trong kỳ; `production.out` = đơn đóng hàng trong kỳ (không cần vào trong kỳ). Loại đơn hủy, đơn chưa map xưởng, xưởng US.
- `sla.within[n]`: N0/N1 tính trên mọi đơn trong kỳ; **N2 chỉ tính trên đơn đủ tuổi** (`sla.mature`, vào SX ≥ 2 ngày). Chỉ tiêu N0≥30 · N1≥80 · N2=100.
- `sla.overdue` = đơn còn mở, vào SX từ 3 ngày trước, **trong 45 ngày** — đơn mở cũ hơn là `capacity.staleOpen` (nợ dữ liệu), không phải quá hạn.
- `quality.ratePct` = % đơn trong kỳ có lỗi xưởng; `bySource`: designer / factory / tool-check.
- `capacity.backlog` = đơn chưa đóng, vào SX trong 45 ngày; `byStage` theo 8 chặng; `history` tồn cuối ngày 30 ngày.
- `customers.top` xếp theo đơn; `rising` (≥3 đơn kỳ trước, tăng ≥50%), `dropping` (≥5 đơn kỳ trước, giảm ≥50%); `tier` = hạng VIP.

## Bảng mã `findings`

| code | nghĩa | params |
|---|---|---|
| `sla_n2_below` / `sla_n2_ok` | % ra trong 2 ngày dưới / đạt chỉ tiêu | pct, target, gap, factory, factoryPct |
| `overdue_orders` | đơn quá hạn còn mở | n, factory, factoryN, oldest (ngày) |
| `output_up` / `output_down` | đơn ra đổi ≥10% so kỳ trước | pct, out, prev |
| `in_exceeds_out` | vào nhiều hơn ra >25% | in, out, gap |
| `backlog_rising` | tồn tăng ≥15% so đầu kỳ | pct, backlog, prev |
| `factory_slow_clear` | xưởng cần ≥3 ngày xả tồn | factory (chuỗi) |
| `error_rate_high` / `error_rate_down` | tỉ lệ lỗi ≥5% hoặc +2 điểm / giảm | pct, delta, source, share, type |
| `customers_dropping` / `customers_rising` | khách giảm/tăng mạnh | n, list |
| `vip_issues` | khách VIP có đơn giữ/lỗi | list |
| `customer_concentration` | top 10 ≥70% đơn | pct |
| `designer_overload` | designer tồn ≥30 việc | list |
| `revenue_up` / `revenue_down` | giá trị đơn đổi ≥10% | pct, total, prev |
| `output_down_day` / `output_up_day` | báo cáo ngày: đơn ra lệch cùng chiều so với hôm qua VÀ TB 7 ngày (≥20%) | out, prev, avg7, pctAvg |
| `weekend_day` (info) | kỳ 1 ngày rơi vào T7/CN | day, weekday |
| `sla_pending` (info) | chưa có lô đủ tuổi đánh giá đúng hẹn | cohort |

`severity`: critical → warning → good → info (đã sắp). `action` (nếu có) là mã việc cần làm: `act_unblock_stage`, `act_clear_overdue`, `act_check_capacity`, `act_rebalance_factory`, `act_review_design`, `act_review_factory`, `act_contact_customers`, `act_vip_followup`, `act_rebalance_design`.

## Ví dụ

```bash
curl -s "$API/api/v1/agent/ceo-report?from=2026-08-31&to=2026-09-06" -H "X-Agent-Api-Key: $KEY"
# → data.report.tomTat: "Tuần 31/08–06/09 vào 4.446 đơn, ra 4.394 (giảm 41% so tuần trước)…"
```
