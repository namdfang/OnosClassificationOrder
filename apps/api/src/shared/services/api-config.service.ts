import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isNil } from 'lodash';
import cron from 'node-cron';

import { BullQueue } from '@/constants';

@Injectable()
export class ApiConfigService {
  constructor(private configService: ConfigService) {}

  get isDevelopment(): boolean {
    return this.nodeEnv === 'development';
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get isTest(): boolean {
    return this.nodeEnv === 'test';
  }

  private getNumber(key: string): number {
    const value = this.get(key);

    try {
      return Number(value);
    } catch {
      throw new Error(key + ' environment variable is not a number');
    }
  }

  private getBoolean(key: string): boolean {
    const value = this.get(key);

    try {
      return Boolean(JSON.parse(value));
    } catch {
      throw new Error(key + ' env var is not a boolean');
    }
  }

  private getString(key: string): string {
    const value = this.get(key);

    return value.replaceAll('\\n', '\n');
  }

  private getCronTime(key: string) {
    const value = this.configService.get<string>(key);

    if (value && !cron.validate(value)) {
      throw new Error(key + ' is not a valid cron time');
    }

    return value;
  }

  get nodeEnv(): string {
    return this.getString('NODE_ENV');
  }

  get fallbackLanguage(): string {
    return this.getString('FALLBACK_LANGUAGE');
  }

  get mongodbURI(): string {
    return this.getString('DB_URI');
  }

  /**
   * R2 (Cloudflare) config. Lenient — chỉ active khi đủ 4 field cốt lõi
   * (account/key/secret/bucket/publicBase). Thiếu → trả `null` để
   * DesignImageService skip queue, importOrders fallback giữ URL gốc thẳng.
   */
  get r2Config(): null | {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    publicBase: string;
    maxDownloadMb: number;
    previewMaxDim: number;
    previewQuality: number;
    thumbDim: number;
    thumbQuality: number;
    queueConcurrency: number;
  } {
    const accountId = this.configService.get<string>('R2_ACCOUNT_ID') || '';
    const accessKeyId = this.configService.get<string>('R2_ACCESS_KEY_ID') || '';
    const secretAccessKey = this.configService.get<string>('R2_SECRET_ACCESS_KEY') || '';
    const bucket = this.configService.get<string>('R2_BUCKET') || '';
    const publicBase = (this.configService.get<string>('R2_PUBLIC_BASE') || '').replace(/\/$/, '');
    if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBase) return null;
    const num = (k: string, fb: number) => {
      const v = Number(this.configService.get<string>(k));
      return Number.isFinite(v) && v > 0 ? v : fb;
    };
    return {
      accountId,
      accessKeyId,
      secretAccessKey,
      bucket,
      publicBase,
      maxDownloadMb: num('R2_MAX_DOWNLOAD_MB', 120),
      previewMaxDim: num('R2_PREVIEW_MAX_DIM', 1000),
      previewQuality: num('R2_PREVIEW_QUALITY', 80),
      thumbDim: num('R2_THUMB_DIM', 300),
      thumbQuality: num('R2_THUMB_QUALITY', 70),
      queueConcurrency: num('DESIGN_QUEUE_CONCURRENCY', 3),
    };
  }

  get awsS3Config() {
    return {
      bucketRegion: this.getString('AWS_S3_BUCKET_REGION'),
      bucketApiVersion: this.getString('AWS_S3_API_VERSION'),
      imagesBucketName: this.getString('AWS_S3_IMAGES_BUCKET_NAME'),
      accessKey: this.getString('AWS_S3_ACCESS_KEY_ID'),
      secretKey: this.getString('AWS_S3_SECRET_ACCESS_KEY'),
      endpoint: this.getString('AWS_S3_ENDPOINT'),
      backblazeEndpoint: this.getString('BACKBLAZE_ENDPOINT'),
    };
  }

  get documentationEnabled(): boolean {
    return this.getBoolean('ENABLE_DOCUMENTATION');
  }

  get authConfig() {
    return {
      privateKey: this.getString('JWT_PRIVATE_KEY'),
      publicKey: this.getString('JWT_PUBLIC_KEY'),
      jwtExpirationTime: this.getNumber('JWT_EXPIRATION_TIME'),
      // TTL khi user check "Ghi nhớ đăng nhập" — optional env, mặc định 30 ngày
      // nếu không set (không dùng helper `get()` vì nó throw khi thiếu key).
      jwtRememberExpirationTime: Number(this.configService.get('JWT_REMEMBER_EXPIRATION_TIME')) || 30 * 24 * 60 * 60,
    };
  }

  get appConfig() {
    return {
      port: this.getString('PORT'),
    };
  }

  get domainName(): string {
    return this.getString('DOMAIN_NAME');
  }

  get captchaToken(): string {
    return this.getString('RECAPTCHA_SECRET_KEY');
  }

  private get(key: string): string {
    const value = this.configService.get<string>(key);

    if (isNil(value)) {
      throw new Error(key + ' environment variable does not set'); // probably we should call process.exit() too to avoid locking the service
    }

    return value;
  }

