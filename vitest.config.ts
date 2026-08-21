import { defineConfig } from 'vitest/config'

/**
 * Eigene Datei, weil Vitest seine eigene Vite-Kopie mitbringt und sich die
 * Plugin-Typen sonst mit denen aus vite.config.ts beissen. Die Kerntests
 * brauchen kein Vite-Plugin, sie laufen gegen reines TypeScript.
 */
export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
})
