# homework

A Claude Code skill that completes a pasted school assignment end-to-end: reads
the assignment, resolves any linked videos/readings, writes the actual work,
runs the prose through the `humanizer` skill, then verifies the result against
[zerogpt.com](https://www.zerogpt.com/)'s AI detector and re-humanizes until the
score is comfortably low — before ever showing it to you.

See [SKILL.md](SKILL.md) for the full step-by-step behavior.

## Setup

The ZeroGPT check drives a real headless browser. One-time setup:

```bash
bash scripts/setup.sh
```

This installs the `playwright` npm package and its Chromium headless-shell
binary into `scripts/node_modules` and `~/Library/Caches/ms-playwright`
respectively. It's idempotent — safe to run again, it skips work already done.

If `npx playwright install` hangs (seen in some sandboxed/proxied
environments even though plain `curl` to the same URL works fine),
`setup.sh` falls back to downloading the browser archive directly with curl
and dropping it where playwright expects it (macOS only for now).

## Manual check

```bash
node scripts/zerogpt_check.js path/to/text.txt /tmp/zerogpt_screens
```

Prints JSON with the AI-detection percentage per chunk (text over 15,000
characters — ZeroGPT's per-submission limit — is split on paragraph
boundaries) and a screenshot of each result, for visual fallback if the
site's layout ever changes and the regex stops matching.

## Requires

- Node.js
- This skill's own [scripts/](scripts) dependencies (`bash scripts/setup.sh`)
- The [humanizer](https://github.com/blader/humanizer) skill installed alongside it
