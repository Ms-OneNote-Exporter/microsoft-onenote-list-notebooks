const logger = require('../src/utils/logger');
const { LIST_EVENT_TYPES, createListingObserver, makeEmitter } = require('../src/list-observer');
const { listNotebooks } = require('../src/list-notebooks');

/**
 * A listing is 5-40s of near silence from a caller's point of view. These tests
 * pin the channel that makes it not-silent - the logger tap - and, more
 * importantly, pin the ways that channel can go wrong: a leaked sink on the
 * module singleton, an observer throw that turns into a re-entrancy cascade, and
 * a path escaping into a stream that is heading for a browser.
 */

/** A path shaped like a real session file: the directory is the sensitive part. */
const AUTH_FILE = '/data/sessions/2f9c1a44-0b7e-4d21-9f6a-session/auth.json';

describe('list-observer', () => {
    let stdout;
    let stderr;

    beforeEach(() => {
        // The listing writes to both streams; keep the test output readable.
        stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
        stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
        jest.restoreAllMocks();
        // The logger is a module singleton: a test that leaks a sink would hand
        // its lines to every test after it.
        logger.setSink(null);
    });

    /** Runs a listing that fails before the browser is born, collecting events. */
    async function collectFromFailedListing(options = {}) {
        const events = [];
        await expect(listNotebooks({
            authFile: '/nonexistent/auth.json',
            onEvent: (event) => events.push(event),
            ...options
        })).rejects.toThrow(/Authentication file not found/);
        return events;
    }

    describe('a throwing observer', () => {
        it('is swallowed, and does not re-enter the tapped logger channel', () => {
            let sinkCalls = 0;
            let observerCalls = 0;

            // The sink `createListingObserver` installs, wired by hand so the
            // invocation count is observable.
            const emit = makeEmitter(() => {
                observerCalls += 1;
                throw new Error('the viewer is broken');
            });
            logger.setSink(({ level, message }) => {
                sinkCalls += 1;
                emit('listing-log', { line: String(message), level });
            });

            logger.info('one line');

            // One sink call, one observer call. If the catch reported through the
            // logger - the channel this sink is reading - a throw would recurse
            // sink -> emit -> throw -> logger.warn -> sink -> ... until the stack
            // gave out, and this would blow up rather than count 1.
            expect({ sinkCalls, observerCalls }).toEqual({ sinkCalls: 1, observerCalls: 1 });
            expect(stderr).toHaveBeenCalled();
            expect(String(stderr.mock.calls[0][0])).toMatch(/observer threw/);
        });

        it('still lets the listing finish its log line', () => {
            createListingObserver({ onEvent: () => { throw new Error('nope'); } });
            expect(() => logger.info('the log line survives')).not.toThrow();
        });
    });

    describe('the event set', () => {
        it('is exactly the one log type', () => {
            expect(LIST_EVENT_TYPES).toEqual(['listing-log']);
            expect(Object.isFrozen(LIST_EVENT_TYPES)).toBe(true);
        });

        it('emits nothing outside it during a listing', async () => {
            const events = await collectFromFailedListing();

            expect(events.length).toBeGreaterThan(0);
            for (const event of events) {
                expect(LIST_EVENT_TYPES).toContain(event.type);
            }
        });

        it('emits no terminal - the caller composes those', async () => {
            // A listing that ends is the caller's to describe. A terminal from
            // here would arrive before the caller's own, and the second, richer
            // one is the one acted on.
            const terminals = /done|failed|listed|complete|finished|started|error/i;
            expect(LIST_EVENT_TYPES.filter((type) => terminals.test(type))).toEqual([]);

            const events = await collectFromFailedListing();
            expect(events.length).toBeGreaterThan(0);
            expect(events.every((e) => e.type === 'listing-log')).toBe(true);
        });
    });

    describe('an absent observer', () => {
        it('is a no-op, not a crash', async () => {
            expect(() => makeEmitter(undefined)('listing-log', {})).not.toThrow();

            const { emit, detach } = createListingObserver({});
            expect(() => emit('listing-log', { line: 'nobody is listening', level: 'INFO' }))
                .not.toThrow();
            expect(() => logger.info('still logged')).not.toThrow();
            expect(() => detach()).not.toThrow();
        });

        it('leaves a listing without onEvent behaving as it always did', async () => {
            await expect(listNotebooks({ authFile: '/nonexistent/auth.json' }))
                .rejects
                .toThrow(/Authentication file not found/);
        });
    });

    describe('redaction', () => {
        it('removes the auth file path, and its directory, from an emitted line', () => {
            const events = [];
            const { detach } = createListingObserver({
                onEvent: (event) => events.push(event),
                authFile: AUTH_FILE
            });

            try {
                // The shape of the line a future logger call would produce if it
                // ever echoed the session file.
                logger.warn(`Could not read ${AUTH_FILE}`);
                logger.warn(`Session directory ${require('path').dirname(AUTH_FILE)} is empty`);

                expect(events).toHaveLength(2);
                for (const event of events) {
                    expect(event.line).not.toContain('2f9c1a44');
                    expect(event.line).not.toContain(AUTH_FILE);
                    expect(event.line).not.toContain('/data/sessions');
                }
                expect(events[0].line).toContain('<auth-file>');
                expect(events[1].line).toContain('<auth-dir>');
            } finally {
                detach();
            }
        });

        it("removes the logger's own paths from an emitted line", () => {
            const events = [];
            const { detach } = createListingObserver({
                onEvent: (event) => events.push(event),
                authFile: AUTH_FILE
            });

            try {
                // The one line in this package that can name a path today, and it
                // only fires under options.dodump - which the runner never sets.
                logger.warn(`Dumping main page content to ${logger.getDumpDisplayPath()}/debug_page_dump.html...`);
                logger.warn(`Log root is ${logger.logDir}`);

                expect(events).toHaveLength(2);
                for (const event of events) {
                    expect(event.line).not.toContain(logger.logDir);
                    expect(event.line).not.toContain(logger.dumpSubDir);
                    expect(event.line).not.toContain('node_modules');
                }
                expect(events[0].line).toContain('<log-dir>');
            } finally {
                detach();
            }
        });

        it('carries the raw line, with the logger level and no timestamp', async () => {
            const events = await collectFromFailedListing();

            const connecting = events.find((e) => e.line.includes('Connecting to OneNote'));
            expect(connecting).toBeDefined();
            expect(connecting.level).toBe('INFO');
            expect(connecting.line).toBe('Connecting to OneNote...');
             // The chalk-coloured timestamp belongs to the console, not the frame:
            // an SSE consumer has its own clock and cannot strip escape codes.
            expect(connecting.line).not.toMatch(/\u001b\[/);
            expect(connecting.line).not.toMatch(/^\[\w{3} \d{2} \d{2}:\d{2}:\d{2}\]/);
        });
    });

    describe('detach', () => {
        it('holds when the auth file is missing - the case that would leak', async () => {
            // The browser is created before the inner try/finally that closes it,
            // and a missing auth file throws before there is a browser at all. If
            // the detach lived in that inner block, the sink would stay attached
            // to the module singleton and keep firing for the next listing.
            const events = [];
            await collectFromFailedListing({ onEvent: (event) => events.push(event) });
            const before = events.length;

            logger.info('after the listing');

            expect(events).toHaveLength(before);
        });

        it('stops the sink after a normal completion too', async () => {
            const events = [];
            const { detach } = createListingObserver({
                onEvent: (event) => events.push(event),
                authFile: AUTH_FILE
            });

            logger.info('while attached');
            detach();
            logger.info('after detach');

            expect(events.map((e) => e.line)).toEqual(['while attached']);
        });
    });
});
