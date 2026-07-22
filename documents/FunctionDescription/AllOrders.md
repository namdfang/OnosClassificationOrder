# All Orders — Function Description

> **File:** `apps/web/src/pages/orders/allOrders/index.tsx`
> **Route:** `/ffm/orders/list`

---

## 1. Overview

Trang **All Orders** là trang quản lý đơn hàng chính của hệ thống Printsel. Cho phép user xem, lọc, tìm kiếm, xuất file, và thực hiện các thao tác hàng loạt trên đơn hàng.

---

## 2. Luồng hoạt động (Flow)

### 2.1 Khởi tạo trang

```
User truy cập /orders/list
  → useSearchParams() đọc toàn bộ query params từ URL
  → fetchOrders() + fetchOrderStatistics() chạy song song
  → fetchProviders() lấy danh sách providers
  → fetchUsers() (chỉ Admin/SuperAdmin/SellerManager ở môi trường dev)
  → Render: BreadCrumb → Stats bar → Filter bar → Tabs → OrderTable
```

### 2.2 Luồng lọc & tìm kiếm

```
User thay đổi bất kỳ filter nào
  → updateSearchParams() cập nhật URL query string
  → useEffect([location.search]) trigger
  → fetchOrders() + fetchOrderStatistics() gọi lại API
  → Table re-render với data mới
```

**Tất cả filter state được sync với URL** → user có thể bookmark/share link với filter đã chọn.

### 2.3 Luồng chuyển tab trạng thái

```
User click tab (e.g., "Pending", "InTransit")
  → handleStatusChange(status)
  → Nếu "Archived": set archived=true, xóa status param
  → Nếu status rỗng: xóa cả status & archived (= All orders)
  → Nếu status cụ thể: set status param, xóa archived
  → URL thay đổi → trigger fetchOrders()
```

### 2.4 Luồng export đơn hàng

```
Cách 1: "By Order Selected"
  → User chọn các đơn hàng trong table (checkbox)
  → Click Export → handleSelectExport()
  → Tính tổng quantity & itemTotal
  → Tạo file Excel (.xlsx) từ data đã chọn
  → Download file "Orders-{timestamp}.xlsx"

Cách 2: "By Time Selected"
  → User chọn khoảng thời gian (RangePicker)
  → Click Export → handleSendExportOrders()
  → Gửi request tới API để server xử lý export
  → Server gửi file qua email/notification
```

### 2.5 Luồng phân trang & sắp xếp

```
User thay đổi page/pageSize/sort
  → handleTableChange(pagination, filters, sorter)
  → Cập nhật URL: page, limit, sort, order
  → Trigger fetchOrders()
```

---

## 3. Các bộ lọc (Filters)

| Filter | Component | Param URL | Mô tả |
|--------|-----------|-----------|--------|
| External ID | Input | `externalId` | Tìm theo mã đơn bên ngoài |
| Bulk External IDs | Modal (BulkOrderId) | `externalIds` | Tìm nhiều đơn cùng lúc (tối đa 100, mỗi dòng 1 ID) |
| Tracking Number | Input | `trackingNumber` | Tìm theo mã vận đơn |
| Provider | Select | `providerId` | Lọc theo nhà cung cấp |
| Product | ProductSearchDynamic | `productId` | Tìm kiếm sản phẩm động (debounce 500ms, hiển thị ảnh) |
| Shipping Type | Select | `shippingType` | Seller / Label |
| Tracking Status | Select | `trackingStatus` | Trạng thái tracking (enum TrackingStatus) |
| Country | Select | `country` | All / China / Non-China / Stock |
| Date Range | RangePicker | `from`, `to` | Presets: Today, Yesterday, 7/14/30 days |
| Status Tab | Tabs | `status` | Lọc theo trạng thái đơn hàng |
| Archived | Tab "Archived" | `archived` | Đơn đã lưu trữ |

---

## 4. Thanh thống kê (Stats Bar)

Hiển thị 3 chỉ số tổng hợp theo filter hiện tại:

- **Orders**: Tổng số đơn hàng (`total`)
- **Items**: Tổng số line items (`orderStatistic.totalItem`)
- **Quantity**: Tổng số lượng sản phẩm (`orderStatistic.totalQuantity`)

---

## 5. Tabs trạng thái đơn hàng

Hiển thị số lượng đơn theo từng trạng thái:

| Tab | Mô tả |
|-----|-------|
| All orders | Tất cả đơn |
| Pending | Chờ xử lý |
| On hold | Tạm giữ |
| TrackingMissing | Thiếu tracking |
| Processing | Đang xử lý |
| In production | Đang sản xuất |
| ShipOut* | Đã gửi hàng (chỉ dev) |
| ShipmentReceived* | Đã nhận hàng (chỉ dev) |
| Manifest* | Manifest (chỉ dev) |
| USArrival* | Đến Mỹ (chỉ dev) |
| CarrierReceived* | Carrier nhận (chỉ dev) |
| In Transit | Đang vận chuyển |
| Out For Delivery | Đang giao |
| Delivered | Đã giao |
| Tracking Hold | Tracking tạm giữ |
| Completed | Hoàn thành |
| Canceled | Đã hủy |
| Refunded | Đã hoàn tiền |
| Archived | Đã lưu trữ |

