#!/usr/bin/env node
// Validates extension/lib/theme-extractor.js against scripts/theme-fixtures.json.
// The fixtures are the measurable definition of relevance for the extractor.
// CommonJS, no dependencies. Run: node scripts/validate-themes.js
"use strict";

const fs = require("fs");
const path = require("path");

const { extractThemes, getAllThemes } = require("../extension/lib/theme-extractor.js");

const FIXTURES_PATH = path.join(__dirname, "theme-fixtures.json");
const MAX_THEMES = 5;

function formatRanked(themes) {
  if (themes.length === 0) return "(none)";
  return themes
    .map((t) => `${t.theme} ${t.score.toFixed(3)} [${t.terms.join(", ")}]`)
    .join("; ");
}

function main() {
  const failures = [];
  const raw = fs.readFileSync(FIXTURES_PATH, "utf8");
  const data = JSON.parse(raw);

  if (!data || !Array.isArray(data.fixtures) || data.fixtures.length === 0) {
    console.error("theme-fixtures.json must be {fixtures: [...]} with a non-empty array");
    process.exit(1);
  }

  const themeVocab = new Set(getAllThemes());
  const seenNames = new Set();

  data.fixtures.forEach((fixture, index) => {
    const name = typeof fixture.name === "string" && fixture.name.trim() ? fixture.name : `fixture at index ${index}`;
    const fail = (message, detail) => failures.push({ name, message, detail });

    if (seenNames.has(name)) {
      fail("duplicate fixture name");
    }
    seenNames.add(name);

    if (typeof fixture.text !== "string" || fixture.text.trim() === "") {
      fail("text must be a non-empty string");
      return;
    }

    // Guard against a typo silently turning an assertion into a no-op
    const declared = [fixture.expectTop, ...(fixture.expectAbsent || [])].filter(Boolean);
    declared.forEach((theme) => {
      if (!themeVocab.has(theme)) fail(`declares theme "${theme}", which is not in getAllThemes()`);
    });

    const ranked = extractThemes(fixture.text, MAX_THEMES);
    const detail = `ranked: ${formatRanked(ranked)}`;

    if (fixture.expectEmpty) {
      if (ranked.length > 0) fail("expected an empty result", detail);
      return;
    }

    if (typeof fixture.expectTop !== "string") {
      fail("needs expectTop, or expectEmpty");
      return;
    }

    if (ranked.length === 0 || ranked[0].theme !== fixture.expectTop) {
      fail(`expected top theme "${fixture.expectTop}"`, detail);
    }

    const leaked = (fixture.expectAbsent || []).filter((theme) => ranked.some((t) => t.theme === theme));
    if (leaked.length > 0) {
      fail(`expected absent, but present: ${leaked.join(", ")}`, detail);
    }

    const topTerms = ranked.length > 0 ? ranked[0].terms : [];
    const missing = (fixture.expectTerms || []).filter((term) => !topTerms.includes(term));
    if (missing.length > 0) {
      fail(`expected terms on the top theme: ${missing.join(", ")}`, detail);
    }
  });

  if (failures.length > 0) {
    console.error(`${failures.length} failure(s):`);
    failures.forEach((f) => {
      console.error(`  - ${f.name}: ${f.message}`);
      if (f.detail) console.error(`      ${f.detail}`);
    });
    process.exit(1);
  }

  console.log(`OK: ${data.fixtures.length} fixtures, ${themeVocab.size} themes`);
  process.exit(0);
}

main();
