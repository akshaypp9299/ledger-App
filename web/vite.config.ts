import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The API runs on :8080 in dev; proxying keeps the browser on one origin (no CORS surprises).
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8080' } },
})
