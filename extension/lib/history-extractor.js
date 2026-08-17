/**
 * History Extractor
 * Extracts themes from browser history page titles
 * All processing happens locally - no data sent externally
 */

// Domains to exclude from history processing (sensitive/personal content).
// Entries are matched as hostname suffixes on label boundaries: an entry
// matches the hostname itself or any subdomain of it. A bare TLD entry like
// "gov" excludes every host under that TLD.
const EXCLUDED_DOMAINS = [
  // Banking & Finance
  "chase.com", "wellsfargo.com", "bankofamerica.com", "citibank.com", "citi.com",
  "capitalone.com", "paypal.com", "venmo.com", "zellepay.com",
  "mint.intuit.com", "quickbooks.intuit.com",
  // Email
  "mail.google.com", "gmail.com", "outlook.com", "outlook.live.com",
  "mail.yahoo.com", "protonmail.com", "proton.me", "fastmail.com",
  // Health
  "mychart.com", "webmd.com", "mayoclinic.org", "myhealth.va.gov",
  // Social (personal content)
  "facebook.com", "instagram.com", "twitter.com", "x.com", "linkedin.com", "tiktok.com",
  // Shopping/accounts (personal preferences)
  "amazon.com", "ebay.com", "walmart.com",
  // Government (any .gov host)
  "gov",
];

/**
 * Check whether a hostname is the domain or a subdomain of it
 * @param {string} hostname - Lowercased hostname
 * @param {string} domain - Domain suffix to test
 * @returns {boolean}
 */
function matchesDomain(hostname, domain) {
  return hostname === domain || hostname.endsWith("." + domain);
}

// Sensitive-host keywords matched as a plain hostname substring. This restores
// the substring coverage the suffix list dropped, so hosts like
// outlook.office.com, mychart.<provider>.org, patient portals and bank
// subdomains stay excluded even when their registrable domain is not enumerated.
// Over-exclusion here is intentional: it favors privacy over history coverage.
const SENSITIVE_HOST_KEYWORDS = [
  "mail", "webmail", "outlook", "mychart", "patient", "health", "bank", "banking", "medical",
];

/**
 * Decide whether a hostname must be excluded from history processing.
 * Unions three checks: registrable-suffix match on the enumerated
 * EXCLUDED_DOMAINS, substring match on SENSITIVE_HOST_KEYWORDS, and substring
 * match on any user-configured excluded entries. User entries are treated as
 * substrings so existing configuration keeps working.
 * @param {string} hostname - The hostname to check
 * @param {string[]} [userExcluded] - Additional user-configured entries
 * @returns {boolean}
 */
function isHostExcluded(hostname, userExcluded = []) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (EXCLUDED_DOMAINS.some((d) => matchesDomain(host, d))) return true;
  if (SENSITIVE_HOST_KEYWORDS.some((k) => host.includes(k))) return true;
  return userExcluded.some((d) => {
    const needle = String(d).toLowerCase().trim();
    return needle !== "" && host.includes(needle);
  });
}

// PII patterns to sanitize
const PII_PATTERNS = [
  // Email addresses
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,
  // Phone numbers (various formats)
  /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
  // SSN
  /\d{3}[-.\s]?\d{2}[-.\s]?\d{4}/g,
  // Credit card numbers
  /\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}/g,
  // IP addresses
  /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g,
];

/**
 * Check if a domain should be excluded
 * @param {string} hostname - The hostname to check
 * @returns {boolean}
 */
function isExcludedDomain(hostname) {
  return isHostExcluded(hostname);
}

/**
 * Sanitize text by removing PII
 * @param {string} text - Text to sanitize
 * @returns {string}
 */
function sanitizeHistoryText(text) {
  if (!text) return "";

  let sanitized = text;
  for (const pattern of PII_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }

  // Remove any remaining potentially sensitive data (long numbers)
  sanitized = sanitized.replace(/\b\d{6,}\b/g, "[REDACTED]");

  return sanitized.trim();
}

/**
 * Extract themes from browser history
 * @param {Object} settings - History settings
 * @param {boolean} settings.enableBrowserHistory - Extract from page titles
 * @param {number} settings.historyDaysBack - Days of history to analyze
 * @param {string[]} settings.excludedDomains - Additional domains to exclude
 * @returns {Promise<{themes: string[], sourceCount: number}>}
 */
async function extractHistoryThemes(settings) {
  const {
    enableBrowserHistory = false,
    historyDaysBack = 7,
    excludedDomains = [],
  } = settings;

  if (!enableBrowserHistory) {
    return { themes: [], sourceCount: 0 };
  }

  // Check if we have history permission
  const hasPermission = await chrome.permissions.contains({ permissions: ["history"] });
  if (!hasPermission) {
    console.log("[Musing] History permission not granted");
    return { themes: [], sourceCount: 0 };
  }

  // Query history; permission can be revoked between the check above and this call
  const startTime = Date.now() - historyDaysBack * 24 * 60 * 60 * 1000;
  let historyItems;
  try {
    historyItems = await chrome.history.search({
      text: "",
      startTime,
      // Scale with the window so historyDaysBack stays meaningful past ~a week
      maxResults: Math.max(500, historyDaysBack * 100),
    });
  } catch (error) {
    console.warn("[Musing] History search failed:", error.message);
    return { themes: [], sourceCount: 0 };
  }

  const textForExtraction = [];
  let sourceCount = 0;

  for (const item of historyItems) {
    if (!item.url) continue;

    try {
      const url = new URL(item.url);
      const hostname = url.hostname.toLowerCase().replace(/\.$/, "");

      // Check if domain is excluded (suffix list + sensitive keywords + user config)
      if (isHostExcluded(hostname, excludedDomains)) {
        continue;
      }

      sourceCount++;

      // Extract from page titles if enabled; skip any title with redacted PII
      if (enableBrowserHistory && item.title) {
        const sanitizedTitle = sanitizeHistoryText(item.title);
        if (sanitizedTitle && !sanitizedTitle.includes("[REDACTED]") && sanitizedTitle.length > 3) {
          textForExtraction.push(sanitizedTitle);
        }
      }
    } catch {
      // Invalid URL, skip
    }
  }

  // Combine titles for theme extraction
  const combinedText = textForExtraction.slice(0, 100).join("\n");

  // Use the theme extractor; raw keywords are not theme names, so no fallback
  let themes = [];
  if (typeof extractThemes === "function") {
    // Adapter: task 4 replaces this with real scored-theme handling
    themes = extractThemes(combinedText, 5).map((t) => t.theme);
  } else {
    console.warn("[Musing] extractThemes unavailable; skipping history themes");
  }

  return {
    themes,
    sourceCount,
    titleCount: textForExtraction.length,
  };
}

// Export for use in background script
if (typeof self !== "undefined") {
  self.extractHistoryThemes = extractHistoryThemes;
  self.sanitizeHistoryText = sanitizeHistoryText;
  self.isExcludedDomain = isExcludedDomain;
}
