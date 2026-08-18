# Agent API — Function Description

> **File BE:** `apps/api/src/modules/agent-api/` (controller, guard, repository, 4 service, registry 5 file, 2 hàm thuần che dữ liệu)
> **File FE:** không có — bên tiêu thụ là AI agent nội bộ, không phải trình duyệt
> **Shared:** `packages/shared/dtos/agent-api.dto.ts`
> **Tài liệu cho agent:** `documents/AgentGuide/DataDictionary.md`, `documents/AgentGuide/ImportantNotes.md`
> **API:** `/api/v1/agent/*`
> **Nguồn yêu cầu:** task `API-1` — SRS `.devtasks/srs/API-1.md`, thiết kế `.devtasks/design/API-1.md`

## 1. Overview

Bộ API **chỉ đọc** phục vụ một AI agent nội bộ trả lời khách hàng qua tin nhắn. Agent cần hai thứ: **hiểu nghiệp vụ** (đọc tài liệu) và **tra được dữ liệu thực** (đọc đơn của khách).

Vì agent nói chuyện trực tiếp với khách, **mọi dữ liệu agent đọc được đều phải coi là có nguy cơ bị nói ra cho khách**. Toàn bộ thiết kế xoay quanh một nguyên tắc:

> **Danh sách trắng ở tầng TRƯỜNG, cấm là mặc định.**

Bảng không có tên trong registry là không tồn tại. Trường không được liệt kê tường minh thì không đọc được, không lọc được, không nhóm được, không sắp xếp được.

**Ba loại câu hỏi agent cố ý KHÔNG trả lời được**, đều chuyển cho người thật: địa chỉ giao hàng · tiền của đơn · ai đang xử lý đơn.

## 2. Luồng hoạt động

```
Agent  ──[X-Agent-Api-Key]──►  AgentApiKeyGuard          401 nếu thiếu/sai/rỗng, thân lỗi GIỐNG HỆT NHAU
                                     │
                                     ▼
                               AgentApiController         log Winston, đo thời gian
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
              AgentReadService  AgentQueryService  AgentDocsService
                    │                │                │
                    └──── registry ──┘                │  danh mục dựng 1 lần lúc boot
                              │                       │
                              ▼                       ▼
                      AgentApiRepository        đọc file .md
                       (find / aggregate)
                              │
                              ▼
                     mask-free-text + order-log-value-policy
                              │
                              ▼
                        AgentAuditService  → collection `agentApiLogs`
```

Guard chạy **trước** mọi validate tham số. Nếu làm ngược lại, một lời gọi thiếu khoá tới bảng sai sẽ nhận 400 thay vì 401, và chính sự khác biệt đó xác nhận cho người dò biết bảng nào tồn tại.

## 3. API / Schema

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/v1/agent/tables` | Liệt kê 11 bảng đọc được, kèm mô tả và danh sách trường trả về |
| `GET` | `/v1/agent/tables/:table/rows` | Đọc thô, phân trang theo con trỏ trên `_id`. Query: `limit`, `cursor`, `fields` |
| `POST` | `/v1/agent/query` | Truy vấn có kiểm soát: lọc, sắp xếp, đếm, nhóm, tổng hợp |
| `GET` | `/v1/agent/docs` | Danh mục tài liệu nghiệp vụ |
| `GET` | `/v1/agent/docs/:slug` | Nội dung markdown của một tài liệu |

Tất cả yêu cầu header `X-Agent-Api-Key`, khớp env `AGENT_API_KEY`.

### DSL truy vấn

```ts
{
  table: string;
  filter?: AgentFilterNode;              // cây and/or/not, sâu tối đa 5 mức
  select?: { kind: 'rows'; fields?: string[]; sort?: AgentSort[]; limit?: number; offset?: number };
  aggregate?: { groupBy?: string[]; metrics: AgentMetric[]; sort?: AgentSort[]; limit?: number };
}
```

`select` và `aggregate` loại trừ nhau. Toán tử: `eq · ne · in · nin · gt · gte · lt · lte · between · exists · startsWith`. Metric: `count · sum · avg · min · max`.

**Không nhận pipeline aggregation thô.** Lý do: tên trường đầu ra khi đó do chính bên gọi đặt (`$project { x: "$shippingAddress.email" }`), nên không có cách nào lọc đầu ra theo tên trường.

### Chính sách trường

```ts
type AgentFieldPolicy = {
  type: 'string' | 'number' | 'date' | 'bool' | 'objectId' | 'enum';
  read: boolean;                      // được xuất hiện trong dữ liệu trả về
  filter: 'none' | 'eq' | 'full';     // 'eq' = chỉ eq/ne/in/nin (thông tin liên hệ khách)
  sortable: boolean;
  groupable: boolean;
  aggregatable?: boolean;
  freeText?: boolean;                 // che theo mẫu trước khi ra; BẮT BUỘC filter='none'
};
```

### Collection mới — `agentApiLogs`

```ts
{ at: Date; capability: string; table?: string; docSlug?: string;
  queryDigest?: unknown; returned: number; durationMs: number;
  outcome: 'ok' | 'denied' | 'error' | 'timeout'; errorCode?: string }
