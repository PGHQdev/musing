# Changelog

All notable changes to Musing are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.4] - 2026-08-10

### Fixed

- The popup no longer opens as an oversized 800×600 window with empty dark
  space; the root element now declares the 350px width Chrome sizes from.

## [1.2.3] - 2026-08-10

### Added

- A subtle, dismissible prompt on the new tab that invites rating on the
  Chrome Web Store. It appears only after sustained use, goes quiet after a
  dismissal, and never shows again once the user rates.

## [1.2.2] - 2026-08-10

### Fixed

- Quotes load reliably after the browser suspends the service worker; storage
  writes are serialized so concurrent updates no longer lose data.
- Gemini conversations are captured in full (both prompts and replies); the
  three content scripts now share one capture core.
- Disabling a site in the popup stops capture immediately.
- Browser-history theme matching again skips email, banking, and health hosts.
- Smart Reasons no longer discards a billed AI response; the quote paints first
  and the reason swaps in when ready.
- Corrected a `web_accessible_resources` match pattern that could block the
  extension from loading.

### Security

- The page-to-extension capture bridge validates message shape and origin.
- Redaction runs before any captured text is stored.

## [1.2.0] - 2026-08

### Changed

- Settings behave consistently across the popup, new tab, and background.
- Introduced the `Store` module as the single owner of `chrome.storage`.

### Fixed

- The proactive-refresh toggle now matches its displayed state.
- Daily quotes count toward no-repeat tracking.

## [1.1.0]

### Added

- Save and export favorite quotes.
- Daily quote mode.
- Theme chips with "less like this" controls.
- Quote history and one-click copy.
- Proactive-refresh toggle.

[1.2.2]: https://github.com/PGHQdev/musing/releases/tag/v1.2.2
[1.2.0]: https://github.com/PGHQdev/musing/releases/tag/v1.2.0
[1.1.0]: https://github.com/PGHQdev/musing/releases/tag/v1.1.0
