# Chat Zalo trong hệ thống (Zalo Chat) — Function Description

> **File FE:** `apps/web/src/pages/zalo/` · `apps/web/src/lib/next-shim/` · `apps/web/src/services/zaloChat.ts`
> **File BE:** `apps/api/src/modules/zalo-chat/`
> **Hạ tầng:** `docker/zalo-engine/docker-compose.yml`
> **Route:** `/adm/zalo` · `/adm/zalo/settings`
> **API:** `POST|DELETE /v1/zalo-chat/session` · proxy `/api/zalo-multi/*` (NGOÀI tiền tố `api/v1`)

## 1. Overview

Nhúng module Zalo của nhà cung cấp (`@zero-126/*`) vào OnosFactory để quản lý **nick Zalo của sale**:
quét QR đăng nhập nick, chat, gán hội thoại, trả lời tự động — ngay trong `/adm`, không phải mở app khác.

Ba mảnh:

| Mảnh | Là gì | Ai viết |
|---|---|---|
| **Engine** | Container `ghcr.io/zero-126/zalo-engine` + Postgres + Redis riêng. Nói chuyện với Zalo, giữ phiên nick, lưu hội thoại. | Nhà cung cấp |
| **Proxy** | `apps/api/src/modules/zalo-chat/` — xác thực người dùng của app rồi chuyển tiếp sang engine kèm chữ ký HMAC. | Ta |
| **Giao diện** | `@zero-126/zalo-ui` (`ZaloWorkspace`, `ZaloSettings`) mount trong 2 trang React. | Nhà cung cấp |

**KHÔNG liên quan tính năng "Nối nhóm Zalo ↔ khách hàng"** ([ZaloGroupMapping.md](ZaloGroupMapping.md)): tính năng
đó đọc dữ liệu từ MỘT engine KHÁC (host `onosceo`, 2 nick của công ty) để làm báo cáo/tóm tắt. Engine ở đây là
engine THỨ HAI, license riêng, dữ liệu riêng, dành cho nick sale. Hai bên không dùng chung DB.

## 2. Luồng hoạt động

```
Trình duyệt (/adm/zalo)
   │ 1. POST /api/v1/zalo-chat/session   (JWT trong header — như mọi API khác)
   │    ← Set-Cookie: onos_zalo=<JWT RS256>; Path=/api/zalo-multi; HttpOnly
   │
   │ 2. ZaloWorkspace gọi thẳng /api/zalo-multi/... (fetch, credentials=same-origin)
   ▼
API (hook onRequest của Fastify)
   │ 3. đọc cookie → {id, displayName, role}
   │ 4. ký x-service-token = {ts}.{HMAC-SHA256(ts, ZALO_ENGINE_SECRET)}
   │    + x-user-id / x-user-name / x-user-role / x-user-scopes
   ▼
Zalo Engine (127.0.0.1:4001) ──▶ Zalo
```

### Vì sao phải có bước đổi JWT lấy cookie

SDK của nhà cung cấp gọi bằng `fetch(..., { credentials: 'same-origin' })` và **không gắn header
`Authorization`** — đó là mã đã build, không sửa được. JWT của app nằm ở `localStorage` nên không tự đi kèm.
Nên trang chat đổi JWT lấy một cookie `HttpOnly` **phạm vi hẹp đúng `/api/zalo-multi`**, sống 8 giờ. Cookie ký
bằng chính cặp khoá RS256 của hệ thống (`JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY`) — một nơi để xoay khoá.

### Điều kiện bắt buộc: trang và proxy phải CÙNG ORIGIN

Giao diện gọi `/api/zalo-multi/...` bằng đường **tương đối** và `credentials: 'same-origin'`. Kéo theo hai ràng buộc:

1. Origin đang mở trang **phải phục vụ được `/api/...`**. Trên dev, tunnel đã có luật `^/api` cho
   `dev-onos.autonow.vn`. Trên **production**, `onosfactory.com` hiện CHỈ phục vụ tệp tĩnh (web gọi API qua
   `api.onosfactory.com`), nên trước khi bật màn chat phải thêm vào server block `onosfactory.com`:

   ```nginx
   # Đặt TRƯỚC location regex tệp tĩnh. `^~` chặn regex phía dưới cướp mất request.
   location ^~ /api/ {
       proxy_pass http://127.0.0.1:3007;
       proxy_http_version 1.1;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
       client_max_body_size 50M;   # gửi ảnh/tệp qua Zalo
       proxy_read_timeout 120s;    # engine cho phép 45s cho đính kèm
   }
   ```

