const os = require('os');
const fs = require('fs');
const path = require('path');

const LOG_ENV = 'ONENOTE_EXPORT_LOG_DIR';
const { resolveLogDir, resolveLogDirFor } = require('../src/utils/logPaths');

describe('log directory resolution', () => {
    let saved;

    beforeEach(() => {
        saved = process.env[LOG_ENV];
    });

    afterEach(() => {
        if (saved === undefined) delete process.env[LOG_ENV];
        else process.env[LOG_ENV] = saved;
    });

    it('honours ONENOTE_EXPORT_LOG_DIR above everything else', () => {
        process.env[LOG_ENV] = '/tmp/somewhere-else';
        expect(resolveLogDir()).toBe('/tmp/somewhere-else');
    });

    it('resolves a relative override to an absolute path', () => {
        process.env[LOG_ENV] = 'relative-logs';
        expect(path.isAbsolute(resolveLogDir())).toBe(true);
    });

    it('ignores a blank override', () => {
        process.env[LOG_ENV] = '   ';
        expect(resolveLogDir()).not.toContain('   ');
    });

    // The bug this fixes. Installed as a dependency - which is what
    // ms-onenote-exporter does - __dirname resolves inside node_modules, so the
    // old hardcoded `../logs` landed there: unreadable in a container running as
    // an unprivileged user, and wiped by the next reinstall besides.
    it('never writes inside node_modules, whatever the install layout', () => {
        for (const layout of [
            '/app/node_modules/@msout/microsoft-onenote-list-notebooks/src/utils',
            '/usr/lib/node_modules/@msout/microsoft-onenote-list-notebooks/src/utils',
            '/opt/homebrew/lib/node_modules/@msout/microsoft-onenote-list-notebooks/src/utils',
        ]) {
            delete process.env[LOG_ENV];
            const dir = resolveLogDirFor(layout);
            expect(dir).not.toContain('node_modules');
            expect(path.isAbsolute(dir)).toBe(true);
        }
    });

    it('uses the package logs dir for a plain checkout', () => {
        delete process.env[LOG_ENV];
        const dir = resolveLogDir();
        expect(
            dir.endsWith(path.join('microsoft-onenote-list-notebooks', 'logs')) || dir.endsWith('logs')
        ).toBe(true);
    });
});

describe('the logger actually writes there', () => {
    // The resolution logic above is only worth anything if the logger uses it.
    // This is the assertion that would have caught the original bug: a
    // hardcoded path in the logger, with a correct logPaths.js sitting unused
    // next to it.
    let tmp;
    let savedLogDir;

    beforeEach(() => {
        savedLogDir = process.env[LOG_ENV];
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'list-logdir-'));
        jest.resetModules();
        process.env[LOG_ENV] = tmp;
    });

    afterEach(() => {
        if (savedLogDir === undefined) delete process.env[LOG_ENV];
        else process.env[LOG_ENV] = savedLogDir;
        fs.rmSync(tmp, { recursive: true, force: true });
    });

    it('creates app.log inside the override, not inside the package', () => {
        const logger = require('../src/utils/logger');
        logger.info('a message worth keeping');
        expect(fs.existsSync(path.join(tmp, 'app.log'))).toBe(true);
        expect(fs.readFileSync(path.join(tmp, 'app.log'), 'utf8')).toContain('a message worth keeping');
    });

    it('keeps the log directory owner-only, because dumps hold account state', () => {
        const logger = require('../src/utils/logger');
        logger.info('hello');
        // Not every filesystem models POSIX modes; skip rather than fail a test
        // about permissions on a platform that has none.
        if (process.platform === 'win32') return;
        expect(fs.statSync(tmp).mode & 0o077).toBe(0);
    });
});

describe('config', () => {
    it('exports only ONENOTE_URL', () => {
        // USER_DATA_DIR was removed: it resolved to <package>/ and was read by
        // nothing in this repo. Asserting the shape keeps it from creeping back
        // in as another path that only makes sense for a checkout.
        expect(Object.keys(require('../src/config')).sort()).toEqual(['ONENOTE_URL']);
    });
});
