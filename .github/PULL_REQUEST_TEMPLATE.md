<!-- Thanks for contributing to Musing. -->

## What does this change?

<!-- A short description of the change and why. Link any related issue. -->

## Checklist

- [ ] The change keeps the extension dependency-free (no bundler, no runtime deps).
- [ ] All `chrome.storage.local` access still goes through `Store` (`extension/lib/storage.js`).
- [ ] `node --check` passes on every changed `.js` file.
- [ ] The default (non-BYOK) path adds no network calls, analytics, or tracking.
- [ ] Commits are atomic and unrelated refactors are excluded.
- [ ] If user-facing, `CHANGELOG.md` and the `VERSION_CHANGELOG` in `newtab.js` are updated.
