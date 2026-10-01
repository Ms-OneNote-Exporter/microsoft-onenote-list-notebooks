#!/usr/bin/env node
/**
 * @fileoverview Main entry point for the OneNote notebook listing CLI tool.
 * @author phptr,enoola,msout
 * @copyright 2026 phptr,enoola,msout
 */

const { program } = require('commander');
const logger = require('./utils/logger');
const { listNotebooks } = require('./list-notebooks');
const { formatNotebookLine, isUsableUrl } = require('./utils/notebooks');

program
    .name('onenote-list')
    .description('List Microsoft OneNote notebooks via Playwright — extracted from MSOneNote Exporter')
    // Single source of truth: a hardcoded version drifts from package.json and
    // makes `--version` report a release that does not exist. It did - it said
    // 1.0.0 while the published version was 0.0.5.
    .version(require('../package.json').version);

program
    .command('list')
    .description('List available OneNote notebooks')
    .requiredOption('--auth-file <path>', 'Path to authentication JSON file (auth.json)')
    .option('--notheadless', 'Run in visible browser mode for debugging')
    .option('--dodump', 'Dump HTML content to files for debugging')
    .action(async (options) => {
        try {
            const notebooks = await listNotebooks(options);
            logger.step('\nAvailable Notebooks:');
            if (notebooks.length === 0) {
                logger.warn('No notebook have been found.');
                logger.warn('Remember: you can export a notebook by using the export command with the --notebook-link <url> option.');
            }
            const linked = notebooks.filter(nb => isUsableUrl(nb.url)).length;
            if (notebooks.length > 0 && linked < notebooks.length) {
                logger.warn(`${notebooks.length - linked} of ${notebooks.length} notebooks have no direct link and must be opened in the browser.`);
            }
            notebooks.forEach((nb, index) => {
                logger.info(formatNotebookLine(nb, index));
            });
        } catch (e) {
            logger.error('Failed to list notebooks.', e);
            // The exit code is set rather than the process ended, so anything
            // already written or flushed still gets out. Without this the CLI
            // reported success on a hard failure: `list --auth-file
            // /nonexistent.json` printed the error and exited 0, which in a
            // container or a CI step is a failed listing that looks like a
            // passing one. microsoft-onenote-export-notebook has always exited
            // non-zero here; this brings the two into line.
            process.exitCode = 1;
        }
    });

program.parse();
