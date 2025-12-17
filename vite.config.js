import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // GitHub Pages 배포를 위해 상대 경로 사용
  build: {
    outDir: 'dist',
  }
})
