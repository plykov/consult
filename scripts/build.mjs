#!/usr/bin/env node
/**
 * Static site builder. No dependencies — Node 18+ only.
 *
 * Reads content/{lang}/site.json, cases/*.md, newsletter/*.md and renders
 * a fully static multilingual site into dist/.
 *
 * BASE_PATH env var sets the URL prefix (e.g. "/WatchPrayer" for GitHub
 * project pages). Defaults to "".
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'content');
const DIST = join(ROOT, 'dist');
const BASE = (process.env.BASE_PATH || '').replace(/\/$/, '');

const config = JSON.parse(readFileSync(join(CONTENT, 'config.json'), 'utf8'));
const LANGS = config.languages;

// ---------------------------------------------------------------- helpers

const esc = (s) => String(s)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

/** Minimal frontmatter parser: `key: value` pairs plus `key:\n  - item` lists. */
function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: raw };
  const data = {};
  let currentKey = null;
  for (const line of m[1].split(/\r?\n/)) {
    const listItem = line.match(/^\s+-\s+(.*)$/);
    if (listItem && currentKey) {
      if (!Array.isArray(data[currentKey])) data[currentKey] = [];
      data[currentKey].push(listItem[1].replace(/^"(.*)"$/, '$1'));
      continue;
    }
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (kv) {
      currentKey = kv[1];
      const value = kv[2].replace(/^"(.*)"$/, '$1');
      data[currentKey] = value === '' ? [] : value;
    }
  }
  return { data, body: m[2] };
}

/** Minimal markdown renderer: h2/h3, paragraphs, ul lists, bold, italics, numbered lists. */
function inline(md) {
  return esc(md)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

function markdown(md) {
  const blocks = md.trim().split(/\r?\n\r?\n+/);
  return blocks.map((block) => {
    const b = block.trim();
    if (!b) return '';
    if (b.startsWith('## ')) return `<h2>${inline(b.slice(3))}</h2>`;
    if (b.startsWith('### ')) return `<h3>${inline(b.slice(4))}</h3>`;
    const lines = b.split(/\r?\n/);
    if (lines.every((l) => /^-\s+/.test(l))) {
      return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^-\s+/, ''))}</li>`).join('')}</ul>`;
    }
    if (lines.every((l) => /^\d+\.\s+/.test(l))) {
      return `<ol>${lines.map((l) => `<li>${inline(l.replace(/^\d+\.\s+/, ''))}</li>`).join('')}</ol>`;
    }
    return `<p>${lines.map(inline).join('<br>')}</p>`;
  }).join('\n');
}

function loadCollection(lang, kind) {
  const dir = join(CONTENT, lang, kind);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const { data, body } = parseFrontmatter(readFileSync(join(dir, f), 'utf8'));
      return { slug: f.replace(/\.md$/, ''), ...data, bodyHtml: markdown(body) };
    });
}

function writePage(relPath, html) {
  const out = join(DIST, relPath);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
}

// ---------------------------------------------------------------- layout

/**
 * @param relPath page path relative to the language root, e.g. "" | "cases/" | "cases/slug/"
 */