> (*) Chỉ hiển thị ở môi trường dev (`!import.meta.env.VITE_PROD`)

---

## 6. OrderTable — Bảng đơn hàng

### 6.1 Columns

| Cột | Nội dung |
|-----|----------|
| Order ID | External ID, order code, nút copy, seller/system note indicator |
| Artworks* | Ảnh artwork (front/back/left/right) — chỉ dev |
| Mockups* | Ảnh mockup — chỉ dev |
| Products | Ảnh sản phẩm, tên, variant, provider, provider order ID, status |
| Status | Trạng thái đơn với badge màu |
| Paid | Tag "Paid" / "No" |
| Tracking | Tên người nhận, tracking status, shipping type/method, tracking number (copy + link), nút refresh |
| Created | Thời gian tạo, thông tin người tạo (Admin/Manager) |
| Updated | Thời gian cập nhật (sortable) |
| Total | Số line items, quantity, tổng tiền |
| Actions | Dropdown menu thao tác |

### 6.2 Bulk Actions (thanh action dưới cùng)

| Action | Role yêu cầu | Mô tả |
|--------|--------------|-------|
| Make Payment | Seller/SellerManager/Admin | Thanh toán hàng loạt |
| Cancel Orders | All | Hủy đơn (có option hoàn tiền) |
| Archive Orders | All | Lưu trữ đơn |
| Update to InProduction | Admin/Manager/Provider/Logistics | Cập nhật trạng thái sản xuất |
| Duplicate | Seller/SellerManager/Admin | Nhân bản đơn hàng |
| Edit (Match Product) | Seller/SellerManager/Admin | Chỉnh sửa sản phẩm trong đơn |

### 6.3 Single Order Actions

- Xem chi tiết (Drawer)
- Cập nhật tracking number & shipping label URL
- Cập nhật seller note / system note
- Thay đổi địa chỉ giao hàng
- Refresh tracking (Admin/Logistics)

---

## 7. Các nút hành động chính (Header)

| Nút | Role | Mô tả |
|-----|------|-------|
| Export order | All | Dropdown: export theo đơn đã chọn hoặc theo thời gian |
| Import CSV | Seller/SellerManager/Admin | Chuyển đến trang import đơn từ CSV |
| Import Trackings | Admin/Manager/Logistics | Chuyển đến trang import tracking numbers |

---

## 8. Components phụ trợ

### BulkOrderId
- Modal cho phép nhập nhiều External ID (TextArea, mỗi dòng 1 ID)
- Tối đa 100 IDs
- Submit → cập nhật URL param `externalIds` → filter table

### ProductSearchDynamic
- Select dropdown với tìm kiếm động
- Debounce 500ms, gọi API tìm sản phẩm
- Hiển thị ảnh thumbnail + tên + variant trong options
- Cập nhật URL param `productId`

### StoreSearchDynamic (commented out)
- Tương tự ProductSearchDynamic nhưng cho Store
- Hiện đang bị comment out trong code

---

## 9. API Endpoints sử dụng

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `orders` | Lấy danh sách đơn hàng (có pagination & filter) |
| GET | `orders/statistic` | Lấy thống kê đơn hàng |
| GET | `providers` | Lấy danh sách nhà cung cấp |
| GET | `users` | Lấy danh sách users (Admin only) |
| POST | `exports/orders` | Gửi yêu cầu export đơn theo thời gian |
| POST | `orders/refetch-tracking` | Refresh tracking toàn bộ |

---

## 10. Phân quyền (Role-based)

| Tính năng | Roles được phép |
|-----------|----------------|
| Xem trang | Theo permissionMap config |
| Import CSV | Seller, SellerManager, Admin |
| Import Trackings | Admin, Manager, Logistics |
| Lọc Provider | Tất cả trừ Provider |
| Lọc Country | Tất cả trừ Provider |
| Xem user list | Admin, SuperAdmin, SellerManager (dev) |
| Scan mode | Shipment (tự động bật `scan=true`) |

---

## 11. State Management

Trang sử dụng **local state + URL params** (không dùng Zustand store riêng):

- **URL params**: Toàn bộ filter state (search, status, page, limit, sort, from/to, etc.)
- **Local state**: orders, total, loading, stores, providers, departments, users, orderStatistic, exportOrders, customDays
- **Global store**: `useAuthStore` (profile, role info)

**Ưu điểm**: Shareable URLs, browser back/forward hoạt động đúng, không mất filter khi refresh.