  get adminEmail(): string {
    return this.getString('ADMIN_EMAIL');
  }

  get smtpConfig() {
    return {
      host: this.getString('SMTP_HOST'),
      user: this.getString('SMTP_USER'),
      password: this.getString('SMTP_PASSWORD'),
      from: this.getString('SMTP_FROM'),
    };
  }

  get telegram() {
    return {
      botToken: this.getString('TELEGRAM_BOT_TOKEN'),
      channelId: this.getString('TELEGRAM_CHANNEL_ID'),
      scanNotificationChannelId: this.getString('TELEGRAM_SCAN_NOTIFICATION_CHANNEL_ID'),
      notificationChannelId: this.getString('TELEGRAM_NOTIFICATION_CHANNEL_ID'),
      notificationEnabled: process.env.TELEGRAM_NOTIFICATION_ENABLED === 'true',
    };
  }

  get scheduledReports() {
    return {
      enabled: process.env.SCHEDULED_REPORTS_ENABLED === 'true',
    };
  }

  /**
   * OnosPod QC production-report export (xem OnospodImportService). Optional
   * integration — thiếu config → getter trả null, feature tự disable thay vì
   * crash app boot (giống r2Config).
   */
  get onospodQcConfig(): null | { apiUrl: string; bearerToken: string } {
    const apiUrl = this.configService.get<string>('ONOSPOD_QC_API_URL') || '';
    const bearerToken = this.configService.get<string>('ONOSPOD_QC_BEARER_TOKEN') || '';
    if (!apiUrl || !bearerToken) return null;
    return { apiUrl, bearerToken };
  }

  get cdn() {
    return {
      url: this.getString('CDN_URL'),
    };
  }

  get partnerApi() {
    return {
      masterKey: this.getString('API_KEY_MASTER_KEY'),
      timestampWindowSeconds: Number(process.env.PARTNER_API_TIMESTAMP_WINDOW || 300),
      rateLimitPerMin: Number(process.env.PARTNER_API_RATE_LIMIT_PER_MIN || 60),
      rateLimitPerDay: Number(process.env.PARTNER_API_RATE_LIMIT_PER_DAY || 10000),
      nonceTtlSeconds: Number(process.env.PARTNER_API_NONCE_TTL || 600),
    };
  }

  get GDriveCDNUrl() {
    return this.getString('GDRIVE_CDN_URL');
  }

  get bottleneck() {
    return {
      downloadImagesMaxConcurrent: this.getString('DOWNLOAD_IMAGES_MAX_CONCURRENT'),
      downloadImagesMaxRetry: this.getString('DOWNLOAD_IMAGES_MAX_RETRY'),
      uploadImagesMaxRetry: this.getString('UPLOAD_IMAGES_MAX_RETRY'),
    };
  }

  get bullmq() {
    return {
      cronTime: {
        [BullQueue.RefreshTrackingStatus]: this.getCronTime('BULLMQ_REFRESH_TRACKING_STATUS_CRON_TIME'),
        [BullQueue.ScanTransactionEmail]: this.getCronTime('BULLMQ_SCAN_TRANSACTION_EMAIL_CRON_TIME'),
        [BullQueue.SendMail]: this.getCronTime('BULLMQ_SEND_MAIL_CRON_TIME'),
      },
    };
  }

  get rabbitmq() {
    return {
      uri: this.getString('RABBITMQ_URI'),
      mainExchange: this.getString('RABBITMQ_MAIN_EXCHANGE'),
    };
  }

  get beefun() {
    return {
      username: this.getString('BEEFUN_USERNAME'),
      password: this.getString('BEEFUN_PASSWORD'),
    };
  }

  get flashship() {
    return {
      apiUrl: this.getString('FLASHSHIP_API_URL'),
      username: this.getString('FLASHSHIP_USERNAME'),
      password: this.getString('FLASHSHIP_PASSWORD'),
    };
  }

  get printcare() {
    return {
      username: this.getString('PRINTCARE_USERNAME'),
      password: this.getString('PRINTCARE_PASSWORD'),
    };
  }

  get burgerPrints() {
    return {
      apiUrl: this.getString('BURGER_PRINTS_API_URL'),
      apiKey: this.getString('BURGER_PRINTS_API_KEY'),
      webApiUrl: this.getString('BURGER_PRINTS_WEB_API_URL'),
      username: this.getString('BURGER_PRINTS_USERNAME'),
      password: this.getString('BURGER_PRINTS_PASSWORD'),
    };
  }

  get onosPod() {
    return {
      apiUrl: this.getString('ONOS_POD_API_URL'),
      username: this.getString('ONOS_POD_USERNAME'),
      password: this.getString('ONOS_POD_PASSWORD'),
    };
  }

  get gearment() {
    return {
      apiUrl: this.getString('GEARMENT_API_URL'),
      apiKey: this.getString('GEARMENT_API_KEY'),
      apiSignature: this.getString('GEARMENT_API_SIGNATURE'),
      storeId: this.getString('GEARMENT_STORE_ID'),
    };
  }

