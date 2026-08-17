#!/usr/bin/env node
// Validates extension/data/quotes.json against the quote-bank rules.
// CommonJS, no dependencies. Run: node scripts/validate-quotes.js
"use strict";

const fs = require("fs");
const path = require("path");

const { getAllThemes } = require("../extension/lib/theme-extractor.js");

const GENERIC_THEMES = new Set(["growth", "motivation", "persistence", "wisdom", "change", "success"]);
const MIN_PER_THEME = 12;
const MAX_PER_AUTHOR = 8;
const MAX_TAGS = 3;
const VAGUE_SOURCES = ["attributed", "unknown", "unsourced", "anonymous", "speech", "interview", "widely quoted", "various", "n/a", "unclear", "disputed"];

// Near-duplicate rule. Two quotes carrying the same line with one word of
// difference pass the exact-text check, so the shorter quote's words are also
// counted against the longer one: a pair fails when at least NEAR_DUP_RATIO of
// the shorter quote's words appear in the longer one.
//
// Word coverage, not edit distance: the seven pairs found in review took four
// shapes — a truncation ("Writing a book is a horrible, exhausting struggle."
// against the full passage), a dropped opening clause plus a word swap
// ("algebraical" against "algebraic"), a one-word swap ("the result" against
// "a result"), and a split word ("anything" against "any thing"). Character
// edit distance separates the last two from the first two by an order of
// magnitude, so no single distance threshold covers them; coverage scores all
// four between 0.933 and 1.000.
//
// The 0.90 line sits above every distinct pair in the bank: the closest is
// 0.714, Hippocrates on the art being long against Longfellow echoing him (ids
// 284 and 309), so there is 0.186 of headroom.
//
// The 6-word floor bounds the coarse end of the ratio. Under 6 words one shared
// word moves coverage by 0.2 or more, so a short aphorism whose every word
// appears in a longer quote scores 1.00 on ordinary reuse rather than on
// duplication. No pair in the bank is excluded by the floor today — running the
// same check at a 1-word floor reports the same zero pairs — so it guards the
// short lines the bank gains later.
const NEAR_DUP_RATIO = 0.9;
const NEAR_DUP_MIN_WORDS = 6;

const QUOTES_PATH = path.join(__dirname, "..", "extension", "data", "quotes.json");

