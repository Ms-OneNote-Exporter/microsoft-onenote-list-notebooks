/**
 * @fileoverview Lists available OneNote notebooks by scraping the OneNote web interface.
 * @author phptr,enoola,msout
 * @copyright 2026 phptr,enoola,msout
 */
const { chromium } = require('playwright');
const logger = require('./utils/logger');
const { getAuthenticatedContextWithFile } = require('./auth-context');
const { ONENOTE_URL } = require('./config');
const fs = require('fs-extra');
const path = require('path');

/**
 * Detects the Microsoft Defender / MCAS "Use Edge Browser" interstitial
 * (URL pattern: *.access.mcas.ms/aad_login) and dismisses it.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<boolean>} true if the interstitial was detected and dismissed
 */
async function dismissMcasInterstitial(page) {
    const url = page.url();
    if (!url.includes('access.mcas.ms')) {
        return false;
    }

    logger.warn('Detected Microsoft Defender MCAS interstitial — dismissing...');

    try {
        await page.waitForSelector('#skip-disclaimer-checkbox', { timeout: 10000 }).catch(() => {});

        const checkbox = await page.$('#skip-disclaimer-checkbox');
        if (checkbox) {
            const isChecked = await checkbox.isChecked();
            if (!isChecked) {
                await checkbox.check();
                logger.debug('MCAS: checked "Hide this notification for all apps for one week".');
            }
        } else {
            logger.warn('MCAS: could not find the "Hide" checkbox.');
        }

        const continueBtn = await page.$('#hiddenformSubmitBtn');
        if (continueBtn) {
            logger.debug('MCAS: clicking "Continue in current browser"...');
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}),
                continueBtn.click()
            ]);
            logger.success('MCAS interstitial dismissed.');

            try {
                await page.waitForLoadState('networkidle', { timeout: 45000 });
            } catch (e) {
                logger.warn('MCAS post-dismiss network idle timeout — continuing anyway...');
            }
            return true;
        } else {
            logger.warn('MCAS: could not find "Continue in current browser" submit button.');
        }
    } catch (e) {
        logger.warn(`MCAS interstitial dismissal failed: ${e.message}`);
    }

    return false;
}

/**
 * Lists available OneNote notebooks.
 * @param {Object} options - Command options
 * @param {string} options.authFile - Path to authentication JSON file
 * @param {boolean} [options.notheadless] - Run in visible browser mode
 * @param {boolean} [options.dodump] - Dump HTML content for debugging
 * @returns {Promise<Array<{name: string, url: string, id: string}>>} Array of notebooks
 */
