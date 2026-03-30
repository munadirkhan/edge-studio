import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/dalle-proxy': {
        target: 'https://oaidalleapiprodscus.blob.core.windows.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/dalle-proxy/, ''),
      }
    }
  }
})