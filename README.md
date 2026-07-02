# microsoft-onenote-list-notebook-playwright

List Microsoft OneNote notebooks via Playwright — extracted from [MSOneNote Exporter](https://github.com/msout/Microsoft-OneNote-Exporter).

This is a standalone CLI tool for listing OneNote notebooks using Playwright with authentication state loaded from a JSON file.

## Installation

```bash
npm install -g @msout/microsoft-onenote-list-notebook-playwright
```

Or locally:

```bash
npm install @msout/microsoft-onenote-list-notebook-playwright
```

## Usage

### List Notebooks

```bash
onenote-list list --auth-file /path/to/auth.json [--notheadless] [--dodump]
```

## Options

| Option | Description |
|--------|-------------|
| `--auth-file <path>` | Path to authentication JSON file (required) |
| `--notheadless` | Run in visible browser mode (disable headless) |
| `--dodump` | Dump HTML content to files for debugging |

## Output

The command outputs a list of notebooks in the following format:
```
Available Notebooks:
1. My Notebook 1 (click-to-open)
2. My Notebook 2 (click-to-open)
```

Each notebook object contains:
- `name`: The display name of the notebook
- `url`: Set to 'click-to-open' (no direct URL available in SPA)
- `id`: The data-automationid attribute for potential precise targeting

## Authentication

Authentication state must be obtained separately using the `microsoft-webauth-playwright` module:

```bash
# First, authenticate
webauth login --email your@email.com --password yourpassword

# Then list notebooks
onenote-list list --auth-file /path/to/auth.json
```

## Project Structure

```
microsoft-onenote-list-notebook-playwright/
├── src/
│   ├── index.js         # CLI entry point
│   ├── auth-context.js  # Auth context loader (no Electron code)
│   ├── list-notebooks.js # Main listing logic
│   ├── config.js        # Configuration (paths, URLs)
│   └── utils/
│       └── logger.js    # Logging utilities
├── test/                # Jest tests
├── package.json
└── README.md
```

## License

ISC — same as MSOneNote Exporter.
