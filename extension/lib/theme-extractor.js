/**
 * Local Theme Extraction Module
 * Extracts themes from conversation text using keyword matching
 * Fully local - no network requests
 *
 * Each theme carries two keyword tiers:
 *   strong - the word alone is decisive for the theme ("microservice", "burnout")
 *   weak   - common English, or a term several themes share ("work", "system")
 * A keyword can be strong for one theme and weak for another.
 */

const THEME_KEYWORDS = {
  // Technical
  programming: {
    strong: [
      "coding", "software", "developer", "api", "frontend", "backend",
      "javascript", "python", "typescript", "react", "git", "html", "css"
    ],
    weak: [
      "code", "program", "function", "variable", "algorithm", "database",
      "node", "deploy", "server", "client"
    ]
  },
  debugging: {
    strong: ["debug", "bug", "crash", "exception", "stack trace", "breakpoint", "console"],
    weak: ["error", "fix", "issue", "problem", "broken", "log", "test", "failing"]
  },
  architecture: {
    strong: [
      "architecture", "design pattern", "infrastructure", "scalable", "microservice",
      "monolith", "api design", "database design", "schema"
    ],
    weak: ["system", "structure"]
  },
  algorithms: {
    // "big o" is weak because the widened pattern also matches "big one"
    strong: ["algorithm", "data structure", "hash", "recursion", "dynamic programming"],
    weak: ["complexity", "sort", "search", "tree", "graph", "optimization", "big o"]
  },

  // Learning & Growth
  learning: {
    strong: ["learn", "learning", "study", "education", "tutorial", "beginner", "teach"],
    weak: ["understand", "knowledge", "course", "practice", "improve", "skill", "advanced"]
  },
  growth: {
    // "grow" is weak because "growing" and "grown" attach to any noun: a table,
    // a backlog, a bill
    strong: ["growth", "evolve"],
    weak: [
      "improve", "better", "progress", "develop", "change", "transform",
      "journey", "path", "milestone", "grow"
    ]
  },

  // Emotional
  frustration: {
    strong: ["frustrat", "annoy", "stuck", "confused", "hate", "ugh", "argh"],
    weak: ["difficult", "hard", "struggle", "can't", "won't work", "doesn't work"]
  },
  curiosity: {
    strong: ["curious", "fascinate", "how does", "what if", "learn more"],
    weak: ["wonder", "interesting", "explore", "discover", "why"]
  },
  excitement: {
    strong: ["excit", "amazing", "awesome", "fantastic", "finally"],
    weak: ["cool", "love", "great", "worked", "success", "yes", "perfect"]
  },
  anxiety: {
    strong: ["worr", "anxious", "stress", "nervous", "panic", "overwhelm"],
    weak: ["afraid", "fear", "deadline", "pressure", "uncertain"]
  },

  // Life
  career: {
    strong: [
      "career", "profession", "interview", "resume", "salary", "promotion",
      "startup", "entrepreneur"
    ],
    weak: ["job", "work", "manager", "team", "company", "business"]
  },
  relationships: {
    strong: ["relationship", "friend", "family", "partner", "colleague"],
    weak: ["team", "collaborate", "communicate", "trust", "support"]
  },
  health: {
    strong: ["health", "sleep", "exercise", "wellness", "tired", "burnout", "meditat"],
    weak: ["mental", "energy", "balance", "rest"]
  },
  finance: {
    strong: ["money", "finance", "budget", "price", "expensive", "afford", "income", "salary"],
    weak: ["invest", "save", "cost"]
  },

  // Abstract
  persistence: {
    strong: ["persist", "persever", "keep going", "don't give up", "endure", "resilient", "dedication"],
    weak: ["continue", "determined", "committed"]
  },
  patience: {
    strong: ["patient", "patience", "gradual", "calm", "steady"],
    weak: ["wait", "time", "slow", "eventually", "pace"]
  },
  simplicity: {
    strong: ["simple", "simplify", "minimal", "elegant", "straightforward"],
    weak: ["clean", "clear", "basic", "essential", "reduce"]
  },
  complexity: {
    strong: ["complex", "complicated", "intricate", "nuance", "sophisticated"],
    weak: ["subtle", "layered", "deep"]
  },
  wisdom: {
    strong: ["wisdom", "wise"],
    weak: [
      "insight", "perspective", "understand", "realize", "lesson",
      "experience", "knowledge", "truth"
    ]
  },

  // Work & Productivity
  productivity: {
    strong: ["productive", "productivity", "distract", "procrastinat", "todo", "priorit", "time management"],
    weak: ["efficient", "focus", "task", "organize"]
  },
  motivation: {
    // "aspir" is weak because the widened pattern also matches "aspirin", "aspirate"
    strong: ["motivat", "inspire", "passion", "ambition", "determination"],
    weak: ["drive", "purpose", "goal", "dream", "aspir"]
  },

  // Writing & Creativity
  writing: {
    strong: ["writ", "essay", "article", "blog", "draft", "narrative"],
    weak: ["document", "edit", "publish", "content", "copy", "story"]
  },
  creativity: {
    strong: ["creativ", "brainstorm", "innovate", "imagine", "inventive"],
    weak: ["idea", "design", "art", "create", "original", "unique"]
  },

  // Decision Making
  "decision-making": {
    strong: ["decide", "decision", "choice", "choose", "tradeoff", "pros and cons"],
    weak: ["option", "alternative", "evaluate", "assess", "weigh"]
  },
  uncertainty: {
    strong: ["uncertain", "unsure", "doubt", "unknown", "unclear", "ambiguous", "unpredictable"],
    weak: ["maybe", "perhaps", "risk"]
  },

  // Problem Solving
  "problem-solving": {
    strong: ["solve", "solution", "tackle", "figure out"],
    weak: ["problem", "challenge", "approach", "strategy", "method", "address", "resolve"]
  },

  // Success & Failure
  success: {
    // "success" is weak because the widened pattern also matches "successive", "succession"
    strong: ["succeed", "achieve", "accomplish", "breakthrough", "victory"],
    weak: ["win", "goal", "milestone", "success"]
  },
  failure: {
    strong: ["fail", "failure", "mistake", "setback", "defeat", "disappoint"],
    weak: ["wrong", "error", "loss"]
  },

  // Time
  time: {
    // "hour", "minute", "day", "week", "month" and "year" were removed: a unit of
    // measure attaches to whatever is being measured and is no evidence of a topic
    strong: ["deadline", "schedule"],
    weak: ["time", "late", "early", "soon", "eventually"]
  },

  // Communication
  communication: {
    strong: ["communicat", "clarify", "conversation", "feedback", "listen"],
    weak: ["explain", "discuss", "talk", "understand", "express"]
  },

  // Change
  change: {
    strong: ["adapt", "transition", "transform", "evolve"],
    weak: ["change", "adjust", "shift", "different", "new", "update"]
  },

  // Philosophy
  philosophy: {
    // "moral" is weak because the widened pattern also matches "morale"
    strong: ["death", "consciousness", "ethics"],
    weak: ["meaning", "purpose", "exist", "life", "reality", "truth", "value", "moral"]
  },

  // Courage & Fear
  courage: {
    strong: ["courage", "brave", "fearless", "dare", "stand up"],
    weak: ["bold", "confident", "risk", "venture"]
  },
  fear: {
    strong: ["fear", "afraid", "scared", "dread", "phobia"],
    weak: ["terrif", "worry", "anxious"]
  }
};

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Generic words that would otherwise prefix-match unrelated terms
// ("work" -> "workflow", "time" -> "timeline", "change" -> "changelog")
const EXACT_MATCH_KEYWORDS = new Set(["work", "time", "change"]);

