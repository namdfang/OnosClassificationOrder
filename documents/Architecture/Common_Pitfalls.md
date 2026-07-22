# Common Pitfalls — Cross-Cutting Gotchas

> Tổng hợp các bug pattern đã từng xảy ra ở dự án — đọc trước khi extend code core (User, Auth, Order entity, Shared DTOs). Mỗi entry: **Triệu chứng → Root cause → Fix → Rule chung**.

---

## 1. ⚠️ User field silently undefined ở BE service / FE profile

### Triệu chứng

- Endpoint mới reject với "Thiếu X (user chưa gán X)" **dù admin đã gán đúng trong DB**.
- Hoặc UI page báo "Tài khoản chưa được cấu hình X" dù field đã set.
- `console.log(user)` trên BE service hoặc `console.log(authStore.profile)` trên FE → field thiếu.

### Root cause

`UserService` có **2 aggregation pipeline độc lập** strip field bằng `$project`:

| Method | Audience | Consumer |
|---|---|---|
| `getUserById(id)` (`apps/api/src/modules/user/user.service.ts:41`) | BE | JwtStrategy → `@AuthUser()` decorator |
| `getMe(id, user)` (`apps/api/src/modules/user/user.service.ts:123`) | FE | `GET /v1/auth/me` → `authStore.profile` |

Cả 2 đều có `$project` **whitelist** — field nào KHÔNG có trong list sẽ **silently** `undefined` trên user object. Mongoose không warn, TypeScript không catch (lean → `any`/`UserDocument` cast).

### Fix

Add field vào **cả 2** `$project`:

```ts
// getUserById
$project: { _id: 1, status: 1, email: 1, ..., fulfillmentStage: 1, ... }

// getMe
$project: { _id: 1, email: 1, name: 1, ..., fulfillmentStage: 1, ... }
```

### Rule chung

Khi thêm field mới trên `UserEntity` mà downstream cần access:

| Use case | Project vào |
|---|---|
| BE service / controller dùng `user.X` qua `@AuthUser()` | `getUserById` |
| FE display / authStore lookup | `getMe` |
| Cả 2 (vd: `fulfillmentStage`) | Cả 2 |
| Chỉ DB schema (private, không có business logic) | Không cần (vẫn lưu DB) |

**Khi không chắc:** add vào cả 2 — overhead negligible, false-negative bug rất tốn thời gian debug.

### Precedent đã xảy ra

- `fulfillmentStage` (2026-06): Forgot ở `getUserById` → `/v1/fulfillment/my-tasks` báo "Thiếu stage" toàn dự án. Fix: `user.service.ts:96` + `:170`. Xem `FunctionDescription/FulfillmentWorkflow.md §5.6`.

---

## 2. ⚠️ Shared package factory const với `new Date()` bị freeze ở module load

### Triệu chứng

Field timestamp ở record mới luôn = server start time, không phải thời điểm tạo. Test development không phát hiện (vì restart server thường xuyên), prod log mới rõ.

### Root cause

```ts
// SAI — `new Date()` evaluate 1 lần ở module load.
const ENTRY_PATCH = {
  createdAt: new Date(),
  ...
} as const;
```

`as const` không "lazy" — value tính ngay khi module require/import. Mọi caller dùng `Object.assign(patch, ENTRY_PATCH)` về sau đều ghi cùng timestamp.

### Fix

Convert thành factory function — evaluate mỗi call:

```ts
function buildEntryPatch(): Record<string, unknown> {
  return {
    createdAt: new Date(),
    ...
  };
}
```

### Rule chung

- **Const literal patch object** chỉ được chứa giá trị tĩnh (string/enum/0).
- Bất kỳ field nào cần evaluate runtime (`new Date()`, `randomUUID()`, `+new Date()` shortcut) phải nằm trong factory function.

### Precedent đã xảy ra

- `FULFILLMENT_ENTRY_SET` (2026-06): Const `waitingAt: new Date()` → mọi đơn vào fulfillment đều có `waitingAt = server boot time`. Fix: refactor thành `buildFulfillmentEntrySet()`. Xem `FunctionDescription/FulfillmentWorkflow.md §5.4`.

