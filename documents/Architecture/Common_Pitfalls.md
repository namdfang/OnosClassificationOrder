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

## Khi nào update file này

- Phát hiện bug pattern cross-cutting (ảnh hưởng > 1 module).
- Code review thấy lỗi tương tự lặp lại từ precedent đã ghi.
- Bug debug mất > 1h vì root cause subtle (silent failure, type system không catch).
