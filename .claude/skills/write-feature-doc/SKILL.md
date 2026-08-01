---
name: write-feature-doc
description: Use when creating a new file under documents/FunctionDescription/ for a new OnosFactory feature (or restructuring an existing doc to match the standard shape). Provides the required template and writing rules referenced from the repo's root CLAUDE.md Documentation Rules section.
---

### Doc file structure (template cho file mới)

```markdown
# [Feature Name] — Function Description

> **File FE:** đường dẫn
> **File BE:** đường dẫn
> **Route:** /xxx
> **API:** /v1/xxx

## 1. Overview

## 2. Luồng hoạt động

## 3. API / Schema

## 4. UI Components

## 5. Backend logic

## 6. Performance notes

## 7. Permissions
```

### Quy tắc viết doc

- Viết bằng **tiếng Việt** (giống các file hiện có).
- Trỏ đến **file path tuyệt đối tính từ repo root** + tên function / class cụ thể (không nói chung chung).
- Khi liệt kê endpoint dùng bảng `Method | Path | Mô tả`.
- Khi liệt kê schema dùng code block TypeScript-ish.
- KHÔNG copy nguyên code dài vào doc — chỉ trích đoạn ngắn minh họa.
- Số liệu performance phải có trước/sau cụ thể (ms, MB, lần request...).

Sau khi tạo file mới theo template này, nhớ thêm 1 dòng vào bảng "Feature → Doc mapping" trong `CLAUDE.md` gốc repo (cột Tính năng / Doc / Files liên quan).
