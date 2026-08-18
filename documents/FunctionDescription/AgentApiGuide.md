# Agent API Guide — Function Description

> **File FE:** `apps/web/src/components/settings/AgentApiGuide.tsx` + `apps/web/src/components/settings/agent-api/` (`StartTab.tsx`, `ApiKeyBox.tsx`, `TablesTab.tsx`, `DocsTab.tsx`, `TryTab.tsx`, `types.ts`), service `apps/web/src/services/agentApi.ts`, i18n `apps/web/src/i18n/locales/{vi,en}/agentApi.json`
> **File BE:** `apps/api/src/modules/agent-api/agent-api-admin.controller.ts` + `agent-admin.service.ts` (bề mặt quản trị, tách khỏi `agent-api.controller.ts`)
> **Route:** `/adm/settings/agent-api` (mục trong trang Cài đặt, nhóm "Hệ thống")
> **API:** `GET /v1/agent-admin/overview`, `GET /v1/agent-admin/key`, và 5 endpoint `/api/v1/agent/*` gọi thẳng từ trình duyệt

## 1. Overview

Bộ API `/v1/agent` (xem [`AgentApi.md`](AgentApi.md)) phục vụ AI agent chăm sóc khách hàng nhưng
trước đây không có màn hình nào. Người vận hành muốn biết agent đọc được dữ liệu gì, hoặc muốn kiểm
chứng một câu trả lời của agent, phải mở mã nguồn hoặc dùng công cụ gọi API bên ngoài.

Trang này để **một người quản trị không đọc mã nguồn vẫn tự trả lời được ba câu hỏi**: agent gọi được
endpoint nào và xác thực ra sao · agent đọc được bảng nào, trường nào, trường nào cố ý bị che · agent
hiểu nghiệp vụ qua tài liệu nào — rồi **kiểm chứng ngay tại chỗ** bằng một lời gọi thật.

Trang **chỉ đọc**. Không thao tác nào của trang sửa dữ liệu nghiệp vụ, và trang không hiển thị dữ liệu
nào mà một lời gọi agent hợp lệ không thấy.

Ba nguyên tắc chi phối toàn bộ thiết kế:

1. **Trung thực với nguồn sống** — danh sách bảng/trường/tài liệu và hạn mức đều lấy từ registry và
   hằng số của module tại thời điểm gọi, không chép cứng vào frontend.
2. **An toàn khi chia sẻ màn hình** — khoá API mặc định bị che, chỉ hiện khi người xem chủ động bấm.
3. **Thất bại phải dạy được** — lỗi hiển thị nguyên `code` và thông điệp gốc của bộ API, không nuốt
   thành thông báo chung chung.

## 2. Luồng hoạt động

```
/adm → Cài đặt → nhóm "Hệ thống" → "Agent API"
   │
   ├─ mount → GET /v1/agent-admin/overview   (1 lần duy nhất)
   │          → badge "Đang hoạt động" / "Chưa cấu hình khoá"
   │
   ├─ Tab A "Bắt đầu"   xác thực · địa chỉ gốc · hạn mức · 8 mã lỗi · khu vực khoá
   │     └─ [Hiện khoá] → GET /v1/agent-admin/key → hiện + nút copy
   │
   ├─ Tab B "Bảng dữ liệu"   danh sách bảng → bảng trường (6 thuộc tính) + khu vực trường bị loại trừ
   │     └─ [Thử đọc bảng này] → nhảy sang tab D, điền sẵn tên bảng
   │
   ├─ Tab C "Tài liệu"   (lazy) GET /api/v1/agent/docs → chọn 1 mục → GET /docs/:slug
   │
   └─ Tab D "Thử gọi"    (lazy) dựng lời gọi → chạy thẳng /api/v1/agent/* → mã HTTP + JSON + curl
```

**Nạp dữ liệu có chủ đích.** Hạn mức 60 lần/phút của bộ API là tài nguyên dùng chung với agent thật,
nên trang **không polling** và **không prefetch cả bốn tab lúc mount**: danh mục tài liệu đợi đến khi
mở tab C, khoá đợi đến khi người xem bấm hiện hoặc bấm Chạy.

