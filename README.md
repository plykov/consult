# Bridgehead — European B2B GTM Strategy Consultancy

Multilingual static website (EN · DE · NL · FR · ES) for a B2B go-to-market strategy
consultancy targeting:

- **Technical companies entering Europe** whose home-market GTM playbook stops working
  once local decision units, procurement norms, partner influence and trust dynamics change.
- **NL-based businesses** looking to go EU-wide or global.

Includes case studies and a newsletter section ("The Decision Unit") with signup and archive.

## How it works

- **English is the single source of truth.** All content lives in `content/en/`:
  - `site.json` — every UI string and page section (hero, audiences, problem, services, contact…)
  - `cases/*.md` — case studies (Markdown + YAML frontmatter)
  - `newsletter/*.md` — newsletter issues
- **DE / NL / FR / ES are generated automatically.** When `content/en/**` changes on `main`,
  the `Sync translations` workflow calls the Claude API to retranslate exactly the files that
  changed (tracked by SHA-256 hashes in `content/.translation-state.json`) and commits the
  updated `content/{de,nl,fr,es}` files.
- **The site builds with zero dependencies** (`node scripts/build.mjs`, Node 18+) into `dist/`
  and deploys to GitHub Pages on every push to `main`.

```
content/
  config.json            shared, non-translated config (languages, emails, form action)
  .translation-state.json  EN-source hashes per translated file (managed by translate.mjs)
  en/  de/  nl/  fr/  es/
    site.json
    cases/*.md
    newsletter/*.md
scripts/
  build.mjs              static site generator (no dependencies)
  translate.mjs          Claude-API translation sync (no dependencies)
static/
  styles.css             copied verbatim into dist/
.github/workflows/
  translate.yml          EN change on main → retranslate DE/NL/FR/ES → commit
  deploy.yml             push to main → build → deploy to GitHub Pages
```

## Local development

```bash
node scripts/build.mjs            # build into dist/
npx serve dist                    # or: python3 -m http.server -d dist
```

`BASE_PATH=/WatchPrayer node scripts/build.mjs` reproduces the GitHub Pages URL layout.

## Translation sync

```bash
node scripts/translate.mjs --check     # list translations that are stale vs content/en
ANTHROPIC_API_KEY=... node scripts/translate.mjs        # retranslate stale files only
ANTHROPIC_API_KEY=... node scripts/translate.mjs --all  # force full retranslation
```

The translator preserves JSON keys/structure, YAML frontmatter keys, `order`/`issue`/`date`
values, Markdown structure, the brand name and the newsletter name, and validates JSON output
before writing.

## One-time setup after merging to `main`

1. **Repository secret** — add `ANTHROPIC_API_KEY` (Settings → Secrets and variables →
   Actions) so the translation workflow can call the Claude API.
2. **GitHub Pages** — Settings → Pages → Source: **GitHub Actions**.
3. **Newsletter form** — `content/config.json` → `newsletterFormAction` currently points at a
   Buttondown placeholder. Point it at your real newsletter provider's form endpoint
   (Buttondown, Mailchimp, Brevo…). Also set `contactEmail` and, if the site moves to a
   custom domain, `siteUrl` (used for canonical and hreflang tags).

## Editing content

Edit **only** `content/en/**` (plus `content/config.json` for non-translated settings).
Push to `main` — translations and deployment happen automatically. Manual edits to
`content/{de,nl,fr,es}` will be overwritten the next time the corresponding English file
changes; if you must hand-tune a translation, do it and avoid touching the EN source, or
re-apply after the next sync.

Adding a case study or newsletter issue = adding one Markdown file under
`content/en/cases/` or `content/en/newsletter/`. The translation workflow creates the four
localized copies and the build picks them up automatically.
