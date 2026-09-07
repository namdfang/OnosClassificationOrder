# Seller Portal (`apps/seller`) — Function Description

> **File FE:** `apps/seller/src/app/{layout,page}.tsx`, `apps/seller/src/app/login/page.tsx`, `apps/seller/src/app/(portal)/layout.tsx`, `apps/seller/src/app/(portal)/portal/orders/{page,[productionId]/page,3d|2d|wood|embroidery|led|canvas/page}.tsx`, `apps/seller/src/app/track/{page,[code]/page}.tsx`, `apps/seller/src/app/auth/handoff/page.tsx`, `apps/seller/src/components/orders/{orders-list-view,order-row,product-line-tabs,orders-status-filter-pills,orders-stats-bar,push-dialog,stage-timeline}.tsx`, `apps/seller/src/components/layout/{customer-sidebar,impersonation-banner}.tsx`, `apps/seller/src/lib/{product-lines,navigation,constants,customer-orders,label-preview}.ts`, `apps/seller/src/context/session-context.tsx`, `apps/seller/src/i18n/{index,constants}.ts` + `locales/{vi,en}/{customerPortal,track,common,seller}.json`
> **File BE (Next server-side):** `apps/seller/src/app/api/auth/{login,logout,handoff}/route.ts`, `apps/seller/src/app/api/v1/[...path]/route.ts` (proxy), `apps/seller/src/lib/server/api.ts` (cookie), `apps/seller/proxy.ts` (Next 16 middleware)
> **File BE (NestJS — tái dùng, không endpoint mới):** `apps/api/src/modules/customer-portal/*` (`customer/auth/*`, `customer/orders/*`, `public/track/:code`), `apps/web/src/utils/impersonationStart.ts` (handoff mạo danh)
> **Route:** `/login`, `/portal` (→ `/portal/orders`), `/portal/orders`, `/portal/orders/{3d,2d,wood,embroidery,led,canvas}`, `/portal/orders/:productionId`, `/track`, `/track/:code`, `/auth/handoff`; placeholder PR-C: `/portal/orders/create`, `/portal/orders/import`, `/portal/account`
> **API (same-origin của app seller):** `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/handoff`, `ANY /api/v1/*` → NestJS `${API_INTERNAL_URL}/*`

---

## 1. Overview

Cổng khách hàng (seller) **tách thành app riêng** bằng Next.js 16 App Router, clone khuôn giao diện thghub (kit `components/shared`, sidebar 210px, tab dịch vụ → tab **dòng sản phẩm**). App admin `apps/web` giữ nguyên cho vận hành nội bộ; `/customer/*` cũ vẫn chạy song song cho tới PR-D (redirect).

Khác biệt nghiệp vụ so với thghub: Onos là xưởng nên seller nhìn đơn theo **dòng sản phẩm** `productLine` (`3d · 2d · wood · embroidery · led · canvas`, PRD-8 — `Products.md §2.4b`), không phải theo dịch vụ POD/Drop/Express. Trục này chi phối menu (6 mục con của "Quản lý đơn"), tab đếm, bộ lọc, badge trên mỗi dòng đơn.

Nguyên tắc cứng:

- **Không tách API, không Prisma, không server action.** Seller chỉ gọi API NestJS có sẵn qua DTO Zod trong `packages/shared`. Một nguồn số duy nhất.
- **Token không bao giờ ra JS.** Route handler của Next giữ JWT trong cookie httpOnly; browser chỉ gọi `/api/v1/*` same-origin, proxy gắn Bearer.
- **Thiếu số/field → thêm ở BE + shared**, không tính ở FE.

Đợt 1 (PR-B, 07/09/2026): login/logout/remember, danh sách đơn + 6 tab dòng sản phẩm + pill trạng thái + chip "Đang giữ", push/hủy đơn pending, chi tiết đơn (timeline 8 chặng, sửa mockup/địa chỉ), `/track/:code` công khai, handoff mạo danh từ admin. Đợt 2 (PR-C): dashboard, đặt đơn, import CSV, tài khoản. Hạ tầng/redirect: PR-D.

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

### 2.4 Danh sách đơn theo dòng sản phẩm

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

## 3. API / Schema

Không có endpoint NestJS mới. Route handler của Next:

| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/auth/login` | body `{userEmail,password,rememberMe}` → gọi `customer/auth/login`, set 2 cookie, trả `{user, expiresIn}`; lỗi BE forward nguyên mã (401 sai mật khẩu, 423 khóa…) |
| POST | `/api/auth/logout` | xóa cookie (+ `impersonate/stop` nếu đang mạo danh) → `{redirectTo}` |
| POST | `/api/auth/handoff` | body `{token, exp?}` → xác minh qua `customer/auth/me` → set cookie phiên (không persist) |
| ANY | `/api/v1/*` | proxy → `${API_INTERNAL_URL}/*` (GET/POST/PATCH/PUT/DELETE), gắn Bearer + Accept-Language, 401 → xóa cookie |

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

Theme: `globals.css` `@theme` + `.dark` (khuôn thghub) với token Onos — accent indigo `#6366F1`, CTA tím `#6f26c2`, Inter + Lexend Deca (`next/font/google`).

## 5. Backend logic

- Không đổi NestJS. Điểm cần nhớ khi thêm màn mới: endpoint phải dưới `customer/` (RolesGuard, Customers.md §6) hoặc `public/`.
- `syncLegacyOrdersForCustomer` chỉ chạy trong `listOrders` → xem §2.4 về thứ tự gọi counts.

## 6. Performance notes

- Bundle client `.next/static` ≈ 1,5 MB; **0 chunk chứa `@nestjs`** nhờ `shared/enums` subpath + `import type` (kiểm bằng `grep -rl @nestjs .next/static`).
- `next build` ≈ 3 s (Turbopack) trên hub; 17 trang đều dynamic (`ƒ`).
- Đo dev (khách 4.926 đơn): `counts` + list 20 dòng trả < 1 s qua proxy.

## 7. Permissions

Chỉ vai `RoleType.Customer` (JWT từ `customer/auth/login` hoặc token mạo danh). Không dùng permission-catalog nội bộ. Trang `/track/*` public.

## 8. Vận hành

- Dev hub: `pnpm dev:seller` (port **3017**; 3100 của thghub đã bị dự án khác chiếm trên hub). Smoke đã chạy 07/09/2026: login sai/đúng, cookie remember 30 ngày, proxy 401, counts + 6 tab khớp list sau lazy-sync, detail + PATCH, `/track` không cookie, handoff mạo danh + logout về admin.
- Đồng bộ i18n: `pnpm --filter ./apps/seller sync-i18n` (tự chạy ở `prebuild`).
- Bẫy đã gặp: `@types/react` 19 của seller bị pnpm hoist vào `node_modules/.pnpm/node_modules` → `apps/web` (React 18) type-check vỡ (`'Outlet' cannot be used as a JSX component`) → `apps/web/tsconfig.json` `paths` ghim `react`/`react-dom` về `./node_modules/@types/*` (Common_Pitfalls.md §9).