```

Index `{ at: -1 }` cộng TTL 90 ngày, tạo ở `AgentAuditService.onModuleInit()`. Collection này **nằm ngoài registry** nên agent không đọc được nhật ký của chính nó.

### Mã lỗi

| HTTP | `code` | Khi nào |
|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu / sai / rỗng khoá. Thân lỗi giống hệt nhau ở cả 5 endpoint |
| 403 | `TABLE_NOT_ALLOWED` | Bảng ngoài registry. Dùng chung thân lỗi cho bảng cấm và bảng không tồn tại |
| 400 | `FIELD_NOT_ALLOWED` | Trường không đọc/lọc/nhóm/sắp xếp được |
| 400 | `WRITE_NOT_SUPPORTED` | Truy vấn mang ý ghi |
| 400 | `INVALID_QUERY` | Khoá bắt đầu bằng `$` hoặc chứa dấu chấm, cú pháp sai |
| 408 | `QUERY_TIMEOUT` | Vượt `maxTimeMS` |
| 404 | `DOC_NOT_FOUND` | Slug không có; trả kèm danh mục đang có |
| 503 | `DOCS_UNAVAILABLE` | Không tìm thấy thư mục tài liệu lúc boot |

## 4. UI Components

Không có. Bộ API này không phục vụ trình duyệt và không có màn hình quản trị — khoá cấp bằng biến môi trường.

## 5. Backend logic

### 5.1 Registry — nguồn sự thật duy nhất

`apps/api/src/modules/agent-api/registry/index.ts` → `AGENT_TABLE_REGISTRY`, đúng 11 bảng: `orders`, `orderLogs`, `customers`, `productConfigs`, `productCategories`, `collections`, `promotions`, `factories`, `machineTypes`, `workshopConfigs`, `customer_notifications`.

Không nhánh code nào nhận tên collection từ bên gọi rồi truyền xuống mongoose — luôn phải qua `AgentQueryService.spec()` trước.

### 5.2 Ba lớp chặn ghi và chạy mã

1. `AgentQueryService.assertNoOperatorKeys()` — quét sâu payload, từ chối mọi khoá bắt đầu bằng `$` hoặc chứa dấu chấm. Chặn `$where`, `$function`, `$accumulator`, `$merge`, `$out`.
2. Zod `.strict()` ở mọi cấp của `AgentQueryZod`.
3. `AgentApiRepository` **chỉ phơi ra** `find`, `aggregate`, `insertLog`, `ensureLogTtlIndex`. Không service nào của module chạm được `save`/`updateOne`/`deleteOne` — BR-3 được giữ bằng hình dạng của lớp, không bằng kỷ luật người viết.

### 5.3 Che dữ liệu bằng cấu trúc

`$project` **luôn** dựng từ registry, không bao giờ từ tham số bên gọi. Trường bị che không được đọc lên khỏi DB — không có bước "lấy hết rồi xoá trường nhạy cảm", vì bước đó chỉ cần quên một nhánh là rò.

Hai bất biến không viết trong yêu cầu mà bắt buộc phải có:

- `sortable ⇒ read` — thứ tự sắp xếp để lộ quan hệ so sánh giữa các bản ghi.
- `groupable ⇒ read` — khoá nhóm hiện nguyên ở kết quả tổng hợp.

Giá vốn (`cost`, `nonShipCost`) và bốn trường giá nội bộ khác của biến thể **không có mặt trong registry ở bất kỳ vai trò nào**: cho lọc trên một trường số bị che là dựng sẵn một máy đoán nhị phân (`cost > 10` trả 0, `cost > 5` trả 3 → ra giá trị thật sau vài lời gọi).

### 5.4 Che văn bản tự do

`mask-free-text.ts` thay email và số điện thoại trong mọi chuỗi rời khỏi module. Ca kiểm quan trọng nhất: mã sản xuất dạng `XQ-91783-27005` **không** được che nhầm thành số điện thoại.

Văn bản tự do **đọc được nhưng `filter: 'none'`**: che chạy ở đầu ra, còn lọc chạy trên giá trị thô trong DB — cho lọc là dựng lại đúng máy dò đã cấm ở §5.3.

### 5.5 Giá trị cũ/mới của nhật ký

`order-log-value-policy.ts` — `before`/`after` chỉ trả khi tên trường bị đổi nằm trong danh sách trắng 17 tên trường nghiệp vụ, và giá trị vẫn phải đi qua bộ che. Trường ngoài danh sách trả `valueOmitted: true` để agent biết là bị lược, không phải giá trị vốn rỗng.

### 5.6 Bảy bất biến có unit test

`registry.spec.ts` và `registry-schema.spec.ts` — đây là phần **thực sự** bảo đảm việc che dữ liệu, vì AC dạng "không bao giờ xuất hiện" không thể chứng minh bằng một bộ test hữu hạn chạy qua API.

| Mã | Bất biến |
|---|---|
| I1 | `sortable ⇒ read`, `groupable ⇒ read` |
| I2 | Danh sách bảng khớp chính xác 11 tên khoá cứng |
| I3 | Không tên trường bị cấm nào lọt vào registry |
| I4 | **Mọi** đường dẫn của schema phải hoặc nằm trong registry, hoặc nằm trong `deliberatelyExcluded` |
| I5 | Metric chỉ trên trường `aggregatable && read` |
| I6 | Văn bản tự do phải `filter: 'none'`, không sắp xếp, không nhóm |
| I7 | Danh sách trắng `before`/`after` khớp chính xác 17 tên |

**I4 là bất biến quan trọng nhất**: thêm một field mới vào `OrderEntity` mà không quyết định gì về nó thì test đỏ. Đây là cơ chế duy nhất ngăn kiểu rò "field mới lọt vào theo mặc định" khi hệ thống tiến hoá — đúng loại lỗi mà test chạy qua API không bao giờ bắt được, vì lúc viết test thì field đó còn chưa tồn tại.

### 5.7 Tài liệu

`AgentDocsService` dựng danh mục **một lần lúc boot** từ `documents/{AgentGuide,FunctionDescription,Architecture}`; `documents/Plans/` cố ý bị loại. `:slug` chỉ tra trong danh mục đó nên bên gọi không bao giờ đưa được đường dẫn xuống `fs`.

Thứ tự tìm thư mục: env `AGENT_DOCS_DIR` → `<thư mục chạy>/agent-docs` → đi ngược lên tìm `documents/` ở gốc repo. `apps/api/scripts/copy-agent-docs.mjs` chạy sau `build`, chép tài liệu vào cả `dist/agent-docs` lẫn `dist-prod/agent-docs` — vì `start:prod` chạy `node dist-prod/main.js` và không có gì bảo đảm gốc repo nằm cạnh tiến trình.

## 6. Performance notes

| Ngưỡng | Giá trị | Env ghi đè |
|---|---|---|
| `limit` mặc định / trần | 50 / 200 (lớn hơn bị **kẹp**, không báo lỗi) | `AGENT_API_MAX_LIMIT` |
| `offset` tối đa | 10.000 | — |
| Số nhóm tối đa của `aggregate` | 1.000 | — |
| `maxTimeMS` đọc thô | 3.000 ms | `AGENT_API_READ_TIMEOUT_MS` |
| `maxTimeMS` truy vấn | 8.000 ms | `AGENT_API_QUERY_TIMEOUT_MS` |
| Tần suất | 60 lời gọi/phút | `AGENT_API_RATE_LIMIT_PER_MIN` |

- `maxTimeMS` **chưa từng được dùng ở đâu khác trong repo**. Nó phải có mặt ở mọi `find()` và `aggregate()` của module; sót một chỗ là mất chốt chặn đúng ở chỗ đó.
- `readPreference: 'secondaryPreferred'` — tải đọc của agent rơi vào secondary của replica set, không vào primary đang phục vụ sản xuất.
- Phân trang đọc thô dùng **con trỏ trên `_id`**, không dùng `skip`: bảng `orders` lớn, `skip` sâu vừa chậm vừa vi phạm giới hạn tải.

## 7. Permissions

**Không dùng permission-catalog nội bộ và không dùng JWT.** Xác thực bằng một khoá bí mật duy nhất trong biến môi trường `AGENT_API_KEY`, tách hẳn khỏi mọi tài khoản người thật; thu hồi hoặc đổi khoá không ảnh hưởng tài khoản nào.

Cụm `partnerApi` sẵn có trong `ApiConfigService` **cố ý không được tái dùng**: nó thiết kế cho ký HMAC theo đối tác và chưa module nào dùng, kéo vào đây chỉ làm bề mặt xác thực phức tạp hơn mà không thêm bảo đảm nào cho một bên gọi duy nhất.

So sánh khoá bằng `crypto.timingSafeEqual` trên bản băm SHA-256 — độ dài khác nhau không làm lộ thông tin qua thời gian. Thiếu cấu hình khoá thì mọi endpoint **đóng**, không có chế độ "mở khi thiếu cấu hình".