// Widened forms that invert the meaning of their keyword. "fearless" is a courage
// keyword, so without this one sentence feeds fear and courage at once. The forms
// are suppressed for a keyword that widened into them ("fear"), and kept for a
// keyword that is one of them ("fearless" still matches "fearlessly").
const INVERTED_FORMS = new Set(["fearless", "fearlessly", "fearlessness"]);

// A theme survives only with one strong keyword or two distinct weak ones
const MIN_DISTINCT_WEAK = 2;
// A theme survives only within this fraction of the top score
const RELATIVE_CUTOFF = 0.4;
// Reason-line limits: how many terms per theme and how long each may be
const MAX_TERMS = 3;
const MAX_TERM_LENGTH = 24;
// Terms carry letters, single spaces, and hyphens only
const TERM_SHAPE = /^[a-z]+(?:[ -][a-z]+)*$/;

// Precompiled once at module scope. Every read resets lastIndex before use, so
// sharing these regexes across calls is safe.
const THEME_PATTERNS = Object.entries(THEME_KEYWORDS).map(([theme, tiers]) => {
  const build = (keyword, strong) => {
    const exact = EXACT_MATCH_KEYWORDS.has(keyword);
    return {
      keyword,
      strong,
      exact,
      regex: new RegExp(`\\b${escapeRegExp(keyword)}${exact ? "\\b" : "\\w*"}`, "g"),
    };
  };

  return {
    theme,
    // Strong keywords count double on both sides of the ratio
    denominator: 2 * tiers.strong.length + tiers.weak.length,
    keywords: [
      ...tiers.strong.map((keyword) => build(keyword, true)),
      ...tiers.weak.map((keyword) => build(keyword, false)),
    ],
  };
});

