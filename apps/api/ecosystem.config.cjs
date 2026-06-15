const dotenv = require('dotenv');

dotenv.config();
console.log('env', process.env.NODE_ENV, process.env.DB_URI?.length);

if (process.env.NODE_ENV) {
  dotenv.config({ path: `.env.${process.env.NODE_ENV}` });
} else {
  console.log('NODE_ENV must be defined');

  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(1);
}

function getEnv(key) {
  if (!process.env[key]) {
    throw new Error(`Missing env variable ${key}`);
  }

  return process.env[key];
}

function getOptionalEnv(key) {
  return process.env[key];
}

module.exports = [
  {
    name: getEnv('APP_NAME'),
    script: './start.js',
    instances: getOptionalEnv('APP_INSTANCES') || 1,
    // exec_mode: 'cluster',
    max_memory_restart: '1G',
  },
];
