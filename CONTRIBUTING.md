# Contributing to Musing

Thanks for your interest. Musing is a small, dependency-free Chrome extension, so contributing is quick to set up.

## Development setup

```bash
git clone https://github.com/PGHQdev/musing.git
```

1. Open `chrome://extensions/`, enable **Developer mode**, click **Load unpacked**, and select `extension/`.
2. Edit files under `extension/`. Reload the extension from `chrome://extensions/` to pick up changes.
3. Read [CONTEXT.md](CONTEXT.md) for the domain vocabulary (Theme, Quote, Store, Scrape, and so on).

There is no build step for the extension. It is vanilla JavaScript on Manifest V3.

## Before you open a pull request

- **Keep it dependency-free.** The extension ships no bundler and no runtime dependencies. Match the existing idiom.
- **Storage goes through `Store`.** All `chrome.storage.local` access lives in `extension/lib/storage.js`. Do not read or write raw keys elsewhere.
- **Syntax-check your changes.** CI runs `node --check` on every `.js` file. Run the same locally:
  ```bash
  find extension landing -name '*.js' -not -path '*/node_modules/*' -exec node --check {} \;
  ```
- **Do not weaken the privacy model.** The extension is local by default. The only outbound path is opt-in BYOK Smart Reasons. A change that adds network calls, analytics, or tracking to the default path will not be merged.
- **One logical change per pull request.** Keep commits atomic and unrelated refactors out.

## Adding quotes

Edit `extension/data/quotes.json`. Each quote needs `text`, `author`, and a `themes` array using existing theme ids where possible (see `THEME_KEYWORDS` in `extension/lib/theme-extractor.js`).

## Reporting bugs and requesting features

Open an issue using the templates. For security issues, follow [SECURITY.md](SECURITY.md) instead of filing a public issue.
