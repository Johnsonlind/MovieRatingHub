import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    proxy: process.env.NODE_ENV === 'development' ? {
      '/auth': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.log('代理错误:', err);
          });
          proxy.on('proxyReq', (_proxyReq, req) => {
            console.log('代理请求:', req.url);
          });
          proxy.on('proxyRes', (proxyRes) => {
            console.log('代理响应:', proxyRes.statusCode);
          });
        }
      },
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true
      }
    } : {}
  },
  build: {
    target: 'es2015'
  },
  esbuild: {
    target: 'es2015'
  }
});
