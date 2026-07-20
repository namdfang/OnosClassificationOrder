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

import { bootstrap, bootstrapMicroservice } from './main-nest';

void bootstrap();
void bootstrapMicroservice();
