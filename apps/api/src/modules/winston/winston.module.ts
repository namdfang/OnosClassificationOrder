import type { DynamicModule } from '@nestjs/common';
import { Global, Module } from '@nestjs/common';

import type { IWinstonModuleAsyncOptions, WinstonModuleOptions } from './winston.interfaces';
import { createWinstonAsyncProviders, createWinstonProviders } from './winston.providers';

@Global()
@Module({})
/**
 * Represents a Winston Module
 */
export class WinstonModule {
  /**
   * Constructor for winston module
   * @param options
   */
  public static forRoot(options: WinstonModuleOptions): DynamicModule {
    const providers = createWinstonProviders(options);

    return {
      module: WinstonModule,
      providers,
      exports: providers,
    };
  }

  /**
   * Asynchronous constructor for winston module
   * @param options
   */
  public static forRootAsync(options: IWinstonModuleAsyncOptions): DynamicModule {
    const providers = createWinstonAsyncProviders(options);

    return {
      module: WinstonModule,
      imports: options.imports,
      providers,
      exports: providers,
    };
  }
}
