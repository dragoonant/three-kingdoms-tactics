import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

// PW_PORT lets a run avoid a port another project already holds.
const PORT = Number(process.env.PW_PORT ?? 5291)
// Production base path (see vite.config.ts): the preview server serves the build
// under this sub-path, matching GitHub Pages.
const BASE_URL = `http://localhost:${PORT}/three-kingdoms-tactics/`

const FALLBACK_CHROMIUM = '/opt/pw-browsers/chromium'
const executablePath = existsSync(FALLBACK_CHROMIUM) ? FALLBACK_CHROMIUM : undefined

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: 'test-results',
  fullyParallel: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
          ...(executablePath ? { executablePath } : {}),
        },
      },
    },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
