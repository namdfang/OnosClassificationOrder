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

if (!process.env.DB_URI) {
  console.log('DB_URI must be defined');

  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(1);
}

// require('./dist-prod/main.js');
try {
  require('./dist-prod/main.js');
} catch (err) {
  console.error('Failed to load ./dist-prod/main.js, trying ./dist/main.js');
  try {
    require('./dist/main.js');
  } catch (err) {
    console.error('Failed to load ./dist/main.js', err);
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  }
}
