---
name: homework
description: |
  Complete a pasted school assignment end-to-end. Use when the user pastes assignment
  text and wants it done. Asks which class it's for if not stated, reads the full
  assignment for context, watches/reads any linked videos, and fetches and cites any
  linked webpages (via WebFetch, falling back to a Playwright browser session for
  JS-heavy pages). Runs the written answer through the humanizer skill, then verifies
  it against zerogpt.com's AI detector and re-humanizes until the score is low before
  delivering. Delivers the completed work as plain chat text, never an Artifact.
---

# Homework / assignment completion

## Step 1 — Get the class

If the user's message doesn't say what class/course the assignment is for, use
AskUserQuestion to ask before doing anything else — don't start reading the
assignment or fetching links first. If the class is already stated, skip straight
to Step 2.

## Step 2 — Read the assignment

Read the full pasted assignment text closely: the actual task(s), format expected
(essay, short answer, problem set, worksheet, etc.), length/scope constraints,
grading criteria or rubric if included, and due date if mentioned. Note anything
ambiguous, but don't stall on it — make the reasonable call and proceed unless a
genuine judgment call belongs to the user (e.g. picking a topic they'd have an
opinion on, or a prompt with two contradictory readings).

## Step 3 — Resolve every link in the assignment

Check the assignment text for links before writing anything, and resolve each one:

**Video links (YouTube, Vimeo, lecture capture, etc.)**
1. Try WebFetch on the video URL first — page metadata, description, and (for some
   hosts) an auto-generated transcript may be enough.
2. If that's thin, WebSearch for a transcript of the specific video (e.g.
   `<title> transcript`) rather than guessing at content.
3. If neither yields real content, fall back to Playwright (see below) to load the
   page and pull whatever transcript/caption panel or description is rendered
   client-side.
4. Never fabricate what a video says. If you truly can't extract its content, tell
   the user which video you couldn't access and what you'd need (e.g. them pasting
   the transcript).

**Webpage links (readings, source material, articles)**
1. Try WebFetch first.
2. If the page is a SPA / renders empty or clearly incomplete via WebFetch (common
   with JS-heavy sites, paywalled previews, or infinite-scroll pages), fall back to
   Playwright: run a short Node script via Bash (`npx playwright`) that launches a
   headless browser, navigates to the URL, waits for content to render, and extracts
   the text you need. Playwright is available in this environment (`npx playwright`
   works without extra setup).
3. Track which specific facts/quotes came from which source so you can cite them
   properly in Step 4 — don't blend sourced material in without attribution.

Only reach for Playwright when WebFetch genuinely isn't enough — it's slower, so
don't use it as the default for a plain static article.

## Step 4 — Do the actual assignment

Produce the real completed work product — the essay, the worked problem set with
shown work, the worksheet answers, the analysis — not a plan or an outline of what
you'd do. Cite any source pulled from Step 3 in whatever citation style the
assignment specifies; if none is specified, use a plain inline citation (source name
+ link) rather than inventing a formal style.

## Step 5 — Humanize the written answer

Run the prose you produced in Step 4 through the `humanizer` skill (embedded mode:
take only the final rewritten text back, not its explanation of what it changed).
Skip this step for pure computation (a problem set that's all worked math, a code
assignment) where there's no prose to humanize — go straight to Step 6 with
whatever written explanation text does exist, or straight to Step 7 if there's none.

## Step 6 — Verify the AI-detection score and re-humanize until it's low

Check the humanized text against zerogpt.com before delivering it, and keep
correcting until the score is comfortably low:

1. Write the current draft to a temp file (use your scratchpad directory).
2. Run:
   ```
   bash <homework-skill-dir>/scripts/setup.sh   # first run only, installs playwright + browser — cheap no-op after that
   node <homework-skill-dir>/scripts/zerogpt_check.js <text-file> <scratchpad>/zerogpt_screens
   ```
   This drives a headless browser against zerogpt.com's detector and returns JSON:
   `{"overallPercent": N, "chunks": [...]}`. Text over 15,000 characters is
   automatically split into chunks and checked separately — `overallPercent` is the
   worst chunk, which is the number that matters (any one flagged section is a
   problem even if the rest is clean).
3. If a chunk's `percent` comes back `null` (site layout changed, or a captcha), Read
   that chunk's `screenshot` PNG directly and read the percentage off the page
   visually instead of giving up.
4. **Decide:**
   - `overallPercent <= 5`: good, proceed to Step 7.
   - `overallPercent > 15`: re-run the humanizer skill on the flagged text — a chunk
     that shows highlighted sentences in its screenshot, so look at that image and
     concentrate the rewrite on those specific sentences rather than starting over —
     then go back to step 2 and recheck.
   - `5 < overallPercent <= 15`: same re-humanize-and-recheck loop, since the target
     is comfortably under 5, not just under whatever triggered the first check.
5. Cap it at **4 check attempts total**. If it's still above 5% after the 4th, stop
   looping — deliver the best version you got to (Step 7) and tell the user the
   final ZeroGPT score honestly instead of silently claiming it passed.

Never claim a lower score than what the tool actually returned.

## Step 7 — Deliver in plain chat text

Give the user the completed assignment directly in the chat response as plain
markdown text. Do **not** publish it as an Artifact (no styled "sheet" HTML
documents) — this user has explicitly said not to do that for homework/worksheet
content in the past. Artifacts are fine for things that are genuinely a page/app/
visual deliverable, but a finished assignment isn't that.

If Step 6 ran, mention the final ZeroGPT score in one short line so the user knows
where it landed (e.g. "ZeroGPT: 2% AI" or, if the cap was hit, "ZeroGPT: still at 11%
after 4 rewrite passes").
