# Seller Portal (`apps/seller`) — Function Description

> **File FE:** `apps/seller/src/app/{layout,page}.tsx`, `apps/seller/src/app/login/page.tsx`, `apps/seller/src/app/(portal)/layout.tsx`, `apps/seller/src/app/(portal)/portal/orders/{page,[productionId]/page,3d|2d|wood|embroidery|led|canvas/page}.tsx`, `apps/seller/src/app/track/{page,[code]/page}.tsx`, `apps/seller/src/app/auth/handoff/page.tsx`, `apps/seller/src/components/orders/{orders-list-view,order-row,product-line-tabs,orders-status-filter-pills,orders-stats-bar,push-dialog,stage-timeline}.tsx`, `apps/seller/src/components/layout/{customer-sidebar,impersonation-banner}.tsx`, `apps/seller/src/lib/{product-lines,navigation,constants,customer-orders,label-preview}.ts`, `apps/seller/src/context/session-context.tsx`, `apps/seller/src/i18n/{index,constants}.ts` + `locales/{vi,en}/{customerPortal,track,common,seller}.json`
> **File BE (Next server-side):** `apps/seller/src/app/api/auth/{login,logout,handoff}/route.ts`, `apps/seller/src/app/api/v1/[...path]/route.ts` (proxy), `apps/seller/src/lib/server/api.ts` (cookie), `apps/seller/proxy.ts` (Next 16 middleware)
> **File BE (NestJS — tái dùng, không endpoint mới):** `apps/api/src/modules/customer-portal/*` (`customer/auth/*`, `customer/orders/*`, `public/track/:code`), `apps/web/src/utils/impersonationStart.ts` (handoff mạo danh)
> **Route:** khách: `/login`, `/portal` (dashboard), `/portal/orders/:slug` (slug = dòng sản phẩm `3d|2d|wood|embroidery|led|canvas` → trang DỊCH VỤ; slug khác → chi tiết đơn `:productionId`), `/portal/orders/:line/create`, `/portal/orders/:line/import`, `/portal/orders?q=` (chỉ điều hướng), `/portal/account`, `/portal/api`, `/track`, `/track/:code`, `/auth/handoff`; **khu quản trị nhân viên (§9):** `/hub/login`, `/hub`, `/hub/sellers`, `/hub/orders`, `/hub/notifications`
> **API (same-origin của app seller):** `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/handoff`, `ANY /api/v1/*` → NestJS `${API_INTERNAL_URL}/*`

---

## 1. Overview

Cổng khách hàng (seller) **tách thành app riêng** bằng Next.js 16 App Router, clone khuôn giao diện thghub (kit `components/shared`, sidebar 210px, tab dịch vụ → tab **dòng sản phẩm**). App admin `apps/web` giữ nguyên cho vận hành nội bộ; `/customer/*` cũ vẫn chạy song song cho tới PR-D (redirect).

Khác biệt nghiệp vụ so với thghub: Onos là xưởng nên seller nhìn đơn theo **dòng sản phẩm** `productLine` (`3d · 2d · wood · embroidery · led · canvas`, PRD-8 — `Products.md §2.4b`), không phải theo dịch vụ POD/Drop/Express. Trục này chi phối menu (6 mục con của "Quản lý đơn"), tab đếm, bộ lọc, badge trên mỗi dòng đơn.

Nguyên tắc cứng:

- **Không tách API, không Prisma, không server action.** Seller chỉ gọi API NestJS có sẵn qua DTO Zod trong `packages/shared`. Một nguồn số duy nhất.
- **Token không bao giờ ra JS.** Route handler của Next giữ JWT trong cookie httpOnly; browser chỉ gọi `/api/v1/*` same-origin, proxy gắn Bearer.
- **Thiếu số/field → thêm ở BE + shared**, không tính ở FE.

PR-B (07/09/2026): login/logout/remember, danh sách đơn + 6 tab dòng sản phẩm + pill trạng thái + chip "Đang giữ", push/hủy đơn pending, chi tiết đơn (timeline 8 chặng, sửa mockup/địa chỉ), `/track/:code` công khai, handoff mạo danh từ admin. PR-C (cùng ngày): dashboard, đặt đơn (upload R2), import CSV, tài khoản, chuông thông báo. PR-D: pm2/systemd, deploy.sh, cloudflared, CORS, redirect `/customer/*` ở admin (§8).

## 2. Luồng hoạt động

### 2.1 Đăng nhập — cookie httpOnly + proxy same-origin (D5)

```
browser ──POST /api/auth/login {userEmail,password,rememberMe}──▶ Next route handler
   ◀── Set-Cookie onos_seller_token (httpOnly) + onos_seller_exp ──┘   │
                                                                      └──POST customer/auth/login──▶ NestJS
browser ──GET /api/v1/customer/orders?…──▶ proxy [...path] ──Authorization: Bearer <cookie>──▶ NestJS
```

