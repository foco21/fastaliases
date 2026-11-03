#!/bin/sh
# Builds the Chrome Web Store upload: only the files the extension needs, manifest.json at the zip's top level.
set -e
cd "$(dirname "$0")"
node test.js
version=$(node -p "require('./manifest.json').version")
mkdir -p dist
out="dist/aliases-for-fastmail-$version.zip"
rm -f "$out"
zip -r -X -q "$out" manifest.json background.js content.js lib.js popup.html popup.css popup.js options.html options.js ui.css LICENSE icons fonts
echo "Built $out"
unzip -l "$out" | tail -1