**Hiện khoá và dùng khoá là hai việc khác nhau.** Bấm Chạy ở tab D không cần bấm "Hiện khoá" trước —
trang tự lấy khoá để gọi nhưng không hiển thị nó.

## 3. API / Schema

### 3.1 Bề mặt quản trị (JWT nhân viên)

| Method | Path | Mô tả |
|---|---|---|
| GET | `/v1/agent-admin/overview` | Metadata dựng từ registry: bảng, trường, trường bị loại trừ, hạn mức, tình trạng khoá |
| GET | `/v1/agent-admin/key` | Giá trị khoá API. Gọi riêng, chỉ khi người xem chủ động cần |

```ts
interface AgentAdminOverview {
  basePath: string;        // '/api/v1/agent' — đường TƯƠNG ĐỐI, FE ghép origin của mình
  authHeader: string;      // 'X-Agent-Api-Key'
  keyConfigured: boolean;  // biết ngay khi mở trang, KHÔNG kèm giá trị khoá
  keyEnvName: string;      // 'AGENT_API_KEY'
  limits: { rateLimitPerMin: number; maxLimit: number; readTimeoutMs: number; queryTimeoutMs: number };
  tables: AgentAdminTable[];
}

interface AgentAdminTable {
  key: string; description: string; entityName: string; defaultSort: string;
  fields: AgentAdminField[];
  excludedFields: string[];   // CHỈ tên trường, không bao giờ kèm giá trị
}

interface AgentAdminField {
  name: string;
  type: 'string' | 'number' | 'date' | 'bool' | 'objectId' | 'enum';
  read: boolean;
  filter: 'none' | 'eq' | 'full';
  sortable: boolean; groupable: boolean;
  aggregatable?: boolean; freeText?: boolean; note?: string;
}
```

### 3.2 Bề mặt agent (khoá riêng)

Tab C và D gọi **thẳng** 5 endpoint `/api/v1/agent/*` với header `X-Agent-Api-Key`, không qua proxy.
Nhờ vậy dòng `curl` hiển thị trên trang đúng bằng lời gọi vừa chạy, và mã lỗi tới tay người xem
nguyên vẹn vì không có tầng nào ở giữa để nuốt nó.

Hệ quả đã được chấp nhận: mỗi lần bấm thử sinh một dòng trong `agentApiLogs` y như agent gọi, và
`AgentApiLogEntity` không có trường ghi nguồn gọi nên không phân biệt được. Thống kê tần suất gọi của
agent vì thế lệch lên theo số lần admin bấm thử — xem `.devtasks/srs/API-3.md` §11/A5.

## 4. UI Components

| Component | Vai trò |
|---|---|
| `AgentApiGuide.tsx` | Khung 4 tab, giữ toàn bộ state, gọi `overview` một lần, cấp hàm `ensureKey` cho tab C/D |
| `agent-api/StartTab.tsx` | Phần A: xác thực, địa chỉ gốc, 4 hạn mức, 5 năng lực, bảng 8 mã lỗi |
| `agent-api/ApiKeyBox.tsx` | Khu vực khoá: che mặc định, nút Hiện/Ẩn, cảnh báo, nhánh "chưa cấu hình" |
| `agent-api/TablesTab.tsx` | Phần B: danh sách bảng + bảng trường 6 thuộc tính + khu vực trường bị loại trừ |
| `agent-api/DocsTab.tsx` | Phần C: danh mục theo `section`, nội dung markdown thô, nhánh `DOCS_UNAVAILABLE` |
| `agent-api/TryTab.tsx` | Phần D: form theo năng lực, `ResultPanel` 4 trạng thái, dòng `curl` |
| `agent-api/types.ts` | 5 năng lực + ánh xạ mã lỗi ↔ HTTP + kiểu state |

Tái dùng hoàn toàn design system sẵn có: `components/ui/{tabs,table,badge,button,input,textarea}`,
`components/common/{CopyButton,Spinner}`, icon Lucide. **Không component dùng chung mới, không
dependency mới.**

