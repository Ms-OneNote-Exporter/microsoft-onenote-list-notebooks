/**
 * @fileoverview Logger utility for the OneNote notebook listing CLI tool.
 * @author phptr,enoola,msout
 * @copyright 2026 phptr,enoola,msout
 */
const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');
const { resolveLogDir } = require('./logPaths');

/**
 * What this logger's own paths are rewritten to before a line leaves for a sink.
 *
 * Defence in depth, with the basis stated: today no `logger.*` call in this
 * package emits a path — `getDumpDisplayPath()` is the only one that can, and it
 * fires under `options.dodump`, which the CLI never sets. The redaction is here so
 * that a future line which does name the log root cannot ship a home directory
 * or an install path to a caller that is broadcasting it to a browser.
 */
const REDACTED_LOG_DIR = '<log-dir>';
const REDACTED_DUMP_DIR = '<log-dir>/dumps';
const REDACTED_DUMP_SUB_DIR = '<dump-dir>';

class Logger {
    constructor() {
        this.months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        this.logDir = resolveLogDir();
        this.logFilePath = path.join(this.logDir, 'app.log');
        this._sink = null;
        
         // Initialize dump directory name once per execution
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');

         // Format: YYYY-MM-DD_HHhMM
        this.dumpSubDir = `${yyyy}-${mm}-${dd}_${hh}h${min}`;

         // Ensure logs directory exists. Restricted permissions because the
        // dump files written next to app.log contain the authenticated DOM of a
        // real Microsoft account: cookies, tenant hostnames and notebook names.
        this._ensurePrivateDir(this.logDir);
        this._tightenExistingLogFile();
    }

    /**
     * Creates `dir` and forces it to owner-only.
     *
     * fs.ensureDirSync honours the process umask, so on a permissive umask the
     * dumps would end up world-readable. chmod makes it explicit rather than
     * dependent on the environment.
     *
     * @param {string} dir - Directory to create
     */
    _ensurePrivateDir(dir) {
        fs.ensureDirSync(dir);
        try {
            fs.chmodSync(dir, 0o700);
        } catch (e) {
            // A filesystem that does not support chmod is not a reason to fail
            // a listing; the log is a diagnostic aid, not the product.
        }
    }

    /**
     * Brings an existing app.log down to owner-only.
     *
     * Files this process creates are 0600 from the start, but a log written by
     * an earlier version - which had no `mode` at all - is still 0644, and
     * appendFileSync's `mode` only applies at creation. One chmod at startup is
     * enough to close that off.
     */
    _tightenExistingLogFile() {
        try {
            const stats = fs.statSync(this.logFilePath);
            if ((stats.mode & 0o077) !== 0) {
                fs.chmodSync(this.logFilePath, 0o600);
            }
        } catch (e) {
            // No log file yet, or chmod unsupported: not fatal.
        }
    }

    _getTimestamp() {
        const now = new Date();
        const month = this.months[now.getMonth()];
        const day = String(now.getDate()).padStart(2, '0');
        const time = now.toTimeString().split(' ')[0];
        return `[${month} ${day} ${time}]`;
    }

    /**
     * Returns the absolute path to the current session's dump directory.
     * Ensures the directory exists, owner-only.
     * @returns {Promise<string>}
     */
    async getDumpDir() {
        const dumpDir = path.join(this.logDir, 'dumps', this.dumpSubDir);
        fs.ensureDirSync(dumpDir);
        try {
            fs.chmodSync(dumpDir, 0o700);
        } catch (e) {
            // See _ensurePrivateDir: not fatal.
        }
        return dumpDir;
    }

    /**
     * Returns a user-friendly relative path for logging.
     *
     * Relative to the cwd rather than a hardcoded `logs/dumps/...`, because the
     * log directory is no longer always <package>/logs: an installed copy writes
     * to the XDG state dir, and ms-onenote-exporter points every step at one
     * shared directory. A fixed string would name a path that does not exist.
     * @returns {string}
     */
    getDumpDisplayPath() {
        return path.relative(process.cwd(), path.join(this.logDir, 'dumps', this.dumpSubDir)) || '.';
    }

