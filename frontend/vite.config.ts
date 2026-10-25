import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // Pure-function unit tests only (formatting helpers); no DOM needed yet.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
