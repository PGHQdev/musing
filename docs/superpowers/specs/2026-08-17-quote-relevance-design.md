# Quote relevance and reason specificity — design

Date: 2026-08-17
Status: approved for planning

## Problem

Quotes read as generic and unrelated to what the user discussed. Three causes
compound, and no single one is a bug.

1. **The bank is thin and skewed.** 93 quotes, 27 distinct tags. Eight themes the
   extractor can emit have zero quotes: `architecture`, `algorithms`, `curiosity`,
   `excitement`, `anxiety`, `relationships`, `health`, `finance`. `career` has one
   quote, `complexity` has two. Those themes fall through to the random fallback.
   The three most common tags are the three most generic: `growth` (22),
   `motivation` (17), `persistence` (14).
2. **Signal is diluted at every stage.** `extractThemes` returns a fixed top 5 with
   no threshold. `history-extractor.js` asks for 10. The two sets merge as a flat
   union, so up to 15 equal-weight themes reach matching. `findQuotesByThemes`
   scores by raw tag overlap, takes the top 30, then shuffles. `getQuoteForDisplay`
   picks uniformly at random from a 30-quote cache that still holds quotes from a
   previous topic. Rank is discarded twice.
3. **The reason line is a fixed string.** `THEME_REASONS[matchedThemes[0]]`, where
   the tag order comes from the quote rather than from what drove the match.

## Decisions

- Grow the bank to about 400 quotes with a floor of 12 per theme.
- Every quote carries a verifiable `source`, enforced in CI.
- Keep keyword extraction. Fix the scoring end to end. Local embeddings and BYOK
  reranking are out of scope.
- Reason format: short theme phrase, a middle dot, then the matched words.

---

## 1. Quote bank

**Target**: about 400 quotes, floor of 12 per each of the 34 extractor themes.
Multi-tag overlap keeps the total near 400 rather than 34 × 12. Expected size is
about 65 KB, plus about 12 KB for the `source` field.

**Schema** gains one field:

```json
{
  "id": 1,
  "text": "Simplicity is prerequisite for reliability.",
  "author": "Edsger Dijkstra",
  "source": "EWD498 (1975)",
  "themes": ["simplicity", "programming", "debugging"]
}
```

**Sourcing**. Candidates come from recall, one theme at a time, then pass a triage:

1. The work and passage are nameable. Accept and record `source`.
2. Widely repeated with no nameable work. Verify against Wikiquote and Quote
   Investigator, or drop. Wikiquote keeps explicit "Misattributed" and "Unsourced"
   sections per author, which is the signal used.
3. Known floating attributions (Einstein, Twain, Gandhi, Churchill, Confucius,
   Buddha). Drop by default.

Wikiquote serves as a reference for checking. No dataset compilation is copied, so
no share-alike question arises.

**Composition by theme group**:

- Life and abstract themes (philosophy, courage, patience, change, fear,
  uncertainty, wisdom, persistence): public-domain primary texts. Marcus Aurelius,
  Seneca, Montaigne, Emerson, Thoreau, William James, Franklin.
- Technical themes (programming, debugging, architecture, algorithms, complexity,
  simplicity): cited engineering literature. Dijkstra, Knuth, Brooks, Kernighan,
  Hoare, Lamport, Hamming, Norman, Beck, Fowler.
- Work and emotion themes (career, health, anxiety, relationships, productivity,
  communication): the thinnest supply of citable material and the largest share of
  bucket 2. Expect the most drops here.

**Tagging rules**, enforced by the validator:

- At most 3 tags per quote, at least 1.
- Every tag exists in `getAllThemes()`. The dead `planning` tag on id 3 is removed.
- At least one tag outside `GENERIC_THEMES` = {growth, motivation, persistence,
  wisdom, change, success}. A quote tagged only with generic themes fails.
- One author appears at most 4 times.

These rules are what give the inverse-frequency weights in section 4 something to
separate.

## 2. Theme model and storage

`extractThemes(text, maxThemes)` returns a sorted array of objects:

```js
[{ theme: "debugging", score: 0.42, terms: ["stack traces", "exception"] }]
```

Call sites that change: `background.js:525`, `history-extractor.js:186`.

`Store.themes.getExtracted()` and `getHistoryThemes()` normalize on read. An
existing `string[]` from an installed user maps to `{theme, score: 1, terms: []}`.
No storage version bump and no reset for current users.

`Store.conversations` keeps its current shape. Per-entry platform and timestamp are
out of scope for this design.

## 3. Extraction

Each keyword list splits into two tiers. Strong keywords are decisive alone
("microservice", "recursion", "burnout", "procrastinat"). Weak keywords need
company ("work", "better", "system", "improve").

