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

The command outputs a list of notebooks, each with a direct link:
```
Available Notebooks:
1. My Notebook 1 (https://onedrive.live.com/personal/xxxx/_layouts/15/Doc.aspx?sourcedoc={af4c31dd-e6b3-2073-80b1-6c0000000000}&action=edit&wdorigin=NavigationUrl)
2. My Notebook 2 (https://contoso-my.sharepoint.com/personal/john_contoso_eu/_layouts/15/Doc.aspx?sourcedoc={28b95c90-8a57-4422-ba14-e51b21b43bde}&action=edit&wdorigin=NavigationUrl)
```

The link is the same canonical form OneNote puts in the address bar, so it can be
passed straight to the export tool:

```bash
microsoft-onenote-export-notebook export --auth-file /path/to/auth.json \
  --notebook-link 'https://contoso-my.sharepoint.com/personal/john_contoso_eu/_layouts/15/Doc.aspx?sourcedoc={28b95c90-8a57-4422-ba14-e51b21b43bde}&action=edit&wdorigin=NavigationUrl'
```

Note the single quotes: the URL contains `{`, `}` and `&`, which a shell would
otherwise interpret.

### Where the links come from

OneNote does not put notebook links in the page. A notebook row is a
`<tr tabindex="0">` with no `href` and no `data-*` attribute — the app wires it up
as a click target and the URL lives in the MRU feed the page fetches from
`substrate.office.com` while it loads. This tool reads that feed and matches it back
to the scraped rows by title, then rebuilds each link in canonical form from the
site path and the `sourcedoc` GUID.

A notebook that is in the list but not in the feed is printed by name alone and
counted in a warning above the list.

Each notebook object contains:
- `name`: The display name of the notebook
- `url`: The canonical notebook URL, or `'click-to-open'` when no link could be
  resolved. The sentinel is never printed.
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
│   ├── index.js           # CLI entry point
│   ├── auth-context.js    # Auth context loader (no Electron code)
│   ├── list-notebooks.js  # Main listing logic
│   ├── config.js          # Configuration (paths, URLs)
│   ├── diagnose-new-page.js # Interactive page-diagnosis helper
│   └── utils/
│       ├── logger.js      # Logging utilities
│       ├── logPaths.js    # Log/dump directory resolution
│       └── notebooks.js   # Listing presentation (URL resolution, rendering)
├── test/                  # Jest tests (not published)
├── package.json
├── .npmignore
├── .gitignore
└── README.md
```

## License

MIT — see [LICENSE](LICENSE), and read [NOTICE.md](NOTICE.md).
