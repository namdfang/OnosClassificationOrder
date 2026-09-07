# Seller Portal riêng — `apps/seller` (Next.js) clone khuôn thghub, đơn phân theo DÒNG SẢN PHẨM

> Ngày 07/09/2026 · nhánh `main` @ `60bec49` (+ thay đổi chưa commit của đợt trang xưởng / CEO Dashboard — sẽ gộp PR riêng trước).

## Context — vì sao

- `apps/web` (Vite) đang chứa cả hai thế giới: `/adm` + `/ffm` cho nội bộ và `/customer/*` + landing/catalog/track cho khách → chung bundle, sidebar, i18n, nhịp deploy; khách và xưởng phải chờ nhau.
- Người dùng chốt: **tách app riêng cho seller bằng Next.js, clone khuôn giao diện từ thghub** (Next 16, cùng nhà); app admin giữ nguyên cho vận hành nội bộ.
- Khác biệt nghiệp vụ: thghub là công ty dịch vụ → đơn chia theo dịch vụ (POD/Drop/Express/Warehouse). Onos là xưởng → seller nhìn đơn theo **dòng sản phẩm**: **3D · 2D (gồm DTG + DTF) · Gỗ · Thêu · LED · Canvas**. Trục này chi phối menu, tab, bộ lọc, đếm, catalog, form đặt đơn.
- Ràng buộc: **không tách API, không kéo Prisma của thghub** — seller chỉ gọi API NestJS Onos đã có qua DTO Zod trong `packages/shared`. Một nguồn số duy nhất.

## Quyết định đã chốt với người dùng

| Mục | Chốt |
|---|---|
| Dòng sản phẩm | 6 giá trị: `3d` · `2d` · `wood` · `embroidery` · `led` · `canvas` |
| Phạm vi đợt 1 | Cốt lõi sau đăng nhập: login, danh sách + chi tiết đơn (lọc theo dòng), đặt đơn + CSV/push, tài khoản, `/track/:id` public. Landing / catalog công khai / API docs / careers → đợt 2 (vẫn ở `apps/web`) |
| Domain | prod `seller.onosfactory.com`, dev `seller-dev-onos.autonow.vn`; `apps/web` giữ `onosfactory.com`, `/customer/*` redirect sang seller khi đợt 1 lên |
| Backfill | Tự động theo tín hiệu sẵn có (collection → xưởng → phòng máy → mã in cũ), còn lại mặc định `3d` + đánh dấu để admin gắn lại; LED/Canvas chỉ gắn tay |

## Kiểm kê (tóm tắt, chi tiết đã đọc)

**thghub** (`/root/.vibedev/repos/thghub`): Next 16.1.6 / React 19.2.3 / Tailwind v4 (`@theme` trong `globals.css`, không có tailwind.config) / SWR / **không shadcn, không radix, không form lib, không i18n lib** / next-auth v5 beta dính Prisma. **0 component import Prisma, 0 server action** — toàn bộ UI là HTTP client thuần qua `src/hooks/use-api.ts` → clone khả thi. Seller portal = `src/app/(customer)/portal/*` (42 route), sidebar `src/components/layout/customer-sidebar.tsx`, nav `src/lib/navigation.ts`, UI kit `src/components/shared/` (29 file), `oms/orders-{service-tabs,status-filter-pills,pagination,stats-bar}.tsx`, `portal/{portal-orders-list-view,portal-order-row}.tsx`, wizard import `(internal)/oms/v2/bulk-upload/_components/*`, charts `portal/dashboard/*`. Taxonomy `SERVICE_TYPES/COLORS/ICONS` trong `src/lib/constants.ts`.

**Onos**: BE khách đã đủ — 42 endpoint (31 JWT `RoleType.Customer` dưới `customer/*`, 7 public, 4 X-Api-Key); `apps/api/src/guards/roles.guard.ts` chỉ cho khách vào `/customer/`. FE khách trong `apps/web` ~9,9k LOC (`pages/customer/**`, `components/customer/*`, `FileUrlOrUploadInput.tsx`, `services/customerPortal.ts`, i18n `customerPortal` 486 khóa…). `packages/shared`: tsup cjs+esm, `dist/index.js` import `@anatine/zod-nestjs` 58 chỗ (kéo NestJS vào client nếu import runtime), nhưng `packages/shared/enums/*` không import dtos → tách subpath sạch. Login BE trả `{accessToken, expiresIn}` (`customer-auth.controller.ts` L69-76). Mạo danh khách: `apps/web/src/utils/impersonationStart.ts` L73-79 ghi store rồi `window.location.href = PATHS.CUSTOMER_ORDERS`.

