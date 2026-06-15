export enum ApiKeyEnv {
  Test = 'test',
  Live = 'live',
}

export enum ApiKeyStatus {
  Active = 'active',
  Revoked = 'revoked',
}

export enum ApiScope {
  ProductsRead = 'products.read',
  OrdersRead = 'orders.read',
  OrdersWrite = 'orders.write',
  OrdersCancel = 'orders.cancel',
  // OrdersDelete = 'orders.delete',
}

export const ALL_API_SCOPES: ApiScope[] = [
  ApiScope.ProductsRead,
  ApiScope.OrdersRead,
  ApiScope.OrdersWrite,
  ApiScope.OrdersCancel,
];

export enum PartnerApiErrorCode {
  Unauthorized = 'UNAUTHORIZED',
  InvalidKey = 'INVALID_KEY',
  InvalidSignature = 'INVALID_SIGNATURE',
  TimestampOutOfRange = 'TIMESTAMP_OUT_OF_RANGE',
  NonceReplay = 'NONCE_REPLAY',
  EnvMismatch = 'ENV_MISMATCH',
  ForbiddenScope = 'FORBIDDEN_SCOPE',
  RateLimited = 'RATE_LIMITED',
  ValidationError = 'VALIDATION_ERROR',
  NotFound = 'NOT_FOUND',
  VariantNotFound = 'VARIANT_NOT_FOUND',
  DuplicateExternalRef = 'DUPLICATE_EXTERNAL_REF',
  PaymentPending = 'PAYMENT_PENDING',
  OrderImmutable = 'ORDER_IMMUTABLE',
  InternalError = 'INTERNAL_ERROR',
}

export const HMAC_TIMESTAMP_WINDOW_SECONDS = 300;
export const HMAC_NONCE_TTL_SECONDS = 600;

export const API_KEY_HEADERS = {
  PartnerKey: 'X-Partner-Key',
  Timestamp: 'X-Timestamp',
  Nonce: 'X-Nonce',
  Signature: 'X-Signature',
} as const;
