# OnosFactory — Design System

## 1. Product context
OnosFactory là hệ điều hành nội bộ của một xưởng in-ấn/may (print-on-demand, all-over print) phục vụ khách bán hàng ở Mỹ. Nhân sự dùng: quản lý xưởng, tổ trưởng công đoạn (In → Ép → QC → May vào → May ra → Đóng hàng), designer, support soát tool, admin. Khách hàng có Customer Portal riêng (không thuộc phạm vi này).

Trang đang thiết kế: **`/ffm/orders/workshop` — "Đơn hàng theo xưởng"**. Job-to-be-done: mỗi sáng quản lý xưởng nhìn 1 màn hình để biết **hôm nay có bao nhiêu đơn, đang kẹt ở chặng nào, đơn nào cần xử lý** rồi mở từng đơn/nhóm sản phẩm để thao tác (gán máy in, đổi trạng thái, giữ đơn, in tem). Dữ liệu được nhóm theo **loại sản phẩm** (34 nhóm ngày 06/09/2026, 174 đơn, 2 xưởng TN 115 / ML 59).

Các trang liên quan cùng shell: Dashboard `/ffm/dashboard` (tabs stats/status/factory/lifecycle), Danh sách đơn `/ffm/orders`, Task Fulfillment `/ffm/fulfillment/my-tasks` (kanban), Quét mã lỗi `/orders/scan-error`.

## 2. Nguyên tắc UX của trang vận hành (bắt buộc)
1. **Tổng quan trước, chi tiết sau**: dải phễu chặng (Soát tool → Thiết kế → In → Ép → QC → May vào → May ra → Đóng hàng) ở đầu trang, số thật, chặng đang chọn được tô nổi; bấm chặng = lọc bảng.
2. **Trạng thái đọc bằng hình**: pill/chip kèm số đếm (Giữ đơn, Lỗi file, Chưa soát, Thiếu tool, Ưu tiên). Màu ngữ nghĩa tách khỏi màu chủ đạo: xanh lá = ổn, hổ phách = cần chú ý, đỏ = kẹt/lỗi, xám = chưa bắt đầu.
3. **Bảng quét dọc được**: mã đơn dạng mono `tabular-nums`, 1 dòng/đơn, cột cố định trái (mã + ảnh mockup), hàng nhóm sản phẩm mỏng (tên + n đơn/qty) thay vì khối card to; hover hàng mới hiện nút thao tác.
4. **Một ngôn ngữ**: nhãn tiếng Việt thống nhất (không trộn "Print"/"In"); tên cột ngắn; không nút chỉ-icon không nhãn ở thao tác chính; không "mọi thời gian" làm mặc định — mặc định là hôm nay.
5. **Không hộp lồng hộp**: border/shadow chỉ cho thứ cần nổi (panel đang chọn, drawer). Nền trang trắng, khối phẳng phân cách bằng đường kẻ `border`.

## 3. Màu (Tailwind + shadcn HSL variables; light = `:root`, dark = `.dark`)
- Nền `--background` #FFFFFF · chữ `--foreground` hsl(222 84% 5%) · chữ phụ `--muted-foreground` hsl(215 16% 47%) · viền `--border` hsl(214 32% 91%) · khối phụ `--muted`/`--secondary` hsl(210 40% 96%).
- **Chủ đạo (UI app)**: indigo `primary` #6366F1 (hover #4F46E5, nhạt #EEF2FF) — nút chính, tab/pill đang chọn, link, focus ring.
- **Brand (chỉ landing/logo)**: tím `brand.600` #6f26c2, tối `ink.800` #2b2739 — KHÔNG dùng làm màu nút trong app.
- Ngữ nghĩa: thành công `emerald-600` #059669 (nền `emerald-50`), cảnh báo `amber-500` #F59E0B (nền `amber-50`), lỗi/kẹt `red-600` #DC2626 (nền `red-50`), thông tin `sky-600`, trung tính `slate-400`.
- Dark: nền hsl(222 84% 5%), khối hsl(217 33% 17%), viền hsl(217 33% 17%), chữ hsl(210 40% 98%).

## 4. Chữ
- Body **Inter** 400/500/600/700 (`font-sans`), tiêu đề trang 18–20px/600, tiêu đề khối 14px/600, thân bảng 13px, chú thích 12px `text-muted-foreground`.
- Hiển thị **Lexend Deca** (`font-display`) chỉ cho landing — trong app không dùng.
- Mã đơn/SKU/mã máy: `font-mono` (ui-monospace, "JetBrains Mono" fallback) 12–13px, `tabular-nums`, chữ hoa giữ nguyên.
- Nhãn cột: 12px/500 uppercase `tracking-wide` `text-muted-foreground`.

## 5. Khoảng cách & khung
- Lưới 4px; padding trang 24px (`p-6`), khoảng giữa khối 16px, trong khối 12px; ô bảng `px-3 py-2`, hàng 40px (bảng gọn 36px).
- Bo góc `--radius` 8px (`rounded-lg`) cho khối/nút, `rounded-md` 6px cho input/chip, `rounded-full` cho pill số đếm.
- Bóng: gần như không; `shadow-sm` cho popover/drawer; panel chọn dùng viền `primary` thay bóng.
- Shell: Sidebar trái 256px (thu gọn 72px) nền trắng viền phải; Header 56px; vùng nội dung cuộn, chiều rộng tối đa full.

## 6. Thành phần (shadcn/Radix — `apps/web/src/components/ui`)
Button (default/outline/ghost/secondary/destructive; sm 32px, default 36px), Badge (default/secondary/outline/destructive; dùng cho trạng thái), Table (thead nền `muted`, hàng hover `muted/50`), Tabs (underline), Tooltip, Popover, Dialog/Sheet (drawer phải 480–640px), Input 36px, Switch, DropdownMenu. Icon **lucide** 16px trong bảng/chip, 18px menu, 20px header.

Chip trạng thái chuẩn: `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium` + màu ngữ nghĩa nền nhạt/chữ đậm (ví dụ `bg-amber-50 text-amber-700 ring-1 ring-amber-200`).

## 7. Chuyển động
Ít và có mục đích: page transition fade 150ms (framer-motion), hover hàng `transition-colors 150ms`, drawer trượt 200ms ease-out, không animation trang trí. Tôn trọng `prefers-reduced-motion`.

## 8. Ràng buộc riêng của dự án
- Số liệu trong bản thiết kế phải là **số thật ngày 06/09/2026** (file `.superdesign/tmp/workshop-real-data-2026-09-06.json`), không bịa.
- Không lộ giá vốn/tiền trong màn hình xưởng.
- Logo: dùng đúng Brand Asset `apps/web/src/assets/images/logo.png` (177×43) ở góc trên sidebar; không thay bằng chữ/emoji/icon.
- Giữ nguyên bộ font/màu ở mục 3–4; bản biến thể chỉ khác **bố cục, mật độ, thứ tự thông tin**, không đổi phong cách thị giác.
