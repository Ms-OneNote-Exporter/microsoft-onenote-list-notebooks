/**
 * @fileoverview Progress events for a notebook listing, and the logger tap behind them.
 * @author phptr,enoola,msout
 * @copyright 2026 phptr,enoola,msout
 */
const path = require('path');
const logger = require('./utils/logger');

/**
 * Every event `listNotebooks()` can emit, as a frozen list.
 *
 *     listing-log { line, level }
 *
 * **One type, not a taxonomy.** A listing has no counts and no determinable
 * totals - there is no "3 of 12 notebooks" to report, because the list is only
 * known once the page has finished loading - so the honest vocabulary is the line
 * stream itself. `level` travels with the line because a viewer needs to tell a
 * WARN ("Network idle timeout - continuing anyway...") from routine INFO.
 *
 * **There is deliberately no terminal here.** `notebooks-listed` /
 * `notebooks-failed` are composed by the caller out of `listNotebooks()`'s return
 * value and its rejection. A terminal emitted from in here would arrive *before*
 * the caller's own, and the second, richer one is the one a viewer acts on.
 * A test pins both halves of that.
 *
 * @type {readonly string[]}
 */
const LIST_EVENT_TYPES = Object.freeze(['listing-log']);

/** What the auth file path is rewritten to before a line is emitted. */
const REDACTED_AUTH_FILE = '<auth-file>';

/** What the auth file's directory is rewritten to before a line is emitted. */
const REDACTED_AUTH_DIR = '<auth-dir>';

/**
 * Wraps the caller's observer so a throwing or absent one cannot break a listing.
 *
 * The observer is watching, not participating: a bug in it must never cost
 * someone the notebook list they are waiting on.
 *
 * **The catch writes to `process.stderr` and not to this package's logger.**
 * That is a deliberate difference from the export package's equivalent wrapper,
 * which reports through the very logger feeding the sink. Here the two are the
 * same channel, so `logger.warn` in that catch would make a throwing observer
 * into a cascade - sink -> emit -> throw -> logger.warn -> sink -> emit -> throw
 * -> ... - that ends in a RangeError escaping the catch and killing the listing.
 * The bug is not copied. A test pins it.
 *
 * @param {Function} [onEvent] - the caller's `options.onEvent`
 * @returns {(type: string, payload: Object) => void}
 */
function makeEmitter(onEvent) {
    if (typeof onEvent !== 'function') return () => {};
    return (type, payload) => {
        try {
            onEvent({ type, ...payload });
        } catch (error) {
            process.stderr.write(
                `[WARN] onEvent observer threw for "${type}"; continuing. ${error && error.message ? error.message : error}\n`
            );
        }
    };
}

/**
 * The strings that must not survive into an emitted line, longest first.
 *
 * Defence in depth, with the basis stated: the auth file path appears today only
 * in the thrown `Authentication file not found: ...` message, which never reaches
 * a `logger.*` call. Both it and its directory are redacted anyway, so that a
 * future log line naming the session file cannot put a session GUID on a stream
 * heading for a browser.
 *
 * `path.dirname` returns `'.'` for a bare filename, and replacing that would
 * blank out every full stop in the line - so a directory that carries no
 * information is not redacted at all.
 *
 * @param {string} [authFile] - `options.authFile`
 * @returns {Array<[string, string]>} [value, placeholder] pairs
 */
function authSecrets(authFile) {
    if (typeof authFile !== 'string' || authFile.trim() === '') return [];

    const secrets = [[authFile, REDACTED_AUTH_FILE]];
    const dir = path.dirname(authFile);
    if (dir && dir !== '.' && dir !== authFile) {
        secrets.push([dir, REDACTED_AUTH_DIR]);
    }
    return secrets;
}

/** Applies `secrets` to one line, as a plain string. */
function redactLine(line, secrets) {
    const text = typeof line === 'string' ? line : String(line);
    let redacted = text;
    for (const [value, placeholder] of secrets) {
        redacted = redacted.split(value).join(placeholder);
    }
    return redacted;
}

/**
 * Builds the observer for one listing.
 *
 * Exists so `listNotebooks` does not grow, and so the wiring sits next to the
 * vocabulary it emits rather than inside the orchestration.
 *
 * The logger is a module singleton, so the sink is attached here and cleared by
 * the caller's `finally` via `detach()`. A sink that outlived the run would send
 * *this* run's lines to whatever observer ran next - and, worse, keep them
 * flowing into an observer whose caller has already gone away.
 *
 * @param {object} [options]
 * @param {Function} [options.onEvent] - the caller's observer
 * @param {string} [options.authFile] - path whose text is redacted from lines
 * @returns {{emit: Function, detach: Function}}
 */
function createListingObserver({ onEvent, authFile } = {}) {
    const secrets = authSecrets(authFile);
    const raw = makeEmitter(onEvent);

    const emitter = (type, payload) => raw(type, {
        ...payload,
        ...(payload && 'line' in payload ? { line: redactLine(payload.line, secrets) } : {})
    });

    // The raw `message` is passed straight through: it is already the undecorated
    // line. The logger has redacted its own paths by the time it arrives here,
    // and the auth file is redacted above, so what leaves is a line with no
    // timestamp, no colour escapes and no path that means anything to a viewer.
    logger.setSink(({ level, message }) => emitter('listing-log', { line: message, level }));

    return {
        emit: emitter,
        detach: () => logger.setSink(null)
    };
}

module.exports = {
    LIST_EVENT_TYPES,
    createListingObserver,
    makeEmitter
};
