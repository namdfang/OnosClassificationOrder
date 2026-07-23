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