2. Cookie phiên phải được cấp **trên chính origin của trang**, nên `useZaloSession` gọi `fetch` đường tương đối
   `/api/v1/zalo-chat/session` chứ KHÔNG qua `RepositoryRemote`. Bản dev qua tunnel tự suy ra host API riêng
   (`api-dev-onos.autonow.vn`); gọi qua axios sẽ đặt cookie cho host đó, còn SDK gọi host của trang — cookie
   không bao giờ đi kèm và **mọi lời gọi trả 401**. Đây là lỗi đã dính lúc chạy thử lần đầu.

### Vì sao proxy nằm ở hook `onRequest` chứ không phải controller Nest

1. **Đường dẫn `/api/zalo-multi` là cố định** — giao diện gọi thẳng chuỗi này ở 8 chỗ trong mã đã build, nên nó
   phải nằm NGOÀI tiền tố `api/v1` của API.
2. **Hook `onRequest` chạy trước khâu đọc body**, nên `req.raw` còn nguyên luồng — điều kiện bắt buộc để
   chuyển tiếp multipart (gửi ảnh/tệp) mà không nạp cả tệp vào RAM.

Phần chuyển tiếp **dùng lại `createZaloProxyHandler` của SDK**, không chép tay: hợp đồng với engine còn có danh
sách header phải bỏ, trần chờ riêng cho đường chậm (gửi tệp 60s, còn lại 30s), `push/sw.js` phải phục vụ tại app
đúng MIME, và `directory` KHÔNG được forward. Chép tay bốn thứ đó là bốn chỗ lệch âm thầm mỗi lần vendor ra bản mới.

## 3. API / Schema

| Method | Path | Mô tả |
|---|---|---|
| POST | `/v1/zalo-chat/session` | Đổi JWT lấy cookie phiên. `@Auth([SuperAdmin, Admin])`. |
| DELETE | `/v1/zalo-chat/session` | Xoá cookie phiên. |
| ALL | `/api/zalo-multi/*` | Proxy sang engine. Không có cookie hợp lệ → **401**, không forward. |
| GET/POST | `/api/zalo-multi/socket` | socket.io polling → `/socket.io/` của engine. |

Không có collection Mongo nào: module này **chỉ là cầu nối**, mọi dữ liệu Zalo nằm trong Postgres của engine.

## 4. UI Components

| File | Vai trò |
|---|---|
| `pages/zalo/index.tsx` | Mount `<ZaloWorkspace basePath="/adm/zalo" settingsPath="/adm/zalo/settings">` |
| `pages/zalo/settings.tsx` | `<ZaloSettings>` bọc `ZaloConfigProvider` (component này đọc `basePath` từ context) |
| `pages/zalo/useZaloSession.ts` | Xin cookie phiên trước khi dựng giao diện |
| `lib/next-shim/link.tsx`, `navigation.ts` | Shim `next/link` + `next/navigation` — xem §5 |

Entry sidebar "Chat Zalo" nằm cạnh "Nhóm Zalo", **`onlyForRoles: [SuperAdmin, Admin]`**.

## 5. Backend logic / điểm cần biết

- **Gói giao diện viết cho Next.js.** Nó import `next/link` + `next/navigation` ngay trong mã đã build (đúng 2 chỗ).
  App này chạy Vite + react-router nên `vite.config.js` alias hai đường đó sang `src/lib/next-shim/`. **KHÔNG cài
  `next`** chỉ để thoả một import. `useRouter().refresh()` để rỗng: `refresh` của Next là nạp lại dữ liệu phía
  server, app này không có, mà reload cả trang sẽ đá người dùng khỏi cuộc trò chuyện đang mở.
