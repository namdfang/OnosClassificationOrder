import type { ZodDtoStatic } from '@anatine/zod-nestjs/src/lib/create-zod-dto';
import { default as multipart } from '@fastify/multipart';
import type { ArgumentMetadata, PipeTransform } from '@nestjs/common';
import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { Transport } from '@nestjs/microservices';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
// import compression from 'compression';
import { CustomExceptionFilter, UnprocessableEntityFilter } from 'core';
import helmet from 'helmet';
// import morgan from 'morgan';
import { I18nService } from 'nestjs-i18n';

import { AppModule } from './app.module';
import { setupSwagger } from './setup-swagger';
import { ApiConfigService } from './shared/services';
import { SharedModule } from './shared/shared.module';

export async function bootstrap(): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      bodyLimit: 10_048_576,
    }),
    {
      cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173', 'https://onosfactory.com'],
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
        preflightContinue: false,
        optionsSuccessStatus: 204,
        credentials: true,
        maxAge: 86_400,
        allowedHeaders: 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
      },
    },
  );

  const configService = app.select(SharedModule).get(ApiConfigService);

  if (configService.isProduction) {
    // app.enable('trust proxy');
  }

  // @ts-expect-error multipart
  void app.register(multipart);

  // Preserve raw body cho /api/v1/partner/* — cần để verify HMAC signature đúng byte-for-byte
  // Dùng preParsing hook để capture raw stream BEFORE Nest's JSON parser chạy
  const fastifyInstance = app.getHttpAdapter().getInstance();
  fastifyInstance.addHook('preParsing', async (request: any, _reply: any, payload: any) => {
    if (!request.url?.startsWith('/api/v1/partner')) {
      return payload;
    }

    const chunks: Buffer[] = [];

    for await (const chunk of payload) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
    }

    const rawBuffer = Buffer.concat(chunks);
    request.rawBody = rawBuffer.toString('utf8');

    const { Readable } = await import('node:stream');

    // Phải emit Buffer chunks (không phải string) để Fastify default parser xử lý được
    return Readable.from([rawBuffer]);
  });
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  // app.setGlobalPrefix('/api'); use api as global prefix if you don't have subdomain
  // app.use(
  //   rateLimit({
  //     windowMs: 1 * 60 * 1000, // 1 minutes
  //     max: 100, // limit each IP to 100 requests per windowMs
  //   }),
  // );
  // app.enableCors();
  // app.use(compression());
  // app.use(morgan('combined'));
  app.enableVersioning();
  app.setGlobalPrefix('api/v1');

  const reflector = app.get(Reflector);

  app.useGlobalFilters(
    new CustomExceptionFilter(configService.isDevelopment, app.select(SharedModule).get(I18nService)),
    new UnprocessableEntityFilter(reflector, configService.isDevelopment, app.select(SharedModule).get(I18nService)),
  );

  @Injectable()
  class ZodValidationPipe implements PipeTransform {
    public transform(value: unknown, metadata: ArgumentMetadata): unknown {
      const zodSchema = (metadata.metatype as ZodDtoStatic).zodSchema;

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (zodSchema) {
        const parseResult = zodSchema.safeParse(value);

        if (!parseResult.success) {
          const { error } = parseResult;

          // const message = error.errors.map((error2) => `${error2.path.join('.')}: ${error.message}`);

          throw new UnprocessableEntityException(error);
        }

        return parseResult.data;
      }

      return value;
    }
  }

  app.useGlobalPipes(new ZodValidationPipe());

  if (configService.documentationEnabled) {
    setupSwagger(app);
  }

  // Starts listening for shutdown hooks
  if (!configService.isDevelopment) {
    app.enableShutdownHooks();
  }

  const port = configService.appConfig.port;

  if (!process.env.VITE) {
    await app.listen(port, '0.0.0.0');
    console.info(`server running on ${await app.getUrl()}`);
  }

  return app;
}

export async function bootstrapMicroservice() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.RMQ,
    options: {
      urls: [process.env.RABBITMQ_URI!],
    },
  });

  await app.listen();
  console.info('Microservice is listening...');
}

// void bootstrap();
// void bootstrapMicroservice();
