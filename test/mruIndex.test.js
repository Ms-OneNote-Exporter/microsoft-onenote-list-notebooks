const {
    notebookKey,
    indexNotebookUrls,
    canonicalNotebookUrl,
    guidFromUrl,
    isUsableUrl
} = require('../src/utils/notebooks');

/**
 * Shapes taken from real substrate MRU responses, captured against both a
 * consumer and a business account. The consumer entry is verbatim; the
 * business entries are trimmed to the fields the index reads.
 */
const CONSUMER_PAYLOAD = {
    files: [
        {
            last_store_modified_datetime: '2026-09-29T18:43:31Z',
            id: 'SPO_MGU2YTA0ZGQtYmQwZS00ZDJlLWExOGQtNGE1NzcyMGMzZjdl...',
            mru_type: 'ClassicMru',
            mru_url: 'https://d.docs.live.net/B173E6B3AF4C31DD/Documents/Redmo',
            title: 'Redmo',
            type: 'OneNote',
            source: 'OneDriveForConsumer',
            url: 'https://d.docs.live.net/B173E6B3AF4C31DD/Documents/Redmo',
            web_url: 'https://onedrive.live.com/personal/b173e6b3af4c31dd/_layouts/15/doc.aspx?resid=af4c31dd-e6b3-2073-80b1-6c0000000000&cid=b173e6b3af4c31dd',
            sharepoint_info: {
                site_path: 'https://my.microsoftpersonalcontent.com/personal/b173e6b3af4c31dd',
                unique_id: 'af4c31dd-e6b3-2073-80b1-6c0000000000',
                site_id: '0e6a04dd-bd0e-4d2e-a18d-4a57720c3f7e',
                web_id: 'e38207d4-9fc2-4d3d-abef-e00917ad9bde',
                list_id: '33cf9042-4ec4-4e0a-a05f-12d9848138d4',
            },
            onedrive_info: { drive_id: 'B173E6B3AF4C31DD', item_id: 'B173E6B3AF4C31DD!108' },
        },
    ],
};

const BUSINESS_PAYLOAD = {
    files: [
        {
            title: 'NotebookLongSimple',
            source: 'OneDriveForBusiness',
            url: 'https://mobilutils-my.sharepoint.com/personal/john_mobilutils_eu/Documents/NotebookLongSimple',
            web_url: 'https://mobilutils-my.sharepoint.com/personal/john_mobilutils_eu/_layouts/15/Doc.aspx?sourcedoc=%7B28B95C90-8A57-4422-BA14-E51B21B43BDE%7D&file=NotebookLongSimple&action=edit&mobileredirect=true&wdorigin=Sharepoint',
            sharepoint_info: {
                site_path: 'https://mobilutils-my.sharepoint.com/personal/john_mobilutils_eu',
                unique_id: '28b95c90-8a57-4422-ba14-e51b21b43bde',
                site_id: '70688a95-7787-45ed-9df6-7a403987830c',
                web_id: '29a70613-b5c8-4655-ac72-56f44c1fcc07',
                list_id: 'b271d91e-d890-46af-8c91-014b38c52992',
            },
        },
        {
            title: 'Bloc-notes de MOBILUTILS',
            source: 'SharePoint',
            url: 'https://mobilutils.sharepoint.com/sites/MOBILUTILS/SiteAssets/Bloc-notes%20de%20MOBILUTILS',
            web_url: 'https://mobilutils.sharepoint.com/sites/MOBILUTILS/_layouts/15/Doc.aspx?sourcedoc=%7B33BDB4D1-AA1A-49F1-A6BA-7E76B14B249E%7D&file=Bloc-notes%20de%20MOBILUTILS&action=edit&mobileredirect=true&wdorigin=Sharepoint',
            sharepoint_info: {
                site_path: 'https://mobilutils.sharepoint.com/sites/MOBILUTILS',
                unique_id: '33bdb4d1-aa1a-49f1-a6ba-7e76b14b249e',
            },
        },
    ],
};