- `rememberMe=true` → cookie `maxAge = expiresIn` của BE (BE quyết TTL theo `JWT_REMEMBER_EXPIRATION_TIME`, Auth.md §2.3); `false` → cookie phiên (đóng trình duyệt là mất).
- `onos_seller_exp` là cookie thường (JS đọc được) chỉ để client biết còn phiên; **không phải** nguồn xác thực.
- Proxy nhận **401 từ BE → xóa cookie** rồi trả 401; `use-api.ts` thấy 401 → về `/login?callbackUrl=`. `proxy.ts` (middleware) chỉ chặn sớm trang cần đăng nhập khi **không có** cookie — hết hạn thật do BE quyết.
- Proxy stream body (JSON + multipart), bỏ header hop-by-hop, gắn `Accept-Language` từ cookie `onos_lang` nếu client không gửi.

### 2.2 Đăng xuất

`POST /api/auth/logout`: xóa cookie. Nếu `customer/auth/me` báo `impersonatedBy` (phiên mạo danh) → gọi `customer/auth/impersonate/stop` (Auth.md §10.4a) rồi trả `redirectTo = NEXT_PUBLIC_ADMIN_URL`; ngược lại `redirectTo = /login`.

### 2.3 Handoff mạo danh từ admin

`apps/web/src/utils/impersonationStart.ts`: khi `VITE_SELLER_URL` khác rỗng và target là khách → `window.location.href = ${VITE_SELLER_URL}/auth/handoff#token=…&exp=…`. Token đi qua **fragment** (không tới server, không lọt access log). Trang `/auth/handoff` đọc hash, `history.replaceState` xóa hash, `POST /api/auth/handoff` → route handler **xác minh token bằng `customer/auth/me`** trước khi ghi cookie (token rác → 401, không tạo phiên) → `/portal/orders`. Banner vàng `ImpersonationBanner` hiện suốt phiên, nút "Thoát" đi đường §2.2. `VITE_SELLER_URL` rỗng → giữ hành vi cũ (mở `/customer/orders` trong `apps/web`).

### 2.4 Trang dịch vụ (mỗi dòng sản phẩm một trang) — KHÔNG có trang "tất cả đơn"

Quyết định 07/09/2026 (người dùng): seller cần dịch vụ nào thì vào đúng dịch vụ đó (`/portal/orders/3d`…), giống hub thg vào từng mảng POD/Drop. Hệ quả:
- **Không có** `/portal/orders` dạng danh sách tổng và không có tab chọn dòng cho seller (`ProductLineTabs` chỉ còn ở khu quản trị `/hub/orders`). `/portal/orders` chỉ là bộ điều hướng: `?q=<mã>` (từ chuông thông báo) → tìm đơn rồi nhảy tới chi tiết; không có → về Dashboard.
- Route dùng **một segment động** `app/(portal)/portal/orders/[slug]/page.tsx`: slug là dòng sản phẩm → `OrdersListView lockedLine`; ngược lại → `OrderDetailView productionId` (Next không cho 2 slug khác tên cùng cấp). `[slug]/create` và `[slug]/import` là đặt đơn/import **ngay trong trang dịch vụ** (`CreateOrderView line` khoá catalog theo dòng; `ImportOrdersView line` nhận mọi SKU nhưng quay về dòng đang đứng).
- Header trang dịch vụ = `ServiceHero` (trong `orders-list-view.tsx`): dải màu theo dòng → hồng logo, icon + tên dòng + số đơn, 2 CTA "Import CSV" (viền trắng) và "Đặt đơn <dòng>" (vàng logo). Sidebar chỉ còn Dashboard · Orders (6 dịch vụ) · Tài khoản — không còn mục New order/Import CSV riêng.

#### Chi tiết danh sách trong trang dịch vụ

- Thẻ số + pill trạng thái trên trang dịch vụ chỉ đếm đơn CỦA DÒNG ĐÓ: `GET customer/orders/counts?productLine=<line>` (BE `countsPipelines(..., productLine)` thêm `$match` cùng điều kiện với listing; `admin/customer-orders/counts` cũng nhận `productLine`). Đo dev TIKTOKSHOPUS: tổng 4.926 → 2D 301 / 3D 4.625.

`OrdersListView` (dùng chung 7 route): `GET customer/orders?page&limit&status&held&search&productLine` + `GET customer/orders/counts`.

- Tab dòng: `all` + 6 dòng, số đếm từ `counts.byProductLine` (một đơn nhiều dòng đếm ở mọi dòng — D9). Route `/portal/orders/<line>` truyền `lockedLine` → chỉ hiện tab đó, không đổi được.
- Pill trạng thái = `CustomerOrderStatus` (7) + "Tất cả"; chip **"Đang giữ"** là cờ chồng (`held=true`), không phải tab (CustomerOrderIntake.md §1.2); "Đang sửa lỗi" chỉ hiện số.
- Filter/trang nằm **trên URL** (`useUrlState`: `page,limit,status,held,q,line`) → F5/back giữ nguyên; search debounce 350 ms.
- **Thứ tự gọi quan trọng:** `GET customer/orders` chạy `syncLegacyOrdersForCustomer` (lazy-sync đơn hệ cũ) TRƯỚC khi list, còn `counts` thì không → gọi song song lần đầu thì tab đếm cũ (đo trên dev: 4.682 vs 4.926). FE làm tươi counts **sau khi list về** (`useEffect` gọi `mutate`).
- Tick chọn chỉ với đơn `pending` → `PushDialog`: `POST push-preview` (SWR, không effect) → xác nhận → `POST push`; hủy đơn pending → `POST staging/:id/cancel`.
- Cột: Đơn (mã + nguồn + ngày) · Sản phẩm (mockup thumb + type/sku/màu/size ×SL, "+N sản phẩm khác") · **Dòng SP** (badge `productLines[]`) · Khách nhận · Trạng thái (+ Held/Rework + chặng hiện tại) · Vận chuyển · Tổng tiền · Push/Hủy.