/**
 * Collect every match of one keyword pattern
 * @param {RegExp} regex - Global pattern for a single keyword
 * @param {string} keyword - The keyword the pattern was built from
 * @param {string} text - Lowercased conversation text
 * @returns {{count: number, first: string, firstIndex: number}|null}
 */
function matchKeyword(regex, keyword, text) {
  regex.lastIndex = 0;
  let count = 0;
  let first = "";
  let firstIndex = -1;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const form = match[0];
    if (INVERTED_FORMS.has(form) && !INVERTED_FORMS.has(keyword)) continue;
    if (count === 0) {
      first = form;
      firstIndex = match.index;
    }
    count += 1;
  }

  return count > 0 ? { count, first, firstIndex } : null;
}

/**
 * Pick the terms shown on the reason line
 * @param {string} theme - Theme name, used to drop redundant terms
 * @param {Array} hits - Matched keywords with tier, count, and first appearance
 * @returns {string[]} Up to MAX_TERMS terms, strong tier first
 */
function selectTerms(theme, hits) {
  const seen = new Set();
  const candidates = [];

  for (const hit of hits) {
    const term = hit.term;
    if (!term || term.length > MAX_TERM_LENGTH || !TERM_SHAPE.test(term)) continue;
    // "writing · writing" adds nothing, and neither does "learn" under "learning"
    if (term === theme || theme.includes(term) || term.includes(theme)) continue;
    if (seen.has(term)) continue;
    seen.add(term);
    candidates.push(hit);
  }

  candidates.sort((a, b) => {
    if (a.strong !== b.strong) return a.strong ? -1 : 1;
    if (a.count !== b.count) return b.count - a.count;
    return a.firstIndex - b.firstIndex;
  });

  return candidates.slice(0, MAX_TERMS).map((hit) => hit.term);
}

/**
 * Extract themes from text using tiered keyword matching
 * @param {string} text - The conversation text to analyze
 * @param {number} maxThemes - Maximum number of themes to return (default: 5)
 * @returns {Array<{theme: string, score: number, terms: string[]}>} Descending by
 *   score; empty when nothing matches
 */
function extractThemes(text, maxThemes = 5) {
  if (!text || typeof text !== "string") {
    return [];
  }

  const normalizedText = text.toLowerCase();
  const scored = [];

  for (const { theme, denominator, keywords } of THEME_PATTERNS) {
    let distinctStrong = 0;
    let distinctWeak = 0;
    const hits = [];

    // Distinct keywords, not total hits, so one word repeated cannot carry a theme
    for (const { keyword, strong, exact, regex } of keywords) {
      const match = matchKeyword(regex, keyword, normalizedText);
      if (!match) continue;

      if (strong) {
        distinctStrong += 1;
      } else {
        distinctWeak += 1;
      }

      hits.push({
        term: exact ? keyword : match.first,
        strong,
        count: match.count,
        firstIndex: match.firstIndex,
      });
    }

    if (distinctStrong < 1 && distinctWeak < MIN_DISTINCT_WEAK) continue;

    const raw = 2 * distinctStrong + distinctWeak;
    scored.push({
      theme,
      score: raw / denominator,
      terms: selectTerms(theme, hits),
    });
  }

  if (scored.length === 0) {
    return [];
  }

  scored.sort((a, b) => b.score - a.score || a.theme.localeCompare(b.theme));

  // Relative cutoff, so a focused conversation returns one or two themes
  const cutoff = RELATIVE_CUTOFF * scored[0].score;
  return scored.filter((entry) => entry.score >= cutoff).slice(0, maxThemes);
}

/**
 * Get all available theme names
 * @returns {string[]} Array of all theme names
 */
function getAllThemes() {
  return Object.keys(THEME_KEYWORDS);
}

// Export for use in extension
if (typeof module !== "undefined" && module.exports) {
  module.exports = { extractThemes, getAllThemes, THEME_KEYWORDS };
}

// Export for service worker importScripts, matching history-extractor
if (typeof self !== "undefined") {
  self.extractThemes = extractThemes;
  self.getAllThemes = getAllThemes;
}
