# Shared Package Rules (packages/shared)

> Xem quy tắc chung (TypeScript, Git, Code Quality) và bảng Feature → Doc mapping ở [`CLAUDE.md`](../../CLAUDE.md) gốc repo.

### What goes here

- DTOs (Zod schemas + class DTOs)
- Enums (RoleType, Status, OrderStatus, PermissionType...)
- Constants (validation lengths, Zod validators)
- Types (PageQuery, PageRes, BaseEntity)

### What does NOT go here

- Business logic
- Framework-specific code (NestJS decorators, React components)
- Configuration

### Naming

- DTO files: `[feature].dto.ts`
- Enum files: `[name].enum.ts`
- Constant files: descriptive name (e.g., `validation.ts`)

### Entry `client/` (nest-free, 07/09/2026)

- `packages/shared/client/**` = schema Zod + hàm thuần **KHÔNG import NestJS** để app browser (`apps/seller`) import runtime qua `shared/client` (tsup entry + `exports["./client"]`). File trong `client/` chỉ được import `zod` và file khác trong `client/`.
- Schema/hàm nào FE cần **runtime** (validate CSV, ghép URL CDN, luật design) → định nghĩa ở `client/`, rồi `dtos/*.dto.ts` **re-export** (BE + `apps/web` vẫn import từ `shared` như cũ). `enums/` tương tự cho enum.
- Sau khi sửa: `pnpm --filter shared build` rồi kiểm `grep -l @nestjs dist/client/*.js dist/chunk-*.js` phải rỗng cho chunk mà `dist/client/index.js` import.