### 2.5 Chi tiết đơn `/portal/orders/:productionId`

`GET/PATCH customer/orders/:productionId` (`{ order: CustomerOrderSummary, track: LifecycleTrack }`). Timeline 8 chặng (`StageTimeline`, nhãn `track.progress.stages.*`), lưới thiết kế theo vị trí in (`designs`, thumbnail Drive/R2 qua `driveThumbnailUrl`, bấm mở file), mockup (sửa URL → PATCH), địa chỉ ship (form 11 trường → PATCH), link tra cứu công khai `/track/:pid` kèm nút copy. Đơn đã hủy → khóa sửa. Upload file design lên R2 làm ở PR-C.

### 2.6 Tra cứu công khai `/track/:code`

Không cookie, không sidebar. `GET /api/v1/public/track/:code` → proxy sang `public/track/:code` (PublicOrderTracking.md — danh sách trắng field hẹp, mọi lỗi = 404). Hiện thêm badge dòng sản phẩm (`product.productLine`).

### 2.7 Đặt đơn `/portal/orders/create`

Mirror `apps/web/src/pages/customer/orders/new.tsx`: bộ chọn sản phẩm từ `GET customer/catalog` (search + **tab dòng sản phẩm** `productLine`) → chọn biến thể (`lib/catalog-variant.ts`) → số lượng, mockup (bắt buộc) + design theo `printArea` (luật `designAcceptKeys` từ `shared/client`) → "Thêm vào đơn" → giỏ + 1 địa chỉ ship chung + ghi chú → `POST customer/orders` → về `/portal/orders?status=pending`. Ô file = `components/shared/file-url-or-upload-input.tsx` (dán URL hoặc upload thẳng browser→R2: `presign` → PUT presigned URL → `confirm` → poll `GET customer/designs/:sha`). **R2 bucket phải có CORS cho origin seller** (DesignStorage.md).

### 2.8 Import CSV `/portal/orders/import`

Mirror `apps/web/src/pages/customer/orders/import.tsx`: `xlsx` parse template fulfill OnosPod cũ → group `(order_id, identifier)` → validate từng đơn bằng **`CustomerImportOrderZod` import từ `shared/client`** (cùng schema BE `ImportCustomerOrdersDto`, xem §5) → `POST customer/orders/import/resolve` đối chiếu SKU (ảnh/tên/giá + cảnh báo thiếu design) → `POST customer/orders/import` → bảng kết quả created/duplicated/failed → nút sang tab Chờ đẩy SX. Template tải ở `/customer-order-template.csv` (copy từ `apps/web/public`).

### 2.9a API & Webhook `/portal/api` (tab riêng, 07/09/2026)

Khuôn `portal/api-keys` của thghub: tab bar **API key · Webhook · Lệnh mẫu** trong 1 card, banner vàng hiện key plain **một lần** ghim trên tab bar. Tái dùng `GET/POST/DELETE customer/api-keys` + `customer/webhooks` (ORD-4). Lệnh mẫu dựng từ `NEXT_PUBLIC_OPEN_API_URL` (mặc định `https://api.onosfactory.com/api/v1`). Nút "Tài liệu API" mở `NEXT_PUBLIC_ADMIN_URL/customer/api/docs` (tài liệu đầy đủ chuyển sang seller ở đợt 2). Danh sách sự kiện webhook lấy từ `CUSTOMER_WEBHOOK_EVENTS` — đã dời sang `shared/client` (dto re-export). Trang tài khoản chỉ còn link sang đây.

### 2.9 Dashboard `/portal` + tài khoản + chuông

- Dashboard: `GET customer/orders/dashboard` (4 KPI + 5 đơn gần nhất) + `GET customer/orders/counts` → 2 biểu đồ thanh CSS "theo dòng sản phẩm" (`byProductLine`) và "theo trạng thái", bấm là sang danh sách đúng bộ lọc. Không dùng recharts.
- Tài khoản: `PATCH customer/auth/me` (fullName/phone), `POST customer/auth/change-password`; email/SKU khoá.
- Chuông (`components/layout/notifications-bell.tsx`, trong sidebar): SWR `GET customer/notifications?page=1&limit=20` poll 60 s, `POST customer/notifications/read`; text thông báo hệ thống dựng từ `event`/`eventData` (mirror `NotificationBell.tsx` của web, namespace `customerNotifications` copy từ `apps/web`).

## 3. API / Schema

Không có endpoint NestJS mới. Route handler của Next:

| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/auth/login` | body `{userEmail,password,rememberMe}` → gọi `customer/auth/login`, set 2 cookie, trả `{user, expiresIn}`; lỗi BE forward nguyên mã (401 sai mật khẩu, 423 khóa…) |
| POST | `/api/auth/logout` | xóa cookie (+ `impersonate/stop` nếu đang mạo danh) → `{redirectTo}` |
| POST | `/api/auth/handoff` | body `{token, exp?}` → xác minh qua `customer/auth/me` → set cookie phiên (không persist) |
| ANY | `/api/v1/*` | proxy phiên KHÁCH → `${API_INTERNAL_URL}/*` (GET/POST/PATCH/PUT/DELETE), gắn Bearer + Accept-Language, 401 → xóa cookie (`lib/server/proxy.ts` dùng chung) |
| POST | `/api/hub/auth/login` | nhân viên: `POST /auth/login` (recaptchaToken rỗng) → kiểm `GET /auth/me` role ∈ {SuperAdmin, Admin} (khác → 403, không ghi cookie) → cookie `onos_hub_token` |
| POST | `/api/hub/auth/logout` | xóa cookie hub |
| POST | `/api/hub/impersonate` | body `{customerId}` → `POST /auth/impersonate` bằng token nhân viên → cookie phiên KHÁCH (giữ nguyên cookie hub) → client mở `/portal/...` |
| ANY | `/api/hub/v1/*` | proxy phiên NHÂN VIÊN (cookie `onos_hub_token`) → NestJS |

Cookie: `onos_seller_token` (httpOnly, SameSite=Lax, Secure khi `NEXT_PUBLIC_APP_URL` là https), `onos_seller_exp`, `onos_lang` (`vi|en`, 1 năm).

Env (`apps/seller/.env.example`): `API_INTERNAL_URL=http://127.0.0.1:3007/api/v1` (server→server, không qua Internet), `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_ADMIN_URL`. **`next start` không đọc `.env.development`** → dịch vụ dev-hub/prod phải truyền env qua systemd/pm2.

DTO dùng (`import type` từ `shared`): `CustomerStagingOrder` (+`productLines[]`), `CustomerOrderCounts` (+`byProductLine`), `CustomerPushQuoteOrder`, `CustomerOrderSummary`, `LifecycleTrack`, `PublicOrderTrack`, `Customer`. Runtime enum từ `shared/enums`: `CustomerOrderStatus`, `CUSTOMER_ORDER_STATUSES`, `ProductLine`, `PRODUCT_LINES`.

## 4. UI Components

| Component | Vai trò |
|---|---|
| `components/shared/*` (19 file copy thghub) | badge/button/card/confirm-modal/copy-button/data-table/empty-state/page-header/safe-image/search-input/status-pill/theme-toggle/toast/… — `badge.tsx` đổi thành `StatusBadge` (i18n `orders.status.*`) + `ProductLineBadge` |
| `components/orders/product-line-tabs.tsx` | card tab 6 dòng + "Tất cả", màu/icon từ `lib/product-lines.ts` (3d Shirt #4338ca · 2d Layers #0e7490 · wood TreePine #92400e · embroidery Scissors #7c3aed · led Lightbulb #b45309 · canvas Image #047857) |
| `orders-status-filter-pills.tsx` / `orders-stats-bar.tsx` / `orders-pagination.tsx` | pill trạng thái + chip held; 5 thẻ số (tổng/chờ push/đang SX/đã xuất+hoàn tất/đang giữ — không hiện tiền vì gate thanh toán OFF); phân trang |
| `orders-list-view.tsx` + `order-row.tsx` | bảng đơn (mirror cột `apps/web/src/pages/customer/orders/index.tsx`) |
| `push-dialog.tsx` | mirror `PushToProductionDialog.tsx` |
| `stage-timeline.tsx` | 8 chặng, dùng chung detail + track |
| `layout/customer-sidebar.tsx` | logo Onos, nav `lib/navigation.ts` (`buildCustomerNav(t)` — Orders xổ 6 dòng qua `CollapsibleNavItem`), đổi ngôn ngữ, theme, user + đăng xuất |
| `layout/impersonation-banner.tsx` | banner sticky 34px, đặt `--viewas-h` để sidebar fixed né xuống |
| `providers/i18n-provider.tsx` | `I18nextProvider` + cookie `onos_lang`; root layout (server) đọc cookie → render đúng ngôn ngữ ngay HTML đầu |
| `context/session-context.tsx` | SWR `customer/auth/me` → `{profile,isImpersonating,refresh,signOut}` |

Theme: `globals.css` `@theme` + `.dark` (khuôn thghub) với **bảng màu lấy từ logo ONOSPOD chính chủ** — sidebar tối màu mận `#3a0c24` (token riêng `--color-sidebar-fg/-muted/-hover/-border`), nền trang ngả hồng `#f6edf2`, thẻ số có viền trên màu, banner mạo danh vàng logo; 6 màu dòng sản phẩm (`lib/product-lines.ts`) và màu trạng thái (`lib/constants.ts`) cũng lấy từ 6 màu logo — (`https://app.onosfactory.com/branding/logo.svg`, lưu ở `public/onos-logo.svg`, cũng là favicon `app/icon.svg`): hồng cánh sen `#c40c68` = accent (mục đang chọn, link, tab), `#a80a58` = CTA (nút hành động), xanh lá `#48a05c`→success, vàng `#f7d21e`→warning, đỏ `#e01008`→error, đỏ sẫm `#800808`/ô-liu `#7f9a2b` cho chart. Nền trung tính ngả hồng-ấm nhẹ. Dark mode nâng sáng hồng `#ff4fa3`. Font Inter + Lexend Deca (`next/font/google`). **Đừng dùng `apps/web/src/assets/images/logo.svg`/`favicon.png` — 2 file đó là ảnh rác ("Hihihi"/icon "fla"), chỉ `logo.png` (onospod) và SVG trên là thật.** Khóa theme localStorage/cookie `onos-theme`.

Responsive (07/09/2026): `PageHeader` xếp dọc dưới `sm`; ô tìm kiếm full-width dưới `sm`; **danh sách đơn và danh sách seller đổi sang dạng THẺ dưới `md`** (`components/orders/order-card.tsx`, khối `md:hidden` trong `sellers/page.tsx`) — không cuộn ngang trên điện thoại; bảng chỉ hiện từ `md`. Đã chụp kiểm ở 1440 / 1024 / 390 px + dark mode bằng Playwright (script tạm trong scratchpad, không commit).

## 5. Backend logic

- **`packages/shared/client/`** (mới, PR-C): entry **nest-free** `shared/client` (tsup entry + `exports["./client"]`) chứa schema/hàm thuần dùng chung FE/BE mà app browser cần runtime: `DesignFieldsZod`, `ProductionOrderShippingAddressZod`/`ProductionOrderTrackingZod` (+`normalizeProductionOrderTracking`), `CUSTOMER_SHIP_METHODS`/`parseCustomerShipMethod`, `CustomerImportOrderZod` (+ Item/Address), `designAcceptKeys`, `designCdnUrl`/`designVariantUrl`/`extractDesignSha`/`Sha256Zod`. Các file `dtos/*.dto.ts` **re-export** từ đây nên BE và `apps/web` (import `shared`) không đổi. Quy tắc: file trong `client/` chỉ import `zod` và file khác trong `client/`; đã kiểm `dist/client` + chunk dùng chung không có `@nestjs`.
- Không đổi NestJS. Điểm cần nhớ khi thêm màn mới: endpoint phải dưới `customer/` (RolesGuard, Customers.md §6) hoặc `public/`.
- `syncLegacyOrdersForCustomer` chỉ chạy trong `listOrders` → xem §2.4 về thứ tự gọi counts.

## 6. Performance notes

- Bundle client `.next/static` ≈ 1,5 MB; **0 chunk chứa `@nestjs`** nhờ `shared/enums` subpath + `import type` (kiểm bằng `grep -rl @nestjs .next/static`).
- `next build` ≈ 3 s (Turbopack) trên hub; 17 trang đều dynamic (`ƒ`).
- Đo dev (khách 4.926 đơn): `counts` + list 20 dòng trả < 1 s qua proxy.

## 7. Permissions

Chỉ vai `RoleType.Customer` (JWT từ `customer/auth/login` hoặc token mạo danh). Không dùng permission-catalog nội bộ. Trang `/track/*` public.

## 9. Khu quản trị `/hub` — admin quản lý toàn bộ seller (PR-E, 07/09/2026)

Người dùng chốt: app `/adm` cũ chỉ còn cho **vận hành xưởng**; mọi việc quản lý seller làm ở cổng mới với cùng giao diện thghub. `/hub` là khu **nhân viên** (Admin/SuperAdmin) sống chung app với `/portal` (khách) nhưng **phiên riêng, cookie riêng, proxy riêng**:

| | Khách `/portal` | Nhân viên `/hub` |
|---|---|---|
| Đăng nhập | `/login` → `customer/auth/login` | `/hub/login` → `auth/login` (+ kiểm role qua `auth/me`) |
| Cookie | `onos_seller_token` | `onos_hub_token` |
| Proxy | `/api/v1/*` | `/api/hub/v1/*` |
| Middleware (`proxy.ts`) | thiếu cookie → `/login` | `/hub/*` thiếu cookie hub → `/hub/login` |
| `use-api.ts` 401 | → `/login` | đang ở `/hub/*` → `/hub/login` |

Cấu trúc: `src/app/hub/login/page.tsx` (ngoài layout gate) + `src/app/hub/(app)/{layout,page,sellers,orders,notifications}` (layout `HubSessionProvider` + `HubShell` chặn vai khác Admin/SuperAdmin). Sidebar `components/hub/hub-sidebar.tsx` (`buildHubNav`: Tổng quan · Đơn hàng (xổ 6 dịch vụ) · Vận hành · Seller · Thông báo · link "Vận hành xưởng" → `NEXT_PUBLIC_ADMIN_URL`).

Trang:
- **`/hub`** — `GET admin/customer-orders/stats`: 5 KPI (seller có đơn, tổng đơn khách, chờ đẩy, đang SX, đang giữ), thanh theo dòng/trạng thái (bấm → `/hub/orders` đúng bộ lọc), top 10 seller (số đơn/chờ/đang SX + nút xem như seller), 8 đơn mới nhất.
- **`/hub/sellers`** — `GET /customers?page&limit&search&tier&hasAccount&deleted` (API quản trị khách sẵn có, Customers.md): cột seller/hạng/số đơn (link sang `/hub/orders?seller=`)/đơn gần nhất/trạng thái; hành động **Xem như seller**, sửa (tên/điện thoại/hạng — `PATCH /customers/:id`), reset mật khẩu (`POST .../reset-password`, tự sinh → hiện 1 lần), khóa/mở (`PATCH .../status`), xóa mềm/khôi phục.
- **`/hub/orders`** — trang OMS riêng `components/hub/hub-orders-view.tsx` (khuôn `oms/orders-list-view.tsx` của thghub, 07/09/2026): header + nút làm mới → `DateRangeFilter` (BE `dateFrom/dateTo` theo `pushedAt ?? createdAt`, giờ VN) → thẻ số → **tab 6 dịch vụ** (`ProductLineTabs`, số từ `counts` không lọc dòng) → pill trạng thái (số theo dòng đang chọn) → tìm kiếm + `SellerFilterPicker` (`components/hub/seller-filter-picker.tsx`, gõ tìm seller, bấm tên seller trong bảng cũng khoá theo seller) → bảng đầu xám 11 cột (đơn/seller/sản phẩm/dịch vụ/SL/tổng/trạng thái/**Nội bộ**/khách nhận/vận đơn/ngày). **Cột Nội bộ** (`components/hub/internal-status.tsx`, 07/09/2026 — để admin support seller không phải mở app xưởng): chip chặng hiện tại theo màu chặng · xưởng · designer + trạng thái thiết kế · ưu tiên P1–3 · lỗi sản xuất `[nguồn] loại — ghi chú` (đỏ) · lý do giữ (vàng) · ghi chú soát tool / file lỗi / in / lý do designer từ chối (gộp, bỏ trùng, tối đa 2) · log gần nhất (`orderLogs`: action:field · người · giờ). Dữ liệu từ `items[].internal` (`AdminInternalStatusZod`) — BE `toAdminStagingOrder` chép từ `prodOrders` (PROD_DERIVE_FIELDS mở rộng thêm `factoryId assignee priority productionError* toolResult* toolCheckErrorNotes errorFileNote printStatusNote designerRejectedReason`) + `loadAdminRefs()` tra `factories`/`users`/`orderLogs` theo tập id của 1 trang (3 truy vấn nhỏ, không $lookup trong pipeline lớn). `toStagingOrder` cho khách KHÔNG chép các trường này (đã kiểm: `customer/orders` không có `internal`) + phân trang trong card; mobile dùng `OrderCard showViewAs={false}`. **Chỉ đọc, không CTA mạo danh** (mạo danh làm ở `/hub/sellers`). Mọi bộ lọc nằm trên URL (`line,status,held,q,seller,from,to,page,limit`). Sidebar hub: **Orders** xổ "Tất cả dịch vụ" + 6 dịch vụ (`buildHubNav`), mỗi dịch vụ có route `/hub/orders/<line>` (`HubOrdersView lockedLine` — ẩn tab dịch vụ). **Khung cố định** (cả `/hub/orders*` lẫn trang dịch vụ seller): trang cao đúng `100dvh` trừ padding và banner mạo danh (`--viewas-h`), phần đầu + bộ lọc `shrink-0`, bảng `flex-1 overflow-auto` với `thead sticky`, phân trang `shrink-0` neo đáy — header/footer không trôi khi cuộn.
- **`/hub/notifications`** — `POST /customer-notifications` (1 seller hoặc broadcast) + `GET /customer-notifications/sent`.

