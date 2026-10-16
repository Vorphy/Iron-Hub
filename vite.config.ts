import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

// GitHub Pages serwuje projekt pod /Iron-Hub/. Inny hosting: BASE_PATH=/ npm run build
export default defineConfig(({ command }) => ({
  base: command === 'build' ? (process.env.BASE_PATH ?? '/Iron-Hub/') : '/',
  plugins: [preact()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
}));
