# Catalog công khai (`/catalog`) — Function Description

> **File FE:** `apps/web/src/pages/catalog/{index,detail}.tsx`, `apps/web/src/components/public/{PublicProductCard.tsx,ProductImage.tsx,catalogPrice.ts}`, `apps/web/src/services/publicCatalog.ts`, i18n `apps/web/src/i18n/locales/{vi,en}/catalog.json`
> **File BE:** `apps/api/src/modules/customer-portal/public-catalog.controller.ts` + `customer-catalog.service.ts` (`getPublicCatalog()`/`getPublicCatalogItem()`/`listCatalog()`/`findCatalogItem()`)
> **Route:** `/catalog`, `/catalog/:id` (`PATHS.CATALOG`, `PATHS.CATALOG_DETAIL`)
> **API:** `GET /v1/public/catalog`, `GET /v1/public/catalog/:id`

---

## 1. Overview

Catalog **công khai, KHÔNG cần đăng nhập** — để khách chưa có tài khoản xem
được hàng trước khi quyết định đăng ký đặt đơn. Đây là bước nối tiếp của trang
chủ hướng-khách-hàng (xem [`Landing.md`](Landing.md)): header có mục "Sản phẩm"
trỏ thẳng vào đây, và mọi CTA trong trang dẫn về `CUSTOMER_REGISTER`.

**Phân biệt với 2 catalog đã có:**

| Trang                  | Ai xem được        | Giá hiển thị                                         |
| ---------------------- | ------------------ | ---------------------------------------------------- |
| `/catalog` (trang này) | **Bất kỳ ai**      | `retailPrice` — **giá niêm yết**, KHÔNG áp khuyến mãi |
| `/customer/catalog`    | Khách đã đăng nhập | Giá đã áp `Promotion` theo tier VIP của khách         |
| `/adm/products`        | Nhân viên có quyền | Đầy đủ, gồm cả giá vốn                                |

### 1.1 Thiết kế bám theo dữ liệu THẬT

> **Đọc phần này trước khi sửa giao diện.** Giao diện hiện tại được dựng lại sau
> khi đo dữ liệu thật, không theo dữ liệu lý tưởng.

Độ phủ trường trên 151 sản phẩm đang public (đo qua chính endpoint này):

| Trường                                                    | Độ phủ thực tế  |
| --------------------------------------------------------- | --------------- |
| `fullName`                                                | 151/151 (100%)  |
| `mockup` (ảnh)                                            | **2/151 (~1%)** |
| `productCategory`                                         | 1/151           |
| `printMethod`, `description`, `sizeChartUrl`, `printArea` | **0/151**       |
| `variations` → nên **giá**                                | **0/151**       |

Hệ quả đã áp vào thiết kế:

- **Tên sản phẩm là nội dung chính**, không phải ảnh.
- **Ảnh mặc định bắt buộc** (`ProductImage`): thiếu `mockup` thì vẽ nền gradient
  tím + lưới mờ + icon áo, để lưới đều nhau thay vì ô trống.
- **Không bịa nhãn thay thế.** Giá/danh mục/cách in/số biến thể đều render có
  điều kiện — không hiện "Liên hệ" lặp 151 lần khi đơn giản là chưa có giá.
- **Lọc nhanh bằng từ khoá** thay cho lọc theo danh mục: `productCategory` gần
  như trống nên dropdown danh mục sẽ vô dụng.
- **Trang chi tiết có nhánh "đang cập nhật"**: sản phẩm không có mô tả/size/giá
  sẽ hiện khối giải thích + email hỗ trợ thay vì một trang trơ trọi.

Khi dữ liệu đầy lên, mọi phần này **tự hiện thêm** mà không cần sửa code.

---

## 2. Luồng hoạt động

```
Khách vào /catalog
  → GET /v1/public/catalog?page&limit&search   (không kèm token)
  → lưới thẻ: ảnh (thật hoặc mặc định) + TÊN sản phẩm + "Xem chi tiết"
  → bấm 1 thẻ → /catalog/:id
      → GET /v1/public/catalog/:id
      → phần nào có dữ liệu thì hiện; không có gì → khối "đang cập nhật" + email
      → CTA "Gửi yêu cầu cho sản phẩm này" → CUSTOMER_REGISTER
```

- **Tìm kiếm** đẩy vào query string (`?q=`), debounce 400ms, đổi từ khoá luôn
  reset về trang 1. Trạng thái nằm trên URL nên chia sẻ/refresh giữ nguyên kết quả.
- **Lọc nhanh** (`QUICK_FILTERS`) là hàng chip chỉ set lại ô tìm kiếm — **phím
  tắt cho search, KHÔNG phải thuộc tính sản phẩm**. Từ khoá để tiếng Anh vì phải
  khớp tên sản phẩm trong DB; mỗi từ đã đối chiếu là có kết quả thật.
- **Phân trang** tái dùng `components/common/PaginationBar` (`position="top"`).
  `pageSize` là state thật trên URL (`?size=`), options `[12, 24, 48]` — bội số
  của 3 cho lưới 3 cột. **Phải truyền `pageSizeOptions`**: để mặc định
  `[10,20,50,100]` thì `<select>` không có option khớp và hiện nhầm "10/page"
  dù đang lấy 24 sản phẩm.
- 4 trạng thái đầy đủ: đang tải (`Spinner`) / lỗi (kèm nút "Thử lại" gọi lại
  `fetchCatalog`) / rỗng (kèm gợi ý) / có dữ liệu.

---

## 3. API / Schema

| Method | Path                     | Auth       | Mô tả                                        |
| ------ | ------------------------ | ---------- | -------------------------------------------- |
| GET    | `/v1/public/catalog`     | **public** | Danh sách sản phẩm, phân trang + tìm kiếm    |
| GET    | `/v1/public/catalog/:id` | **public** | 1 sản phẩm cho trang chi tiết                |

