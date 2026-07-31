# Careers — Function Description

> **File FE:** `apps/web/src/pages/company/careers/index.tsx`
> **File BE:** Không có — trang tĩnh, không gọi API.
> **Route:** `/company/careers`
> **API:** Không có

## 1. Overview

**Careers** = landing page tuyển dụng công khai, viết bằng **tiếng Anh** (theo yêu cầu — nội dung LUÔN tiếng Anh, không đổi theo toggle ngôn ngữ VI/EN của app). Nội dung + thiết kế bám theo mẫu tờ rơi tuyển dụng thực tế của **Onos Group** (POD production, Houston TX) — tin tuyển dụng cho 1 vị trí cụ thể (**Machine Operator**, 10 open positions), phối màu xanh lá đậm `#0d2a1f` + vàng gold (`amber-400/600`) cố định (KHÔNG đổi theo dark/light theme của app, vì đây là màu thương hiệu trên tờ rơi) + ảnh nhân viên thật (`assets/images/careers-hero.png`, chụp từ tờ rơi gốc, đã có sẵn huy hiệu "BUILD BETTER · GROW TOGETHER" trong ảnh). Trang không có backend, không lưu đơn ứng tuyển — ứng viên nộp hồ sơ qua email hoặc Google Form ngoài.

## 2. Luồng hoạt động

1. Truy cập `/company/careers` — route public, không qua `PrivateRoute`, không dùng `MainLayout`/Sidebar (tự render header/footer riêng nền xanh đậm, cùng pattern `pages/landing/index.tsx`).
2. Header: logo app (`assets/images/logo.png`) đặt trong khối bo góc nền trắng ở góc trên-bên-trái (mô phỏng vị trí logo trên tờ rơi mẫu) + nav anchor.
3. Hero 2 cột (`lg:grid-cols-2`): cột trái là text ("We're Hiring! Machine Operator" + pill "10 Open Positions" + tagline + 2 CTA), cột phải là ảnh nhân viên thật `careers-hero.png`.
4. Người dùng cuộn tiếp qua: Info strip (Location/Pay/Shift/Safety) → Job Responsibilities / Qualifications / Compensation & Benefits (3 cột, mỗi cột có header bar nền xanh đậm + icon vàng + gạch chéo vàng góc phải kiểu tờ rơi) → Work Schedule / Employment Type (2 cột, cùng style header bar) → Apply Today (banner nền xanh đậm).
5. Nút "Apply Today" (Header + Hero primary button) mở tab mới trực tiếp tới Google Form thật (`apply.applicationForm.link` trong i18n, hiện là `docs.google.com/forms/d/e/1FAIpQLSejNYPnUMZ6SWPXY6FbqgLf7qDq5Im0l2JX36dv7tMuMFmkuw/viewform`) — KHÔNG còn `mailto:`.
6. Nút "Job Application Form" (Hero secondary button, outline) cuộn xuống section Apply qua anchor `#apply`.
7. Card "Email Your Resume" (section Apply) mở `mailto:careers@onosgroup.com?subject=Application — Machine Operator`.
8. Card "Job Application Form" (section Apply, đã thay cho card "WhatsApp" trước đó) hiển thị **ảnh QR thật** (`assets/images/careers-application-qr.png`, ảnh chụp QR gốc do user cung cấp — KHÔNG phải QR generate) — click vào card cũng mở tab mới tới cùng Google Form ở trên.
9. Card "Apply Online" là link nội bộ trỏ tới `${PATHS.COMPANY_CAREERS}#apply` (tự cuộn về section Apply trên cùng trang).

## 3. API / Schema

Không có — toàn bộ nội dung tĩnh, khai báo qua i18n namespace `careers` (`src/i18n/locales/{vi,en}/careers.json`, nội dung 2 file GIỐNG NHAU vì trang luôn hiển thị tiếng Anh). Cấu trúc chính: `hero`, `infoStrip` (location/pay/shift/safety), `responsibilities`/`qualifications`/`benefits` (mỗi key có `title` + `items[]`), `schedule`/`employmentType` (`items[]`), `apply` (`email`/`applicationForm.value`+`applicationForm.link`/`online`+`subjectPrefix`), `footer`.

## 4. UI Components

- `pages/company/careers/index.tsx` — page component duy nhất, tự chứa header (logo + nav anchor `#responsibilities`/`#qualifications`/`#benefits`/`#apply`) + footer, không phụ thuộc `MainLayout`.
- `SectionHeaderBar` (nội bộ file) — header bar dùng chung cho 5 section liệt kê (Responsibilities/Qualifications/Benefits/Schedule/EmploymentType): icon vàng + tiêu đề trắng trên nền `bg-[#0d2a1f]`, gạch tam giác vàng (`border-l-amber-400`) mô phỏng góc cắt vàng trên tờ rơi.
- `ChecklistCard` (nội bộ file) — bọc `SectionHeaderBar` + danh sách bullet `CheckCircle2`, nhận `id` để làm anchor target cho nav.
- Tái dùng `components/ui/button.tsx` (`asChild` + Radix `Slot` để render `<a>` bên trong `Button`).
- Ảnh tĩnh trong `assets/images/`: `careers-hero.png` (ảnh nhân viên POD production, dùng làm hero photo cột phải), `careers-application-qr.png` (ảnh QR ứng tuyển gốc, dùng trong card "Job Application Form"). Cả 2 import trực tiếp qua Vite asset import (`import x from '@/assets/images/...'`), KHÔNG dùng `qrcode.react`/generate QR động.
- Các list (`responsibilities.items`/`qualifications.items`/`benefits.items`/`schedule.items`/`employmentType.items`) đọc qua `t(key, { returnObjects: true })` trả về `string[]` — sửa nội dung thì chỉ cần sửa 2 file i18n `careers.json`, không cần đụng `index.tsx` trừ khi đổi cấu trúc section.

## 5. Backend logic

Không có — không có module BE, không có endpoint.

## 6. Performance notes

Trang tĩnh, không gọi API, lazy-load qua `React.lazy` trong `App.tsx` — không ảnh hưởng bundle chính. 2 ảnh tĩnh (~230KB + ~460KB) import trực tiếp, không tối ưu/nén riêng — chấp nhận được vì trang public tải 1 lần, không nằm trong luồng chính của app.

## 7. Permissions

Public hoàn toàn — không gate auth, không check permission-catalog.
