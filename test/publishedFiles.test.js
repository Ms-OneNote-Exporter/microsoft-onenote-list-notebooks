const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/**
 * Guards the published tarball.
 *
 * npm publishes are permanent: once a version is on the registry its tarball can
 * be downloaded forever, and there is no good way to take it back. So the rule is
 * to check before publishing rather than to notice afterwards.
 *
 * This package uses an .npmignore rather than a `files` whitelist in
 * package.json, which is a weaker mechanism - a whitelist can only include what
 * is listed, whereas .npmignore has to exclude everything unwanted. That is why
 * the audit below reads the real tarball contents instead of reasoning about the
 * manifest: with .npmignore, the manifest is not a reliable description of what
 * ships.
 *
 * It caught a real leak. The .npmignore excluded five patterns, so the published
 * 0.0.5 tarball carried the test suite, the GitHub workflow, the Dockerfile,
 * docker-compose.yml and jest.config.js - twenty files where nine were needed.
 */
const ROOT = path.resolve(__dirname, '..');

/** The file list npm would actually publish, from npm itself rather than a guess. */
function publishedFiles() {
    const json = execFileSync('npm', ['pack', '--dry-run', '--json'], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
    });
    return JSON.parse(json)[0].files.map((f) => f.path);
}

/** Anything under these paths is development material. */
const FORBIDDEN_PATTERNS = [
    { re: /(^|\/)test(s)?\//, why: 'test suites' },
    { re: /^\.github\//, why: 'CI workflows' },
    { re: /^Dockerfile$/, why: 'the container build' },
    { re: /compose\.ya?ml$/, why: 'container orchestration' },
    { re: /^entrypoint\.sh$/, why: 'container entrypoints' },
    { re: /\.dockerignore$/, why: 'docker build config' },
    { re: /^jest\.config\.js$/, why: 'test config' },
    { re: /^eslint\.config\.js$/, why: 'lint config' },
    { re: /^coverage\//, why: 'coverage reports' },
    { re: /^logs?\//, why: 'runtime logs' },
    { re: /^output\//, why: 'export output' },
    { re: /dumps?/, why: 'HTML debug dumps' },
];

describe('published files', () => {
    const files = publishedFiles();

    it('resolves a plausible file list, so the checks below are not vacuous', () => {
        // Without this, an empty or broken npm pack would make every exclusion
        // below pass for the wrong reason.
        expect(files.length).toBeGreaterThan(5);
        expect(files).toContain('package.json');
        expect(files).toContain('src/list-notebooks.js');
        expect(files).toContain('src/index.js');
    });

    it.each(FORBIDDEN_PATTERNS)('publishes no $why', ({ re }) => {
        const leaked = files.filter((f) => re.test(f));
        expect({ leaked }).toEqual({ leaked: [] });
    });

    // The rule this package depends on at runtime: the umbrella imports the
    // library entry, which only resolves if the exports map is honoured.
    it('publishes the module the exports map points at', () => {
        const pkg = require('../package.json');
        for (const entry of Object.values(pkg.exports)) {
            if (typeof entry !== 'string') continue;
            expect({ entry, shipped: files.includes(entry.replace(/^\.\//, '')) })
                .toEqual({ entry, shipped: true });
        }
    });

    it('publishes the documents a consumer needs', () => {
        for (const doc of ['LICENSE', 'README.md', 'NOTICE.md']) {
            expect(files).toContain(doc);
        }
    });

    it('does not publish a bundled dependency spec, which could ship a secret', () => {
        // A file: or link: entry would pull local content into the tarball.
        for (const [name, spec] of Object.entries(require('../package.json').dependencies || {})) {
            expect({ name, spec }).not.toEqual({ name, spec: expect.stringMatching(/^(file|link|git\+)/) });
        }
    });
});

describe('.npmignore exists and is not a subset of the manifest', () => {
    // With .npmignore rather than a `files` whitelist, deleting or emptying this
    // file silently changes what ships - the manifest keeps looking correct, and
    // the test suite keeps passing while the tarball grows.
    it('is present and non-empty', () => {
        const path_ = path.join(ROOT, '.npmignore');
        expect(fs.existsSync(path_)).toBe(true);
        expect(fs.readFileSync(path_, 'utf8').trim().length).toBeGreaterThan(0);
    });

    it('excludes the test directory, which is the leak it was written for', () => {
        const ignore = fs.readFileSync(path.join(ROOT, '.npmignore'), 'utf8');
        expect(ignore).toMatch(/^test\/$/m);
    });

    it('excludes auth state under any name', () => {
        // A consumer can call their session file anything, so the pattern is
        // wider than the one filename in .gitignore.
        const ignore = fs.readFileSync(path.join(ROOT, '.npmignore'), 'utf8');
        expect(ignore).toMatch(/^\*auth\*json$/m);
    });
});
