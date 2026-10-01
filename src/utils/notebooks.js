/**
 * @fileoverview Presentation helpers for notebook listings.
 *
 * These are deliberately free of any Playwright or DOM dependency so they can
 * be unit tested under Jest's `node` test environment.
 *
 * @author phptr,enoola,msout
 * @copyright 2026 phptr,enoola,msout
 */

/**
 * The sentinel the scraper used to emit when it had no real link for a row.
 *
 * It is not a URL and was never resolvable, so it must never reach the
 * rendered output. See issue #4.
 *
 * @type {string}
 */
const PLACEHOLDER_URL = 'click-to-open';

/**
 * Data attributes Microsoft has used to carry a notebook link.
 *
 * OneNote's web app has moved between the classic table and the OneDrive-backed
 * list more than once and which attribute holds the link has changed with it, so
 * the scraper tries them in order of how explicit they are. This list is passed
 * into the page by the caller, so it has exactly one owner.
 *
 * A miss is the expected case, not a bug: the app wires notebook rows up as
 * click handlers, so a real href often does not exist to be found.
 *
 * @type {string[]}
 */
const URL_DATA_ATTRIBUTES = [
    'data-href',
    'data-url',
    'data-web-url',
    'data-itemurl',
    'data-sharepoint-url',
    'data-onenote-url',
    'data-link'
];

/**
 * Tests whether a scraped value is worth showing as a notebook link.
 *
 * Rejects empty values, the placeholder sentinel, and the non-navigational
 * schemes that OneDrive rows use for menu affordances.
 *
 * @param {*} value - Candidate URL, possibly null or undefined
 * @returns {boolean}
 */
function isUsableUrl(value) {
    if (typeof value !== 'string') {
        return false;
    }

    const trimmed = value.trim();
    if (trimmed === '' || trimmed === PLACEHOLDER_URL) {
        return false;
    }

    return !/^(?:javascript:|mailto:|tel:|about:|#)/i.test(trimmed);
}

/**
 * Turns a scraped href into an absolute URL when it can be resolved.
 *
 * OneNote rows use root-relative links (`/onenote/...`) and occasionally bare
 * paths, so a relative value is resolved against the page it was scraped from.
 * A value that cannot be resolved is returned as null rather than passed
 * through, because a half-resolved path printed next to a notebook name reads
 * as a working link and is not one.
 *
 * @param {*} value - Candidate URL, possibly relative
 * @param {string} [baseUrl] - Page URL the value was scraped from
 * @returns {string|null} Absolute URL, or null if none could be resolved
 */
function normalizeUrl(value, baseUrl) {
    if (!isUsableUrl(value)) {
        return null;
    }

    const candidate = value.trim();

    if (/^https?:\/\//i.test(candidate)) {
        return candidate;
    }

    if (!baseUrl) {
        return null;
    }

    let base;
    try {
        base = new URL(baseUrl);
    } catch (e) {
        return null;
    }

    try {
        return new URL(candidate, base).href;
    } catch (e) {
        return null;
    }
}

/**
 * Renders a single line of notebook output.
 *
 * The URL is appended only when one was actually resolved, which is what
 * issue #4 asks for: the old renderer appended `nb.url` unconditionally, so
 * rows whose link could not be scraped were printed as `Redmo (click-to-open)`.
 * A row with no real link now prints as just `Redmo`.
 *
 * @param {{name: string, url?: string}} notebook - Notebook to render
 * @param {number} index - Zero-based position in the listing
 * @returns {string} The formatted line
 */
function formatNotebookLine(notebook, index) {
    const url = normalizeUrl(notebook && notebook.url);
    const suffix = url ? ` (${url})` : '';
    return `${index + 1}. ${notebook.name}${suffix}`;
}

module.exports = {
    PLACEHOLDER_URL,
    URL_DATA_ATTRIBUTES,
    isUsableUrl,
    normalizeUrl,
    formatNotebookLine
};
