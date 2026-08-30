import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/Kleenest_Production/',
  plugins: [react()],
  build: { sourcemap: true }
});
