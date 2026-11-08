import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    // .claude/worktrees holds separate checkouts, not project source.
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'],
    // Each test file boots an in-process Postgres (PGlite) and runs migrations.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'server-only': path.resolve(__dirname, 'test/server-only-stub.ts'),
    },
  },
})