describe('canonicalNotebookUrl', () => {
    it('builds the pro-tenant form OneNote produces', () => {
        // Verified against a live business account: this exact URL opens the
        // editor and does not redirect away.
        const url = canonicalNotebookUrl({
            title: 'NotebookLongSimple',
            source: 'OneDriveForBusiness',
            url: 'https://mobilutils-my.sharepoint.com/personal/john_mobilutils_eu/Documents/NotebookLongSimple',
            web_url: 'https://mobilutils-my.sharepoint.com/personal/john_mobilutils_eu/_layouts/15/Doc.aspx?sourcedoc=%7B28B95C90-8A57-4422-BA14-E51B21B43BDE%7D&file=NotebookLongSimple&action=edit&mobileredirect=true&wdorigin=Sharepoint',
            sharepoint_info: {
                site_path: 'https://mobilutils-my.sharepoint.com/personal/john_mobilutils_eu',
                unique_id: '28b95c90-8a57-4422-ba14-e51b21b43bde',
            },
        });
        expect(url).toBe(
            'https://mobilutils-my.sharepoint.com/personal/john_mobilutils_eu/_layouts/15/Doc.aspx' +
            '?sourcedoc={28b95c90-8a57-4422-ba14-e51b21b43bde}&action=edit&wdorigin=NavigationUrl'
        );
    });

    it('builds the consumer form, rewriting the host to onedrive.live.com', () => {
        // A consumer site's site_path is my.microsoftpersonalcontent.com, which
        // works, but the canonical form lives on onedrive.live.com.
        const url = canonicalNotebookUrl(CONSUMER_PAYLOAD.files[0]);
        expect(url).toBe(
            'https://onedrive.live.com/personal/b173e6b3af4c31dd/_layouts/15/Doc.aspx' +
            '?sourcedoc={af4c31dd-e6b3-2073-80b1-6c0000000000}&action=edit&wdorigin=NavigationUrl'
        );
    });

    it('works for a SharePoint site document, not just a personal site', () => {
        const url = canonicalNotebookUrl(BUSINESS_PAYLOAD.files[1]);
        expect(url).toContain('https://mobilutils.sharepoint.com/sites/MOBILUTILS/_layouts/15/Doc.aspx');
        expect(url).toContain('sourcedoc={33bdb4d1-aa1a-49f1-a6ba-7e76b14b249e}');
    });

    it('falls back to the guid in web_url when sharepoint_info is absent', () => {
        const url = canonicalNotebookUrl({
            web_url: 'https://x-my.sharepoint.com/personal/u/_layouts/15/Doc.aspx?sourcedoc=%7BABC-123%7D&file=n&action=edit',
        });
        expect(url).toBe('https://x-my.sharepoint.com/personal/u/_layouts/15/Doc.aspx?sourcedoc={ABC-123}&action=edit&wdorigin=NavigationUrl');
    });

    it('falls back to resid, the consumer encoding', () => {
        const url = canonicalNotebookUrl({
            web_url: 'https://onedrive.live.com/personal/p/_layouts/15/doc.aspx?resid=ABC-456&cid=p',
        });
        expect(url).toBe('https://onedrive.live.com/personal/p/_layouts/15/Doc.aspx?sourcedoc={ABC-456}&action=edit&wdorigin=NavigationUrl');
    });

    it('omits wd=target, which deep-links a page rather than the notebook', () => {
        const url = canonicalNotebookUrl(BUSINESS_PAYLOAD.files[0]);
        expect(url).not.toContain('wd=target');
    });

    it('returns null when there is no guid to build from', () => {
        expect(canonicalNotebookUrl({ title: 'x' })).toBeNull();
        expect(canonicalNotebookUrl({ title: 'x', web_url: 'https://a.example/n' })).toBeNull();
        expect(canonicalNotebookUrl(null)).toBeNull();
    });
});

describe('guidFromUrl', () => {
    it('reads a percent-encoded sourcedoc', () => {
        expect(guidFromUrl('https://x.example/Doc.aspx?sourcedoc=%7BABC-1%7D&file=n'))
            .toBe('ABC-1');
    });

    it('reads a braced sourcedoc', () => {
        expect(guidFromUrl('https://x.example/Doc.aspx?sourcedoc={ABC-2}&action=edit'))
            .toBe('ABC-2');
    });

    it('reads resid', () => {
        expect(guidFromUrl('https://x.example/doc.aspx?resid=ABC-3&cid=z')).toBe('ABC-3');
    });

    it('returns null when there is no guid', () => {
        expect(guidFromUrl('https://x.example/Documents/Notebook')).toBeNull();
        expect(guidFromUrl('')).toBeNull();
        expect(guidFromUrl(null)).toBeNull();
    });
});

