/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The build is a single self-contained HTML file so it can be opened anywhere
// (or published as a page) without a server.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
