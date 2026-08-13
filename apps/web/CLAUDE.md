# Frontend Rules (apps/web)

> Xem quy tắc chung (TypeScript, Git, Code Quality) và bảng Feature → Doc mapping ở [`CLAUDE.md`](../../CLAUDE.md) gốc repo.

### Component Rules

- Functional components only. Dùng `function ComponentName()` hoặc `const ComponentName: React.FC<Props>`.
- Props type: interface với suffix `Props` (e.g., `FilterFormProps`).
- Default export cho page components, named export cho utilities.
- File naming: **PascalCase** cho components (e.g., `FilterForm.tsx`, `StatCard.tsx`).

### I18n (Đa ngôn ngữ) — BẮT BUỘC cho mọi UI mới

> Chi tiết đầy đủ + kiến trúc: [`documents/FunctionDescription/I18n.md`](../../documents/FunctionDescription/I18n.md) — đọc trước khi thêm trang/component mới hoặc sửa text hiển thị.

- **KHÔNG hardcode text hiển thị người dùng** dưới bất kỳ hình thức nào: JSX text, `toast.success/error`, `placeholder`, `title`/`aria-label`, tên nút, tiêu đề dialog, table column header, empty-state, tooltip... TẤT CẢ phải qua `react-i18next`: `const { t } = useTranslation('<namespace>')` rồi `t('key')`.
- **Namespace theo feature**, khớp bảng "Feature → Doc mapping" ở [`CLAUDE.md`](../../CLAUDE.md) gốc (vd trang Orders dùng namespace `orders`, Fulfillment dùng `fulfillmentWorkflow`...). Dùng `common` cho string dùng chung (Lưu/Hủy/Xóa/Tìm kiếm, loading/error, pagination...) — đọc `src/i18n/locales/vi/common.json` trước khi tự thêm key trùng nghĩa.
- Thêm key mới → viết vào **CẢ 2** file `src/i18n/locales/{vi,en}/<namespace>.json`, không để lệch cấu trúc key giữa 2 ngôn ngữ. Namespace mới → đăng ký thêm trong `src/i18n/index.ts`.
- **Map/mảng label khai báo ở module scope** (ngoài function component — chỉ evaluate 1 lần lúc import, KHÔNG tự đổi khi user chuyển ngôn ngữ) → PHẢI chuyển thành function nhận `t` làm tham số, gọi trong component qua `useMemo(() => buildX(t), [t])` (mẫu: `buildNavGroups(t)` ở `components/sidebar/Sidebar.tsx`).
- **Zod schema có message lỗi** khai module scope → factory function `buildXSchema(t)`, gọi qua `useMemo` trong component (mẫu: `buildLoginSchema(t)` ở `pages/login/index.tsx`).
- Label lấy từ `packages/shared` (enum/constant dùng chung BE, vd permission-catalog, fulfillment-stage) → **KHÔNG sửa file shared**. Tạo dictionary riêng trong namespace FE + tra bằng `t(key, { defaultValue: originalLabel })` để tự fallback khi thiếu key (mẫu: `utils/fulfillmentStageLabel.ts`, `permissions.*`/`permissionGroups.*` trong `auth.json`).
- Module KHÔNG phải React component (axios interceptor, export util gọi từ click handler...) → import `i18n` default export từ `@/i18n`, gọi `i18n.t(key, { ns: '<namespace>' })` thay vì dùng hook.
- Ngôn ngữ mặc định: **Tiếng Anh** (`DEFAULT_LANGUAGE` trong `src/i18n/index.ts` — cũng là `fallbackLng`). Người dùng đã chọn ngôn ngữ thì lựa chọn được nhớ qua `localStorage` (`onosfactory-language`), sống qua restart trình duyệt. Thêm string mới → viết CẢ `en` lẫn `vi`, **file `en` phải luôn phủ đủ key** vì fallback trỏ vào đó.

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
- **Radix UI + shadcn-style components** (`src/components/ui/`) cho component primitives — KHÔNG dùng Ant Design (không phải dependency của project).
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
import { useTranslation } from 'react-i18next';
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
- **KHÔNG** thêm CSS `animation` hoặc `@keyframes` cho Radix overlay components (Dialog, Popover, DropdownMenu, Tooltip, Sheet) — chúng đã có animation riêng, thêm vào sẽ gây nhấp nháy.

### Form Handling

- Dùng `react-hook-form` + `@hookform/resolvers/zod` với `Form`/`FormField`/`FormItem` (`src/components/ui/form.tsx`, wrapper quanh Radix).
- Define Zod schema cho type-safe form values (`z.infer<typeof schema>`).
- Validation: Zod schema rules + custom validators (`src/utils/validate.ts`).
