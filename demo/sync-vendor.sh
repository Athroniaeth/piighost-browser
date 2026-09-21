#!/bin/sh
# Recopie les sources servies au navigateur depuis leur source unique.
# web/vendor/ est dérivé, jamais édité : le paquet fait foi.
set -eu
cd "$(dirname "$0")"
rm -rf web/vendor
mkdir -p web/vendor
cp -r ../packages/ner-web/src web/vendor/ner-web
cp -r node_modules/@huggingface web/vendor/@huggingface
echo "web/vendor régénéré depuis packages/ner-web et node_modules"
