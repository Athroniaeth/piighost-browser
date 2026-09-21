#!/bin/sh
# Copies the sources served to the browser from their single source.
# web/vendor/ is derived and never edited: the package is authoritative.
set -eu
cd "$(dirname "$0")"
rm -rf web/vendor
mkdir -p web/vendor
cp -r ../packages/ner-web/src web/vendor/ner-web
cp -r node_modules/@huggingface web/vendor/@huggingface
echo "web/vendor regenerated from packages/ner-web and node_modules"
