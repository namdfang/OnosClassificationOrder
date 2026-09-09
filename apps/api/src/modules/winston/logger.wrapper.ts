/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Logger } from 'winston';

class LoggerWrapper {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  info(message: any, ...meta: any[]) {
    this.logger.info(message, ...meta);
  }

  // Nhiều service khai type winston `Logger` rồi gọi `.error`/`.warn` — wrapper
  // thiếu method là TypeError nổ NGAY TRONG catch block, nuốt cả luồng xử lý lỗi
  // (đã xảy ra thật: seller-shipping.buy không hoàn được ví vì logger.error nổ).
  error(message: any, ...meta: any[]) {
    this.logger.error(message, ...meta);
  }

  warn(message: any, ...meta: any[]) {
    this.logger.warn(message, ...meta);
  }

  debug(message: any, ...meta: any[]) {
    this.logger.debug(message, ...meta);
  }
}

export default LoggerWrapper;