**Taxonomy hôm nay**: KHÔNG có enum. Dữ liệu thật: collections `3D` 146 · `2D` 12 · `embroidery` 11 · `handmade-wood` 3 (172/196 SP); xưởng TNW (gỗ, `flowType=merged`), MLDTF (DTF); machineType HT (thêu); `productConfig.printMethod` null 195/196; `orders.printMethod` `EMB` 1.437 (thô từ OnosPod). Intake `customer-order.service.ts buildPricingContext()` (L596) không select `printMethod`; facet catalog chỉ category + collection.

## Quyết định thiết kế

| # | Quyết định | Lý do |
|---|---|---|
| D1 | Field MỚI `productLine` (enum 6 giá trị) trên ProductConfig / OrderEntity / CustomerOrderItem; **giữ `printMethod`** (dtg/dtf/…) làm kỹ thuật xưởng | `printMethod` đang là nguồn logic DTF ở tool duyệt thiết kế (`order.service.ts` `DTF_PRINT_METHOD_CODE`, `isDtf`) — gộp là phá ORD-6. Seller nhìn dòng, xưởng nhìn kỹ thuật |
| D2 | Field phụ `productLineSource: manual \| collection \| factory \| machineType \| printMethod \| default` | Admin lọc "đang bị gán mặc định" để gắn lại; sửa tay → `manual` |
| D3 | Migration 1 lần theo khuôn claim-flag của `ProductConfigService.migrateDesignReviewCodes()` (`product-config.service.ts` L224-337: `system_configs` upsert `$setOnInsert`, stale takeover, log kế hoạch) | Đã xử lý 2 Nest context bootstrap song song |
| D4 | `apps/seller` pin **Next 16.1.6 / React 19.2.3 / Tailwind v4 / zod 3** | Khớp thghub (kit đã chạy trên bộ này); pnpm cô lập nên không đụng React 18 của `apps/web`; Node server 20.20 ≥ 20.9. **zod phải v3** để dùng chung schema với `shared` (thghub dùng zod 4 — không copy code phụ thuộc API v4) |
| D5 | **Không dùng next-auth.** Route Handler `POST /api/auth/login` gọi NestJS, set cookie httpOnly `onos_seller_token`; mọi call đi qua **proxy same-origin** `app/api/v1/[...path]/route.ts` gắn `Authorization: Bearer` từ cookie | Không CORS, token không lộ ra JS, handoff mạo danh đơn giản; BE đã cấp JWT + TTL theo `rememberMe` |
| D6 | i18n: react-i18next, copy JSON `customerPortal`/`track`/`common` từ `apps/web` (giữ parity vi/en 486 khóa); nhãn dòng sản phẩm là FE dictionary `t('productLines.<code>')` theo `I18n.md` §2.3 | thghub chỉ có nhãn EN thủ công |
| D7 | `packages/shared` thêm entry tsup + `exports["./enums"]` → seller import **runtime** từ `shared/enums`, DTO chỉ `import type`; page import CSV cần Zod runtime thì `dynamic()` | Tránh kéo `@nestjs/common` vào client bundle |
| D8 | Prod chạy `next start -p 3017` dưới pm2 (không standalone/Docker đợt 1) | VPS build tại chỗ; standalone trong monorepo cần thêm bước copy |
| D9 | Đơn 1 dòng có nhiều item khác dòng → `productLines[]` ở mức đơn (distinct từ item), lọc theo dòng = đơn có ÍT NHẤT 1 item thuộc dòng | Không ép "1 đơn 1 dòng" vì CSV cũ cho phép nhiều item |

## PR-A — Dòng sản phẩm hạng nhất (BE + shared + admin tối thiểu)