  get merchize() {
    return {
      apiUrl: this.getString('MERCHIZE_API_URL'),
      apiKey: this.getString('MERCHIZE_API_TOKEN'),
    };
  }

  get customCat() {
    return {
      apiUrl: this.getString('CUSTOMCAT_API_URL'),
      apiKey: this.getString('CUSTOMCAT_API_KEY'),
    };
  }

  get usFulfill() {
    return {
      apiUrl: this.getString('US_FULFILL_API_URL'),
      apiKey: this.getString('US_FULFILL_API_KEY'),
    };
  }

  get hubFulfill() {
    return {
      apiUrl: this.getString('HUB_FULFILL_API_URL'),
      apiKey: this.getString('HUB_FULFILL_API_KEY'),
    };
  }

  get dreamship() {
    return {
      apiUrl: this.getString('DREAMSHIP_API_URL'),
      apiKey: this.getString('DREAMSHIP_API_KEY'),
    };
  }

  get printees() {
    return {
      apiUrl: this.getString('PRINTEES_API_URL'),
      apiKey: this.getString('PRINTEES_API_KEY'),
    };
  }

  get printify() {
    return {
      apiUrl: this.getString('PRINTIFY_API_URL'),
      apiToken: this.getString('PRINTIFY_API_TOKEN'),
      shopId: this.getString('PRINTIFY_SHOP_ID'),
    };
  }

  get labelService() {
    return {
      url: this.getString('LABEL_SERVICE_API_URL'),
    };
  }

  get webUrl() {
    return this.getString('WEB_URL');
  }

  get redis() {
    return {
      password: this.getString('REDIS_PASSWORD'),
      host: this.getString('REDIS_HOST'),
      port: this.getString('REDIS_PORT'),
      db: this.getString('REDIS_DB'),
    };
  }

  get rateLimiter() {
    return {
      enabled: this.getBoolean('RATE_LIMITER_ENABLED'),
      sessionMax: this.getNumber('RATE_LIMITER_SESSION_MAX'),
      sessionTtl: this.getNumber('RATE_LIMITER_SESSION_TTL'),
      userMax: this.getNumber('RATE_LIMITER_USER_MAX'),
      userTtl: this.getNumber('RATE_LIMITER_USER_TTL'),
    };
  }

  get adminChannel() {
    return {
      channelId: this.getString('TELEGRAM_CHANNEL_ID'),
      botToken: this.getString('TELEGRAM_BOT_TOKEN'),
    };
  }

  get elasticsearch() {
    return {
      host: this.getString('ELASTICSEARCH_HOST'),
      apiKey: this.getString('ELASTICSEARCH_APIKEY'),
      userActionIndex: this.getString('USER_ACTION_INDEX'),
    };
  }

  get smtp() {
    return {
      username: this.getString('SMTP_USERNAME'),
      password: this.getString('SMTP_PASSWORD'),
      host: this.getString('SMTP_HOST'),
      port: this.getNumber('SMTP_PORT'),
    };
  }

  get trackingStatus() {
    return {
      apiUrl: this.getString('TRACKING_STATUS_API_URL'),
    };
  }

  get Ocr() {
    return {
      url: this.getString('OCR_URL'),
    };
  }

  get GOauth() {
    return {
      type: this.getString('GOAUTH_TYPE'),
      projectId: this.getString('GOAUTH_PROJECT_ID'),
      clientId: this.getString('GOAUTH_CLIENT_ID'),
      clientSecret: this.getString('GOAUTH_CLIENT_SECRET'),
      authUri: this.getString('GOAUTH_AUTH_URI'),
      tokenUri: this.getString('GOAUTH_TOKEN_URI'),
      authProviderX509CertUrl: this.getString('GOAUTH_AUTH_PROVIDER_X509_CERT_URL'),
      accessToken: this.getString('GOAUTH_ACCESS_TOKEN'),
      refreshToken: this.getString('GOAUTH_REFRESH_TOKEN'),
      redirectUri: this.getString('GOAUTH_REDIRECT_URL'),
    };
  }

  get emailScanFrom() {
    return {
      pingpong: this.getString('PINGPONG_EMAIL_SCAN_FROM'),
      lianlian: this.getString('LIANLIAN_EMAIL_SCAN_FROM'),
    };
  }

  get lark() {
    return {
      printselBotId: this.getString('LARK_PRINTSEL_BOT_ID'),
    };
  }

  get payOS() {
    return {
      clientId: this.getString('PAYOS_CLIENT_ID'),
      apiKey: this.getString('PAYOS_API_KEY'),
      checksumKey: this.getString('PAYOS_CHECKSUM_KEY'),
    };
  }

  get topup() {
    return {
      urlCallback: this.getString('TOPUP_URL_CALLBACK'),
      urlProcessedCallback: this.getString('TOPUP_URL_PROCESSED_CALLBACK'),
    };
  }
}