---

## 3. ⚠️ Enum extension không migrate đơn cũ → "ghost data" mất visibility

### Triệu chứng

Sau khi enum (vd `FulfillmentStage`) thay đổi (5 → 7 stage, hoặc 4 → 5 tab), đơn cũ với enum value cũ vẫn nằm trong DB nhưng **không match filter nào** ở FE → biến mất khỏi UI.

### Root cause

- BE filter `currentFulfillmentStage: { $in: NEW_VALUES }` — không bao gồm `'qc'`, `'sew'` cũ.
- Frontend `FULFILLMENT_STAGE_LABELS[stage]` lookup → undefined.

### Fix options

| Option | Khi nào dùng |
|---|---|
| **Migration script onModuleInit** — rewrite `'qc'` → `'qc-post-press'` etc. | Khi có business value cần giữ đơn cũ. |
| **Chấp nhận data loss** — đơn cũ ghost, admin xoá hoặc bỏ qua | Khi đơn cũ "chưa chuẩn" (theo confirm từ stakeholder). |
| **Backward-compat fallback** — code đọc cả enum cũ + mới | KHÔNG khuyên — bloat code lâu dài. |

### Rule chung

Khi refactor enum trên field index trong production:

1. Xác định **rõ ràng** với stakeholder: migrate hay drop?
2. Nếu drop: doc rõ ràng "data cũ mất visibility, áp dụng cho đơn mới from {date}".
3. Tránh option 3 — kỹ thuật nợ tích lũy.

### Precedent đã xảy ra

- `FulfillmentStage` (2026-06): 5 → 7 stage refactor. Stakeholder confirm "data cũ chưa chuẩn, không cần migrate". Xem `FunctionDescription/FulfillmentWorkflow.md §1` refactor history.

---

## 4. ⚠️ Mongoose Zod `as const` patch không type-check `$inc` field

### Triệu chứng

`$inc: { someCounter: 1 }` được set nhưng counter không tăng — silently fail vì Mongoose schema không có `someCounter` declare.

### Rule chung

Field nào dùng `$inc` PHẢI có `@Prop({ type: Number, default: 0 })` declare trong Mongoose schema.

---

## 5. ⚠️ Shared package build không tự động — TypeScript/runtime mismatch

### Triệu chứng

Sửa enum / DTO trong `packages/shared/` → BE / FE không thấy giá trị mới dù typecheck pass.

### Root cause

Shared package compile sang `dist/index.js` + `dist/index.cjs`. BE/FE import từ `'shared'` resolve về `dist/` (theo package.json `exports`). Khi sửa source, **phải rebuild**.

### Fix

```bash
cd packages/shared && pnpm build
```

Hoặc `pnpm dev` chạy watch mode trong shared package.

### Rule chung

- Sau khi sửa `packages/shared/`, **luôn** rebuild trước khi test BE/FE.
- CI/deploy script tự rebuild — local dev cần manual.

---

## 6. ⚠️ "Code đúng nhưng server chạy code cũ" — query param bị Zod strip âm thầm + deploy/PM2 không reload sạch

> Mở rộng #5 sang phần **runtime/deploy**. #5 nói "rebuild dist"; pitfall này về việc **dù dist mới, PROCESS đang chạy vẫn dùng code cũ** và hệ quả **silent** (không có lỗi, param/field biến mất). Tốn nhiều giờ debug trong phiên 2026-06.

### Triệu chứng

- Thêm query param mới (vd. `userSku`, `toolResultNote`) vào FE + BE + shared, typecheck pass, **local chạy mượt**, nhưng **trên server filter không áp dụng** / facet mới không trả về / field response (vd. `inProductionAt`, `toolResultNote`) bị thiếu — **không có error nào**.
- Hoặc: server **lúc trả field mới lúc không** (intermittent).

### Root cause (3 lớp, hay cộng hưởng)