**Shared**
- Mới `packages/shared/enums/product-line.ts`: `ProductLine` const (`3d|2d|wood|embroidery|led|canvas`), `PRODUCT_LINES`, `PRODUCT_LINE_LABELS` (VI cho BE/log), `PRODUCT_LINE_SOURCES`. Export ở `enums/index.ts`. `package.json`: `build` → `tsup index.ts enums/index.ts …`, `exports["./enums"]`.
- `dtos/product-config.dto.ts`: `ProductConfigZod` + Create/Update thêm `productLine`, `productLineSource`; `GetProductConfigsZod` filter 2 trường; `CustomerCatalogItemZod` + `GetCustomerCatalogZod` (`productLine`); `GetCustomerCatalogFacetsResZod` thêm `productLines[{code,count}]`.
- `dtos/customer-order.dto.ts`: `CustomerStagingItemZod.productLine`; `CustomerStagingOrderZod.productLines[]`; `GetCustomerStagingOrdersZod.productLine`; `CustomerOrderCountsZod.byProductLine`.
- `dtos/production-order.dto.ts`: `ImportProductionOrderRowZod.productLine`; `CustomerOrderSummaryZod.productLine`; DTO track public thêm `productLine`.

**API**
- `product-config.entity.ts`: `@Prop({enum, index}) productLine?`, `productLineSource?` (parity `assertSameType` ép Zod). `product-config.service.ts` `updateProductConfig()`: đổi `productLine` → `productLineSource='manual'`; list filter 2 trường. Registry agent `registry/product-configs.registry.ts` + `orders.registry.ts` khai field.
- `order.entity.ts`: `productLine?` (index). `order.service.ts importOrders()` (~L7330-7390): `productLine = pc.productLine ?? row.productLine` vào `data` cạnh `printMethod`.
- `customer-order.entity.ts` `CustomerOrderItem.productLine?`. `customer-order.service.ts`: `buildPricingContext()` select thêm `productLine` (+ `PricingConfig`); `quoteItem` trả; `placeOrder`/`importOrdersCsv` ghi vào item; `pushToProduction()` `importRows.push({... productLine})`; `syncLegacyOrdersForCustomer` copy từ OrderEntity; `PROD_DERIVE_FIELDS` + `toStagingOrder()` (`item.productLine ?? prodOrder.productLine`, `productLines` distinct); `listOrders()` filter `$or: [{'items.productLine'}, {'prodOrders.productLine'}]` sau `$lookup`; `getCounts()` thêm nhánh `byProductLine` (`$setUnion` items ∪ prodOrders → `$unwind` → `$group`).
- `customer-catalog.service.ts`: `CATALOG_ROW_SELECT` + filter + `getFacets()` thêm `$group` theo `productLine` → `productLines`.
- `public-track.service.ts`: thêm `productLine` vào field whitelist + response; mở rộng `public-track.spec.ts` (soi rò rỉ field).
- **Migration** mới `apps/api/src/modules/product-config/product-line-migration.service.ts`, gọi từ `ProductConfigService.onModuleInit()` sau `migrateDesignReviewCodes()`; flag `system_configs.key='PRD-8:product_line_backfill_v1'` (copy khung claim/stale L232-268). Suy luận mỗi SP chưa có dòng, ưu tiên: (1) collection shortName/name: `3d→3d`, `2d→2d`, `embroidery→embroidery`, `handmade-wood|wood→wood` (nhiều collection → embroidery > wood > 2d > 3d); (2) xưởng `TNW→wood`, `MLDTF→2d`; (3) machineType `HT→embroidery`; (4) `printMethod` `embroidery→embroidery`, `dtf|dtg→2d`; (5) còn lại `3d` + `source=default`. Sau đó orders: `updateMany` theo từng `productConfigId` (`productLine: {$exists:false}`); đơn không map: `printMethod:'EMB'→embroidery`, xưởng TNW/MLDTF, machineType HT, còn lại 3d. `customer_orders.items` bằng `arrayFilters` theo `productConfigId`. Log `[product-line-migration] products X/Y (defaulted N) · orders U · staging items V` + warn danh sách defaulted.
- **Admin FE** (`apps/web`): `pages/products/ProductConfigTab.tsx` filter + cột "Dòng SP" (badge màu); `pages/products/detail/index.tsx` select `productLine` cạnh danh mục + chú thích nguồn gán; i18n `products.json` `productLines.*`, `productLineSources.*`. Không kanban.
- Spec: `product-line-migration.spec.ts` (collection/factory/default + idempotent); cập nhật spec có item (`place-order-artwork.spec.ts`, `public-track.spec.ts`).

