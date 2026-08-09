# Security Policy

## Supported versions

The latest version published on the Chrome Web Store receives security fixes. Please make sure you are on the current version before reporting.

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report privately through GitHub's [private vulnerability reporting](https://github.com/PGHQdev/musing/security/advisories/new) (Security → Report a vulnerability). Include:

- what you found and where (file, function, or flow),
- steps to reproduce or a proof of concept,
- the impact you believe it has.

You can expect an acknowledgement within a few days. Once a fix ships, we are happy to credit you unless you prefer to stay anonymous.

## Scope

Musing is local by default. The areas most relevant to security are:

- the message bridge between the page-context interceptor and the content script,
- handling of captured conversation text before it is stored,
- the optional BYOK path that sends snippets to a third-party provider using the user's own key.

Reports that data leaves the browser on the default (non-BYOK) path are especially valuable.
