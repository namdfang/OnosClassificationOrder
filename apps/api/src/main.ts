import dotenv from 'dotenv';

dotenv.config();
console.log('env', process.env.NODE_ENV, process.env.DB_URI?.length);

if (process.env.NODE_ENV) {
  dotenv.config({ path: `.env.${process.env.NODE_ENV}` });
} else {
  console.log('NODE_ENV must be defined');

  process.exit(1);
}

if (!process.env.DB_URI) {
  console.log('DB_URI must be defined');

  process.exit(1);
}

import { Logger } from '@nestjs/common';

import { bootstrap, bootstrapMicroservice } from './main-nest';
import { QuietBrokerLogger } from './utils/quiet-broker-logger';

// Phải đặt TRƯỚC hai bootstrap: cả AmqpConnection lẫn microservice RMQ đều
// dùng `Logger` tĩnh của Nest, override ở đây là gom được log retry của cả hai.
Logger.overrideLogger(new QuietBrokerLogger());

void bootstrap();
void bootstrapMicroservice();
