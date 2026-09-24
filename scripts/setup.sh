#!/usr/bin/env bash
# One-time setup for the ZeroGPT check: installs the playwright package and
# its Chromium headless-shell browser binary. Safe to re-run; it skips work
# that's already done.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d node_modules/playwright ]; then
  npm install --no-audit --no-fund
fi

CACHE_DIR="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/Library/Caches/ms-playwright}"
if [ "$(uname -s)" != "Darwin" ]; then
  CACHE_DIR="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
fi

# Revision-aware: the shared browser cache may hold shells from other Playwright
# installs (1228/1234), while this package pins its own revision — a blind glob
# here once skipped the install and every check failed at launch.
EXPECTED_REV=""
if [ -d node_modules/playwright-core ]; then
  EXPECTED_REV="$(node -e "const b=require('./node_modules/playwright-core/browsers.json').browsers.find(x=>x.name==='chromium-headless-shell'); console.log(b?b.revision:'')" 2>/dev/null || true)"
fi

if [ -n "$EXPECTED_REV" ] && [ -f "$CACHE_DIR/chromium_headless_shell-$EXPECTED_REV/INSTALLATION_COMPLETE" ]; then
  echo "Chromium headless shell $EXPECTED_REV already installed."
  exit 0
fi
if [ -z "$EXPECTED_REV" ] && compgen -G "$CACHE_DIR"/chromium_headless_shell-*/INSTALLATION_COMPLETE > /dev/null 2>&1; then
  echo "Chromium headless shell already installed."
  exit 0
fi

echo "Installing Chromium headless shell r${EXPECTED_REV:-?} via playwright..."
if npx playwright install chromium-headless-shell 2>&1; then
  echo "Done."
  exit 0
fi

# Fallback for macOS: playwright's own downloader can hang in sandboxed/
# proxied environments even when plain curl to the same URL works fine.
# Download the same artifact directly and drop it where playwright expects it.
if [ "$(uname -s)" = "Darwin" ]; then
  echo "playwright install hung or failed; falling back to a direct download..."
  ARCH="$(uname -m)"
  case "$ARCH" in
    arm64) PLATFORM="mac-arm64" ;;
    x86_64) PLATFORM="mac-x64" ;;
    *) echo "Unsupported architecture: $ARCH. Install manually with: npx playwright install chromium-headless-shell" >&2; exit 1 ;;
  esac

  REVISION="1243"
  BROWSER_VERSION="$(node -e "console.log(require('./node_modules/playwright-core/browsers.json').browsers.find(b=>b.name==='chromium-headless-shell').browserVersion)")"
  URL="https://cdn.playwright.dev/builds/cft/${BROWSER_VERSION}/${PLATFORM}/chrome-headless-shell-${PLATFORM}.zip"
  TARGET="$CACHE_DIR/chromium_headless_shell-${REVISION}"

  mkdir -p "$TARGET"
  TMP_ZIP="$(mktemp -t zerogpt-shell).zip"
  curl -fsSL --max-time 120 -o "$TMP_ZIP" "$URL"
  unzip -q -o "$TMP_ZIP" -d "$TARGET"
  rm -f "$TMP_ZIP"
  touch "$TARGET/INSTALLATION_COMPLETE"
  chmod +x "$TARGET/chrome-headless-shell-${PLATFORM}/chrome-headless-shell"
  xattr -cr "$TARGET" 2>/dev/null || true
  echo "Installed via direct download."
  exit 0
fi

echo "Could not install the browser automatically. Run manually:" >&2
echo "  npx playwright install chromium-headless-shell" >&2
exit 1
