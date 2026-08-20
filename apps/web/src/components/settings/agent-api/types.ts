import type { AgentAdminOverview, AgentAdminTable } from 'shared';

/**
 * Nam nang luc cua bo API agent (`API-3`, phan A va D).
 *
 * `path` la duong DUOI `basePath` do BE tra ve — khong hardcode origin, khong
 * hardcode `/api/v1`. Danh sach bang/truong/tai lieu van lay tu nguon song
 * (BR-4, AC-05); rieng 5 duong dan nay la hinh dang co dinh cua chinh bo API,
 * duoc SRS §2 liet ke tuong minh.
 */
export type CapabilityKey = 'listTables' | 'readRows' | 'query' | 'listDocs' | 'getDoc';

export interface Capability {
  key: CapabilityKey;
  method: 'GET' | 'POST';
  /** Mau duong dan de hien o phan A — `:table`, `:slug` la cho dien. */
  pattern: string;
}

export const CAPABILITIES: Capability[] = [
  { key: 'listTables', method: 'GET', pattern: '/tables' },
  { key: 'readRows', method: 'GET', pattern: '/tables/:table/rows' },
  { key: 'query', method: 'POST', pattern: '/query' },
  { key: 'listDocs', method: 'GET', pattern: '/docs' },
  { key: 'getDoc', method: 'GET', pattern: '/docs/:slug' },
];

/**
 * HTTP that su cua tung ma loi — doi chieu tung dong voi
 * `apps/api/src/modules/agent-api/agent-errors.ts`, KHONG suy tu ten ma.
 *
 * Cai bay da sap mot lan (`API-3-B1`): `FIELD_NOT_ALLOWED` va
 * `WRITE_NOT_SUPPORTED` NGHE nhu 403/405 nhung ca hai deu dung
 * `BadRequestException` nen la 400. Chi `TABLE_NOT_ALLOWED` moi la
 * `ForbiddenException`. Sua bang nay thi mo agent-errors.ts ra doc, dung doan.
 */
export const ERROR_HTTP: Record<string, number> = {
  UNAUTHORIZED: 401, // UnauthorizedException o AgentApiKeyGuard
  TABLE_NOT_ALLOWED: 403, // ForbiddenException
  FIELD_NOT_ALLOWED: 400, // BadRequestException
  WRITE_NOT_SUPPORTED: 400, // BadRequestException
  INVALID_QUERY: 400, // BadRequestException
  QUERY_TIMEOUT: 408, // HttpStatus.REQUEST_TIMEOUT
  DOC_NOT_FOUND: 404, // NotFoundException
  DOCS_UNAVAILABLE: 503, // HttpStatus.SERVICE_UNAVAILABLE
};

export type OverviewState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ok'; data: AgentAdminOverview };

export type { AgentAdminOverview, AgentAdminTable };
