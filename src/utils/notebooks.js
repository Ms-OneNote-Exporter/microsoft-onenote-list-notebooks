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

/**
 * Builds a title -> URL index from the Office substrate MRU payload.
 *
 * The OneNote web app does not put notebook links in the DOM. A row is a
 * `<tr tabindex="0">` with no `href` and no `data-*` attribute; the app renders
 * it as a click target and the URL lives in the MRU feed the page fetches from
 * substrate.office.com. So the link is read off the wire and matched back to the
 * scraped rows by title.
 *
 * Matching is on the normalised title because the payload and the DOM can
 * differ in surrounding whitespace and case. A title that appears twice keeps
 * its first entry, which matches the order the listing itself shows.
 *
 * The URL is rebuilt in canonical form via canonicalNotebookUrl, falling back to
 * the feed's own links when an entry is too thin to rebuild from. The canonical
 * form is preferred because it is the one OneNote itself produces and the one
 * that stays put in the address bar rather than redirecting.
 *
 * @param {{files?: Array<Object>}} payload - Parsed MRU response
 * @returns {Map<string, string>} Lowercased title -> absolute notebook URL
 */
function indexNotebookUrls(payload) {
    const index = new Map();
    const files = (payload && payload.files) || [];

    for (const file of files) {
        const title = typeof (file && file.title) === 'string' ? file.title : null;
        if (!title) continue;

        const key = notebookKey(title);
        if (!key || index.has(key)) continue;

        const url = canonicalNotebookUrl(file) ||
            normalizeUrl(file.web_url) ||
            normalizeUrl(file.url);
        if (url) {
            index.set(key, url);
        }
    }

    return index;
}

/**
 * Normalises a notebook title for matching.
 *
 * Shared with indexNotebookUrls so the index key and the lookup key are built
 * the same way; a divergence here would silently match nothing.
 *
 * @param {string} title - Notebook title
 * @returns {string} Normalised key
 */
function notebookKey(title) {
    return String(title == null ? '' : title).replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Host used for consumer OneNote notebooks.
 *
 * A consumer account's site_path is on my.microsoftpersonalcontent.com, which
 * works, but the canonical form that OneNote itself produces - and that people
 * copy out of the address bar - is on onedrive.live.com. Same site, different
 * host alias, so this is a rewrite rather than a different target.
 *
 * @type {string}
 */
const CONSUMER_HOST_REWRITES = [
    [/^https?:\/\/[^/]*\.microsoftpersonalcontent\.com/i, 'https://onedrive.live.com']
];

/**
 * Builds the canonical SharePoint URL for a notebook.
 *
 * OneNote hands out this form when you click through to a notebook:
 *
 *     .../\_layouts/15/Doc.aspx?sourcedoc={GUID}&action=edit&wdorigin=NavigationUrl
 *
 * The MRU feed's own `url` and `web_url` are the pre-navigation forms
 * (`resid=` on consumer, `file=...&mobileredirect=true&wdorigin=Sharepoint` on
 * business). They open the right notebook but are not the shape a user would
 * recognise, and they redirect on load. Rebuilding from the site path and the
 * `sourcedoc` GUID produces the canonical form directly, which also means the
 * printed link survives being pasted into the sibling exporter's
 * `--notebook-link` and stays put in the address bar.
 *
 * `wd=target(...)`, which OneNote adds to deep-link a specific page inside the
 * notebook, is deliberately not reproduced: the feed carries no page id, and a
 * link to the notebook itself is what `--notebook-link` means.
 *
 * @param {Object} file - One entry from the MRU feed
 * @returns {string|null} Canonical URL, or null if the entry lacks the fields
 */
function canonicalNotebookUrl(file) {
    if (!file) {
        return null;
    }

    // The GUID is sharepoint_info.unique_id on both account types. The feed's
    // own links are the fallback, since some older entries omit it.
    const guid = (file.sharepoint_info && file.sharepoint_info.unique_id) ||
        guidFromUrl(file.web_url) || guidFromUrl(file.url);
    if (!guid) {
        return null;
    }

    const base = siteBase(file);
    if (!base) {
        return null;
    }

    return `${base}/_layouts/15/Doc.aspx?sourcedoc={${guid}}&action=edit&wdorigin=NavigationUrl`;
}

/**
 * Extracts a notebook GUID from a feed URL.
 *
 * Handles both encodings: `sourcedoc=%7BGUID%7D` on business accounts and
 * `resid=GUID` on consumer ones.
 *
 * @param {string} url - A feed URL
 * @returns {string|null} The GUID, or null
 */
function guidFromUrl(url) {
    const match = String(url || '').match(/[?&](?:sourcedoc|resid)=(?:%7B|\{)?([^&}%]+)/i);
    return match ? match[1] : null;
}

/**
 * Resolves the site root a notebook lives under.
 *
 * Taken from web_url where possible, because that already carries the right host
 * for the account type; sharepoint_info.site_path is the fallback.
 *
 * @param {Object} file - One entry from the MRU feed
 * @returns {string|null} Site root without a trailing slash, or null
 */
function siteBase(file) {
    const fromWebUrl = String((file && file.web_url) || '').split('/_layouts/')[0];
    let base = normalizeUrl(fromWebUrl) || normalizeUrl(file && file.sharepoint_info && file.sharepoint_info.site_path);

    if (!base) {
        return null;
    }

    for (const [pattern, replacement] of CONSUMER_HOST_REWRITES) {
        base = base.replace(pattern, replacement);
    }

    return base.replace(/\/+$/, '');
}

module.exports = {
    PLACEHOLDER_URL,
    URL_DATA_ATTRIBUTES,
    isUsableUrl,
    normalizeUrl,
    notebookKey,
    indexNotebookUrls,
    canonicalNotebookUrl,
    guidFromUrl,
    formatNotebookLine
};