### 9.1 Vận hành sản xuất `/hub/operations` (07/09/2026)

Góc nhìn quản trị toàn quy trình, **chỉ đọc**, không endpoint tổng hợp mới — gọi 4 API sẵn có qua proxy hub: `GET ceo/overview?from&to` (CeoDashboard.md), `GET orders/lifecycle-overview?from&to&factoryId` (OrderLifecycle.md), `GET orders/factory-overview`, và `GET admin/customer-orders?stage=<chặng>` (filter mới, xem dưới). Bộ lọc trên URL: `from/to` (mặc định 7 ngày gần nhất), `factory`, `line` (tab dịch vụ ngay dưới header — `GET orders/lifecycle-overview` nhận thêm `productLine`, PRD-8), `stage`, `page`. 5 khối (`components/hub/operations-view.tsx`):
1. **KPI**: vào SX · ra SX (so kỳ trước) · đang chạy (tuổi tồn TB) · quá hạn ≥3 ngày · đúng hẹn N2 (so kỳ trước).
2. **Phễu 8 chặng**: mỗi chặng tồn + lỗi + làm lại + xong trong kỳ, thanh tỉ lệ, chặng nút thắt (`totals.bottleneckStage`) tô đỏ; **bảng "Trạng thái sản xuất từng đơn"** luôn hiện dưới phễu (15 dòng/trang, phân trang): mặc định đơn đang sản xuất của dịch vụ đang chọn; bấm chặng → lọc đúng chặng; cột chặng hiện tại tô màu chặng + Giữ/Làm lại, cột "Ở chặng" = tuổi từ `currentStageAt`. KPI/SLA/xưởng/nhân sự vẫn là số toàn hệ (CEO overview chưa lọc theo dòng).
3. **Đúng hẹn & quá hạn**: 3 thanh N0/N1/N2 so mục tiêu, quá hạn theo xưởng, 6 đơn cũ nhất. **Theo xưởng**: bảng vào/ra/tồn/ra-ngày/xả hết/N2/lỗi (CEO) + bảng in/đang in/chưa in/chưa gán thiết kế/lỗi (factory-overview).
4. **Chất lượng** (tỉ lệ lỗi, theo nguồn, loại SP hay lỗi) + **Nhân sự** (designer xong/tồn/làm lại — tồn ≥30 tô đỏ; công nhân theo công đoạn).
5. **Phát hiện & việc cần làm**: `findings[]` của CEO overview, câu chữ dịch bằng namespace `ceoDashboard` (copy từ `apps/web` qua `sync-i18n`, `findings.<code>` + `actions.<action>`).

