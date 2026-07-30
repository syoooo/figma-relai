#!/usr/bin/env bash
# The plugin ships as a zip you import from the manifest, so the three files
# Figma actually reads have to travel together and stay in step with the build.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
version="$(node -p "require('$root/package.json').version")"
src="$root/packages/figma-plugin"
out="$root/dist-plugin"
stage="$out/relai-plugin"

for f in code.js manifest.json ui.html; do
  [ -f "$src/$f" ] || { echo "missing $src/$f — run the build first"; exit 1; }
done

# The panel carries the version in its footer; if that disagrees with
# package.json the zip is stale, and a stale zip is worse than none.
if ! grep -q "Relai v$version" "$src/ui.html"; then
  echo "ui.html does not say v$version — rebuild before packaging"; exit 1
fi

rm -rf "$out"
mkdir -p "$stage"
cp "$src/code.js" "$src/manifest.json" "$src/ui.html" "$stage/"
(cd "$out" && zip -qr "relai-plugin-$version.zip" relai-plugin)
rm -rf "$stage"

echo "dist-plugin/relai-plugin-$version.zip"
ls -lh "$out/relai-plugin-$version.zip" | awk '{print "  " $5}'