```
distinctStrong = strong keywords with >= 1 match
distinctWeak   = weak keywords with >= 1 match
reject theme unless distinctStrong >= 1 or distinctWeak >= 2
raw   = 2*distinctStrong + distinctWeak
score = raw / max(2*strongCount + weakCount, 12)
keep themes with score >= 0.4 * topScore, capped at maxThemes
```

Distinct keyword counts replace total match counts, so one word repeated forty
times stops carrying a theme. The relative cutoff replaces the fixed top 5, so a
focused conversation yields one or two themes. History extraction drops from 10
themes to 5.

**Term capture** for the reason line. Patterns widen from `\b{keyword}` to
`\b{keyword}\w*`, and the matched word is recorded as it appeared. Stems become
real words: "frustrat" surfaces as "frustrating", "procrastinat" as
"procrastinating". Multi-word keywords keep working, since `\bstack trace\w*`
matches "stack traces".

Term rules:

- `EXACT_MATCH_KEYWORDS` ("work", "time", "change", "life", "art", "big o") keep
  their `\b` suffix and record the keyword unchanged. Widening would break the
  guard that stops "work" matching "workflow". Task 6 added the last three and
  paired them with `SUPPRESSED_FORMS`; see the amendment note below.
- Keep up to 3 distinct terms per theme, strong tier first, then by hit count.
- Lowercase, deduplicated, at most 24 characters, letters plus spaces and hyphens
  only. Anything else is dropped.
- Drop any term that equals the theme phrase or appears inside it. Keyword lists
  contain the theme name itself for many themes, and `writing · "writing"` adds
  nothing.

## 4. Matching

`quotes-db.js` builds an inverse-frequency table once after load:

```
idf(theme)  = log(N / (1 + quotesTaggedWith(theme)))
quoteScore  = SUM over matched tags [ userScore(tag) * idf(tag) ] / sqrt(quote.themes.length)
```

A `debugging` match outweighs a `growth` match by frequency. The `sqrt` divisor
removes the reward for wide tagging. `findQuotesByThemes(scoredThemes, count)`
returns `[{quote, score}]` ranked, with the shuffle removed. Call sites:
`background.js:548`, `:597`, `:606`.

The random fallback stays for the case where nothing scores above zero.

## 5. Selection

- `getQuoteForDisplay` samples with probability proportional to `score²` among the
  candidates that survive the recency filter. Variety holds and rank counts.
- The cache stores a `themeKey`, the sorted theme names joined. When the key
  changes the cache rebuilds. The merge path in `refreshLocalQuoteCache` applies
  only when the key is unchanged, so a past topic stops feeding today's quotes.
- History themes merge at weight 0.5 against conversation themes at 1.0.
- `matchedThemes` sorts by contribution (`userScore * idf`), so the first entry is
  the theme that drove the pick.

## 6. Reasons

The response gains `origin: "matched" | "fallback"`. A fallback pick shows no
reason line. Today a fallback quote that happens to share a tag renders a clause
that implies causation.

Background sends `reason: {theme, terms, origin}`. Composition stays in
`newtab.js` beside the existing table, which becomes two fields per theme:

```js
debugging: { lead: "you've been troubleshooting code", phrase: "troubleshooting code" },
health:    { lead: "you're focused on wellbeing",      phrase: "focused on wellbeing" },
```

Rendering:

- Terms present: `phrase · "term", "term"`, at most 2 terms shown.
- Terms absent: `lead`, which is the current copy unchanged.
- `origin: "fallback"`: empty string, and the element loses its `show` class.
- AI reasons (BYOK) keep priority over both, unchanged.

Examples:

```
troubleshooting code · "stack trace", "exception"
focused on wellbeing · "burnout", "tired"
weighing options · "tradeoff", "alternative"
```

The chips under the quote already display theme names, so the reason line carries
the evidence rather than repeating the theme.

## 7. Validation and tests

`scripts/validate-quotes.js`, run in CI. It `require`s `lib/theme-extractor.js`,
which already exposes `getAllThemes()` behind a `module.exports` guard, so the
vocabulary has one source. Checks:

- ids unique and integer; `author` and `source` non-empty; `source` rejects vague
  values such as "attributed", "unknown", "speech", "interview".
- `text` unique after normalization (lowercase, punctuation and quotes stripped).
- 1 to 3 tags, all in `getAllThemes()`, at least one outside `GENERIC_THEMES`.
- Every theme holds at least 12 quotes. No author exceeds 4 quotes.
- Exit 1 with every violation listed, rather than the first.

`scripts/validate-themes.js` with `scripts/theme-fixtures.json`, run in CI. About
15 sample texts: a debugging session, career doubt, a writing task, burnout, an
architecture discussion, and two deliberately ambiguous chats. Each fixture
declares `expectTop`, `expectAbsent`, and `expectTerms`. This is the measurable
definition of relevance for this work.

