#!/bin/sh
# Entrypoint script for the OneNote notebook listing CLI tool in Docker

set -e

# If no arguments provided, show help
if [ $# -eq 0 ]; then
    echo "Usage: microsoft-onenote-list-notebooks <command> [options]"
    echo ""
    echo "Commands:"
    echo "  list    List available OneNote notebooks"
    echo ""
    echo "Options:"
    echo "  --auth-file <path>   Path to authentication JSON file (required for 'list' command)"
    echo "  --notheadless        Run in visible browser mode"
    echo "  --dodump             Dump HTML content to files for debugging"
    echo ""
    echo "Example:"
    echo "  docker run -v /path/to/auth.json:/auth.json <image> list --auth-file /auth.json"
    exit 0
fi

# Allow shell access for debugging
if [ "$1" = "/bin/sh" ] || [ "$1" = "sh" ]; then
    exec "$@"
fi

# Allow node access for debugging
if [ "$1" = "node" ]; then
    exec node "$@"
fi

# Execute the provided command
exec node /app/src/index.js "$@"
