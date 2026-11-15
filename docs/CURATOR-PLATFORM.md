# Curator platform: spec

Goal: make the curator's job **very easy** and **fully AFK**. A curator agent should be able to research, write and publish places, and make **beautiful, detailed place pages** that get the traveler excited, with no human help and no editing of code.

Built by a coder agent. Places content is written by curator agents only.

## Requirements

### 1. A clear content format the curator writes
- One folder or file per place, in a simple human/agent-friendly format (e.g. Markdown with frontmatter, or JSON/YAML + Markdown body).
- Validated by a **schema** with helpful error messages that say exactly what to fix.
- Covers the required fields: name, city, country, area, category (and optional secondary tags), short why, cost estimate (local currency + R$, with the FX rate and date used), book-ahead info (required? lead time? method: passport-registered, app, website, tour; link), opening hours/seasonal notes for Dec–Jan, sources with checked dates, and a confidence level.
- Also supports **area/city cards** for the broad round.

### 2. Pretty, detailed views from content blocks
The curator composes a place page from a library of **rich blocks**, without writing HTML/CSS. Examples:
- Hero (big photo, title, one-line hook, category chips)
- "Why you'll love it" highlights
- Photo gallery (with credits/licenses)
- Quick facts strip (cost in R$, time needed, best time of day, book-ahead badge)
- Book-ahead timeline (when to book relative to visit date, how)
- Cost breakdown (ticket, transport, extras) in R$ + local
- Map / location (embed or static, link to maps app; China note: Amap/Baidu vs Google)
- Insider tips, "what locals do", pitfalls
- Food/drink menu highlights (for Eat / nightlife places)
- Quote / vibe block, "pairs well with" nearby places
- Weather / winter note
- Sources footer
Pages must look great in light and dark, on desktop and phone. Design quality matters: this is what makes the traveler care.

### 3. Media handling
- A command to fetch and store images locally from free/licensed sources (e.g. Wikimedia Commons), recording author, license and source URL automatically.
- Image optimization (resize/compress) so pages load fast.

### 4. Fully AFK tooling for the curator
- A CLI with commands such as: scaffold a place, validate, fetch media, build/preview, render a **screenshot** of a page so the curator can check it visually by itself, list gaps (missing fields, stale sources, unbalanced categories, cities with too few options vs days).
- A way to run curator work headlessly (e.g. a script that runs `claude -p` with the curator brief and a task such as "add 10 nightlife places in Seoul" or "process new feedback"), looping validate → fix until clean.
- Reads the game's feedback files (swipes, duels, questions) and summarizes the traveler's taste for the curator.
- A **curator guide** (a doc the curator reads first) explaining the format, the blocks, the commands, the quality bar, and the rules (sources required, prices in R$, flag book-ahead, budget-traveler angle).

### 5. Boundaries
- Places data lives in its own directory. The game app reads it; it never writes it.
- The platform code never contains place content (except clearly-marked fixtures for tests).

## Definition of done
- A curator agent, given only the curator guide and a one-line task, can add a polished place page end-to-end with no human input.
- Proven with **a couple of examples** produced by a curator subagent (not by the coder), with screenshots.