- **Vai trò**: `SuperAdmin`/`Admin` → `owner` (thấy MỌI hội thoại của MỌI nick). Role khác → không cấp cookie.
  Quyết định vai trò nằm ở **một chỗ duy nhất** — `ZaloChatService.vaiTro()`; decorator `@Auth` chỉ chặn vòng ngoài.
  Muốn mở cho Manager/Support thì thêm nhánh `member` ở đó, KHÔNG nới ở proxy.
- **Tiến trình microservice**: `main-nest.ts` dựng thêm một `NestMicroservice` nạp cùng `AppModule` — ở đó
  `httpAdapter` là `null`. `ZaloProxyService.onModuleInit` phải kiểm tra trước khi gắn hook, không thì tiến trình
  đó sập lúc khởi động (đã dính một lần).
- **Engine pin theo digest**, không dùng `:latest`. Có bản mới thì engine tự ghi log "CÓ BẢN ENGINE MỚI" → đọc
  changelog ở https://zalo.autonow.vn → đổi digest trong compose → `docker compose pull && up -d`.
- **Engine chỉ nghe loopback** (`127.0.0.1:4001`). Nó đọc được mọi hội thoại nên tuyệt đối không mở ra mạng ngoài;
  mọi lối vào phải đi qua proxy của app.

## 6. Cấu hình

`apps/api/.env.<NODE_ENV>`:

```
ZALO_ENGINE_URL=http://127.0.0.1:4001
ZALO_ENGINE_SECRET=<trùng y hệt docker/zalo-engine/.env>
```

Production còn cần: **`GHCR_TOKEN`** trong môi trường của server (deploy chạy `pnpm install`), **license riêng**
cho máy đó, và block nginx ở §2. Phiên nick KHÔNG chuyển được giữa hai engine — lên engine mới phải quét QR lại.

`docker/zalo-engine/.env` (KHÔNG commit — xem `.env.example`): `ENGINE_PORT`, `PG_PW`, `ZALO_ENGINE_SECRET`,
`ZALO_ENCRYPTION_KEY` (đổi = mất hết phiên, phải quét QR lại), `ZALO_LICENSE_KEY` (**mỗi server một khoá**).

Gói npm nằm ở registry riêng: `.npmrc` ở gốc repo trỏ `@zero-126` sang `npm.pkg.github.com`, token đọc từ biến
môi trường `GHCR_TOKEN` — **máy nào chạy `pnpm install` (kể cả server production lúc `deploy.sh`) phải có biến này**.

## 7. Vận hành thật (từ 03/09/2026)

| Mảnh | Dev (hub) | Production (`onosnew`) |
|---|---|---|
| Engine | `docker/zalo-engine/` trong repo hub, license "ONOS _HUB" | `/var/www/onosfactory/current/docker/zalo-engine/` (`.env` gitignored, license "ONOS _HUB_PROD", 30 nick). **Docker cài ngày 03/09 chỉ cho việc này.** |
| Token registry | `/root/.onos-ghcr.env` (600), `~/.bashrc` nạp | y hệt; `deploy.sh` tự nạp cho shell không tương tác |
| `/api/` trên origin web | luật `^/api` của tunnel | block `location ^~ /api/` chèn tay vào server 443 `onosfactory.com` ở `/etc/nginx/sites-enabled/onosfactory` (bản lưu `/etc/nginx/onosfactory.bak-*`) — KHÔNG nằm trong repo |

**Sự cố lần deploy đầu (03/09):** pnpm hỏi "xoá node_modules cài lại?" khi tập registry đổi, chạy không tương tác thì
**thoát 0 mà không cài gì** → API build thiếu `@zero-126/zalo-sdk` → sập. `deploy.sh` đã vá (trả lời sẵn + kiểm gói
resolve được trước khi build). Bẫy kiểm tra: API trả `200 text/html` rỗng cho GET không có route, nên **kiểm block
nginx bằng POST** (`/api/v1/auth/login` → 422 JSON), đừng nhìn `GET /api/v1`.

## 8. Permissions

| Vai trò hệ thống | Vào `/adm/zalo` | Vai trong engine |
|---|---|---|
| SuperAdmin, Admin | có | `owner` — thấy mọi hội thoại |
| Còn lại | không (không có entry sidebar, `POST session` trả 403) | — |