Thao tác (gán designer, đổi xưởng, báo lỗi) vẫn ở app xưởng: nút "Mở app vận hành xưởng" → `NEXT_PUBLIC_ADMIN_URL/ffm/orders/workshop?factoryId=`.

**BE mới:** `GetAdminCustomerOrdersZod.stage` (`WORKSHOP_STAGE_FILTER_KEYS`) — `listOrdersAdmin` `$match` `$expr $in [stage, $map(prodOrders chưa hủy → workshopStageSwitchExpr('$$p.'))]`; `workshopStageSwitchExpr(prefix)` nhận tiền tố để chạy trên mảng `$lookup` (mặc định `'$'`, các nơi gọi cũ không đổi). Đo dev: press 905 · designer 326 · tool-check 975 đơn khách.

**Mạo danh trong app** (`components/hub/view-as-button.tsx`): `POST /api/hub/impersonate` → BE `POST /auth/impersonate` (AUTH-1, chỉ SuperAdmin — Admin thường bị BE từ chối, nút vẫn hiện nhưng báo lỗi) → cookie phiên khách; banner vàng ở `/portal`; nút "Thoát" → `POST /api/auth/logout` thấy còn cookie hub → `customer/auth/impersonate/stop` rồi về **`/hub/sellers`** (không còn cookie hub → về `NEXT_PUBLIC_ADMIN_URL` như trước).

