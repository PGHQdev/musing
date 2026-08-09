# Musing — Domain Glossary

Terms used across the codebase and in architecture discussions. Storage for all of
these is owned by the **Store** module (`extension/lib/storage.js`) — the single
owner of the `chrome.storage.local` namespace.

## Core concepts

- **Theme** — a keyword-cluster category (e.g. `programming`, `career`, `courage`)
  extracted locally from conversation or history text. The atomic unit of "what the
  user has been thinking about". Defined in `THEME_KEYWORDS` (`lib/theme-extractor.js`).
- **Quote** — an entry in the bundled `data/quotes.json` database, tagged with `themes[]`.
- **Matched Themes** — the intersection of the user's combined themes and a quote's
  themes; drives the on-screen recommendation reason.
- **Conversation Themes vs. History Themes** — two independently extracted theme sets
  (from scraped AI chats vs. browser history), unioned into **combined themes** before
  quote matching. `Store.themes.getExtracted()` / `Store.themes.getHistoryThemes()`.
- **Blocked Themes** ("less like this") — user-excluded themes, filtered out of both
  theme extraction and quote selection. `Store.themes.block/unblock/blocked`.

## Recommendation

- **Recommendation Reason** — the explanation shown under a quote: a static
  `THEME_REASONS` lookup (newtab) or an AI-generated one.
- **Smart Reasons (BYOK)** — optional AI-generated reasons using the user's own API
  key (Groq / Claude / OpenAI). `lib/ai-reason-generator.js`, settings in `Store.ai`.
- **Cached Quotes** — the rotating pool (max 30) refreshed from theme matches,
  distinct from the full bundled database. `Store.quotes.getCache/setCache`.
- **Daily Quote** — settings-gated mode pinning one quote per local calendar day.
  `Store.quotes.getDailyState/setDailyState`; the date-key logic lives in newtab.
- **Shown Quote History** — two anti-repeat mechanisms updated together by
  `Store.history.recordShown(quote)` at display time: a short recency-id window
  (dedup input for quote selection) and a longer ledger (history feature).
  Distinct from **History Settings** (`Store.historySettings`), which configures
  browser-history theme extraction.

## Capture

- **Platform** — one of `claude` | `chatgpt` | `gemini`; drives every per-site branch
  across content scripts, the API interceptor, and the background worker.
- **Scrape** — the DOM-polling capture cycle a content script runs on a platform page.
  Debug entries go to `Store.scrape.appendLog`.
- **Proactive Scrape** — background-tab mechanism that opens a hidden platform tab to
  force a scrape when data is stale (>24h). Timestamps in `Store.scrape`.
- **API Capture** — the alternate capture path (`inject/api-interceptor.js`)
  intercepting fetch/XHR responses in the page context, bridged by
  `content-scripts/injector.js`.

## Architecture decisions (inline, pre-ADR)

- **Store owns storage** (2026-08): all `chrome.storage.local` keys, defaults, and
  read-modify-write sequences live in `lib/storage.js`; call sites use grouped
  intents and never see raw key strings. Shown-quote recording happens once, at
  display time (newtab), not at selection time (background).
