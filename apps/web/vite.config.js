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
    // Tắt sourcemap prod để giảm peak memory (server hay OOM ở chunk render
    // vì sourcemap JSON parse rất tốn RAM). Dev vẫn có sourcemap qua serve.
    sourcemap: false,
    // Tăng warning limit lên 1MB để giảm noise — chunk thực sự lớn (vendor
    // react/antd) ~700kb gzip vẫn ổn.
    chunkSizeWarningLimit: 1024,
    rollupOptions: {
      output: {
        // Split vendor thành các chunk độc lập → mỗi chunk render tách,
        // tránh peak memory khi rollup serialize toàn bộ deps vào 1 chunk.
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-utils': ['dayjs', 'axios', 'zustand', 'lucide-react', 'zod'],
          'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
        },
      },
    },
  },
});
