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
    // is not an algorithm. "big o" is exact, so "big one" no longer counts, and
    // "graph" keeps its plural while SUPPRESSED_FORMS holds off "graphql".
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
    // "better" every comparison. All five were removed, and "change" went with
    // them once it widened: "we changed the schema" is not growth, and the
    // change theme still carries the word. "evolve" is weak for the same reason
    // it is weak in change: a schema evolves.
    strong: ["growth"],
    weak: ["improve", "progress", "journey", "milestone", "evolve"]
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
    // "panic" is weak because a kernel panic is not one
    strong: ["worr", "anxious", "stress", "nervous", "overwhelm"],
    weak: ["afraid", "fear", "deadline", "pressure", "uncertain", "panic"]
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
    // "balance" cannot reach "balancing", since the word drops its "e", and the
    // "balanc" stem that reaches it also hands "load balancing" to the theme.
    // Measured as an even trade, so the engineering false fire decides it: this
    // extension reads conversations about code. SUPPRESSED_FORMS holds off
    // "balancer"; "balanced" stays reachable in both senses and is irreducible.
    // "health" is weak because every service has a health check
    strong: ["sleep", "exercise", "wellness", "tired", "burnout", "meditat"],
    weak: ["energy", "balance", "health"]
  },
  finance: {
    strong: ["money", "finance", "budget", "price", "expensive", "afford", "income", "salary"],
    weak: ["invest", "save", "cost"]
  },

  // Abstract
  persistence: {
    // "resilient" is weak because a service is resilient to a zone failure
    strong: ["persist", "persever", "keep going", "don't give up", "endure", "dedication"],
    weak: ["continue", "determined", "committed", "resilient"]
  },
  patience: {
    // "slow" was removed: a slow query is a performance report, not patience.
    // "steady" and "gradual" are weak because a queue reaches a steady state and
    // a rollout is gradual
    strong: ["patient", "patience", "calm"],
    weak: ["wait", "time", "eventually", "pace", "steady", "gradual"]
  },
  simplicity: {
    // "clear" was removed for "clear the cache", "basic" for "basically" and
    // "basic auth", "reduce" for "reducer". "essential" keeps its plural while
    // SUPPRESSED_FORMS holds off "essentially". "minimal" is weak because every
    // bug report asks for a minimal repro.
    strong: ["simple", "simplify", "elegant", "straightforward"],
    weak: ["clean", "essential", "minimal"]
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
    // "art" is exact, so "artifact" no longer counts, and "idea" keeps its
    // plural while SUPPRESSED_FORMS holds off "ideally".
    strong: ["creativ", "brainstorm", "innovate", "imagine", "inventive"],
    weak: ["idea", "art"]
  },

  // Decision Making
  "decision-making": {
    strong: ["decide", "decision", "choice", "choose", "tradeoff", "pros and cons"],
    weak: ["option", "alternative", "evaluate", "assess", "weigh"]
  },
  uncertainty: {
    // "unknown" is weak because parsers hit unknown tokens and hosts
    strong: ["uncertain", "unsure", "doubt", "unclear", "ambiguous", "unpredictable"],
    weak: ["maybe", "perhaps", "risk", "unknown"]
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
    // "listen" and "feedback" are weak because a server listens on a port and a
    // feedback loop stabilizes a controller
    strong: ["communicat", "clarify", "conversation"],
    weak: ["explain", "discuss", "talk", "understand", "express", "listen", "feedback"]
  },

  // Change
  change: {
    // "different" and "new" were removed: both are generic comparisons that
    // attach to any noun, and "change" and "update" carry the sense.
    // The theme has no strong tier: "adapt" is an adapter, "transition" is a
    // CSS property, "transform" is a transformer, and one strong keyword fires
    // a theme alone. As weak keywords they keep every on-theme inflection and
    // need a second distinct word before the theme survives.
    // "change" stays exact. Widening it to reach "changed" and "changes" was
    // measured: it bought one more true fire and five false ones, because
    // "I changed the config" is in every engineering conversation. "changing"
    // is out of reach either way, since the pattern is \bchange\w* and the
    // word drops its "e".
    strong: [],
    weak: ["adapt", "transition", "transform", "evolve", "change", "adjust", "shift", "update"]
  },

  // Philosophy
  philosophy: {
    // "moral" is weak because the widened pattern also matches "morale".
    // "value" was removed for a variable, "truth" for "truthy" and "source of
    // truth", "purpose" for "the purpose of this function". The stem "existen"
    // replaces "exist", which widened into "existing" and "exists": it covers
    // existence and existential without reaching either. "life" is exact, so
    // "lifecycle" no longer counts.
    strong: ["death", "consciousness", "ethics"],
    weak: ["meaning", "existen", "life", "reality", "moral"]
  },

  // Courage & Fear
  courage: {
    // "stand up" is weak because you stand up a cluster
    strong: ["courage", "brave", "fearless", "dare"],
    weak: ["bold", "confident", "risk", "venture", "stand up"]
  },
  fear: {
    strong: ["fear", "afraid", "scared", "dread", "phobia"],
    weak: ["terrif", "worry", "anxious"]
  }
};

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Words whose bare form is on-theme and whose widened set is mostly noise, so
// no short list of forms could clean it up ("work" -> "workflow", "time" ->
// "timeline", "life" -> "lifecycle", "art" -> "artifact" and 250 other art*
// words, "big o" -> "big one"). Where the false forms are a short closed list,
// suppress them in SUPPRESSED_FORMS instead and keep the widening: exact match
// also throws away every honest inflection, including the plural.
const EXACT_MATCH_KEYWORDS = new Set([
  "work", "time", "change", "life", "art", "big o"
]);

