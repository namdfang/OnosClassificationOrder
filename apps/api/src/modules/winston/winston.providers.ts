import type { Provider } from '@nestjs/common';
import type { LoggerOptions } from 'winston';
import { createLogger } from 'winston';

import LoggerWrapper from './logger.wrapper';
import type { IWinstonModuleAsyncOptions, WinstonModuleOptions } from './winston.interfaces';

/**
 * Token for the type of configuration to be used when declaring in app module
 */
export const WINSTON_MODULE_OPTIONS = 'WinstonModuleOptions';
/**
 * An identifier for when injecting the winston provider
 */
export const WINSTON_MODULE_PROVIDER = 'winston';

/**
 * Constructor a winston provider
 * @param loggerOpts
 */
export const createWinstonProviders = (loggerOpts: WinstonModuleOptions): Provider[] => [
  {
    provide: WINSTON_MODULE_PROVIDER,
    useFactory: () => new LoggerWrapper(createLogger(loggerOpts)),
  },
];

/**
 * Async constructor for a winston provider
 * @param options
 */
export const createWinstonAsyncProviders = (options: IWinstonModuleAsyncOptions): Provider[] => [
  {
    provide: WINSTON_MODULE_OPTIONS,
    useFactory: options.useFactory,
    inject: options.inject || [],
  },
  {
    provide: WINSTON_MODULE_PROVIDER,
    useFactory: (loggerOpts: LoggerOptions) => new LoggerWrapper(createLogger(loggerOpts)),
    inject: [WINSTON_MODULE_OPTIONS],
  },
];
