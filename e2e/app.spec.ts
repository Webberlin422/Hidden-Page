/**
 * E2E tests for HiddenPage Electron app.
 *
 * These tests require a desktop display environment (Electron BrowserWindow
 * needs a GPU and display). Run with:
 *
 *   npm run build && npx playwright test
 *
 * On headless CI, set up a virtual display (Xvfb on Linux, or
 * use windows-2019/2022 CI images which have desktop support).
 */
import { test, expect, _electron as electron } from '@playwright/test';

test.describe('HiddenPage Electron App', () => {
  // E2E tests require a desktop display (not available in headless/CLI environments).
  // Run locally with: npm run build && npm run test:e2e
  test('should launch without crashing', async () => {
    const electronApp = await electron.launch({
      args: ['dist/main/main.js'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    });

    // Give the app time to initialize
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Verify the process is still running (didn't crash on startup)
    expect(electronApp.process().exitCode).toBeNull();

    // Try to get any window (requires display)
    const windows = electronApp.windows();
    if (windows.length > 0) {
      const title = await windows[0].title();
      expect(title).toBeTruthy();
    }

    await electronApp.close();
    expect(electronApp.process().exitCode).not.toBeNull();
  });

  test.skip('should create browser window (requires display)', async () => {
    const electronApp = await electron.launch({
      args: ['dist/main/main.js'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    });

    // Wait for BrowserWindow to be created
    const window = await electronApp.firstWindow({ timeout: 15000 });
    expect(window).toBeTruthy();

    await window.waitForLoadState('domcontentloaded');
    const hasApp = await window.evaluate(() => document.querySelector('#app') !== null);
    expect(hasApp).toBe(true);

    await electronApp.close();
  });
});