**BE mới (chỉ đọc):** `apps/api/src/modules/customer-portal/customer-order-admin.controller.ts` — `GET admin/customer-orders` (+`/counts`, `/stats`), `@Auth([Admin])` (SuperAdmin qua guard); prefix `admin/...` cố ý không chứa `/customer/` nên token khách bị `RolesGuard` chặn (đã kiểm: 403). Service: `buildDerivePipeline(customerId | null)` — null = không scope khách; `assembleCounts`/`countsPipelines` tách từ `getCounts`; `listOrdersAdmin` (+ `$lookup customers` → `customer{userSku,userEmail,fullName,tier}`), `getCountsAdmin`, `getStatsAdmin` (group theo `customerId`, top 10, `$facet` đếm seller). DTO `AdminCustomerStagingOrderZod`/`GetAdminCustomerOrdersZod`/`AdminCustomerOrderStatsZod` ở `customer-order.dto.ts`. Import enum trong file API phải từ `'shared'` (KHÔNG `@shared/enums` — alias nguồn không tồn tại sau build, API dev sập `Cannot find module`).

Đo dev (07/09/2026): 125 seller có đơn, 38.095 đơn staging. Hiệu năng tải trang `/hub/orders*` xem §9.2.

### 9.2 Hiệu năng tải `/hub/orders*` (F5, 07/09/2026)

Trước tối ưu, F5 `/hub/orders` chờ ~6 s: `admin/customer-orders` 6,3 s + `counts` 5 s (×2, cho tab + pill) + `stats` 5,4 s — nguyên nhân là `$lookup orders` + derive trạng thái chạy trên CẢ 38k document staging rồi mới phân trang.

Đã sửa ở `apps/api/src/modules/customer-portal/customer-order.service.ts`:

- **`buildPagedListPipeline()`** (dùng chung `listOrders` khách + `listOrdersAdmin`): lọc mức document trước (`customerId`, khoảng ngày, `items.productLine`, tìm kiếm) → sort `pushedAt ?? createdAt` → `$facet` **phân trang TRƯỚC**, chỉ `$lookup`/derive cho 20 dòng của trang. Đường nhanh này áp khi KHÔNG lọc trạng thái/giữ/chặng; riêng `status=pending` suy được ở mức document (`status≠cancelled`, `refundedAt=null`, `pushedAt=null`, mirror `statusDerived`) nên cũng đi đường nhanh. Lọc `status` khác / `held` / `stage` vẫn phải derive toàn bộ rồi mới sort + phân trang (đường đầy đủ). Mọi aggregate bật `allowDiskUse`.
- **Cache admin 60 s** cho `getCountsAdmin`/`getStatsAdmin` (`cachedAdmin()` — stale-while-revalidate: hết hạn vẫn trả bản cũ và tính lại nền, request trùng key dùng chung 1 promise; `warmAdminCache()` làm ấm `counts:{}` + `stats` 10 s sau boot). Số tab/pill trễ tối đa 60 s so với DB — chấp nhận được cho màn quản trị.
- Đếm theo dòng dùng CÙNG luật với danh sách: chỉ `items.productLine` (không fallback `prodOrders.productLine`) — trước đây tab 3D đếm 37.179 mà danh sách 37.004 vì 178 staging cũ thiếu `items.productLine` (đã backfill trên dev từ `orders.productLine`; prod chạy lại cùng lệnh mongosh khi deploy).
- FE `hooks/use-api.ts`: SWR `keepPreviousData` + `dedupingInterval` 5 s — đổi tab/trang giữ bảng cũ tới khi có dữ liệu mới, không nháy trắng.