    _stripColors(str) {
         // eslint-disable-next-line no-control-regex
        return str.replace(/\u001b\[[0-9;]*m/g, '');
    }

    _formatMessage(level, message, colorFunc = (m) => m) {
        const timestamp = this._getTimestamp();
        const coloredTimestamp = chalk.gray(timestamp);
        const levelTag = `[${level}]`;
        const coloredLevelTag = colorFunc(levelTag);

         // Handle multi-line messages
        let formattedMessage = '';
        if (typeof message === 'string' && message.includes('\n')) {
            formattedMessage = message.split('\n').map(line => `${coloredTimestamp} ${coloredLevelTag} ${line}`).join('\n');
        } else if (typeof message !== 'string') {
             // Handle objects/errors
            try {
                const stringified = JSON.stringify(message, null, 2);
                formattedMessage = `${coloredTimestamp} ${coloredLevelTag} ${stringified}`;
            } catch (e) {
                formattedMessage = `${coloredTimestamp} ${coloredLevelTag} [Complex Object]`;
            }
        } else {
            formattedMessage = `${coloredTimestamp} ${coloredLevelTag} ${message}`;
        }

         // Write to log file (no colors)
        const plainTimestamp = timestamp;
        const plainLevelTag = levelTag;
        let plainMessage = '';

        if (typeof message === 'string' && message.includes('\n')) {
            plainMessage = message.split('\n').map(line => `${plainTimestamp} ${plainLevelTag} ${line}`).join('\n');
        } else if (typeof message !== 'string') {
            try {
                const stringified = JSON.stringify(message, null, 2);
                plainMessage = `${plainTimestamp} ${plainLevelTag} ${stringified}`;
            } catch (e) {
                plainMessage = `${plainTimestamp} ${plainLevelTag} [Complex Object]`;
            }
        } else {
            plainMessage = `${plainTimestamp} ${plainLevelTag} ${message}`;
        }

         // Append to log file. `mode` only applies at creation, so an app.log
        // written by an earlier version stays 0644; _tightenExistingLogFile
        // brings that down to owner-only on the next run.
        fs.appendFileSync(this.logFilePath, plainMessage + '\n', { mode: 0o600 });

         // Notify the sink *after* the append and before the return, so a sink
        // that throws cannot cost this the app.log line. It is handed the raw
        // `message`, never `formattedMessage`: that one carries a chalk-coloured
        // timestamp, and a consumer broadcasting the line has its own clock.
        // `logger.error`'s error-stack branch deliberately does not come through
        // here - it writes to the file directly - so a stack never reaches a sink.
        this._toSink(level, message);

        return formattedMessage;
    }

    /**
     * Registers a sink for every emitted line, as `({level, message})`.
     *
     * **This is how `listNotebooks`' `listing-log` event gets its lines.** The
     * listing logs from a dozen places - the browser launch, the two load waits,
     * the five-attempt scrape loop, the MCAS interstitial, the OneDrive fallback -
     * and threading an emitter through each of them would be a wide change that
     * rots the first time someone adds a `logger.info` and forgets. Tapping the
     * logger is one hook.
     *
     * The sink lives on a module singleton, so it has to be explicitly removed:
     * `setSink(null)` is what `listNotebooks`' `finally` calls, and without it a
     * sink left behind would forward *this* run's lines to whatever observer ran
     * next.
     *
     * @param {((entry: {level: string, message: unknown}) => void)|null} sink
     */
    setSink(sink) {
        this._sink = typeof sink === 'function' ? sink : null;
    }

    /**
     * This logger's own paths, longest first.
     *
     * Both *forms* of the dump path are listed, not just the absolute one, because
     * a line carries whichever the caller had: `getDumpDisplayPath()` hands out a
     * path relative to the cwd, so redacting only `this.logDir` would leave the
     * dump subdir - a run's date and time - sitting in the middle of it. The bare
     * subdir is listed last, which catches any rendering of it the two paths above
     * do not cover.
     *
     * Longest first throughout, because each of these *contains* the next: in any
     * other order the shorter rewrite would already have mangled the longer string
     * and its own rule would never match.
     *
     * `getDumpDisplayPath()` returns `'.'` when the dump dir is the cwd, and
     * replacing that would blank out every full stop in the line - so an empty or
     * `.` path is not a secret and is skipped.
     *
     * @returns {Array<[string, string]>} [value, placeholder] pairs
     */
    _ownPaths() {
        const candidates = [
            [path.join(this.logDir, 'dumps', this.dumpSubDir), REDACTED_DUMP_DIR],
            [this.getDumpDisplayPath(), REDACTED_DUMP_DIR],
            [this.logDir, REDACTED_LOG_DIR],
            [this.dumpSubDir, REDACTED_DUMP_SUB_DIR]
        ];
        return candidates.filter(([value]) => value && value !== '.');
    }

    /** Rewrites this logger's own paths out of a line bound for a sink. */
    _redactOwnPaths(message) {
        if (typeof message !== 'string') {
            return message;
        }
        let redacted = message;
        for (const [value, placeholder] of this._ownPaths()) {
            if (value) {
                redacted = redacted.split(value).join(placeholder);
            }
        }
        return redacted;
    }

    /**
     * Forwards one message to the sink, if there is one.
     *
     * A sink that throws is swallowed. It is an observer, and an observer's bug
     * must never cost someone the listing it is watching - and the line has
     * already been appended to app.log by the time this runs.
     */
    _toSink(level, message) {
        if (!this._sink) return;
        try {
            this._sink({ level, message: this._redactOwnPaths(message) });
        } catch (e) {
            // process.stderr, not this logger: reporting a sink failure through
            // the logger whose sink just failed is a re-entrant loop.
            process.stderr.write(
                `[WARN] log sink threw; ignoring. ${e && e.message ? e.message : e}\n`
            );
        }
    }

    /** Generic log method for programmatic use */
    log(level, message) {
        const lv = (level || 'info').toLowerCase();
        if (this[lv] && typeof this[lv] === 'function') {
            this[lv](message);
        } else {
            this.info(message);
        }
    }

    info(message) {
        process.stdout.write(this._formatMessage('INFO', message, chalk.blue) + '\n');
    }

    warn(message) {
        process.stdout.write(this._formatMessage('WARN', message, chalk.yellow) + '\n');
    }

    error(message, error = null) {
        process.stderr.write(this._formatMessage('ERROR', message, chalk.red) + '\n');
        if (error) {
            if (error.stack) {
                const stack = chalk.red(error.stack);
                process.stderr.write(stack + '\n');
                 // Also write stack to file
                fs.appendFileSync(this.logFilePath, this._stripColors(stack) + '\n');
            } else {
                process.stderr.write(this._formatMessage('ERROR', error, chalk.red) + '\n');
            }
        }
    }

    success(message) {
        process.stdout.write(this._formatMessage('SUCCESS', message, chalk.green) + '\n');
    }

    debug(message) {
        process.stdout.write(this._formatMessage('DEBUG', message, chalk.gray) + '\n');
    }

    step(message) {
        process.stdout.write(this._formatMessage('STEP', message, chalk.magenta) + '\n');
    }
}

module.exports = new Logger();
