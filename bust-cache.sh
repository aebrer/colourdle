#!/bin/sh
# Replace ?v=... cache-busting params in HTML files with current timestamp.
# Run before committing deploy changes.

stamp=$(date +%s)

for f in docs/index.html docs/about.html; do
  [ -f "$f" ] && sed -i "s/\?v=[^\"']*/\?v=$stamp/g" "$f"
done

echo "Cache-busted with v=$stamp"
