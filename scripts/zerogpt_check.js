#!/usr/bin/env node
// Checks text for AI-detection score via zerogpt.com using a headless browser.
//
// Usage: node zerogpt_check.js <text-file> [screenshot-dir]
//
// Prints one JSON object to stdout:
//   {
//     "overallPercent": 12,
//     "chunks": [
//       { "index": 0, "percent": 12, "verdict": "...", "screenshot": "/path/chunk0.png" }
//     ]
//   }
// or, on failure: { "error": "..." }
//
// zerogpt.com caps a single submission at 15,000 characters, so longer text
// is split on paragraph boundaries into chunks under that limit and checked
// one at a time. overallPercent is the highest chunk score (the figure that
// matters for "is any part of this going to get flagged").

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const CHAR_LIMIT = 15000;
const RESULT_WAIT_MS = 25000;
const POLL_INTERVAL_MS = 500;

function splitIntoChunks(text, limit) {
  if (text.length <= limit) return [text];
  const paragraphs = text.split(/\n\s*\n/);
  const chunks = [];
  let current = '';
  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;
    if (candidate.length > limit && current) {
      chunks.push(current);
      current = para;
    } else {
      current = candidate;
    }
    // A single paragraph longer than the limit: hard-split it.
    while (current.length > limit) {
      chunks.push(current.slice(0, limit));
      current = current.slice(limit);
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function checkChunk(page, text, screenshotPath) {
  await page.goto('https://www.zerogpt.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#textArea', { timeout: 15000 });
  await page.fill('#textArea', text);
  await page.click('button.scoreButton');

  const deadline = Date.now() + RESULT_WAIT_MS;
  let bodyText = '';
  let match = null;
  while (Date.now() < deadline) {
    bodyText = await page.evaluate(() => document.body.innerText);
    match = bodyText.match(/Your Text is ([^\n]*)\n+\s*(\d{1,3}(?:\.\d+)?)%\s*\n\s*AI GPT/);
    if (match) break;
    await page.waitForTimeout(POLL_INTERVAL_MS);
  }

  if (screenshotPath) {
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  }

  if (!match) {
    return { percent: null, verdict: null, screenshot: screenshotPath || null, error: 'Could not read a result from zerogpt.com — check the screenshot.' };
  }
  return { percent: Number(match[2]), verdict: match[1].trim(), screenshot: screenshotPath || null };
}

async function main() {
  const [, , textFile, screenshotDir] = process.argv;
  if (!textFile) {
    console.log(JSON.stringify({ error: 'Usage: node zerogpt_check.js <text-file> [screenshot-dir]' }));
    process.exit(1);
  }
  const text = fs.readFileSync(textFile, 'utf8');
  const chunks = splitIntoChunks(text, CHAR_LIMIT);
  const outDir = screenshotDir || require('os').tmpdir();
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch();
  const results = [];
  try {
    const page = await browser.newPage();
    for (let i = 0; i < chunks.length; i++) {
      const screenshotPath = path.join(outDir, `zerogpt_chunk${i}.png`);
      const result = await checkChunk(page, chunks[i], screenshotPath);
      results.push({ index: i, ...result });
    }
  } finally {
    await browser.close();
  }

  const numericPercents = results.map(r => r.percent).filter(p => typeof p === 'number');
  const overallPercent = numericPercents.length ? Math.max(...numericPercents) : null;

  console.log(JSON.stringify({ overallPercent, chunks: results }, null, 2));
}

main().catch(err => {
  console.log(JSON.stringify({ error: err.message }));
  process.exit(1);
});
