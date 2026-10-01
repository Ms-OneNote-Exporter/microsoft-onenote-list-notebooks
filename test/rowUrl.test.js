const fs = require('fs');
const path = require('path');
const { PLACEHOLDER_URL, URL_DATA_ATTRIBUTES } = require('../src/utils/notebooks');

/**
 * Guards the in-page URL resolver.
 *
 * resolveRowUrlInPage is passed to page.evaluate by stringifying it, so it is
 * not reachable by require() and the existing list-notebooks tests cannot touch
 * it. That indirection is exactly where a bug would hide: a syntax error, a
 * closure over module scope, or a stray Node reference all survive every other
 * test and then fail inside a live browser, mid-listing, against a real
 * account. So the function is recovered from the source text here and driven
 * against a stub DOM.
 *
 * The extraction below is deliberately a parse of the real file rather than a
 * copy: a copy would test the copy.
 */
const SOURCE = fs.readFileSync(path.resolve(__dirname, '../src/list-notebooks.js'), 'utf8');

function loadInPageResolver() {
    const match = SOURCE.match(/function resolveRowUrlInPage[\s\S]*?\n\}/);
    if (!match) {
        throw new Error('resolveRowUrlInPage not found in src/list-notebooks.js');
    }
    // Same round-trip the scraper performs before handing the function to the page.
    return new Function(`return (${match[0]})`)();
}

const PAGE_URL = 'https://onenote.cloud.microsoft/notebooks';

/** Minimal stand-in for the attributes and descendants a row exposes. */
function makeRow({ attrs = {}, anchor = null, cell = null } = {}) {
    return {
        getAttribute: (name) => (name in attrs ? attrs[name] : null),
        querySelector: (sel) => {
            if (sel === 'a[href]') return anchor;
            if (sel === 'td') return cell;
            return null;
        }
    };
}

describe('in-page row URL resolver', () => {
    let resolveRowUrl;

    beforeAll(() => {
        resolveRowUrl = loadInPageResolver();
    });

    it('survives the serialisation the page.evaluate call performs', () => {
        // A closure over module scope, or a Node global, shows up here as a
        // throw or a ReferenceError rather than in a browser session.
        expect(typeof resolveRowUrl).toBe('function');
        expect(resolveRowUrl(makeRow(), PAGE_URL, PLACEHOLDER_URL, URL_DATA_ATTRIBUTES)).toBeNull();
    });

    it('takes the anchor href when the row has one', () => {
        const row = makeRow({
            anchor: { getAttribute: () => '/onenote/web/nb/42' }
        });
        expect(resolveRowUrl(row, PAGE_URL, PLACEHOLDER_URL, URL_DATA_ATTRIBUTES))
            .toBe('https://onenote.cloud.microsoft/onenote/web/nb/42');
    });

    it('reads a data attribute off the cell when there is no anchor', () => {
        const row = makeRow({
            cell: { getAttribute: (n) => (n === 'data-url' ? '/nb/7' : null) }
        });
        expect(resolveRowUrl(row, PAGE_URL, PLACEHOLDER_URL, URL_DATA_ATTRIBUTES))
            .toBe('https://onenote.cloud.microsoft/nb/7');
    });

    it('reads a data attribute off the row itself as a last resort', () => {
        const row = makeRow({ attrs: { 'data-sharepoint-url': 'https://contoso.sharepoint.com/x' } });
        expect(resolveRowUrl(row, PAGE_URL, PLACEHOLDER_URL, URL_DATA_ATTRIBUTES))
            .toBe('https://contoso.sharepoint.com/x');
    });

    it('returns null for a plain click-handler row, which is the common case', () => {
        // This is the shape the app has actually been producing: every logged
        // run in this repo's own app.log shows click-to-open for every row.
        expect(resolveRowUrl(makeRow(), PAGE_URL, PLACEHOLDER_URL, URL_DATA_ATTRIBUTES)).toBeNull();
    });

    it('ignores an anchor that carries a non-navigational href', () => {
        const row = makeRow({
            anchor: { getAttribute: () => 'javascript:void(0)' }
        });
        expect(resolveRowUrl(row, PAGE_URL, PLACEHOLDER_URL, URL_DATA_ATTRIBUTES)).toBeNull();
    });

    it('does not mistake the placeholder for a real link', () => {
        const row = makeRow({ attrs: { 'data-href': PLACEHOLDER_URL } });
        expect(resolveRowUrl(row, PAGE_URL, PLACEHOLDER_URL, URL_DATA_ATTRIBUTES)).toBeNull();
    });

    it('does not throw when the page URL cannot resolve a relative href', () => {
        const row = makeRow({ anchor: { getAttribute: () => '/nb/1' } });
        expect(resolveRowUrl(row, 'not-a-url', PLACEHOLDER_URL, URL_DATA_ATTRIBUTES)).toBeNull();
    });

    it('tries attributes in the order the shared constant defines', () => {
        // The order is the module's contract; the resolver must honour the list
        // it is handed rather than a private copy that can drift from it.
        const row = makeRow({
            attrs: {
                'data-link': '/second',
                'data-href': '/first'
            }
        });
        expect(resolveRowUrl(row, PAGE_URL, PLACEHOLDER_URL, URL_DATA_ATTRIBUTES))
            .toBe('https://onenote.cloud.microsoft/first');
    });
});