1. **Global `ZodValidationPipe` (`apps/api/src/main-nest.ts`) strip key lạ.** Pipe gọi `zodSchema.safeParse(query)` rồi `return parseResult.data`. Zod `z.object({...})` **mặc định xóa mọi key không khai báo**. Nếu process đang chạy nắm `GetXxxZod` từ **dist cũ** (chưa có param mới) → param bị **cắt khỏi query trước khi vào controller** → service không bao giờ nhận. **Silent, không lỗi.** (Tương tự: `toCard`/mapper build object field-by-field → field mới chỉ xuất hiện nếu dòng map đó có trong code đang chạy.)
2. **Process Node cache module trong RAM.** Build lại `dist` trên đĩa **vô tác dụng** cho tới khi **restart process**. Rebuild ≠ reload.
3. **PM2 cluster `reload` để lại orphan worker.** `pm2 reload` (rolling, cluster mode) có thể spawn worker mới nhưng worker cũ không chết hẳn (graceful shutdown kẹt) → 2 process cùng phục vụ qua listening socket kế thừa → **request rơi ngẫu nhiên vào worker cũ/mới** → "lúc có lúc không". Dấu hiệu: `ps aux | grep start.js` ra **>1 dòng**, `restarts` count cao bất thường.

### Fix

- **Quy trình deploy đúng:** `git pull/reset` → `pnpm --filter shared build` → `pnpm build:api` → **RESTART** (không chỉ rebuild). Verify: `git log -1`, `pm2 list` (uptime ~0), `ps aux | grep start.js` (chỉ 1 dòng).
- **`deploy.sh` ordering:** reload/restart API **NGAY sau `build:api`, TRƯỚC `build:web`**. Vì `set -e` + `build:web` dễ OOM trên server RAM thấp → nếu web build fail thì script abort **trước** bước reload → API chạy code cũ dù `dist-prod` đã mới. (Đã sửa: dùng `pm2 restart` thay `reload` để kill sạch worker cũ, tránh orphan.)
- **Orphan PM2:** `kill <pid_cũ>` thủ công, rồi `pm2 delete <app> && pm2 start ecosystem.config.cjs` để chỉ còn 1 bản. Thêm `kill_timeout` vào ecosystem để worker cũ bị SIGKILL khi reload.

### Cách phân biệt nhanh (FE vs BE vs deploy)

- DevTools → Network: request có chứa param mới (vd. `userSku=`) không? **Có** mà kết quả không đổi ⇒ BE strip ⇒ server chạy code cũ ⇒ restart.
- Gọi endpoint facet (vd. `/my-task-filters`): response **thiếu hẳn key mới** (vd. không có `userSku`) ⇒ service cũ ⇒ chưa deploy. (Response không bị ZodValidationPipe đụng — pipe chỉ validate **input**; key thiếu = do code service.)

### Liên quan timezone (red herring đã gặp)

Khác biệt local/server **không phải lúc nào cũng do timezone.** Phiên 2026-06: nghi server UTC gây lệch ngày, nhưng `timedatectl` cho thấy VPS cũng `+07` → loại. Nguyên nhân thật là code cũ. **Tuy vậy rule vẫn đúng:** filter theo ngày phải hardcode `+07:00` (`new Date(\`${d}T00:00:00+07:00\`)`), KHÔNG dùng `setHours()` (giờ local server) — để đúng bất kể TZ server.

### Rule chung

- Sửa `packages/shared` hoặc BE service → **rebuild + RESTART process**, không chỉ rebuild.
- Param/field mới "biến mất" mà không có lỗi → nghi ngay **Zod strip do dist cũ** hoặc **process chưa restart**, không phải bug logic.
- Bug "lúc được lúc không" trên server → nghi **nhiều instance/orphan process** chạy lẫn code cũ + mới.

### Precedent đã xảy ra

- 2026-06: `userSku` + `toolResultNote` filter + `inProductionAt` ở `/designer/my-tasks` — local đúng, server sai/thiếu. Root cause: server chạy bản `designer-task.service.ts` cũ + orphan PM2 worker (`pid` từ hôm trước) + `deploy.sh` reload sau web-build-OOM. Fix: kill orphan + đổi `reload`→`restart` + reorder deploy.

---

## §6. `packages/shared` — circular barrel import → bundle phình 74× → `Maximum call stack size exceeded` khi load