describe('notebookKey', () => {
    it('matches the index key and the lookup key', () => {
        // These two are built by different call sites; if they diverge, every
        // lookup silently misses and the listing falls back to names-only.
        expect(notebookKey('Redmo')).toBe(notebookKey('  Redmo  '));
        expect(notebookKey('John @ Work')).toBe(notebookKey('john  @   work'));
    });

    it('tolerates null and undefined', () => {
        expect(notebookKey(null)).toBe('');
        expect(notebookKey(undefined)).toBe('');
    });
});

describe('indexNotebookUrls', () => {
    it('indexes a consumer account notebook by title', () => {
        const index = indexNotebookUrls(CONSUMER_PAYLOAD);
        expect(index.get('redmo'))
            .toBe('https://onedrive.live.com/personal/b173e6b3af4c31dd/_layouts/15/Doc.aspx'
                + '?sourcedoc={af4c31dd-e6b3-2073-80b1-6c0000000000}&action=edit&wdorigin=NavigationUrl');
    });

    it('indexes business and SharePoint-hosted notebooks', () => {
        const index = indexNotebookUrls(BUSINESS_PAYLOAD);
        expect(index.size).toBe(2);
        expect(index.get('notebooklongsimple')).toMatch(/^https:\/\/mobilutils-my\.sharepoint\.com\//);
        expect(index.get('bloc-notes de mobilutils')).toMatch(/^https:\/\/mobilutils\.sharepoint\.com\//);
    });

    it('yields the canonical form, not the feed pre-navigation link', () => {
        // The feed's own links redirect on load; the canonical form does not,
        // and it is the one a user recognises from the address bar.
        const url = indexNotebookUrls(CONSUMER_PAYLOAD).get('redmo');
        expect(url).not.toBe(CONSUMER_PAYLOAD.files[0].url);
        expect(url).not.toBe(CONSUMER_PAYLOAD.files[0].web_url);
        expect(url).toContain('wdorigin=NavigationUrl');
    });

    it('falls back to url when web_url is missing', () => {
        const index = indexNotebookUrls({ files: [{ title: 'OnlyUrl', url: 'https://x.example/nb' }] });
        expect(index.get('onlyurl')).toBe('https://x.example/nb');
    });

    it('skips entries with no usable link rather than indexing a placeholder', () => {
        const index = indexNotebookUrls({
            files: [
                { title: 'NoLink' },
                { title: 'BadLink', url: 'javascript:void(0)' },
                { title: 'Placeholder', url: 'click-to-open' },
            ]
        });
        expect(index.size).toBe(0);
    });

    it('skips entries with no title', () => {
        const index = indexNotebookUrls({ files: [{ url: 'https://x.example/nb' }] });
        expect(index.size).toBe(0);
    });

    it('keeps the first entry when a title repeats', () => {
        // A consumer account can list the same notebook title from more than one
        // MRU feed; first-wins matches the order the listing itself shows.
        const index = indexNotebookUrls({
            files: [
                { title: 'Dup', url: 'https://first.example/nb' },
                { title: 'dup', url: 'https://second.example/nb' },
            ]
        });
        expect(index.size).toBe(1);
        expect(index.get('dup')).toBe('https://first.example/nb');
    });

    it('returns an empty index for a missing, empty or malformed payload', () => {
        for (const payload of [null, undefined, {}, { files: [] }, { files: null }]) {
            expect(indexNotebookUrls(payload).size).toBe(0);
        }
    });

    it('produces links that pass the usable-URL check', () => {
        // Anything the index yields is rendered by formatNotebookLine, so a bad
        // entry would surface as a broken link in the listing.
        for (const payload of [CONSUMER_PAYLOAD, BUSINESS_PAYLOAD]) {
            for (const url of indexNotebookUrls(payload).values()) {
                expect(isUsableUrl(url)).toBe(true);
            }
        }
    });
});