function normalizeText(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function words(normalized) {
  return normalized.split(" ").filter(Boolean);
}

/**
 * Fraction of the shorter word list also present in the longer one, counting
 * repeats once each ("problem" twice needs "problem" twice to match).
 * @returns {number} 0 to 1
 */
function coverage(a, b) {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const remaining = new Map();
  long.forEach((word) => remaining.set(word, (remaining.get(word) || 0) + 1));

  let shared = 0;
  short.forEach((word) => {
    const left = remaining.get(word) || 0;
    if (left > 0) {
      shared += 1;
      remaining.set(word, left - 1);
    }
  });

  return short.length > 0 ? shared / short.length : 0;
}

function main() {
  const violations = [];
  const raw = fs.readFileSync(QUOTES_PATH, "utf8");
  const data = JSON.parse(raw);

  // Check 1: top-level shape
  const hasValidShape =
    data && typeof data === "object" && !Array.isArray(data) && Array.isArray(data.quotes) && data.quotes.length > 0;
  if (!hasValidShape) {
    violations.push("top level must be {version, quotes} with a non-empty quotes array");
    report(violations);
    process.exit(1);
  }

  const quotes = data.quotes;
  const allThemes = getAllThemes();
  const themeVocab = new Set(allThemes);

  const seenIds = new Set();
  const seenTexts = new Map(); // normalized text -> first id that used it
  const wordLists = []; // {label, words} for the near-duplicate pass
  const themeCounts = {};
  const authorCounts = {};
  allThemes.forEach((t) => { themeCounts[t] = 0; });

  quotes.forEach((q, index) => {
    const id = q && q.id;
    const label = Number.isInteger(id) ? `id ${id}` : `quote at index ${index} (no valid id)`;

    // Check 2: id is a positive integer and unique
    if (!Number.isInteger(id) || id <= 0) {
      violations.push(`${label}: id must be a positive integer`);
    } else if (seenIds.has(id)) {
      violations.push(`id ${id}: duplicate id`);
    } else {
      seenIds.add(id);
    }

    // Check 3: text non-empty and unique after normalization
    if (typeof q.text !== "string" || q.text.trim() === "") {
      violations.push(`${label}: text must be a non-empty string`);
    } else {
      const norm = normalizeText(q.text);
      if (seenTexts.has(norm)) {
        violations.push(`${label}: text duplicates ${seenTexts.get(norm)} after normalization`);
      } else {
        seenTexts.set(norm, label);
        wordLists.push({ label, words: words(norm) });
      }
    }

    // Check 4: author non-empty
    if (typeof q.author !== "string" || q.author.trim() === "") {
      violations.push(`${label}: author must be a non-empty string`);
    } else {
      authorCounts[q.author] = (authorCounts[q.author] || 0) + 1;
    }

    // Check 5: source non-empty, at least 4 chars, not vague. Length and
    // vagueness are judged on the trimmed value, so padding cannot buy either.
    const source = typeof q.source === "string" ? q.source.trim() : "";
    if (source === "") {
      violations.push(`${label}: source must be a non-empty string`);
    } else if (source.length < 4) {
      violations.push(`${label}: source must be at least 4 characters`);
    } else {
      const lowerSource = source.toLowerCase();
      if (VAGUE_SOURCES.some((v) => lowerSource === v || lowerSource.startsWith(v))) {
        violations.push(`${label}: source "${source}" is too vague`);
      }
    }

    // Check 6: themes 1-3 entries, all in vocab, at least one non-generic
    const themes = Array.isArray(q.themes) ? q.themes : null;
    if (!themes || themes.length < 1 || themes.length > MAX_TAGS) {
      violations.push(`${label}: themes must have 1 to ${MAX_TAGS} entries`);
    } else {
      const illegal = themes.filter((t) => !themeVocab.has(t));
      illegal.forEach((t) => violations.push(`${label}: theme "${t}" is not in getAllThemes()`));
      const repeated = themes.filter((t, i) => themes.indexOf(t) !== i);
      new Set(repeated).forEach((t) => violations.push(`${label}: theme "${t}" is listed twice`));
      if (illegal.length === 0 && themes.every((t) => GENERIC_THEMES.has(t))) {
        violations.push(`${label}: themes are all generic (${themes.join(", ")})`);
      }
      themes.forEach((t) => {
        if (themeVocab.has(t)) themeCounts[t] += 1;
      });
    }
  });

  // Check 7: every theme carried by at least MIN_PER_THEME quotes
  allThemes.forEach((theme) => {
    if (themeCounts[theme] < MIN_PER_THEME) {
      violations.push(`theme "${theme}": only ${themeCounts[theme]} quotes, needs at least ${MIN_PER_THEME}`);
    }
  });

  // Check 8: no author over MAX_PER_AUTHOR
  Object.entries(authorCounts).forEach(([author, count]) => {
    if (count > MAX_PER_AUTHOR) {
      violations.push(`author "${author}": appears ${count} times, max is ${MAX_PER_AUTHOR}`);
    }
  });

  // Check 9: no near-duplicate pair (see NEAR_DUP_RATIO)
  const candidates = wordLists.filter((entry) => entry.words.length >= NEAR_DUP_MIN_WORDS);
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const ratio = coverage(candidates[i].words, candidates[j].words);
      if (ratio >= NEAR_DUP_RATIO) {
        violations.push(
          `${candidates[j].label}: near-duplicate of ${candidates[i].label} (${ratio.toFixed(2)} word coverage)`
        );
      }
    }
  }

  report(violations);

  if (violations.length > 0) {
    process.exit(1);
  }

  console.log(
    `OK: ${quotes.length} quotes, ${allThemes.length} themes, ${Object.keys(authorCounts).length} authors`
  );
  process.exit(0);
}

function report(violations) {
  if (violations.length === 0) return;
  console.error(`${violations.length} violation(s):`);
  violations.forEach((v) => console.error(`  - ${v}`));
}

main();