`.github/workflows/ci.yml` gains one step running both validators beside the
existing syntax checks.

## 8. Files and order

Order matters, because the inverse-frequency weights read from the bank.

1. `extension/data/quotes.json`, `scripts/validate-quotes.js`, CI step.
2. `extension/lib/theme-extractor.js`, `scripts/validate-themes.js`,
   `scripts/theme-fixtures.json`.
3. `extension/lib/quotes-db.js`, `extension/lib/storage.js` read normalization.
4. `extension/background.js` call sites, cache rule, history weighting, `origin`.
5. `extension/newtab/newtab.js` reason table and composition.

One commit per stage with CI green at each. `extension/popup/popup.js` needs no
change.

Estimated agent execution time: 60-90 minutes for stage 1, 90-120 minutes for
stages 2 through 5.

## 9. Rejected

- **Local embeddings.** transformers.js with MiniLM, quote vectors precomputed at
  build time. Highest relevance ceiling, since it escapes the 34-bucket
  vocabulary. Costs about 25 MB of bundle, WASM inside an MV3 service worker, a
  first-run load delay, and added store review risk.
- **BYOK reranking.** Passing candidates to the user's own API key serves only
  users who set one, adds latency, and widens the privacy surface. Available as a
  later layer on top of this design.
- **Remote quote API on Workers and D1.** Adds infrastructure and a network call to
  an extension that is local-only today.
- **Bulk dataset import.** Fast scale with weaker attribution accuracy and noisier
  tags, which is the problem this design exists to fix.

## 10. Risks

- Retiering roughly 450 keywords by hand is where errors hide. The fixtures in
  section 7 are the guard.
- A wrong attribution repeated across many pages can survive verification.
  Wikiquote and Quote Investigator exist to track that class of error, which is
  why they are the references.
- The relative cutoff in section 3 can return a single theme for short
  conversations. The random fallback and the `origin` flag cover that case
  honestly.
- Cache rebuild on theme change increases write volume on `chrome.storage.local`.
  The cap of 30 quotes bounds it.

## 11. Amended during implementation

Two decisions in section 3 changed while Task 6 was implemented, and three more
in sections 1, 5 and 7 changed in the review pass before merge. The rest of this
document is the design as approved.

**The denominator floor** (`score = raw / max(2*strongCount + weakCount, 12)`).
This reverses Task 2, which dropped a floor after measuring the smallest
denominator across all 34 themes at exactly 12, making `max(denom, 12)` a no-op.
Task 6 removed 25 weak keywords and demoted five strong ones, taking `growth` to
7 and `change` to 8, and Task 2's own pruning had already taken `time` to 9. Score
is a fraction of a theme's own vocabulary, so a shorter list makes each surviving
hit worth more, and `growth` reached 0.571 on project-management wording — twice
what the same evidence scored before the keywords were cleaned up. A theme should
not gain confidence by losing keywords. The floor binds on 3 of 34 themes and
leaves the other 31 untouched, and it moves neither the relative-cutoff band,
still (0.3667, 0.4444], nor either pin.

**`SUPPRESSED_FORMS`**, an extension of Task 2's `INVERTED_FORMS`. Widening a
keyword to `\b{keyword}\w*` also claims words that merely start the same way:
"exist" claimed "existing", "listen" claimed "listener", "react" claimed
"reaction". Exact match cures that by throwing away every honest inflection,
including the plural, so it is now reserved for keywords whose widened set is
mostly noise. Everything else keeps widening and names its false forms, which
`matchKeyword` skips unless the keyword is one of them.

**Bank size and the per-author cap** (sections 1 and 7). The target of "about 400
quotes" and the cap of 4 quotes per author were both set before the sourcing work.
Requiring a citable source for every line made 4 too tight for the authors who
carry the thin themes, so the validator enforces 8, and the bank landed at 342
quotes across the 34 themes rather than 400. The floor of 12 per theme is
unchanged and holds with three themes exactly at it.

**Near-duplicate detection in the validator** (section 7). Unique text after
normalization proved too weak: seven pairs shipped carrying the same line with one
word of difference, one of them a corrupted Pólya maxim. The validator now also
fails a pair when at least 90% of the shorter quote's words appear in the longer
one, both being at least 6 words. It reads the trimmed `source` for the length and
vagueness checks, and rejects a repeated tag inside one `themes` array.

**Pool size** (section 5). Ranking is deterministic once the shuffle is gone, so
`DEFAULT_CACHE_SIZE` is the whole set a stable topic can reach. At 15 a philosophy
topic drew 15 of the 26 quotes tagged philosophy over 120 draws and never the
rest. It is now 30, the cap `Store.quotes.setCache` already applied, which covers
the largest theme in the bank. A topic whose combined themes tag more than 30
quotes still ends at 30.
