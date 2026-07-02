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

        // Wait for the notebook table to appear.
        // The new onenote.cloud.microsoft/notebooks page renders notebooks as a plain
        // <table> where each notebook row (<tr>) contains in its first <td>:
        //   <img alt="Classic Notebook"> <span>Notebook Name</span>
        // We scope to 'tr img[...]' to exclude the sidebar nav item (which also has
        // this img but outside a table row and produces a false "Notebooks" entry).
        // We use state:'attached' because the imgs can be present but hidden.
        logger.info('Waiting for notebook list to render...');
        const NOTEBOOK_IMG_SELECTOR = 'tr img[alt="Classic Notebook"]';
        try {
            await page.waitForSelector(NOTEBOOK_IMG_SELECTOR, { state: 'attached', timeout: 60000 });
            logger.success('Notebook list detected in DOM.');
        } catch (e) {
            logger.warn(`Notebook img selector not found within timeout: ${e.message}`);
        }

        if (options.dodump) {
            const dumpDir = await logger.getDumpDir();
            const displayPath = logger.getDumpDisplayPath();
            logger.warn(`Dumping main page content to ${displayPath}/debug_page_dump.html...`);
            const content = await page.content();
            await fs.writeFile(path.join(dumpDir, 'debug_page_dump.html'), content);
        }

        let notebooks = [];
        const maxRetries = 5;

        for (let i = 0; i < maxRetries; i++) {
            logger.debug(`Attempt ${i + 1}/${maxRetries} to scrape notebook list...`);

            notebooks = await page.evaluate((imgSelector) => {
                // New page structure (onenote.cloud.microsoft/notebooks):
                // A <table> where each <tr> (notebook row) contains in its first <td>:
                //   <div>
                //     <img alt="Classic Notebook">
                //     <span>Notebook Name</span>
                //   </div>
                // Selector is scoped to 'tr img[...]' to exclude the sidebar nav
                // item (same img alt, but not inside a <tr>) which would otherwise
                // produce a false "Notebooks" entry at position #1.
                const imgs = Array.from(document.querySelectorAll(imgSelector));

                return imgs.map((img, idx) => {
                    // The span immediately following the img holds the name
                    const nameSpan = img.nextElementSibling;
                    if (!nameSpan) return null;

                    const name = nameSpan.innerText.trim();
                    if (!name) return null;

                    // Use the row index as the id (no data-automationid on new page)
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