DTO **tái dùng nguyên** của Customer Portal (`packages/shared/dtos/product-config.dto.ts`):
`GetCustomerCatalogDto` / `GetCustomerCatalogResDto` / `GetCustomerCatalogItemResDto`.
Không tạo DTO mới vì hình dạng dữ liệu giống hệt — chỉ khác cách tính giá.

Ở trang public, 2 field sau **luôn rỗng** (không áp khuyến mãi):

```ts
CustomerCatalogVariation {
  sku, attributes, retailPrice,   // ← có
  discountedPrice,                // ← luôn undefined ở /public/catalog
  appliedPromotionName,           // ← luôn undefined ở /public/catalog
}
```

---

## 4. UI Components

| File                                     | Vai trò                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `pages/catalog/index.tsx`                | Lưới sản phẩm + ô tìm kiếm + phân trang + CTA đóng trang. Dùng `PublicHeader`/`PublicFooter`/`BackToTop`.           |
| `pages/catalog/detail.tsx`               | Chi tiết 1 sản phẩm + bảng biến thể & giá niêm yết.                                                                 |
| `components/public/PublicProductCard.tsx` | Thẻ sản phẩm: ảnh → TÊN (font `display`) → meta/giá có điều kiện → "Xem chi tiết". Vệt tím chạy dọc mép trái khi hover. |
| `components/public/ProductImage.tsx`      | Ảnh sản phẩm + **ảnh mặc định** khi thiếu `mockup` hoặc link ảnh hỏng (`onError`). Nhánh mặc định `aria-hidden` hoàn toàn — tên đã có ở `<h3>`/`<h1>` cạnh đó, gắn thêm `sr-only` sẽ khiến screen reader đọc tên 2 lần. |
| `components/public/catalogPrice.ts`      | `lowestRetailPrice()` — giá thấp nhất trong các biến thể, cho nhãn "Từ …".                                          |

> **Vì sao không dùng chung `components/customer/CatalogProductCard.tsx`:** thẻ
> đó dựng theo token shadcn của app nội bộ và nhận callback `onSelect` để mở
> form đặt đơn; thẻ public theo hệ nhận diện marketing và điều hướng bằng `Link`.
> Hai hệ thiết kế khác nhau, không phải trùng lặp vô ích.

Responsive: lưới `sm:grid-cols-2 lg:grid-cols-3` (thẻ thiên về chữ nên cần rộng
hơn lưới 4 cột kiểu shop ảnh); bảng biến thể ở
trang chi tiết nằm trong `overflow-x-auto` + `min-w-[32rem]` để không đẩy tràn
ngang trang trên mobile.

---

## 5. Backend logic

`CustomerCatalogService` được refactor để **1 lõi phục vụ cả 2 luồng**, tránh
chép logic truy vấn/mapping:

```
listCatalog(dto, tier, { applyPromotions })      ← lõi danh sách
findCatalogItem(id, tier, { applyPromotions })   ← lõi chi tiết
  ├── getCatalog(customer, dto)      → tier = customer.tier, applyPromotions = true
  ├── getCatalogItem(customer, id)   → tier = customer.tier, applyPromotions = true
  ├── getPublicCatalog(dto)          → tier = null,          applyPromotions = false
  └── getPublicCatalogItem(id)       → tier = null,          applyPromotions = false
```

`applyPromotions = false` → **không gọi** `promotionService.getActiveInDateRange()`
(truyền mảng rỗng), nên trang public cũng nhẹ hơn 1 query so với trang khách.

Filter hiển thị dùng chung `VISIBLE_FILTER` — **chỉ** `ProductConfigStatus.Active`
hoặc `null` (tương thích data cũ). KHÔNG đòi `variations` không rỗng: điều kiện
đó từng làm catalog luôn trống vì hầu như không sản phẩm nào có biến thể — xem
[`CustomerPortal.md §7`](CustomerPortal.md).

---

## 6. Performance notes

| Hạng mục       | Chi tiết                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| Route loading  | Cả 2 route `lazy()` trong `App.tsx` — không nằm trong bundle của trang chủ.                            |
| Query          | Trang public bỏ hẳn query promotion (1 round-trip DB ít hơn so với `/customer/catalog`).               |
| Ảnh sản phẩm   | `loading="lazy"` + `decoding="async"` trong lưới. Ảnh mặc định vẽ bằng CSS → **0 request** dù ~99% sản phẩm rơi vào nhánh này. |
| Tìm kiếm       | Debounce 400ms → gõ 1 từ khoá 10 ký tự chỉ bắn 1 request thay vì 10.                                   |
| Dependency mới | **0**.                                                                                                 |

---

## 7. Permissions & giới hạn dữ liệu

`@Auth([], [], { public: true })` — không token, không permission code.

**Vì là endpoint public, phải giữ đúng các ranh giới sau khi sửa:**

- **KHÔNG BAO GIỜ** trả `cost` / `nonShipCost` (giá vốn). `CATALOG_ROW_SELECT`
  không select 2 field này và `CustomerCatalogItemZod` cũng không khai báo chúng
  — đừng nới thêm.
- **KHÔNG** áp khuyến mãi theo tier: giá ưu đãi là quyền lợi của khách đã có
  tài khoản. Nếu cần đổi, sửa `applyPromotions` chứ đừng đổi `getPublicCatalog`
  sang gọi `getCatalog`.
- Chỉ sản phẩm `Active` (hoặc data cũ chưa có `status`) mới hiện ra ngoài. Sản phẩm chưa có biến thể VẪN hiện, giá để trống.
