/**
 * Local Theme Extraction Module
 * Extracts themes from conversation text using keyword matching
 * Fully local - no network requests
 */

const THEME_KEYWORDS = {
  // Technical
  programming: [
    "code", "coding", "program", "software", "developer", "function", "variable",
    "algorithm", "api", "database", "frontend", "backend", "javascript", "python",
    "typescript", "react", "node", "git", "deploy", "server", "client", "html", "css"
  ],
  debugging: [
    "debug", "bug", "error", "fix", "issue", "problem", "broken", "crash", "exception",
    "stack trace", "console", "log", "breakpoint", "test", "failing"
  ],
  architecture: [
    "architecture", "design pattern", "system", "infrastructure", "scalable", "microservice",
    "monolith", "api design", "database design", "schema", "structure"
  ],
  algorithms: [
    "algorithm", "data structure", "complexity", "big o", "sort", "search", "tree",
    "graph", "hash", "recursion", "dynamic programming", "optimization"
  ],

  // Learning & Growth
  learning: [
    "learn", "learning", "study", "understand", "knowledge", "education", "course",
    "tutorial", "practice", "improve", "skill", "beginner", "advanced", "teach"
  ],
  growth: [
    "grow", "growth", "improve", "better", "progress", "develop", "evolve", "change",
    "transform", "journey", "path", "milestone"
  ],

  // Emotional
  frustration: [
    "frustrat", "annoy", "stuck", "confused", "difficult", "hard", "struggle",
    "can't", "won't work", "doesn't work", "hate", "ugh", "argh"
  ],
  curiosity: [
    "curious", "wonder", "interesting", "fascinate", "explore", "discover", "why",
    "how does", "what if", "learn more"
  ],
  excitement: [
    "excit", "amazing", "awesome", "cool", "love", "great", "fantastic", "finally",
    "worked", "success", "yes", "perfect"
  ],
  anxiety: [
    "worr", "anxious", "stress", "nervous", "afraid", "fear", "deadline", "pressure",
    "overwhelm", "panic", "uncertain"
  ],

  // Life
  career: [
    "career", "job", "work", "profession", "interview", "resume", "salary", "promotion",
    "manager", "team", "company", "startup", "business", "entrepreneur"
  ],
  relationships: [
    "relationship", "friend", "family", "partner", "colleague", "team", "collaborate",
    "communicate", "trust", "support"
  ],
  health: [
    "health", "sleep", "exercise", "mental", "wellness", "tired", "energy", "burnout",
    "balance", "rest", "meditat"
  ],
  finance: [
    "money", "finance", "budget", "invest", "save", "cost", "price", "expensive",
    "afford", "income", "salary"
  ],

  // Abstract
  persistence: [
    "persist", "persever", "keep going", "don't give up", "continue", "endure",
    "resilient", "determined", "committed", "dedication"
  ],
  patience: [
    "patient", "patience", "wait", "time", "slow", "gradual", "eventually", "calm",
    "steady", "pace"
  ],
  simplicity: [
    "simple", "simplify", "minimal", "clean", "clear", "elegant", "straightforward",
    "basic", "essential", "reduce"
  ],
  complexity: [
    "complex", "complicated", "intricate", "nuance", "subtle", "layered", "deep",
    "sophisticated"
  ],
  wisdom: [
    "wisdom", "wise", "insight", "perspective", "understand", "realize", "lesson",
    "experience", "knowledge", "truth"
  ],

  // Work & Productivity
  productivity: [
    "productive", "productivity", "efficient", "focus", "distract", "procrastinat",
    "todo", "task", "organize", "priorit", "time management"
  ],
  motivation: [
    "motivat", "inspire", "drive", "passion", "purpose", "goal", "ambition", "dream",
    "aspir", "determination"
  ],

  // Writing & Creativity
  writing: [
    "writ", "essay", "article", "blog", "document", "draft", "edit", "publish",
    "content", "copy", "story", "narrative"
  ],
  creativity: [
    "creativ", "idea", "brainstorm", "innovate", "imagine", "design", "art", "create",
    "original", "unique", "inventive"
  ],

  // Decision Making
  "decision-making": [
    "decide", "decision", "choice", "choose", "option", "alternative", "tradeoff",
    "pros and cons", "evaluate", "assess", "weigh"
  ],
  uncertainty: [
    "uncertain", "unsure", "doubt", "maybe", "perhaps", "risk", "unknown", "unclear",
    "ambiguous", "unpredictable"
  ],

  // Problem Solving
  "problem-solving": [
    "solve", "solution", "problem", "challenge", "approach", "strategy", "method",
    "tackle", "address", "resolve", "figure out"
  ],

  // Success & Failure
  success: [
    "success", "succeed", "achieve", "accomplish", "win", "goal", "milestone",
    "breakthrough", "victory"
  ],
  failure: [
    "fail", "failure", "mistake", "wrong", "error", "setback", "loss", "defeat",
    "disappoint"
  ],

  // Time
  time: [
    "time", "hour", "minute", "day", "week", "month", "year", "deadline", "schedule",
    "late", "early", "soon", "eventually"
  ],

  // Communication
  communication: [
    "communicat", "explain", "clarify", "discuss", "talk", "conversation", "feedback",
    "listen", "understand", "express"
  ],

  // Change
  change: [
    "change", "adapt", "adjust", "transition", "transform", "shift", "evolve",
    "different", "new", "update"
  ],

  // Philosophy
  philosophy: [
    "meaning", "purpose", "exist", "life", "death", "consciousness", "reality",
    "truth", "ethics", "moral", "value"
  ],

  // Courage & Fear
  courage: [
    "courage", "brave", "bold", "confident", "fearless", "risk", "dare", "venture",
    "stand up"
  ],
  fear: [
    "fear", "afraid", "scared", "terrif", "dread", "phobia", "worry", "anxious"
  ]
};

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Generic words that would otherwise prefix-match unrelated terms
// ("work" -> "workflow", "time" -> "timeline", "change" -> "changelog")
const EXACT_MATCH_KEYWORDS = new Set(["work", "time", "change"]);

// Precompiled once at module scope; String.prototype.match with the g flag
// resets lastIndex, so sharing these regexes across calls is safe
const THEME_PATTERNS = Object.entries(THEME_KEYWORDS).map(([theme, keywords]) => ({
  theme,
  keywordCount: keywords.length,
  patterns: keywords.map((keyword) => {
    const suffix = EXACT_MATCH_KEYWORDS.has(keyword) ? "\\b" : "";
    return new RegExp(`\\b${escapeRegExp(keyword)}${suffix}`, "g");
  }),
}));

/**
 * Extract themes from text using keyword matching
 * @param {string} text - The conversation text to analyze
 * @param {number} maxThemes - Maximum number of themes to return (default: 5)
 * @returns {string[]} Array of extracted theme names; empty when nothing matches
 */
function extractThemes(text, maxThemes = 5) {
  if (!text || typeof text !== "string") {
    return [];
  }

  const normalizedText = text.toLowerCase();
  const themeScores = {};

  // Score each theme, normalized by keyword-list size so large lists don't dominate
  for (const { theme, keywordCount, patterns } of THEME_PATTERNS) {
    let score = 0;

    for (const regex of patterns) {
      const matches = normalizedText.match(regex);
      if (matches) {
        score += matches.length;
      }
    }

    if (score > 0) {
      themeScores[theme] = score / keywordCount;
    }
  }

  // Sort themes by score and return top N; [] when nothing matched
  return Object.entries(themeScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxThemes)
    .map(([theme]) => theme);
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
