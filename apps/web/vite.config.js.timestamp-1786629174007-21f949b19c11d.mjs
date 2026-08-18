// vite.config.js
import path from "path";
import { defineConfig } from "file:///Users/namdfang/Code/ToolClassification/node_modules/.pnpm/vite@4.4.9_@types+node@20.17.17/node_modules/vite/dist/node/index.js";
import react from "file:///Users/namdfang/Code/ToolClassification/node_modules/.pnpm/@vitejs+plugin-react@4.0.0_vite@4.4.9/node_modules/@vitejs/plugin-react/dist/index.mjs";
var __vite_injected_original_dirname = "/Users/namdfang/Code/ToolClassification/apps/web";
var vite_config_default = defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src"),
      "@core": path.resolve(__vite_injected_original_dirname, "../../packages/core"),
      "@shared": path.resolve(__vite_injected_original_dirname, "../../packages/shared")
    }
  },
  define: {
    "process.env": {}
  },
  optimizeDeps: {
    include: ["zod", "@anatine/zod-nestjs", "@anatine/zod-openapi"]
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true
    },
    // Tắt sourcemap prod để giảm peak memory (server hay OOM ở chunk render
    // vì sourcemap JSON parse rất tốn RAM). Dev vẫn có sourcemap qua serve.
    sourcemap: false,
    // Target esnext = ít transform → ít memory. User browser hiện đại OK.
    target: "esnext",
    // CSS code split: false → 1 file CSS, giảm peak khi rollup combine.
    cssCodeSplit: true,
    // Set minify=esbuild (default) — esbuild dùng C++ binary, lighter hơn
    // terser. Nếu vẫn OOM, set `minify: false` để skip hoàn toàn (bundle
    // lớn gấp 3, nhưng build pass được với RAM thấp).
    minify: "esbuild",
    // Tăng warning limit lên 1MB để giảm noise — chunk thực sự lớn (vendor
    // react/antd) ~700kb gzip vẫn ổn.
    chunkSizeWarningLimit: 1024,
    rollupOptions: {
      output: {
        // Split vendor thành các chunk độc lập → mỗi chunk render tách,
        // tránh peak memory khi rollup serialize toàn bộ deps vào 1 chunk.
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-utils": ["dayjs", "axios", "zustand", "lucide-react", "zod"],
          "vendor-dnd": ["@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities"]
        }
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvbmFtZGZhbmcvQ29kZS9Ub29sQ2xhc3NpZmljYXRpb24vYXBwcy93ZWJcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9Vc2Vycy9uYW1kZmFuZy9Db2RlL1Rvb2xDbGFzc2lmaWNhdGlvbi9hcHBzL3dlYi92aXRlLmNvbmZpZy5qc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vVXNlcnMvbmFtZGZhbmcvQ29kZS9Ub29sQ2xhc3NpZmljYXRpb24vYXBwcy93ZWIvdml0ZS5jb25maWcuanNcIjtpbXBvcnQgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gJ3ZpdGUnO1xuaW1wb3J0IHJlYWN0IGZyb20gJ0B2aXRlanMvcGx1Z2luLXJlYWN0JztcblxuLy8gaHR0cHM6Ly92aXRlanMuZGV2L2NvbnN0YW50cy9cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHBsdWdpbnM6IFtyZWFjdCgpXSxcbiAgcmVzb2x2ZToge1xuICAgIGFsaWFzOiB7XG4gICAgICAnQCc6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuL3NyYycpLFxuICAgICAgJ0Bjb3JlJzogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJy4uLy4uL3BhY2thZ2VzL2NvcmUnKSxcbiAgICAgICdAc2hhcmVkJzogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJy4uLy4uL3BhY2thZ2VzL3NoYXJlZCcpLFxuICAgIH0sXG4gIH0sXG4gIGRlZmluZToge1xuICAgICdwcm9jZXNzLmVudic6IHt9LFxuICB9LFxuICBvcHRpbWl6ZURlcHM6IHtcbiAgICBpbmNsdWRlOiBbJ3pvZCcsICdAYW5hdGluZS96b2QtbmVzdGpzJywgJ0BhbmF0aW5lL3pvZC1vcGVuYXBpJ10sXG4gIH0sXG4gIGJ1aWxkOiB7XG4gICAgY29tbW9uanNPcHRpb25zOiB7XG4gICAgICB0cmFuc2Zvcm1NaXhlZEVzTW9kdWxlczogdHJ1ZSxcbiAgICB9LFxuICAgIC8vIFRcdTFFQUZ0IHNvdXJjZW1hcCBwcm9kIFx1MDExMVx1MUVDMyBnaVx1MUVBM20gcGVhayBtZW1vcnkgKHNlcnZlciBoYXkgT09NIFx1MUVERiBjaHVuayByZW5kZXJcbiAgICAvLyB2XHUwMEVDIHNvdXJjZW1hcCBKU09OIHBhcnNlIHJcdTFFQTV0IHRcdTFFRDFuIFJBTSkuIERldiB2XHUxRUFCbiBjXHUwMEYzIHNvdXJjZW1hcCBxdWEgc2VydmUuXG4gICAgc291cmNlbWFwOiBmYWxzZSxcbiAgICAvLyBUYXJnZXQgZXNuZXh0ID0gXHUwMEVEdCB0cmFuc2Zvcm0gXHUyMTkyIFx1MDBFRHQgbWVtb3J5LiBVc2VyIGJyb3dzZXIgaGlcdTFFQzduIFx1MDExMVx1MUVBMWkgT0suXG4gICAgdGFyZ2V0OiAnZXNuZXh0JyxcbiAgICAvLyBDU1MgY29kZSBzcGxpdDogZmFsc2UgXHUyMTkyIDEgZmlsZSBDU1MsIGdpXHUxRUEzbSBwZWFrIGtoaSByb2xsdXAgY29tYmluZS5cbiAgICBjc3NDb2RlU3BsaXQ6IHRydWUsXG4gICAgLy8gU2V0IG1pbmlmeT1lc2J1aWxkIChkZWZhdWx0KSBcdTIwMTQgZXNidWlsZCBkXHUwMEY5bmcgQysrIGJpbmFyeSwgbGlnaHRlciBoXHUwMUExblxuICAgIC8vIHRlcnNlci4gTlx1MUVCRnUgdlx1MUVBQm4gT09NLCBzZXQgYG1pbmlmeTogZmFsc2VgIFx1MDExMVx1MUVDMyBza2lwIGhvXHUwMEUwbiB0b1x1MDBFMG4gKGJ1bmRsZVxuICAgIC8vIGxcdTFFREJuIGdcdTFFQTVwIDMsIG5oXHUwMUIwbmcgYnVpbGQgcGFzcyBcdTAxMTFcdTAxQjBcdTFFRTNjIHZcdTFFREJpIFJBTSB0aFx1MUVBNXApLlxuICAgIG1pbmlmeTogJ2VzYnVpbGQnLFxuICAgIC8vIFRcdTAxMDNuZyB3YXJuaW5nIGxpbWl0IGxcdTAwRUFuIDFNQiBcdTAxMTFcdTFFQzMgZ2lcdTFFQTNtIG5vaXNlIFx1MjAxNCBjaHVuayB0aFx1MUVGMWMgc1x1MUVGMSBsXHUxRURCbiAodmVuZG9yXG4gICAgLy8gcmVhY3QvYW50ZCkgfjcwMGtiIGd6aXAgdlx1MUVBQm4gXHUxRUQ1bi5cbiAgICBjaHVua1NpemVXYXJuaW5nTGltaXQ6IDEwMjQsXG4gICAgcm9sbHVwT3B0aW9uczoge1xuICAgICAgb3V0cHV0OiB7XG4gICAgICAgIC8vIFNwbGl0IHZlbmRvciB0aFx1MDBFMG5oIGNcdTAwRTFjIGNodW5rIFx1MDExMVx1MUVEOWMgbFx1MUVBRHAgXHUyMTkyIG1cdTFFRDdpIGNodW5rIHJlbmRlciB0XHUwMEUxY2gsXG4gICAgICAgIC8vIHRyXHUwMEUxbmggcGVhayBtZW1vcnkga2hpIHJvbGx1cCBzZXJpYWxpemUgdG9cdTAwRTBuIGJcdTFFRDkgZGVwcyB2XHUwMEUwbyAxIGNodW5rLlxuICAgICAgICBtYW51YWxDaHVua3M6IHtcbiAgICAgICAgICAndmVuZG9yLXJlYWN0JzogWydyZWFjdCcsICdyZWFjdC1kb20nLCAncmVhY3Qtcm91dGVyLWRvbSddLFxuICAgICAgICAgICd2ZW5kb3ItdXRpbHMnOiBbJ2RheWpzJywgJ2F4aW9zJywgJ3p1c3RhbmQnLCAnbHVjaWRlLXJlYWN0JywgJ3pvZCddLFxuICAgICAgICAgICd2ZW5kb3ItZG5kJzogWydAZG5kLWtpdC9jb3JlJywgJ0BkbmQta2l0L3NvcnRhYmxlJywgJ0BkbmQta2l0L3V0aWxpdGllcyddLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICB9LFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQWtVLE9BQU8sVUFBVTtBQUNuVixTQUFTLG9CQUFvQjtBQUM3QixPQUFPLFdBQVc7QUFGbEIsSUFBTSxtQ0FBbUM7QUFLekMsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUyxDQUFDLE1BQU0sQ0FBQztBQUFBLEVBQ2pCLFNBQVM7QUFBQSxJQUNQLE9BQU87QUFBQSxNQUNMLEtBQUssS0FBSyxRQUFRLGtDQUFXLE9BQU87QUFBQSxNQUNwQyxTQUFTLEtBQUssUUFBUSxrQ0FBVyxxQkFBcUI7QUFBQSxNQUN0RCxXQUFXLEtBQUssUUFBUSxrQ0FBVyx1QkFBdUI7QUFBQSxJQUM1RDtBQUFBLEVBQ0Y7QUFBQSxFQUNBLFFBQVE7QUFBQSxJQUNOLGVBQWUsQ0FBQztBQUFBLEVBQ2xCO0FBQUEsRUFDQSxjQUFjO0FBQUEsSUFDWixTQUFTLENBQUMsT0FBTyx1QkFBdUIsc0JBQXNCO0FBQUEsRUFDaEU7QUFBQSxFQUNBLE9BQU87QUFBQSxJQUNMLGlCQUFpQjtBQUFBLE1BQ2YseUJBQXlCO0FBQUEsSUFDM0I7QUFBQTtBQUFBO0FBQUEsSUFHQSxXQUFXO0FBQUE7QUFBQSxJQUVYLFFBQVE7QUFBQTtBQUFBLElBRVIsY0FBYztBQUFBO0FBQUE7QUFBQTtBQUFBLElBSWQsUUFBUTtBQUFBO0FBQUE7QUFBQSxJQUdSLHVCQUF1QjtBQUFBLElBQ3ZCLGVBQWU7QUFBQSxNQUNiLFFBQVE7QUFBQTtBQUFBO0FBQUEsUUFHTixjQUFjO0FBQUEsVUFDWixnQkFBZ0IsQ0FBQyxTQUFTLGFBQWEsa0JBQWtCO0FBQUEsVUFDekQsZ0JBQWdCLENBQUMsU0FBUyxTQUFTLFdBQVcsZ0JBQWdCLEtBQUs7QUFBQSxVQUNuRSxjQUFjLENBQUMsaUJBQWlCLHFCQUFxQixvQkFBb0I7QUFBQSxRQUMzRTtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