// Widened forms a keyword should not claim, either because they invert its
// meaning or because they are a different word that shares its opening letters.
// A form is suppressed for a keyword that widened into it ("fear" -> "fearless",
// "idea" -> "ideally"), and kept for a keyword that is one of them ("fearless"
// still matches "fearlessly"). A theme that wants one of these words has to name
// it as its own keyword.
const SUPPRESSED_FORMS = new Set([
  // "fearless" is a courage keyword; without this one sentence feeds fear and
  // courage at once
  "fearless", "fearlessly", "fearlessness",
  // creativity's "idea" is not an ideal
  "ideal", "ideals", "ideally", "idealism", "idealist", "idealists",
  "idealistic", "idealistically", "idealize", "idealized", "idealizes",
  "idealizing", "idealization",
  // algorithms' "graph" is not a graphic
  "graphql", "graphic", "graphics", "graphical", "graphically", "graphite",
  // programming's "react" is not a reaction or a nuclear reactor, and a strong
  // keyword fires alone, so without this "her reaction to the news" reads as a
  // programming question. "reactive" stays: reactive programming is the theme.
  "reaction", "reactions", "reacted", "reacting", "reactionary", "reactor", "reactors",
  // debugging's "exception" is not an exceptional year, and its "console" does
  // not console anyone. "consoles" stays: the plural noun is the common one.
  "exceptional", "exceptionally", "exceptionable", "exceptionality", "exceptionalness",
  "consoled", "consoler", "consolers", "consolement",
  // communication's "listen" is not an event listener
  "listener", "listeners",
  // writing's "writ" is not a writable directory, and nobody writhing is writing
  "writable", "writeable", "writability", "writhe", "writhed", "writhes", "writhing",
  // algorithms' "hash" is not a hashtag
  "hashtag", "hashtags",
  // time's "schedule" is not a scheduler
  "scheduler", "schedulers",
  // career's "resume" is a document; a resumed upload is not one. The bare word
  // and its plural stay, since both senses share them.
  "resumed",
  // simplicity's "essential" is not "essentially"
  "essentially", "essentialism", "essentialist", "essentialists", "essentiality",
  "essentialize", "essentialness",
  // health's "balance" is not a load balancer
  "balancer", "balancers", "balanceable", "balancedness", "balancement"
]);

// A theme survives only with one strong keyword or two distinct weak ones
const MIN_DISTINCT_WEAK = 2;
// Smallest divisor a theme may score against. Score is a fraction of the theme's
// own vocabulary, so a short list makes every surviving hit worth more, and
// removing a homograph would hand the theme confidence it did not earn. The
// floor stops a seven-word theme outscoring a twenty-word one on one hit.
const MIN_DENOMINATOR = 12;
// A theme survives only within this fraction of the top score.
// scripts/theme-fixtures.json passes 23 of 23 across (0.3667, 0.5128], so there is
// 0.033 of headroom below and 0.113 above. The band is pinned by "relationships"
// at ratio 0.3667 in the day-rate fixture, which must be cut, and "communication"
// at 0.5128 in the two-diagrams fixture, which must survive. Changing a keyword
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
    denominator: Math.max(2 * tiers.strong.length + tiers.weak.length, MIN_DENOMINATOR),
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
    if (SUPPRESSED_FORMS.has(form) && !SUPPRESSED_FORMS.has(keyword)) continue;
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
