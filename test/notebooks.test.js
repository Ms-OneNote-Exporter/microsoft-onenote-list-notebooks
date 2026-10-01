const {
    PLACEHOLDER_URL,
    isUsableUrl,
    normalizeUrl,
    formatNotebookLine
} = require('../src/utils/notebooks');

describe('Notebook presentation', () => {
    describe('isUsableUrl', () => {
        it('rejects the click-to-open placeholder', () => {
            expect(isUsableUrl(PLACEHOLDER_URL)).toBe(false);
        });

        it('rejects empty and non-string values', () => {
            expect(isUsableUrl('')).toBe(false);
            expect(isUsableUrl('   ')).toBe(false);
            expect(isUsableUrl(null)).toBe(false);
            expect(isUsableUrl(undefined)).toBe(false);
            expect(isUsableUrl(42)).toBe(false);
        });

        it('rejects non-navigational schemes', () => {
            expect(isUsableUrl('javascript:void(0)')).toBe(false);
            expect(isUsableUrl('mailto:someone@example.com')).toBe(false);
            expect(isUsableUrl('#section')).toBe(false);
        });

        it('accepts absolute http(s) URLs', () => {
            expect(isUsableUrl('https://onenote.cloud.microsoft/notebooks')).toBe(true);
            expect(isUsableUrl('http://example.com/nb')).toBe(true);
        });
    });

    describe('normalizeUrl', () => {
        it('passes through absolute URLs unchanged', () => {
            const url = 'https://onenote.cloud.microsoft/onenote/web/nb/1';
            expect(normalizeUrl(url, 'https://example.com/')).toBe(url);
        });

        it('resolves root-relative paths against the page URL', () => {
            expect(normalizeUrl('/onenote/web/nb/1', 'https://onenote.cloud.microsoft/notebooks'))
                .toBe('https://onenote.cloud.microsoft/onenote/web/nb/1');
        });

        it('resolves bare relative paths against the page URL', () => {
            expect(normalizeUrl('nb/1', 'https://onenote.cloud.microsoft/notebooks'))
                .toBe('https://onenote.cloud.microsoft/nb/1');
        });

        it('returns null for a relative path with no base URL', () => {
            expect(normalizeUrl('/onenote/web/nb/1')).toBeNull();
        });

        it('returns null rather than passing a half-resolved path through', () => {
            // Printing an unresolvable path next to a notebook name would read
            // as a working link, which is the confusion issue #4 reports.
            expect(normalizeUrl('/nb/1', 'not-a-valid-url')).toBeNull();
        });

        it('returns null for the placeholder', () => {
            expect(normalizeUrl(PLACEHOLDER_URL, 'https://example.com/')).toBeNull();
        });
    });

    describe('formatNotebookLine', () => {
        // The exact scenario from issue #4.
        it('does not append the placeholder to a notebook name', () => {
            expect(formatNotebookLine({ name: 'Redmo', url: PLACEHOLDER_URL }, 0))
                .toBe('1. Redmo');
        });

        it('prints the name alone when no url was resolved', () => {
            expect(formatNotebookLine({ name: 'Redmo' }, 0)).toBe('1. Redmo');
            expect(formatNotebookLine({ name: 'Redmo', url: null }, 0)).toBe('1. Redmo');
        });

        it('appends a resolved absolute url', () => {
            expect(formatNotebookLine(
                { name: 'Redmo', url: 'https://onenote.cloud.microsoft/onenote/web/nb/1' },
                0
            )).toBe('1. Redmo (https://onenote.cloud.microsoft/onenote/web/nb/1)');
        });

        it('renders the sample listing from issue #4 as expected', () => {
            const notebooks = [
                { name: 'Redmo', url: PLACEHOLDER_URL },
                { name: 'Personal Notebook', url: 'https://onenote.cloud.microsoft/onenote/web/nb/7' }
            ];
            expect(notebooks.map((nb, i) => formatNotebookLine(nb, i)))
                .toEqual([
                    '1. Redmo',
                    '2. Personal Notebook (https://onenote.cloud.microsoft/onenote/web/nb/7)'
                ]);
        });

        it('numbers entries from one', () => {
            expect(formatNotebookLine({ name: 'Third' }, 2)).toBe('3. Third');
        });

        it('never emits the placeholder, whatever the input', () => {
            const cases = [
                { name: 'A', url: PLACEHOLDER_URL },
                { name: 'B', url: '' },
                { name: 'C' },
                { name: 'D', url: 'javascript:void(0)' }
            ];
            for (const nb of cases) {
                expect(formatNotebookLine(nb, 0)).not.toContain('click-to-open');
            }
        });
    });
});
