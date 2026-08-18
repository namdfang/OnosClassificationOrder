import 'dotenv/config';

function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Thiếu env bắt buộc: ${key}`);
  return v;
}

function num(key: string, fallback: number): number {
  const v = Number(process.env[key]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export const config = {
  dbUri: required('DB_URI'),
  rabbitmq: {
    uri: required('RABBITMQ_URI'),
    mainExchange: required('RABBITMQ_MAIN_EXCHANGE'),
  },
  r2: {
    accountId: required('R2_ACCOUNT_ID'),
    accessKeyId: required('R2_ACCESS_KEY_ID'),
    secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
    bucket: required('R2_BUCKET'),
    /** Base URL CDN public (custom domain Cloudflare) — không slash cuối. */
    publicBase: required('R2_PUBLIC_BASE').replace(/\/$/, ''),
  },
  /** Kích thước biến thể — thumb 100×100, preview 500×500 (fit inside, webp). */
  thumbDim: num('DESIGN_THUMB_DIM', 100),
  thumbQuality: num('DESIGN_THUMB_QUALITY', 75),
  previewDim: num('DESIGN_PREVIEW_DIM', 500),
  previewQuality: num('DESIGN_PREVIEW_QUALITY', 80),
  maxDownloadMb: num('DESIGN_MAX_DOWNLOAD_MB', 300),
  /** Số job xử lý song song (file lớn — đừng đặt cao). */
  prefetch: num('WORKER_PREFETCH', 3),
  maxRetries: num('WORKER_MAX_RETRIES', 3),
  tmpDir: process.env.TMP_DIR || '/tmp/design-worker',
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_NOTIFICATION_CHANNEL_ID || '',
  },
};