### Triệu chứng
- API crash lúc **khởi động** (require-time), stack trace trỏ vào `zod/lib/helpers/util.js` / `zod/lib/locales/en.js` (red herring — zod chỉ là "giọt nước tràn ly"): `RangeError: Maximum call stack size exceeded`.
- Load được khi `node --stack-size=2000` (>default ~984) → **hữu hạn nhưng quá sâu**, KHÔNG phải đệ quy vô hạn (schema tự tham chiếu).

### Root cause (2 tầng)
- Leaf files trong `packages/shared` (`dtos/*.dto.ts`, `constants/*.ts`, `utils/*.ts`...) import primitives (`IDZod`, `Status`, `BaseEntityZod`...) từ **`'..'` = thư mục gói** → Node/esbuild resolve qua `package.json` (`module: dist/index.js`) → **tsup NUỐT NGUYÊN `dist/index.js` CŨ vào bundle mới** (marker `// dist/index.js` trong `dist/index.cjs`).
- **Snowball mỗi lần build:** build N chứa dist của build N-1 bên trong → mỗi symbol có suffix tăng dần (`ALL_PERMISSION_CODES`, `...2`, ... `...24` = 24 lớp) — vì `prebuild: rimraf dist` **KHÔNG chạy** (pnpm mặc định bỏ qua pre/post scripts). Bundle phồng dần (8–21MB tuỳ số lớp). Eval N lớp lồng nhau lúc require → tràn stack.
- Nếu dist SẠCH lúc build, `'..'` fallback về `index.ts` → **cycle-qua-entry thật** → esbuild sắp thứ tự eval sai → `TypeError: Cannot read properties of undefined (reading 'extend')` (`BaseEntityZod` chưa init). Tức là kiểu import `'..'` sai ở CẢ 2 nhánh — chỉ "chạy được" nhờ ăn dist cũ.
- **Tích lũy âm thầm:** vượt ngưỡng stack lúc nào không biết → **chỉ lộ khi rebuild/deploy** (dist gitignore, mỗi máy build riêng; máy Node mới stack lớn hơn vẫn chạy được trong khi server Node cũ crash).

### Fix (đã áp 2026-07, branch fix/factory-by-customer)
- Đổi **mọi** leaf import `from '..'` → **import trực tiếp module nguồn** (`from '../constants/common-zod'`, `from './common-length'`, `from '../utils/getObjectValues'`...) — codemod 40 files. Không còn cycle-qua-entry, không còn resolve vào dist. Bundle: **8.13MB → 526KB**, `ALL_PERMISSION_CODES` 24→**1**, load OK cả với `--stack-size=200` (1448 exports, không mất export nào).
- `packages/shared/package.json` build script thêm **`--clean`**: `tsup index.ts --format cjs,esm --clean` — tsup tự xoá dist trước mỗi build (không phụ thuộc `prebuild` vốn bị pnpm bỏ qua) → hết đường snowball tái phát.

### Rule chung
- **TUYỆT ĐỐI KHÔNG** `import ... from '..'` (entry/thư mục gói) bên trong `packages/shared`. Import **file module cụ thể** (hoặc sub-barrel `@shared/enums`/`@shared/types` — alias tsconfig trỏ source, an toàn).
- Sau khi thêm file/DTO vào `shared`: `grep -rn "from '\.\.'" packages/shared --include=*.ts | grep -v dist` phải **= 0**.
- Sanity sau `pnpm --filter shared build`: `grep -c "^// dist/index" packages/shared/dist/index.cjs` phải **= 0** và `grep -c "var ALL_PERMISSION_CODES" ...` phải **= 1** (>1 = tái phát) + `node --stack-size=200 -e "require('./packages/shared/dist/index.cjs')"` không tràn stack; size dist/index.cjs ~500KB (thấy MB là có chuyện).

---

## Khi nào update file này

- Phát hiện bug pattern cross-cutting (ảnh hưởng > 1 module).
- Code review thấy lỗi tương tự lặp lại từ precedent đã ghi.
- Bug debug mất > 1h vì root cause subtle (silent failure, type system không catch).
