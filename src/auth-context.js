/**
 * @fileoverview Authentication context helper for the OneNote notebook listing CLI tool.
 * @author phptr,enoola,msout
 * @copyright 2026 phptr,enoola,msout
 */
const { chromium } = require('playwright');
const fs = require('fs-extra');

/**
 * Creates a Playwright browser context using authentication state from a file.
 * @param {string} authFilePath - Path to the auth.json file containing storageState
 * @param {boolean} headless - Whether to run browser in headless mode
 * @returns {Promise<import('playwright').BrowserContext>} Browser context with auth state
 */
async function getAuthenticatedContextWithFile(authFilePath, headless = true) {
    if (!(await fs.pathExists(authFilePath))) {
        throw new Error(`Authentication file not found: ${authFilePath}`);
    }
    
    const browser = await chromium.launch({ headless });
    const context = await browser.newContext({ storageState: authFilePath });
    return { browser, context };
}

module.exports = { getAuthenticatedContextWithFile };
