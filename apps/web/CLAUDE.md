# Frontend Rules (apps/web)

> Xem quy tắc chung (TypeScript, Git, Code Quality) và bảng Feature → Doc mapping ở [`CLAUDE.md`](../../CLAUDE.md) gốc repo.

### Component Rules

- Functional components only. Dùng `function ComponentName()` hoặc `const ComponentName: React.FC<Props>`.
- Props type: interface với suffix `Props` (e.g., `FilterFormProps`).
- Default export cho page components, named export cho utilities.
- File naming: **PascalCase** cho components (e.g., `FilterForm.tsx`, `StatCard.tsx`).

### State Management

- Zustand stores với `persist` middleware cho data cần giữ qua sessions.
- Store interface naming: `[Name]Store` (e.g., `AuthStore`, `ThemeStore`).
- File naming: **camelCase** + suffix `Store` (e.g., `authStore.ts`).

### API Calls

- **Luôn** dùng `RepositoryRemote` — KHÔNG gọi axios trực tiếp.
- Service files ở `src/services/`, grouped by domain (auth, order, catalog...).
- URL format: `/${CONFIG.API_VERSION}/[endpoint]`.

### Error Handling

- **Mọi async operation** phải wrap trong `try-catch` với `handleAxiosError(error)`.
- KHÔNG dùng `console.log` cho errors trong production code.

### Styling

- **Tailwind** cho layout, spacing, colors, responsive.
- **Ant Design theme tokens** cho component styling (borderRadius, colors...).
- **globals.css** cho CSS overrides mà Design Token không hỗ trợ.
- KHÔNG dùng styled-components.
- KHÔNG dùng inline styles trừ khi bắt buộc (e.g., dynamic values).
- Dark mode: dùng `dark:` prefix trong Tailwind classes.
- Color system: primary = indigo (`#6366F1`), dùng `primary-*` Tailwind classes.

### Routing

- Mọi path phải define trong `constants/paths.ts` object `PATHS`.
- Lazy load page components trong `routerConfig.ts`.
- Permission check: dùng `validatePermission()` và `permissionMap`.
- **3 root router + 1 landing:**
  - `/adm/*` — trang dùng chung / quản trị nhân viên (login, products, users, departments, roles, custom-roles, settings, account, notifications).
  - `/ffm/*` — trang mang tính sản xuất (dashboard, orders, workshop-config, designer, fulfillment).
  - `/customer/*` — Customer Portal (đăng ký/đăng nhập/đặt đơn/theo dõi đơn khách hàng), auth + store RIÊNG (`customerAuthStore.ts`), KHÔNG chung MainLayout/Sidebar nhân viên — xem [`documents/FunctionDescription/CustomerPortal.md`](../../documents/FunctionDescription/CustomerPortal.md).
  - `/` — landing page public, không gate auth (`pages/landing/`).
  - `/adm` và `/ffm` dùng CHUNG 1 `MainLayout`/`Sidebar`/staff `authStore` — chỉ là namespace URL, không phải portal tách biệt.

### Import Order

```typescript
// 1. React + third-party
import React, { useEffect, useState } from 'react';
import { Button, Table } from 'antd';
import type { TablePaginationConfig } from 'antd';
import dayjs from 'dayjs';
import { Search } from 'lucide-react';

// 2. Constants
import { PATHS } from '@/constants/paths';

// 3. Store
import { useAuthStore } from '@/store/authStore';

// 4. Services
import { RepositoryRemote } from '@/services';

// 5. Components
import FilterForm from '@/components/common/FilterForm';

// 6. Utils
import { handleAxiosError } from '@/utils';
```

### Icons

- **Chỉ dùng Lucide React**. Import từ `lucide-react`.
- Size mặc định: `size={16}` cho inline, `size={18}` cho menu, `size={20}` cho header.

### Animation

- Page transitions: Framer Motion `motion.div` trong MainLayout.
- CSS transitions: chỉ dùng `transition-*` Tailwind classes cho hover/focus.
- **KHÔNG** thêm CSS `animation` hoặc `@keyframes` cho Ant Design overlay components (Modal, Popover, Dropdown, Tooltip, Drawer) — chúng đã có animation riêng, thêm vào sẽ gây nhấp nháy.

### Form Handling

- Dùng Ant Design `Form` với `Form.Item`.
- Define `FieldType` interface cho type-safe form values.
- Validation: Ant Design built-in rules + custom validators.
