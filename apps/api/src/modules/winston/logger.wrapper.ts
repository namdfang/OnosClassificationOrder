/* eslint-disable @typescript-eslint/no-unsafe-argument */
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
}

export default LoggerWrapper;