**Markdown hiển thị thô** trong khối `<pre>` monospace có cuộn — repo không có thư viện render
markdown, và người xem trang là người vận hành hệ thống chấp nhận nội dung kỹ thuật.

### Bốn trạng thái kết quả ở tab D — phân biệt được bằng mắt

| Trạng thái | Hiển thị |
|---|---|
| Thành công có dữ liệu | Thanh **xanh** `200 · n dòng · t ms` + JSON |
| Thành công **rỗng** | Thanh **xanh** + khối riêng "Lời gọi thành công. Không có dòng dữ liệu nào khớp điều kiện." — không dùng màu lỗi |
| Lỗi 4xx | Thanh **đỏ** `403 · FIELD_NOT_ALLOWED` + thông điệp gốc + nghĩa mã lỗi |
| Quá hạn 408 | Thanh **hổ phách** `408 · QUERY_TIMEOUT` — màu khác 4xx để không lẫn với lỗi cú pháp |

Sau mọi lỗi, **nội dung form được giữ nguyên** để người xem sửa lại chính lời gọi vừa gửi.

### Ô nhập điều kiện lọc (API-14)

Phần **Đọc thô một bảng** có ô nhập `filter` riêng, gửi điều kiện lọc dưới dạng **chuỗi JSON qua query
string** — đúng năng lực `API-6` thêm cho endpoint đọc bảng. Không có ô này thì người vận hành phải mở
terminal gõ `curl`, đúng thứ trang này sinh ra để khỏi phải làm.

Cú pháp là **MongoDB** (`API-8` đã thay hẳn DSL cây `{field, op, value}` cũ):

```
{ "productionId": { "$eq": "SQ-01912-84416" } }
{ "quantity": { "$gte": 1, "$lte": 9 } }
{ "productionId": { "$startsWith": "SQ-019" } }
```

Toán tử được phép: `$eq $ne $gt $gte $lt $lte $in $nin $exists $startsWith`, cộng `$and $or $nor $not`.
Danh sách này và chính sách từng trường do `apps/api/src/modules/agent-api/mongo-filter.ts` quyết định —
**sửa mẫu hay chú thích trên trang thì mở file đó ra đối chiếu, đừng viết theo trí nhớ.** Cú pháp đã đổi
hai lần (`API-3-B2`, rồi `API-14`), cả hai lần đều vì mẫu được viết theo trí nhớ.

## 5. Backend logic

Metadata dựng **tại thời điểm gọi** từ `AGENT_TABLE_REGISTRY`
(`apps/api/src/modules/agent-api/registry/`), không đóng băng vào biến module lúc boot và không qua
bước lọc hay biến đổi nào. Thêm một trường vào registry là nó tự hiện ra ở phần B mà không sửa dòng
frontend nào.

Hạn mức trả về lấy từ **hằng số cứng** `AGENT_API_RATE_LIMIT_PER_MIN`
(`agent-api.constants.ts`) — đúng hằng số mà `@Throttle` của 5 endpoint agent dùng, nên con số trang
hiển thị không bao giờ lệch khỏi con số đang chặn thật.

Trước `API-4` từng có một biến môi trường cùng tên được khai báo mà **không nơi nào tiêu thụ**: người
vận hành chỉnh env rồi tin là hạn mức đã đổi, trong khi không đổi gì. `API-4` đã gỡ biến đó khỏi
`ApiConfigService` và khỏi `.env.development.example`, nên nay chỉ còn **một nguồn duy nhất**. Hạn mức
không chỉnh được bằng biến môi trường; đổi con số thì sửa hằng số — xem `AgentApi.md` §6.

`allowedHeaders` ở `apps/api/src/main-nest.ts` được nới thêm `X-Agent-Api-Key` để trình duyệt gửi
được header đó. Chỉ nới header — **whitelist origin giữ nguyên**.

## 6. Performance notes

- **Số lời gọi khi mở trang: 1** (`overview`). Trước đây mọi thông tin này chỉ có bằng cách đọc mã
  nguồn. Tab C tốn thêm 1 lời gọi khi mở lần đầu, tab D chỉ gọi khi bấm Chạy.
