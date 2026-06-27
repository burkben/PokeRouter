import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev, calls to /api are proxied to the backend (default localhost:8080),
// so the browser never needs CORS and the frontend stays origin-relative.
// Override the backend with BACKEND_URL when running `npm run dev`.
const backend = process.env.BACKEND_URL ?? 'http://localhost:8080'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: backend,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
})
