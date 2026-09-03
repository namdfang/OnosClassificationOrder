import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/constants/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Gói giao diện Zalo (@zero-126/zalo-ui) viết cho Next.js và import
      // `next/link` + `next/navigation` ngay trong mã đã build. App này chạy
      // Vite + react-router nên hai đường đó trỏ sang shim tương đương ở
      // `src/lib/next-shim/`. KHÔNG cài `next` chỉ để thoả một import.
      'next/navigation': path.resolve(__dirname, './src/lib/next-shim/navigation.ts'),
      'next/link': path.resolve(__dirname, './src/lib/next-shim/link.tsx'),
      '@': path.resolve(__dirname, './src'),
      '@core': path.resolve(__dirname, '../../packages/core'),
      '@shared': path.resolve(__dirname, '../../packages/shared'),
    },
  },
  // Mở web thẳng ở :5173 (không qua tunnel) thì đường proxy Zalo vẫn phải tới
  // API: SDK gọi `/api/zalo-multi/...` cùng origin bằng fetch trần, không đi qua
  // axios nên không dùng VITE_API_URL.
  server: {
    proxy: {
      '/api/zalo-multi': { target: 'http://127.0.0.1:3007', changeOrigin: false },
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
    // Target esnext = ít transform → ít memory. User browser hiện đại OK.
    target: 'esnext',
    // CSS code split: false → 1 file CSS, giảm peak khi rollup combine.
    cssCodeSplit: true,
    // Set minify=esbuild (default) — esbuild dùng C++ binary, lighter hơn
    // terser. Nếu vẫn OOM, set `minify: false` để skip hoàn toàn (bundle
    // lớn gấp 3, nhưng build pass được với RAM thấp).
    minify: 'esbuild',
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
