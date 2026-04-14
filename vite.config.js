import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    proxy: {
      '/video': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/clips': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/dalle-proxy': {
        target: 'https://oaidalleapiprodscus.blob.core.windows.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/dalle-proxy/, ''),
      }
    }
  }
})