async function listNotebooks(options = {}) {
    logger.info('Connecting to OneNote...');

    const headless = !options.notheadless;
    logger.debug(`Launching browser (headless: ${headless})...`);

    const { browser, context } = await getAuthenticatedContextWithFile(options.authFile, headless);
    
    try {
        const page = await context.newPage();

        logger.info(`Navigating to notebooks list: ${ONENOTE_URL}`);
        await page.goto(ONENOTE_URL);

        try {
            logger.debug('Waiting for page content (domcontentloaded)...');
            await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
        } catch (e) {
            logger.warn('Page load timeout/warning, proceeding to scrape anyway...');
        }

        logger.info('Waiting for page to fully settle after redirects...');
        try {
            await page.waitForLoadState('networkidle', { timeout: 45000 });
        } catch (e) {
            logger.warn('Network idle timeout — continuing anyway...');
        }

        await dismissMcasInterstitial(page);

        // Wait for either the standard notebook table or the "Show all notebooks" link to appear.
        logger.info('Waiting for notebook list or "Show all notebooks" link...');
        const NOTEBOOK_IMG_SELECTOR = 'tr img[alt="Classic Notebook"]';
        const SHOW_ALL_SELECTOR = 'a:has-text("Show all notebooks")';
        
        let hasNotebooks = false;
        let showAllVisible = false;

        try {
            await Promise.any([
                page.waitForSelector(NOTEBOOK_IMG_SELECTOR, { state: 'attached', timeout: 30000 }).then(() => { hasNotebooks = true; }),
                page.waitForSelector(SHOW_ALL_SELECTOR, { state: 'visible', timeout: 30000 }).then(() => { showAllVisible = true; })
            ]);
        } catch (e) {
            logger.warn(`Neither notebook list nor "Show all notebooks" found within timeout: ${e.message}`);
        }

        if (options.dodump) {
            const dumpDir = await logger.getDumpDir();
            const displayPath = logger.getDumpDisplayPath();
            logger.warn(`Dumping main page content to ${displayPath}/debug_page_dump.html...`);
            const content = await page.content();
            await fs.writeFile(path.join(dumpDir, 'debug_page_dump.html'), content);
        }

        let notebooks = [];

        if (hasNotebooks) {
            logger.info('Notebook list detected on main page. Scraping...');
            const maxRetries = 5;
            for (let i = 0; i < maxRetries; i++) {
                logger.debug(`Attempt ${i + 1}/${maxRetries} to scrape notebook list...`);

                notebooks = await page.evaluate((imgSelector) => {
                    const imgs = Array.from(document.querySelectorAll(imgSelector));

                    return imgs.map((img, idx) => {
                        const nameSpan = img.nextElementSibling;
                        if (!nameSpan) return null;

                        const name = nameSpan.innerText.trim();
                        if (!name) return null;

                        const tr = img.closest('tr');
                        const trIndex = tr ? tr.rowIndex : idx;

                        return {
                            name,
                            url: 'click-to-open',
                            id: `notebook-row-${trIndex}`
                        };
                    }).filter(n => n && n.name);
                }, NOTEBOOK_IMG_SELECTOR);

                if (notebooks.length > 0) {
                    logger.success(`Found ${notebooks.length} notebooks!`);
                    break;
                }

                if (i < maxRetries - 1) {
                    logger.debug('No notebooks found yet, waiting 3 seconds...');
                    await page.waitForTimeout(3000);
                }
            }
        } else if (showAllVisible) {
            logger.info('No notebooks on main page, but "Show all notebooks" link is visible. Redirecting to OneDrive...');
            
            const showAllLink = page.locator(SHOW_ALL_SELECTOR);
            let targetPage = page;
            const popupPromise = context.waitForEvent('page', { timeout: 15000 }).catch(() => null);

            await showAllLink.click();

            const popupPage = await popupPromise;
            if (popupPage) {
                logger.success('Opened OneDrive in a new tab.');
                targetPage = popupPage;
            } else {
                logger.info('OneDrive did not open in a new tab, using current tab.');
            }

            // Handle potential "Stay signed in?" screen
            logger.info('Checking for potential "Stay signed in?" screen...');
            const yesBtn = targetPage.locator('#idSIButton9, input[type="submit"][value="Yes"], input[value="Yes"], button:has-text("Yes")');
            try {
                await yesBtn.waitFor({ state: 'visible', timeout: 10000 });
                logger.info('Detected "Stay signed in?" screen. Clicking "Yes"...');
                await yesBtn.click();
                await targetPage.waitForNavigation({ waitUntil: 'load', timeout: 20000 }).catch(() => {});
            } catch (e) {
                logger.info('No "Stay signed in?" screen detected within timeout.');
            }

            // Wait for onedrive.live.com to load
            logger.info('Waiting for onedrive.live.com to load...');
            await targetPage.waitForURL(/onedrive\.live\.com/, { timeout: 30000 });
            await targetPage.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});

            // Wait for either the ransomware modal or the OneNote pill to become visible
            logger.info('Waiting for page elements to render on OneDrive...');
            const ransomwareText = targetPage.getByText('Ransomware can lock your files', { exact: false });
            const onenotePill = targetPage.locator('button:has-text("OneNote"), [role="tab"]:has-text("OneNote"), [role="button"]:has-text("OneNote")').first();
            
            try {
                const eventType = await Promise.any([
                    ransomwareText.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'ransomware'),
                    onenotePill.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'pill')
                ]);

                if (eventType === 'ransomware') {
                    logger.info('Detected Ransomware warning modal. Closing it...');
                    const closeBtn = targetPage.locator('button[aria-label="Close"], button[title="Close"], .ms-Modal-closeButton');
                    if (await closeBtn.isVisible()) {
                        await closeBtn.click();
                        logger.success('Ransomware warning modal closed.');
                        await targetPage.waitForTimeout(2000); // Wait for close transition
                    }
                    // Now wait for the filter pill
                    await onenotePill.waitFor({ state: 'visible', timeout: 10000 });
                }
            } catch (e) {
                logger.warn(`OneDrive elements rendering wait finished or timed out: ${e.message}`);
            }

            // Select "OneNote" pill/filter
            logger.info('Filtering by "OneNote" to display notebooks...');
            if (await onenotePill.isVisible().catch(() => false)) {
                await onenotePill.click();
                // Wait for list to filter
                await targetPage.waitForTimeout(3000);
            } else {
                logger.warn('"OneNote" filter pill not found on OneDrive.');
            }

            logger.info('Waiting for notebooks list to render on OneDrive...');
            const nameBtnSelector = 'button[role="link"].nameCellTopContrast, button[role="link"], button[class*="nameCellTop"]';
            try {
                await targetPage.waitForSelector(nameBtnSelector, { state: 'attached', timeout: 15000 });
            } catch (e) {
                logger.warn(`No notebook rows detected within timeout: ${e.message}`);
            }

            if (options.dodump) {
                const dumpDir = await logger.getDumpDir();
                const displayPath = logger.getDumpDisplayPath();
                logger.warn(`Dumping OneDrive page content to ${displayPath}/debug_onedrive_dump.html...`);
                const content = await targetPage.content();
                await fs.writeFile(path.join(dumpDir, 'debug_onedrive_dump.html'), content);
            }

            logger.info('Scraping notebooks from OneDrive list...');
            notebooks = await targetPage.evaluate(() => {
                const rows = Array.from(document.querySelectorAll('[role="row"]'));
                return rows.map((row, idx) => {
                    const nameBtn = row.querySelector('button[role="link"], button.nameCellTopContrast, button[class*="nameCellTop"]');
                    if (!nameBtn) return null;
                    const name = nameBtn.innerText.trim();
                    if (!name) return null;
                    return {
                        name,
                        url: 'click-to-open',
                        id: `notebook-row-${idx}`
                    };
                }).filter(n => n && n.name);
            });

            logger.success(`Found ${notebooks.length} notebooks on OneDrive!`);
        } else {
            logger.warn('Neither notebook list nor "Show all notebooks" link was detected. Trying fallback scrape on main page...');
            const maxRetries = 3;
            for (let i = 0; i < maxRetries; i++) {
                notebooks = await page.evaluate((imgSelector) => {
                    const imgs = Array.from(document.querySelectorAll(imgSelector));
                    return imgs.map((img, idx) => {
                        const nameSpan = img.nextElementSibling;
                        if (!nameSpan) return null;
                        const name = nameSpan.innerText.trim();
                        if (!name) return null;
                        const tr = img.closest('tr');
                        const trIndex = tr ? tr.rowIndex : idx;
                        return {
                            name,
                            url: 'click-to-open',
                            id: `notebook-row-${trIndex}`
                        };
                    }).filter(n => n && n.name);
                }, NOTEBOOK_IMG_SELECTOR);

                if (notebooks.length > 0) {
                    logger.success(`Found ${notebooks.length} notebooks!`);
                    break;
                }
                if (i < maxRetries - 1) {
                    await page.waitForTimeout(3000);
                }
            }
        }

        // Deduping by name (new page may show duplicates in Recent vs All sections)
        const uniqueNotebooks = [];
        const seenNames = new Set();
        for (const nb of notebooks) {
            if (!seenNames.has(nb.name)) {
                seenNames.add(nb.name);
                uniqueNotebooks.push(nb);
            }
        }

        return uniqueNotebooks;

    } catch (e) {
        logger.error('Error listing notebooks:', e);
        throw e;
    } finally {
        await browser.close();
    }
}

module.exports = { listNotebooks, dismissMcasInterstitial };
