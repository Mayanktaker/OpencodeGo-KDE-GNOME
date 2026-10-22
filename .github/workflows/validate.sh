#!/usr/bin/env bash
# © Mayanktaker Computers & Web Development | https://mayanktaker.com
# Validates QML brace balance and JS syntax

set -euo pipefail

echo "Checking api.js syntax..."
node --check contents/code/api.js

echo "Running KDE api checks..."
node tools/kde-api-test.mjs

echo "Checking version sync..."
bash tools/version.sh check

echo "Checking QML brace balance..."
FAIL=0
for f in $(find contents/ui -name '*.qml'); do
  DEPTH=$(python3 -c "
import re, sys
src = open(sys.argv[1]).read()
d = 0
for line in src.split(chr(10)):
    s = re.sub(r'//.*', '', line)
    s = re.sub(r'\"' + r'(?:\\\\.|[^\"' + r'\\\\])*\"', '\"\"', s)
    d += s.count('{') - s.count('}')
print(d)
" "$f")
  if [ "$DEPTH" != "0" ]; then
    echo "FAIL: $f has unbalanced braces (depth=$DEPTH)"
    FAIL=1
  fi
done
if [ "$FAIL" = "1" ]; then exit 1; fi
echo "All QML files OK"
