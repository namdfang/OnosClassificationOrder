// eslint-disable-next-line import/no-extraneous-dependencies
import { defineConfig } from 'vite';
// eslint-disable-next-line import/no-extraneous-dependencies
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/constants/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@core': path.resolve(__dirname, '../../packages/core'),
      '@shared': path.resolve(__dirname, '../../packages/shared'),
    },
  },
  define: {
    'process.env': {},
  },
  optimizeDeps: {
    include: ['zod', '@anatine/zod-nestjs', '@anatine/zod-openapi'],
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
});