**Verify PR-A**: `pnpm --filter shared build && pnpm build-types`; `cd apps/api && pnpm test`; dev API khởi động → log migration; curl `customer/orders/counts` có `byProductLine`, `customer/orders?productLine=2d`, `customer/catalog/facets` có `productLines`, `product-configs?productLineSource=default`; Mongo `productConfigs.countDocuments({productLine:{$exists:false}}) === 0`, flag `status='done'`. Deploy dev trước để xem số `defaulted`.

## PR-B — Scaffold `apps/seller` + auth + đơn (list/detail) + track

**Scaffold**
- `apps/seller/package.json` (pin §D4; `dev: next dev -p 3017`, `build`, `start -p 3017`, `lint`, `build-types`), `tsconfig.json` (copy thghub, `skipLibCheck`), `next.config.ts` (`transpilePackages:['shared']`, headers bảo mật copy thghub, `images.remotePatterns` CDN R2 + mockup host; bỏ redirects/rewrites thghub), `postcss.config.mjs`, `eslint.config.mjs` (thghub, `eslint-config-next`), `.env.example` (`API_INTERNAL_URL=http://127.0.0.1:3007/api/v1`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_ADMIN_URL`), `apps/seller/CLAUDE.md` (không Prisma, không server action, data qua proxy `/api/v1/*`, `import type` từ shared, runtime từ `shared/enums`).
- Root: `turbo.json` outputs `.next/**` (loại cache); `package.json` scripts `dev:seller`/`build:seller`.

**Copy/adapt từ thghub → `apps/seller/src`** (giữ/đổi):
- `app/globals.css`: giữ kiến trúc `@theme` + `.dark`; token Onos `--color-accent #6366F1`, `--color-cta #6f26c2`; bỏ import `@zero-126/zalo-ui` + block `--zalo-*`; font Inter + Lexend Deca (khớp `apps/web`).
- `app/layout.tsx`: providers SWR/Theme/Device/MobileSidebar/Toast + mới `I18nProvider`, `SessionProvider`; bỏ Push/Activity/SW/Clarity.
- `app/(portal)/layout.tsx` ← `(customer)/layout.tsx`: gate bằng session; bỏ AssistantBubble/AnnouncementPopup; `ViewAsBanner` → `ImpersonationBanner`.
- `components/layout/*` (sidebar 210px, collapsible, mobile): bỏ ví/WMS, logo Onos, nút ngôn ngữ.
- `lib/navigation.ts`: `CUSTOMER_NAV` = Dashboard `/portal` · Đơn hàng `/portal/orders` con `3d,2d,wood,embroidery,led,canvas` · Tài khoản `/portal/account`; nhãn qua i18n.
- `lib/product-lines.ts` ← pattern `SERVICE_COLORS/ICONS`: 3d `Shirt #4338ca` · 2d `Layers #0e7490` · wood `TreePine #92400e` · embroidery `Scissors #7c3aed` · led `Lightbulb #b45309` · canvas `Image #047857`.
- `components/orders/product-line-tabs.tsx` ← `oms/orders-service-tabs.tsx` (keys `all` + 6 dòng, count từ `byProductLine`); `status-filter-pills`, `pagination`, `stats-bar` (status = `CustomerOrderStatus` + chip Held/Rework); `orders-list-view.tsx` + `order-row.tsx` ← `portal/portal-orders-list-view.tsx`/`portal-order-row.tsx` (adapt nặng: cột mirror `apps/web/src/pages/customer/orders/index.tsx`, bỏ label/trouble/todo/express).
- `components/shared/*` COPY 19 file (badge, button, card, confirm-modal, copy-button, data-table, date-range-filter, empty-state, file-upload, page-header, safe-image, search-input, stat-card, status-pill, tab-page, theme-toggle, time-filter, timeline, toast); BỎ seller-modal, mention-dropdown, rich-text-editor, install/performance banner, country-select, ring-gauge, cost-panel, type-card.
- `hooks/{use-api,use-url-state,use-back-to-list,use-deferred-api}.ts`, `lib/{utils,read-json,date-utils,vn-date,theme,device,image-url,size-sort}.ts`, `context/{theme,mobile-sidebar,device}-context.tsx`, `components/providers/{swr-provider,theme-script}.tsx`: COPY.
- `app/login/page.tsx`: markup thghub, form → `POST /api/auth/login`, bỏ Google.
- `src/middleware.ts`: chỉ giữ auth redirect (`/login?callbackUrl=`) + `publicPaths ['/login','/track','/api/auth','/api/v1/public']`; bỏ mobile rewrite + rate limit.
- DROP: `(internal)`, `m/`, `app/api/*` thghub, prisma, wallet/label/finance/wms/express, `src/data`, deps zalo/anthropic/resend/tesseract/pdf-lib/web-push/winston/socket.io/tiptap.

**Auth (D5)**
- `app/api/auth/login/route.ts`: POST → `${API_INTERNAL_URL}/customer/auth/login` → set cookie `onos_seller_token` (httpOnly, secure prod, lax, `maxAge=expiresIn` khi rememberMe) + `onos_seller_exp` (client đọc) → trả `user`; 401 forward nguyên.
- `app/api/auth/logout/route.ts`: xóa cookie; đang mạo danh → gọi `customer/auth/impersonate/stop` rồi redirect `NEXT_PUBLIC_ADMIN_URL`.
- `app/api/v1/[...path]/route.ts`: proxy GET/POST/PATCH/PUT/DELETE tới `${API_INTERNAL_URL}/${path}?${search}`; gắn `Authorization` từ cookie, `Accept-Language` từ cookie `onos_lang`; stream body; 401 → xóa cookie + 401 (client `use-api.ts` redirect login); `runtime='nodejs'`, `dynamic='force-dynamic'`.
- `context/session-context.tsx`: SWR `GET /api/v1/customer/auth/me` → `{profile, isImpersonating, refresh}`.
- **Handoff mạo danh**: `app/auth/handoff/page.tsx` + `app/api/auth/handoff/route.ts` (đọc `location.hash` `token`+`exp` → set cookie → `/portal`). `apps/web/src/utils/impersonationStart.ts` L73-79: khi `VITE_SELLER_URL` khác rỗng → `window.location.href = ${VITE_SELLER_URL}/auth/handoff#token=…&exp=…` (fragment không lọt access log); rỗng → giữ hành vi cũ. Không cần endpoint BE mới (`jwt.strategy.ts` đã xử lý token mạo danh).

**Pages PR-B**
| Route | Data (qua `/api/v1`) | Port từ |
|---|---|---|
| `/login` | `POST /api/auth/login` | `pages/customer/login` |
| `/portal/orders` + `/portal/orders/{3d,2d,wood,embroidery,led,canvas}` (`lockedLine`, pattern thghub `orders/pod/page.tsx`) | `GET customer/orders?page&limit&status&held&search&productLine` + `GET customer/orders/counts`; staging: `PATCH staging/:id`, `POST staging/:id/cancel`, push dialog `push-preview` → `push` | `pages/customer/orders/index.tsx`, `PushToProductionDialog.tsx` |
| `/portal/orders/[productionId]` | `GET/PATCH customer/orders/:productionId` (summary + `LifecycleTrack`) | `CustomerOrderDetailDrawer.tsx` (731 LOC) → trang riêng, `orders/track.tsx` timeline |
| `/track/[code]` (public, không sidebar) | `GET public/track/:code` | `pages/track/index.tsx` |
| `/auth/handoff` | §Auth | — |

**i18n**: `src/i18n/index.ts` copy khung `apps/web/src/i18n/index.ts` (react-i18next, fallback `en`), resources `common` (subset), `customerPortal`, `track`, `layout` (nav); `components/providers/i18n-provider.tsx` đọc/ghi cookie `onos_lang` (mirror `languageStore.ts`, dayjs locale). Thêm `productLines.*` vào `customerPortal.json` (vi/en) — cùng key đồng bộ sang `apps/web/products.json`.

**Verify PR-B**: `pnpm --filter ./apps/seller build && lint && build-types` (kiểm bundle không kéo `@nestjs/common` — nếu có, fallback `resolve.fallback` cho class-validator/transformer); `pnpm dev:seller` với API local: login/logout/remember; 401 → login; 6 tab đếm khớp `counts.byProductLine`; detail PATCH mockup; `/track/<pid>` không login; handoff từ admin dev (`VITE_SELLER_URL=http://localhost:3017`).

## PR-C — Đặt đơn + import CSV/push + tài khoản + dashboard

| Route | Data | Port từ |
|---|---|---|
| `/portal` (dashboard) | `GET customer/orders/dashboard` (`CustomerDashboardZod`) + `counts.byProductLine`; charts `portal/dashboard/{chart-card,orders-daily-chart,status-pipeline-donut,top-products-list}` (recharts) chỉ chart có data | `pages/customer/dashboard` |
| `/portal/orders/create` | `GET customer/catalog` (chọn SP/biến thể, lọc `productLine`), `POST customer/orders` (`PlaceCustomerOrderZod`); design: `POST customer/designs/presign` → PUT R2 → `POST customer/designs/confirm` (+ `GET upload-config`) | `pages/customer/orders/new.tsx`, `FileUrlOrUploadInput.tsx` |
| `/portal/orders/import` | wizard (thghub `stepper/file-dropzone/preview-table/result-screen`, `bulk-upload-wizard` viết lại): (1) parse CSV/XLSX client (`xlsx`, map cột như `import.tsx` apps/web, validate `CustomerImportOrderZod` qua `dynamic()`); (2) `POST customer/orders/import/resolve` (SKU→biến thể + dòng SP) → preview lỗi theo dòng; (3) `POST customer/orders/import` → staging; (4) `push-preview` → xác nhận → `push` → result | `pages/customer/orders/import.tsx`, `PushToProductionDialog.tsx` |
| `/portal/account` | `GET/PATCH customer/auth/me`, `POST customer/auth/change-password`, chuông `GET customer/notifications` + `POST read` | `pages/customer/account`, `NotificationBell.tsx` |

**Verify PR-C**: tạo đơn form có upload R2 (presign→PUT→confirm); import template cũ 5 dòng (1 SKU sai) → lỗi đúng dòng; push-preview giá khớp portal cũ; đổi mật khẩu; dashboard số khớp API. **R2 bucket CORS phải thêm origin seller** (ghi `DesignStorage.md`).

## PR-D — Hạ tầng, deploy, redirect

- `apps/seller/ecosystem.config.cjs`: `{name:'onosfactory-seller', script:'node_modules/next/dist/bin/next', args:'start -p 3017', cwd, env:{NODE_ENV, PORT:3017, API_INTERNAL_URL}, max_memory_restart:'1G'}`.
- `deploy.sh`: sau block build web (L146-157) thêm build seller (`NODE_OPTIONS=--max-old-space-size=2048 pnpm --filter ./apps/seller build`) → `pm2 restart apps/seller/ecosystem.config.cjs --update-env` → health `GET http://127.0.0.1:3017/login` = 200 (12×5s) → fail thì hướng dẫn `--rollback`; `--status` in thêm seller; check `node -v` ≥ 20.9. Build seller SAU web để OOM web không kéo theo.
- `cloudflared/config.yml`: thêm `hostname: seller-dev-onos.autonow.vn → http://localhost:3017` trước rule 404 (API đi qua proxy Next, không cần hostname API riêng).
- nginx prod (ngoài repo, doc `Deployment-Ubuntu-VPS.md` §7.2): server block `seller.onosfactory.com` → `proxy_pass http://127.0.0.1:3017` (copy header block API), `client_max_body_size 50M`, certbot; Cloudflare DNS A `seller` proxied.
- CORS `apps/api/src/main-nest.ts` L26: thêm `https://seller.onosfactory.com` (dự phòng); dev `ALLOWED_ORIGINS`. `allowedHeaders` thêm `X-Api-Key` khi chuyển API docs (đợt 2).
- Redirect `apps/web/src/App.tsx` (L136-170): khi `VITE_SELLER_URL` khác rỗng, các route `CUSTOMER_LOGIN/DASHBOARD/ORDERS/ORDER_NEW/ORDER_IMPORT/ORDER_DETAIL/ACCOUNT` render `<ExternalRedirect>` map sang `/login`, `/portal`, `/portal/orders`, `/portal/orders/:pid`, `/portal/orders/create`, `/portal/orders/import`, `/portal/account`. `CUSTOMER_CATALOG*`, `CUSTOMER_API*`, `/track/*`, landing giữ ở `apps/web` tới đợt 2.
- Env prod `apps/seller/.env.production`: `API_INTERNAL_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_ADMIN_URL`.

**Verify PR-D**: dev `seller-dev-onos.autonow.vn` login được, proxy tới 3007; prod `./deploy.sh`: health 3017 = 200, `pm2 ls` có `onosfactory-seller`; `onosfactory.com/customer/orders` → sang seller; `--rollback` khôi phục. Smoke: login, 6 tab, detail, create, import, push, account, track, handoff, logout.

## Docs (mỗi PR cập nhật phần liên quan)

- Mới `documents/FunctionDescription/SellerPortal.md` (skill `write-feature-doc`), `apps/seller/CLAUDE.md`, `documents/Plans/SellerPortal-NextApp.md` (bản kế hoạch này).
- Sửa: `Products.md` (§2.4 `productLine`/`productLineSource`, migration PRD-8, filter/cột admin), `CustomerPortal.md`, `CustomerOrderIntake.md` (query `productLine`, `byProductLine`, item field), `Catalog.md` (facet), `PublicOrderTracking.md` (field), `DesignStorage.md` (R2 CORS origin mới), `Customers.md` (handoff), `WorkshopConfig.md` (`print_method` ≠ dòng SP), `I18n.md` (2 app chung JSON, quy tắc sync "sửa ở apps/web trước"), `Deployment-Ubuntu-VPS.md` + `Architecture/Infrastructure.md` (pm2 3017, nginx, cloudflared).
- `CLAUDE.md` bảng mapping: thêm dòng **Seller Portal (`apps/seller`)**; sửa Customer Portal ("đang chuyển, `/customer/*` redirect"), Products (productLine), Landing/Catalog/Track/Careers ("vẫn ở apps/web, đợt 2").

## Thứ tự & rủi ro

Thứ tự bắt buộc **A → B → C → D** (D chỉ bật redirect sau khi C lên seller-dev và QA xong). Trước A: gộp PR đợt trang xưởng + CEO Dashboard đang chờ.

| Rủi ro | Giảm thiểu |
|---|---|
| `shared` kéo `@nestjs/common` vào client Next | D7 subpath `shared/enums`; DTO `import type`; `dynamic()` cho page cần Zod; kiểm ở `next build` PR-B trước khi viết page |
| zod 3 (shared) vs zod 4 (thghub) | Seller pin zod 3; không copy code dùng API zod 4 |
| React 19/Tailwind 4 vs `apps/web` React 18/Tailwind 3 | Hai app cô lập; không dùng `packages/ui`; chỉ đồng bộ giá trị hex token |
| Bảo trì kép `/customer/*` và seller trong đợt 1 | Sau PR-D freeze `/customer/*` (ghi CLAUDE.md); đợt 2 chuyển catalog/API docs rồi xóa `pages/customer` |
| Cookie/CORS chéo domain | Proxy same-origin; Bearer chỉ server→server |
| OOM build trên VPS | Build seller sau web, heap 2048; fallback build trên hub rồi rsync `.next` (ghi doc) |
| Backfill 49k đơn lúc boot | `updateMany` theo `productConfigId` (~200 lệnh) + 4 fallback, ước < 30 s; claim-flag chống chạy 2 lần |
| Gán mặc định `3d` sai | `productLineSource=default` + warn log + filter admin; LED/Canvas chỉ gắn tay |
| PUT thẳng R2 từ domain seller | Thêm origin vào CORS bucket R2 (checklist PR-C/D) |
