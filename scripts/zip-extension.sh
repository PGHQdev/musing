#!/bin/bash

# Zip extension for Chrome Web Store submission
# Usage: ./scripts/zip-extension.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
EXTENSION_DIR="$PROJECT_DIR/extension"
OUTPUT_DIR="$PROJECT_DIR/dist"

# Get version from manifest.json (require() also validates the JSON parses)
VERSION=$(cd "$PROJECT_DIR" && node -p "require('./extension/manifest.json').version")

# Verify every file referenced by the manifest exists before packaging
cd "$PROJECT_DIR" && node -e '
const fs = require("fs");
const m = require("./extension/manifest.json");
const refs = [
  ...Object.values(m.icons || {}),
  ...Object.values(m.action?.default_icon || {}),
  m.action?.default_popup,
  m.background?.service_worker,
  m.chrome_url_overrides?.newtab,
  ...(m.content_scripts || []).flatMap(cs => cs.js || []),
  ...(m.web_accessible_resources || []).flatMap(w => w.resources || []),
].filter(Boolean);
const missing = refs.filter(f => !fs.existsSync("extension/" + f));
if (missing.length) {
  console.error("Missing files referenced by manifest.json:", missing.join(", "));
  process.exit(1);
}'

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Output filename
OUTPUT_FILE="$OUTPUT_DIR/musing-v${VERSION}.zip"

# Refuse to overwrite a previously packaged artifact for the same version
if [ -e "$OUTPUT_FILE" ]; then
  echo "Error: $OUTPUT_FILE already exists. Bump the version in extension/manifest.json or delete the file first." >&2
  exit 1
fi

# Create zip, excluding unnecessary files
cd "$EXTENSION_DIR"
zip -r "$OUTPUT_FILE" . \
  -x "*.DS_Store" \
  -x "*/.DS_Store" \
  -x "*.map" \
  -x "*.log" \
  -x ".git/*" \
  -x "node_modules/*" \
  -x "*.zip" \
  -x "*~" \
  -x "*.swp" \
  -x "icons/icon.png" \
  -x "*.md"

echo ""
echo "Extension packaged successfully!"
echo "Output: $OUTPUT_FILE"
echo "Version: $VERSION"
echo ""

# Show zip contents and size
echo "Contents:"
unzip -l "$OUTPUT_FILE"
echo ""
echo "Size: $(du -h "$OUTPUT_FILE" | cut -f1)"
