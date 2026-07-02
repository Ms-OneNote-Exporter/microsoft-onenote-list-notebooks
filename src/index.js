#!/usr/bin/env node
const { program } = require('commander');
const logger = require('./utils/logger');
const { listNotebooks } = require('./list-notebooks');

program
    .name('onenote-list')
    .description('List Microsoft OneNote notebooks via Playwright — extracted from MSOneNote Exporter')
    .version('1.0.0');

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
            notebooks.forEach((nb, index) => {
                logger.info(`${index + 1}. ${nb.name} (${nb.url})`);
            });
        } catch (e) {
            logger.error('Failed to list notebooks.', e);
        }
    });

program.parse();
