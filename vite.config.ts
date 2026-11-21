import { defineConfig } from 'vite';

// 纯前端 Vite 配置：base 使用相对路径，构建产物可部署到任意静态目录
export default defineConfig({
  base: './',
  server: {
    open: true,
    port: 5173
  },
  build: {
    target: 'es2020',
    sourcemap: true,
    // Three.js 体积较大，单独拆分为 vendor chunk 后其单包约 530KB，属预期范围
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three']
        }
      }
    }
  }
});
