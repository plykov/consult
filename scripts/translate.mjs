#!/usr/bin/env node
/**
 * Automatic translation sync. No dependencies — Node 18+ only.
 *
 * English (content/en/**) is the single source of truth. This script finds
 * every EN content file that changed since it was last translated (tracked
 * via SHA-256 hashes in content/.translation-state.json) and regenerates the
 * DE / NL / FR / ES versions with the Claude API.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... node scripts/translate.mjs           # sync stale files
 *   ANTHROPIC_API_KEY=... node scripts/translate.mjs --all     # force full retranslation
 *   node scripts/translate.mjs --check                          # list stale files, exit 1 if any
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'content');
const STATE_FILE = join(CONTENT, '.translation-state.json');
const SOURCE_LANG = 'en';
const MODEL = process.env.TRANSLATE_MODEL || 'claude-sonnet-5';

const config = JSON.parse(readFileSync(join(CONTENT, 'config.json'), 'utf8'));
const TARGET_LANGS = config.languages.filter((l) => l !== SOURCE_LANG);
const LANG_NAMES = { de: 'German', nl: 'Dutch', fr: 'French', es: 'Spanish' };

const FORCE_ALL = process.argv.includes('--all');
const CHECK_ONLY = process.argv.includes('--check');

// ---------------------------------------------------------------- helpers

const sha = (s) => createHash('sha256').update(s).digest('hex');

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith('.md') || p.endsWith('.json')) yield p;
  }
}

function loadState() {
  return existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {};
}

// ---------------------------------------------------------------- prompts

function buildPrompt(relPath, source, langCode) {
  const langName = LANG_NAMES[langCode] || langCode;
  const isJson = relPath.endsWith('.json');
  const rules = [
    `Translate the following website content file from English to ${langName}.`,
    'This is content for a B2B go-to-market strategy consultancy targeting technical companies entering Europe and Dutch companies expanding internationally. Use professional, idiomatic business language a native-speaking executive would write — not literal translation.',
    'Keep the brand name "Bridgehead" and the newsletter name "The Decision Unit" in English.',
    'Keep product/industry terms that professionals use in English (e.g. "go-to-market", "pipeline", "ICP") where that is the natural register in the target language.',
    isJson
      ? 'The file is JSON: translate ONLY the string values. Keys, structure, arrays and any URLs/emails must remain byte-identical. Output must be valid JSON.'
      : 'The file is Markdown with YAML frontmatter: keep all frontmatter KEYS, the `order`, `issue` and `date` values, and all Markdown structure (headings, lists, bold) unchanged; translate frontmatter string values and body text.',
    'Output ONLY the translated file content. No explanations, no code fences.',
  ].join('\n- ');

  return `- ${rules}\n\nFile path: ${relPath}\n\n<file>\n${source}\n</file>`;
}

async function callClaude(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

function stripFences(text) {
  const m = text.match(/^```[a-z]*\r?\n([\s\S]*?)\r?\n```$/);
  return m ? m[1] : text;
}

async function translateFile(relPath, source, langCode) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const out = stripFences(await callClaude(buildPrompt(relPath, source, langCode)));
      if (relPath.endsWith('.json')) JSON.parse(out); // validate
      else if (!/^---\r?\n/.test(out)) throw new Error('missing frontmatter in translation');
      return out.endsWith('\n') ? out : out + '\n';
    } catch (err) {
      if (attempt === 3) throw err;
      console.warn(`  retry ${attempt} for ${langCode}/${relPath}: ${err.message}`);
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
}

// ---------------------------------------------------------------- main

const state = loadState();
const sourceDir = join(CONTENT, SOURCE_LANG);
const jobs = [];

for (const file of walk(sourceDir)) {
  const relPath = relative(sourceDir, file);
  const source = readFileSync(file, 'utf8');
  const hash = sha(source);
  for (const lang of TARGET_LANGS) {
    const key = `${lang}/${relPath}`;
    const target = join(CONTENT, lang, relPath);
    if (FORCE_ALL || state[key] !== hash || !existsSync(target)) {
      jobs.push({ relPath, source, hash, lang, target, key });
    }
  }
}

if (CHECK_ONLY) {
  if (jobs.length === 0) {
    console.log('All translations are in sync with content/en.');
    process.exit(0);
  }
  console.log('Stale translations:');
  for (const j of jobs) console.log(`  ${j.key}`);
  process.exit(1);
}

if (jobs.length === 0) {
  console.log('Nothing to translate — all languages in sync with content/en.');
  process.exit(0);
}

console.log(`Translating ${jobs.length} file(s) with ${MODEL}…`);
let failures = 0;
for (const job of jobs) {
  process.stdout.write(`  ${job.key} … `);
  try {
    const translated = await translateFile(job.relPath, job.source, job.lang);
    mkdirSync(dirname(job.target), { recursive: true });
    writeFileSync(job.target, translated);
    state[job.key] = job.hash;
    console.log('ok');
  } catch (err) {
    failures++;
    console.log(`FAILED (${err.message})`);
  }
}

writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
console.log(`Done. ${jobs.length - failures} translated, ${failures} failed.`);
process.exit(failures ? 1 : 0);