function layout({ lang, t, title, description, relPath, active, body }) {
  const alternates = LANGS.map((l) =>
    `<link rel="alternate" hreflang="${l}" href="${config.siteUrl}/${l}/${relPath}">`).join('\n  ');
  const langSwitch = LANGS.map((l) => l === lang
    ? `<span class="lang current" aria-current="true">${l.toUpperCase()}</span>`
    : `<a class="lang" lang="${l}" hreflang="${l}" href="${BASE}/${l}/${relPath}" title="${esc(config.languageNames[l])}">${l.toUpperCase()}</a>`
  ).join('');
  const nav = [
    ['', t.nav.home, 'home'],
    ['cases/', t.nav.cases, 'cases'],
    ['newsletter/', t.nav.newsletter, 'newsletter'],
    ['#contact', t.nav.contact, 'contact'],
  ].map(([path, label, key]) => {
    const href = path === '#contact' ? `${BASE}/${lang}/#contact` : `${BASE}/${lang}/${path}`;
    return `<a href="${href}"${key === active ? ' class="active"' : ''}>${esc(label)}</a>`;
  }).join('');

  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${config.siteUrl}/${lang}/${relPath}">
  ${alternates}
  <link rel="alternate" hreflang="x-default" href="${config.siteUrl}/${config.defaultLanguage}/${relPath}">
  <link rel="stylesheet" href="${BASE}/styles.css">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%230d3b4f'/%3E%3Cpath d='M8 24V8h7a5 5 0 0 1 3.5 8.6A5 5 0 0 1 16 24H8zm4-9.5h3a1.5 1.5 0 0 0 0-3h-3v3zm0 6h4a1.5 1.5 0 0 0 0-3h-4v3z' fill='%23e8b04b'/%3E%3C/svg%3E">
</head>
<body>
<header class="site-header">
  <div class="container header-inner">
    <a class="brand" href="${BASE}/${lang}/">
      <span class="brand-mark" aria-hidden="true">B</span>
      <span class="brand-text">${esc(t.brand.name)}<small>${esc(t.brand.tagline)}</small></span>
    </a>
    <nav class="site-nav" aria-label="Main">${nav}</nav>
    <div class="lang-switch" aria-label="Language">${langSwitch}</div>
  </div>
</header>
<main>
${body}
</main>
<footer class="site-footer">
  <div class="container footer-inner">
    <p>${esc(t.footer.note)}</p>
    <p>&copy; ${new Date().getFullYear()} ${esc(t.brand.name)}. ${esc(t.footer.rights)}</p>
  </div>
</footer>
</body>
</html>
`;
}

// ---------------------------------------------------------------- sections

function newsletterSignup(t, { compact = false } = {}) {
  return `
<section class="newsletter-cta${compact ? ' compact' : ''}" id="newsletter">
  <div class="container narrow">
    <p class="kicker">${esc(t.newsletter.title)}</p>
    <h2>${esc(t.newsletter.name)}</h2>
    <p class="lead">${esc(t.newsletter.lead)}</p>
    <form class="signup" action="${esc(config.newsletterFormAction)}" method="post" target="_blank">
      <label class="visually-hidden" for="nl-email">Email</label>
      <input id="nl-email" type="email" name="email" required placeholder="${esc(t.newsletter.emailPlaceholder)}">
      <button type="submit">${esc(t.newsletter.submit)}</button>
    </form>
    <p class="privacy">${esc(t.newsletter.privacyNote)}</p>
  </div>
</section>`;
}

function caseCard(lang, t, c) {
  return `
<article class="card case-card">
  <p class="card-meta">${esc(c.sector)}</p>
  <h3><a href="${BASE}/${lang}/cases/${c.slug}/">${esc(c.title)}</a></h3>
  <p>${esc(c.summary)}</p>
  <p class="card-link"><a href="${BASE}/${lang}/cases/${c.slug}/">${esc(t.cases.readMore)} →</a></p>
</article>`;
}

// ---------------------------------------------------------------- pages

function buildLang(lang) {
  const t = JSON.parse(readFileSync(join(CONTENT, lang, 'site.json'), 'utf8'));
  const cases = loadCollection(lang, 'cases').sort((a, b) => (+a.order || 99) - (+b.order || 99));
  const issues = loadCollection(lang, 'newsletter').sort((a, b) => (+b.issue || 0) - (+a.issue || 0));

  // ---- home
  const home = `
<section class="hero">
  <div class="container">
    <p class="kicker">${esc(t.hero.kicker)}</p>
    <h1>${esc(t.hero.title)}</h1>
    <p class="lead">${esc(t.hero.lead)}</p>
    <div class="cta-row">
      <a class="btn primary" href="mailto:${esc(config.contactEmail)}">${esc(t.hero.ctaPrimary)}</a>
      <a class="btn ghost" href="${BASE}/${lang}/cases/">${esc(t.hero.ctaSecondary)}</a>
    </div>
  </div>
</section>

<section class="section" id="audiences">
  <div class="container">
    <h2>${esc(t.audiences.title)}</h2>
    <div class="grid two">
      ${t.audiences.items.map((a) => `
      <article class="card audience">
        <h3>${esc(a.title)}</h3>
        <p>${esc(a.body)}</p>
      </article>`).join('')}
    </div>
  </div>
</section>

<section class="section alt" id="problem">
  <div class="container">
    <h2>${esc(t.problem.title)}</h2>
    <p class="section-lead">${esc(t.problem.lead)}</p>
    <div class="grid four">
      ${t.problem.items.map((p, i) => `
      <article class="card problem">
        <span class="num">${String(i + 1).padStart(2, '0')}</span>
        <h3>${esc(p.title)}</h3>
        <p>${esc(p.body)}</p>
      </article>`).join('')}
    </div>
  </div>
</section>

<section class="section" id="services">
  <div class="container">
    <h2>${esc(t.services.title)}</h2>
    <p class="section-lead">${esc(t.services.lead)}</p>
    <div class="grid two">
      ${t.services.items.map((s) => `
      <article class="card service">
        <h3>${esc(s.title)}</h3>
        <p>${esc(s.body)}</p>
      </article>`).join('')}
    </div>
  </div>
</section>

<section class="section alt" id="cases">
  <div class="container">
    <h2>${esc(t.cases.title)}</h2>
    <p class="section-lead">${esc(t.cases.lead)}</p>
    <div class="grid three">
      ${cases.map((c) => caseCard(lang, t, c)).join('')}
    </div>
    <p class="section-more"><a class="btn ghost" href="${BASE}/${lang}/cases/">${esc(t.cases.all)}</a></p>
  </div>
</section>

${newsletterSignup(t)}

<section class="section" id="contact">
  <div class="container narrow center">
    <h2>${esc(t.contact.title)}</h2>
    <p class="lead">${esc(t.contact.lead)}</p>
    <p><a class="btn primary" href="mailto:${esc(config.contactEmail)}">${esc(config.contactEmail)}</a></p>
  </div>
</section>`;

  writePage(`${lang}/index.html`, layout({
    lang, t, relPath: '', active: 'home', body: home,
    title: t.meta.titleSuffix, description: t.meta.description,
  }));

  // ---- cases index
  const casesIndex = `
<section class="page-head">
  <div class="container">
    <h1>${esc(t.cases.title)}</h1>
    <p class="lead">${esc(t.cases.lead)}</p>
  </div>
</section>
<section class="section">
  <div class="container">
    <div class="grid three">
      ${cases.map((c) => caseCard(lang, t, c)).join('')}
    </div>
  </div>
</section>
${newsletterSignup(t, { compact: true })}`;

  writePage(`${lang}/cases/index.html`, layout({
    lang, t, relPath: 'cases/', active: 'cases', body: casesIndex,
    title: `${t.cases.title} · ${t.meta.titleSuffix}`, description: t.cases.lead,
  }));

  // ---- case detail
  for (const c of cases) {
    const body = `
<article class="section article">
  <div class="container narrow">
    <p class="breadcrumb"><a href="${BASE}/${lang}/cases/">← ${esc(t.cases.back)}</a></p>
    <h1>${esc(c.title)}</h1>
    <dl class="case-facts">
      <div><dt>${esc(t.cases.clientLabel)}</dt><dd>${esc(c.client)}</dd></div>
      <div><dt>${esc(t.cases.sectorLabel)}</dt><dd>${esc(c.sector)}</dd></div>
    </dl>
    <aside class="results">
      <h2>${esc(t.cases.resultsLabel)}</h2>
      <ul>${(c.results || []).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
    </aside>
    <div class="prose">${c.bodyHtml}</div>
  </div>
</article>
${newsletterSignup(t, { compact: true })}`;

    writePage(`${lang}/cases/${c.slug}/index.html`, layout({
      lang, t, relPath: `cases/${c.slug}/`, active: 'cases', body,
      title: `${c.title} · ${t.brand.name}`, description: c.summary,
    }));
  }

  // ---- newsletter index
  const nlIndex = `
${newsletterSignup(t)}
<section class="section">
  <div class="container narrow">
    <h2>${esc(t.newsletter.archiveTitle)}</h2>
    ${issues.map((i) => `
    <article class="issue-row">
      <p class="card-meta">#${esc(i.issue)} · ${esc(i.date)}</p>
      <h3><a href="${BASE}/${lang}/newsletter/${i.slug}/">${esc(i.title)}</a></h3>
      <p>${esc(i.summary)}</p>
      <p class="card-link"><a href="${BASE}/${lang}/newsletter/${i.slug}/">${esc(t.newsletter.readIssue)} →</a></p>
    </article>`).join('')}
  </div>
</section>`;

  writePage(`${lang}/newsletter/index.html`, layout({
    lang, t, relPath: 'newsletter/', active: 'newsletter', body: nlIndex,
    title: `${t.newsletter.name} · ${t.meta.titleSuffix}`, description: t.newsletter.lead,
  }));

  // ---- newsletter issues
  for (const i of issues) {
    const body = `
<article class="section article">
  <div class="container narrow">
    <p class="breadcrumb"><a href="${BASE}/${lang}/newsletter/">← ${esc(t.newsletter.backToArchive)}</a></p>
    <p class="card-meta">${esc(t.newsletter.name)} · #${esc(i.issue)} · ${esc(i.date)}</p>
    <h1>${esc(i.title)}</h1>
    <div class="prose">${i.bodyHtml}</div>
  </div>
</article>
${newsletterSignup(t, { compact: true })}`;

    writePage(`${lang}/newsletter/${i.slug}/index.html`, layout({
      lang, t, relPath: `newsletter/${i.slug}/`, active: 'newsletter', body,
      title: `${i.title} · ${t.newsletter.name}`, description: i.summary,
    }));
  }
}

// ---------------------------------------------------------------- run

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

for (const lang of LANGS) buildLang(lang);

cpSync(join(ROOT, 'static'), DIST, { recursive: true });

// Root redirect to default language, with client-side language detection.
writePage('index.html', `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Bridgehead</title>
  <script>
    var supported = ${JSON.stringify(LANGS)};
    var pref = (navigator.languages || [navigator.language || 'en'])
      .map(function (l) { return l.slice(0, 2).toLowerCase(); })
      .find(function (l) { return supported.indexOf(l) !== -1; }) || '${config.defaultLanguage}';
    location.replace('${BASE}/' + pref + '/');
  </script>
  <meta http-equiv="refresh" content="0; url=${BASE}/${config.defaultLanguage}/">
</head>
<body><a href="${BASE}/${config.defaultLanguage}/">Continue</a></body>
</html>
`);

writePage('.nojekyll', '');
console.log(`Built ${LANGS.length} languages into dist/ (BASE_PATH="${BASE}")`);
