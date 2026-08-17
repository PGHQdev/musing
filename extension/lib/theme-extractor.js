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
    // "sort" and "search" were removed: "sort of" is a hedge and "search the logs"
    // is not an algorithm. "big o" and "graph" are exact, so "big one" and
    // "graphql" no longer count.
    strong: ["algorithm", "data structure", "hash", "recursion", "dynamic programming"],
    weak: ["complexity", "tree", "graph", "optimization", "big o"]
  },

  // Learning & Growth
  learning: {
    strong: ["learn", "learning", "study", "education", "tutorial", "beginner", "teach"],
    weak: ["understand", "knowledge", "course", "practice", "improve", "skill", "advanced"]
  },
  growth: {
    // "develop" matched every "developer" and "development", "path" every file
    // path, "transform" every "transformer", "grow" every growing table, and
    // "better" every comparison. All five were removed.
    strong: ["growth", "evolve"],
    weak: ["improve", "progress", "change", "journey", "milestone"]
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
    // "mental" was removed for "mental model", and "rest" for "restart",
    // "restore" and "the rest of the file". "mental health" still hits "health".
    strong: ["health", "sleep", "exercise", "wellness", "tired", "burnout", "meditat"],
    weak: ["energy", "balance"]
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
    // "slow" was removed: a slow query is a performance report, not patience
    strong: ["patient", "patience", "gradual", "calm", "steady"],
    weak: ["wait", "time", "eventually", "pace"]
  },
  simplicity: {
    // "clear" was removed for "clear the cache", "basic" for "basically" and
    // "basic auth", "reduce" for "reducer". "essential" is exact, so
    // "essentially" no longer counts.
    strong: ["simple", "simplify", "minimal", "elegant", "straightforward"],
    weak: ["clean", "essential"]
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
    // "design" was removed for api design, "create" for "create a table",
    // "unique" for a unique index, "original" for "the original version".
    // "idea" and "art" are exact, so "ideally" and "artifact" no longer count.
    strong: ["creativ", "brainstorm", "innovate", "imagine", "inventive"],
    weak: ["idea", "art"]
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
    // "method" is a function, "address" is memory, and "resolve" is a promise.
    // All three were removed.
    strong: ["solve", "solution", "tackle", "figure out"],
    weak: ["problem", "challenge", "approach", "strategy"]
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
    // "different" and "new" were removed: both are generic comparisons that
    // attach to any noun, and "change" and "update" carry the sense
    strong: ["adapt", "transition", "transform", "evolve"],
    weak: ["change", "adjust", "shift", "update"]
  },

  // Philosophy
  philosophy: {
    // "moral" is weak because the widened pattern also matches "morale".
    // "value" was removed for a variable, "truth" for "truthy" and "source of
    // truth", "purpose" for "the purpose of this function". "exist" and "life"
    // are exact, so "existing" and "lifecycle" no longer count.
    strong: ["death", "consciousness", "ethics"],
    weak: ["meaning", "exist", "life", "reality", "moral"]
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

// Words whose bare form is on-theme and whose widened forms are not
// ("work" -> "workflow", "time" -> "timeline", "change" -> "changelog",
// "life" -> "lifecycle", "exist" -> "existing", "balance" -> "balancer",
// "essential" -> "essentially", "idea" -> "ideally", "art" -> "artifact",
// "graph" -> "graphql", "big o" -> "big one")
const EXACT_MATCH_KEYWORDS = new Set([
  "work", "time", "change", "life", "exist", "balance", "essential",
  "idea", "art", "graph", "big o"
]);

// Widened forms that invert the meaning of their keyword. "fearless" is a courage
// keyword, so without this one sentence feeds fear and courage at once. The forms
// are suppressed for a keyword that widened into them ("fear"), and kept for a
// keyword that is one of them ("fearless" still matches "fearlessly").
const INVERTED_FORMS = new Set(["fearless", "fearlessly", "fearlessness"]);

// A theme survives only with one strong keyword or two distinct weak ones
const MIN_DISTINCT_WEAK = 2;
// A theme survives only within this fraction of the top score.
// scripts/theme-fixtures.json passes 20 of 20 across (0.3667, 0.4444], so there is
// 0.033 of headroom below and 0.044 above. The band is pinned by "relationships"
// at ratio 0.3667 in the day-rate fixture, which must be cut, and "communication"
// at 0.4444 in the two-diagrams fixture, which must survive. Changing a keyword
// moves those pins; re-run scripts/validate-themes.js.
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
 * Collect the words one keyword pattern matched
 * An exact-match keyword can only match itself, so its form is the keyword.
 * @param {RegExp} regex - Global pattern for a single keyword
 * @param {string} keyword - The keyword the pattern was built from
 * @param {string} text - Lowercased conversation text
 * @returns {Map<string, {count: number, firstIndex: number}>} Empty when nothing matched
 */
function matchKeyword(regex, keyword, text) {
  regex.lastIndex = 0;
  const forms = new Map();
  let match;

  while ((match = regex.exec(text)) !== null) {
    const form = match[0];
    if (INVERTED_FORMS.has(form) && !INVERTED_FORMS.has(keyword)) continue;
    const seen = forms.get(form);
    if (seen) {
      seen.count += 1;
    } else {
      forms.set(form, { count: 1, firstIndex: match.index });
    }
  }

  return forms;
}

/**
 * Merge keywords that matched the same word, so one word counts once
 * "learning" matches both the "learn" and "learning" keywords, and without this
 * that single word would score as two distinct hits. A group counts as strong
 * when any keyword in it is strong.
 * @param {Array<{keyword: string, strong: boolean, forms: Map}>} matched
 * @returns {Array<{strong: boolean, count: number, firstIndex: number, term: string}>}
 */
function groupMatches(matched) {
  const parent = matched.map((_, index) => index);
  const find = (index) => (parent[index] === index ? index : (parent[index] = find(parent[index])));

  const formOwner = new Map();
  matched.forEach((entry, index) => {
    for (const form of entry.forms.keys()) {
      if (formOwner.has(form)) {
        parent[find(index)] = find(formOwner.get(form));
      } else {
        formOwner.set(form, index);
      }
    }
  });

  const groups = new Map();
  matched.forEach((entry, index) => {
    const root = find(index);
    let group = groups.get(root);
    if (!group) {
      group = { strong: false, count: 0, firstIndex: Infinity, term: "", forms: new Set() };
      groups.set(root, group);
    }
    if (entry.strong) group.strong = true;

    // Two keywords find the same word at the same places, so count each form once
    for (const [form, info] of entry.forms) {
      if (group.forms.has(form)) continue;
      group.forms.add(form);
      group.count += info.count;
      if (info.firstIndex < group.firstIndex) {
        group.firstIndex = info.firstIndex;
        group.term = form;
      }
    }
  });

  return [...groups.values()];
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
    // "writing · writing" adds nothing, and neither does "debugging" under "debugging"
    if (term === theme || term.includes(theme)) continue;
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
    const matched = [];

    for (const { keyword, strong, regex } of keywords) {
      const forms = matchKeyword(regex, keyword, normalizedText);
      if (forms.size > 0) matched.push({ keyword, strong, forms });
    }

    // Distinct words, not total hits, so one word cannot carry a theme twice
    const hits = groupMatches(matched);
    let distinctStrong = 0;
    let distinctWeak = 0;
    for (const hit of hits) {
      if (hit.strong) {
        distinctStrong += 1;
      } else {
        distinctWeak += 1;
      }
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
