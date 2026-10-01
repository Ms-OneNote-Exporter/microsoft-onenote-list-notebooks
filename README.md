# microsoft-onenote-list-notebooks

List Microsoft OneNote notebooks via Playwright — extracted from [MSOneNote Exporter](https://github.com/enoola/Microsoft-OneNote-Exporter).

This is a standalone CLI tool for listing OneNote notebooks using Playwright with authentication state loaded from a JSON file.

## Why this project ?

While this let you authenticate this is a part of a bigger purpose,
primary aim is to offer people a simple way to get out of Microsoft OneNote, because you regardless of what ms documentation states
=> https://learn.microsoft.com/en-us/answers/questions/2276682/onenote-api-fails-with-large-sharepoint-document-l

in essence you want to search for microsoft-onenote-list-notebook, microsoft-onenote-exporter


## Installation

```bash
npm install -g @msout/microsoft-onenote-list-notebooks
```

Or locally:

```bash
npm install @msout/microsoft-onenote-list-notebooks
```

## Usage

### List Notebooks

```bash
microsoft-onenote-list-notebooks list --auth-file /path/to/auth.json [--notheadless] [--dodump]
```

## Options

| Option | Description |
|--------|-------------|
| `--auth-file <path>` | Path to authentication JSON file (required) |
| `--notheadless` | Run in visible browser mode (disable headless) |
| `--dodump` | Dump HTML content to files for debugging |

## Output

The command outputs a list of notebooks, appending a link only for notebooks
where one could be resolved from the page:
```
Available Notebooks:
1. My Notebook 1
2. My Notebook 2 (https://onenote.cloud.microsoft/onenote/web/nb/2)
```

OneNote renders notebook rows as click targets rather than links, so a direct URL
is not always present. A notebook with no resolvable link is listed by name alone
and counted in a warning above the list; it has to be opened in the browser.

Each notebook object contains:
- `name`: The display name of the notebook
- `url`: The resolved absolute URL, or `'click-to-open'` when the row carried no
  usable link. The sentinel is never printed.
- `id`: The data-automationid attribute for potential precise targeting

## Authentication

Authentication state must be obtained separately using the `microsoft-webauth` module:

```bash
# First, authenticate (https://github.com/Ms-OneNote-Exporter/microsoft-webauth or https://www.npmjs.com/package/@msout/microsoft-webauth)
microsoft-webauth login --email your@email.com --password yourpassword

# Then list notebooks
microsoft-onenote-list-notebooks list --auth-file /path/to/auth.json
```

## Project Structure

```
microsoft-onenote-list-notebooks/
├── src/
│   ├── index.js         # CLI entry point
│   ├── auth-context.js  # Auth context loader (no Electron code)
│   ├── list-notebooks.js # Main listing logic
│   ├── config.js        # Configuration (paths, URLs)
│   └── utils/
│       ├── logger.js     # Logging utilities
│       ├── logPaths.js   # Log/dump directory resolution
│       └── notebooks.js  # Listing presentation (URL resolution, rendering)
├── test/                # Jest tests
├── package.json
|── .npmignore
|── .gitignore
└── README.md
```

## License

MIT — see [LICENSE](LICENSE), and read [NOTICE.md](NOTICE.md).