| Gọi | Trước | Sau |
|---|---|---|
| `admin/customer-orders?page=1&limit=20` (38.095) | 6,3 s | 0,09 s |
| … `&productLine=3d` (37.180) | ~6 s | 0,09 s |
| … `&status=pending` | ~6 s | 0,01 s |
| … `&status=in-production` / `&stage=print` | ~6 s | 4,6 s (đường đầy đủ) |
| `admin/customer-orders/counts` | 5,0 s | 5,0 s lần đầu sau boot (đã làm ấm) → 0,005 s |
| `admin/customer-orders/stats` | 5,4 s | 5,4 s lần đầu → 0,006 s |
| `customer/orders` (seller, ~4,9k đơn) | ~1 s | 0,15 s |

Còn chậm (chưa làm): lọc `status`/`held`/`stage` và tính lại counts/stats nền vẫn ≈ 5 s vì phải derive toàn bộ. Hướng cấu trúc nếu cần: ghi **snapshot trạng thái** (`statusSnapshot`/`stageSnapshot`) lên document staging khi push/transition + cron đồng bộ, rồi lọc/đếm bằng index — khi đó mọi đường về < 0,2 s.

## 8. Vận hành & hạ tầng (PR-D)

| Môi trường | Chạy bằng | Env | Vào từ |
|---|---|---|---|
| Dev hub | systemd `onos-seller-dev` (`/etc/systemd/system/onos-seller-dev.service`, `pnpm exec next dev -p 3017`, log `/var/log/onos-seller.log`) | `apps/seller/.env.development` (next dev đọc) | cloudflared `seller-dev-onos.autonow.vn` → `localhost:3017` (`cloudflared/config.yml`) |
| Prod VPS | pm2 `onosfactory-seller` (`apps/seller/ecosystem.config.cjs`, `next start -p 3017`) | `apps/seller/.env.production` (copy từ `.env.production.example`, không commit) | nginx `seller.onosfactory.com` → `127.0.0.1:3017` (Deployment-Ubuntu-VPS.md §8) |

- `deploy.sh`: sau bước web, **nếu có** `apps/seller/.env.production` → `pnpm --filter ./apps/seller build` (heap 2048) → `pm2 restart ecosystem.config.cjs --update-env` → health `GET /login` = 200 (12×5 s); thiếu env → bỏ qua (server chưa bật seller). `--rollback` build lại seller theo bản cũ.
- CORS API (`main-nest.ts`): thêm `https://seller.onosfactory.com` dự phòng; luồng chính là proxy server→server nên không cần CORS. Dev tunnel thêm vào `ALLOWED_ORIGINS` nếu gọi thẳng.
- **Redirect `/customer/*` ở admin** (`apps/web/src/App.tsx` `SellerRedirectGate`): khi `VITE_SELLER_URL` khác rỗng, `/customer/login|dashboard|orders|orders/new|orders/import|orders/:productionId|account` chuyển hẳn sang seller (`/login`, `/portal`, `/portal/orders`, `/portal/orders/create|import|:pid`, `/portal/account`, giữ query). Catalog/API docs/`/track`/landing vẫn ở `apps/web` tới đợt 2. Rỗng → chạy như cũ.
- R2: thêm origin seller (dev + prod) vào CORS bucket trước khi bật upload trực tiếp (DesignStorage.md).

### 8.1 Ghi chú vận hành

- Dev hub: systemd `onos-seller-dev` (`next dev -p 3017`, tự chạy lúc boot; 3100 của thghub đã bị dự án khác chiếm trên hub) → https://seller-dev-onos.autonow.vn (đã route DNS + restart `cloudflared-onos` 07/09/2026). Chạy tay: `pnpm dev:seller`. Smoke đã chạy 07/09/2026: login sai/đúng, cookie remember 30 ngày, proxy 401, counts + 6 tab khớp list sau lazy-sync, detail + PATCH, `/track` không cookie, handoff mạo danh + logout về admin.
- Smoke PR-C (07/09/2026, khách test `seller-smoke@onos.test`): 4 trang 200; catalog lọc `productLine=2d`; resolve SKU thật/giả; import 1 đơn CSV → created; `PATCH me`; đổi mật khẩu sai → 400; notifications; dashboard. Phát hiện + sửa lỗi PR-A: `importOrdersCsv` và luồng tạo đơn qua API **không stamp `productLine`** vào item → tab đếm/lọc bỏ sót đơn chờ đẩy (đã thêm `productLine: q.productLine` ở 2 đường đó — CustomerOrderIntake.md).
- Đồng bộ i18n: `pnpm --filter ./apps/seller sync-i18n` (tự chạy ở `prebuild`).
- Bẫy đã gặp: `@types/react` 19 của seller bị pnpm hoist vào `node_modules/.pnpm/node_modules` → `apps/web` (React 18) type-check vỡ (`'Outlet' cannot be used as a JSX component`) → `apps/web/tsconfig.json` `paths` ghim `react`/`react-dom` về `./node_modules/@types/*` (Common_Pitfalls.md §9).