- **Bảng trường lớn nhất (`orders`, ~58 trường) không cần ảo hoá** — quá nhỏ so với ngưỡng đáng dùng
  `@tanstack/react-virtual` của các trang danh sách đơn.
- **Kết quả JSON cắt ở 200 000 ký tự trước khi vào DOM.** Chuỗi lớn hơn thế mới là thứ làm treo tab,
  không phải số dòng. Khi cắt, trang nói rõ đang cắt bớt kèm số dòng thực tế trả về; nút copy vẫn lấy
  **toàn bộ** nội dung, không lấy bản đã cắt.
- **`@Throttle` tính theo IP**, nên người bấm thử tiêu hạn mức của IP họ, không ăn vào hạn mức của
  agent (IP khác).


## 7. Permissions

| Vai | Quyền |
|---|---|
| SuperAdmin, Admin | Thấy mục Cài đặt, mở được trang, dùng được cả 4 phần |
| Manager | **KHÔNG** — `page.agent_api` nằm trong `ADMIN_ONLY_PAGE_CODES`, loại trừ tường minh |
| Support, Designer, DesignerLeader, Fulfillment, custom role | Không thấy mục; vào thẳng URL bị điều hướng như mọi mục không có quyền |
| Customer (Customer Portal) | Không liên quan — `/adm` và `RolesGuard` đã chặn cứng role Customer |

**Chặn ở hai lớp:** `usePermission().has('page.agent_api')` lọc mục ở frontend, và
`@Auth([RoleType.Admin], ['page.agent_api'])` chặn thật ở cả hai endpoint quản trị.

⚠ `permission-catalog.ts` cấp cho `Manager` **mọi** mã quyền trừ danh sách loại trừ tường minh. Thêm
một mã quyền mới mà quên loại trừ Manager sẽ khiến Manager mở được trang, và hỏng theo kiểu không có
lỗi nào bật ra.

### Khoá API — ba ràng buộc bắt buộc

- Chỉ SuperAdmin/Admin lấy được khoá.
- **Mặc định che**, phải bấm mới hiện — để chia sẻ màn hình hay chụp ảnh trang không vô tình lộ khoá.
- Khoá **không** vào URL (endpoint `GET` không tham số), **không** `localStorage`/`sessionStorage`,
  **không** ghi ra console. Khoá chỉ nằm trong state của trang; rời trang là mất.
- Dòng `curl` mặc định dùng `$AGENT_API_KEY` chứ không phải khoá thật; chèn khoá thật là một thao tác
  chủ động của người xem.

Việc hiển thị thẳng giá trị khoá trên trang là **rủi ro đã được chấp nhận** sau khi hai phương án an
toàn hơn được nêu ra — xem `.devtasks/srs/API-3.md` §8/A4. Siết hơn về sau là change request.

## 8. Đồng bộ với trang tài liệu API (`API-16`)

Trang này là **chuẩn**: trang `/documentation` phải nói cùng một thứ, không phải ngược lại.

Phần cấu trúc (bảng, trường, hạn mức) hai nơi cùng đọc từ registry và hằng số throttle, nên tự khớp.
Phần **văn bản tự do** — nhãn 5 năng lực (`capabilities.*`) và nghĩa 8 mã lỗi (`errors.*`) trong
`src/i18n/locales/{vi,en}/agentApi.json`, cùng bảng `ERROR_HTTP` trong
`src/components/settings/agent-api/types.ts` — hiện vẫn là bản riêng của frontend.

Bản khai báo tương ứng nằm ở `packages/shared/constants/agent-api-guide.ts`, và
`apps/api/src/modules/agent-api/agent-guide-sync.spec.ts` giữ hai bên khớp: **sửa một trong ba chỗ mà
quên hai chỗ kia thì test backend đỏ**. Chi tiết ở [`AgentApi.md`](AgentApi.md) §8.2.

Muốn bỏ hẳn bản chép: đổi trang để đọc thẳng hằng số dùng chung thay cho key i18n. Việc đó cần BA mở
phạm vi vì `API-16` §4 cấm đổi trang.
