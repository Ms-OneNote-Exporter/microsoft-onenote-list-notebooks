/**
 * diagnose-new-page.js
 * 
 * Diagnostic script: opens onenote.cloud.microsoft/notebooks with auth,
 * waits for actual content to render, then dumps the DOM and logs
 * candidate selectors for notebooks.
 * 
 * Usage:
 *   node src/diagnose-new-page.js --auth-file ../microsoft-webauth-playwright-js/auth.json
 */
const { chromium } = require('playwright');
const { getAuthenticatedContextWithFile } = require('./auth-context');
const fs = require('fs-extra');
const path = require('path');

const authFile = process.argv[process.argv.indexOf('--auth-file') + 1];
if (!authFile) {
    console.error('Usage: node src/diagnose-new-page.js --auth-file <path>');
    process.exit(1);
}

const TARGET_URL = 'https://onenote.cloud.microsoft/notebooks';
const DUMP_DIR = path.resolve(__dirname, '../diag-dumps');

async function diagnose() {
    console.log('[DIAG] Starting diagnosis...');
    await fs.ensureDir(DUMP_DIR);

    const { browser, context } = await getAuthenticatedContextWithFile(authFile, false /* visible */);
    const page = await context.newPage();

    console.log(`[DIAG] Navigating to ${TARGET_URL} ...`);
    await page.goto(TARGET_URL);

    // Wait for domcontentloaded
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});

    // Wait for network to settle
    console.log('[DIAG] Waiting for network idle...');
    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {
        console.log('[DIAG] network idle timeout, continuing...');
    });

    // Wait up to 30s for any of several candidate "list item" selectors to appear
    // We try broad patterns that might match any notebook list
    const candidateSelectors = [
        // Old FluentUI v8 grid style
        'div[role="row"]',
        'div[role="gridcell"]',
        // FluentUI v9 / new style 
        'div[role="listitem"]',
        'li[role="option"]',
        'li',
        // Generic patterns
        '[data-automationid]',
        '[aria-label]',
        // React virtualized list
        '[data-list-index]',
        '[data-item-index]',
        // Notebook name could be in a span, button, or anchor
        'button[aria-label]',
        'a[aria-label]',
    ];

    console.log('[DIAG] Waiting up to 30s for content...');
    for (const sel of candidateSelectors) {
        try {
            await page.waitForSelector(sel, { timeout: 3000 });
            console.log(`[DIAG] ✓ Selector found early: ${sel}`);
            break;
        } catch (_) {}
    }

    // Additional wait for SPA rendering
    await page.waitForTimeout(5000);

    // Dump full page HTML
    const html = await page.content();
    const dumpPath = path.join(DUMP_DIR, 'diag_page.html');
    await fs.writeFile(dumpPath, html);
    console.log(`[DIAG] Full page HTML dumped to: ${dumpPath}`);

    // Take a screenshot
    const screenshotPath = path.join(DUMP_DIR, 'diag_screenshot.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`[DIAG] Screenshot saved to: ${screenshotPath}`);

    // Try to extract candidate notebook names using various strategies
    const results = await page.evaluate((selectors) => {
        const report = {};

        for (const sel of selectors) {
            try {
                const els = Array.from(document.querySelectorAll(sel));
                if (els.length > 0) {
                    report[sel] = els.slice(0, 20).map(el => ({
                        tag: el.tagName,
                        role: el.getAttribute('role'),
                        text: el.innerText ? el.innerText.trim().slice(0, 100) : '',
                        id: el.id || '',
                        className: el.className ? el.className.slice(0, 80) : '',
                        dataAttrs: Object.fromEntries(
                            [...el.attributes]
                                .filter(a => a.name.startsWith('data-') || a.name === 'aria-label')
                                .map(a => [a.name, a.value.slice(0, 80)])
                        ),
                        outerHTML: el.outerHTML.slice(0, 300),
                    }));
                }
            } catch (e) {
                report[sel] = `ERROR: ${e.message}`;
            }
        }

        // Also try to find text that looks like notebook names from the screenshot
        const allText = document.body.innerText;
        report['_bodyTextSnippet'] = allText.slice(0, 2000);

        // Count roles present in doc
        const allRoles = [...new Set(
            Array.from(document.querySelectorAll('[role]')).map(e => e.getAttribute('role'))
        )];
        report['_rolesPresent'] = allRoles;

        return report;
    }, candidateSelectors);

    const reportPath = path.join(DUMP_DIR, 'diag_report.json');
    await fs.writeFile(reportPath, JSON.stringify(results, null, 2));
    console.log(`[DIAG] DOM analysis report: ${reportPath}`);

    // Print summary to console
    console.log('\n[DIAG] === ROLES PRESENT IN DOM ===');
    console.log(results['_rolesPresent'] || []);

    console.log('\n[DIAG] === BODY TEXT SNIPPET ===');
    console.log(results['_bodyTextSnippet'] || '(empty)');

    console.log('\n[DIAG] === SELECTORS THAT MATCHED ===');
    for (const [sel, val] of Object.entries(results)) {
        if (sel.startsWith('_')) continue;
        if (Array.isArray(val) && val.length > 0) {
            console.log(`\n  Selector: ${sel}  (${val.length} elements)`);
            val.slice(0, 3).forEach((el, i) => {
                console.log(`    [${i}] tag=${el.tag} text="${el.text.slice(0, 60)}" aria-label="${el.dataAttrs['aria-label'] || ''}" dataAttrs=${JSON.stringify(el.dataAttrs)}`);
            });
        }
    }

    await browser.close();
    console.log('\n[DIAG] Done!');
}

diagnose().catch(err => {
    console.error('[DIAG] Fatal error:', err);
    process.exit(1);
});
