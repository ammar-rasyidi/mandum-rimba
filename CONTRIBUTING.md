# Contributing to Mandum Rimba

Terima kasih sudah mampir. Mandum Rimba is a non-profit, public-interest map of
Indonesia's forests, land use, and protected wildlife, built from credible
satellite and public data. It is far from finished, and the best way to make it
better is together.

You do not need to write code to help. Some of the most valuable contributions
are a corrected coordinate, a credible new data source, or a note that something
on the map is confusing.

## Ways to contribute

1. **Data corrections.** If a coordinate, status, or source looks wrong, open an
   issue with a link to the original source so we can verify and fix it.
2. **New layers or species.** Suggest credible, openly licensed public data that
   deserves a place on the map. Include the provider, a link, and the license.
3. **Design and methodology feedback.** Tell us what is unclear or what could be
   easier to read.
4. **Code.** Bug fixes and features are welcome. For anything larger than a small
   fix, please open an issue first so we can agree on the approach before you
   spend time on it.
5. **Translations.** The interface is Indonesian and English. Improvements to
   either are appreciated.

## Opening an issue

The quickest way to help is to
[open an issue](https://github.com/ammar-rasyidi/mandum-rimba/issues/new/choose)
and pick the template that fits. Each one asks for exactly what we need to act on
it, so please fill it out rather than starting from blank:

- **Bug report**, when something on the site or map looks broken. Tell us the
  page or layer, what you expected, and the steps to reproduce it.
- **Data correction**, when a coordinate, status, or source looks wrong. A link
  to the original source is required; we verify against the provider before
  changing anything.
- **Feature or data source**, to suggest a feature, a new layer, or a dataset.
  For a new source, include the provider, a link, the license, and the coverage.

Filling the template out fully is the single biggest thing you can do to get an
issue acted on quickly. For anything that does not fit a template, the contact
link on the issue page reaches the maintainer.

## Principles we hold to

These are not negotiable, and any contribution is expected to follow them:

1. **Evidence over accusation.** We gather and present data as it is. We do not
   draw conclusions or make claims on a reader's behalf, and we do not single out
   companies or people except through already-published datasets, always with a
   citation.
2. **Never fabricate.** We do not invent coordinates, ranges, figures, or
   sources. Data we cannot obtain is marked unavailable, and the real provider is
   named.
3. **Every layer is sourced.** Anything shown on the map has a working source
   link, a retrieval date, and a place in the methodology.
4. **Bilingual.** Indonesian first, English second. User-facing text lives in the
   translation files, not hard-coded in components.

## Project layout

A pnpm and Turborepo monorepo:

- `apps/web` is the Next.js front end (the map, content pages, and the campaign
  tool).
- `apps/api` is the NestJS service: the scheduled ingest jobs that pull from
  public sources, the tile build, and the read-only API.
- `packages/shared` holds shared TypeScript types.

## Getting set up

```bash
pnpm install

# each app ships an .env.example; copy it and fill in what you have
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

pnpm dev          # web on :3000, api on :4000
```

Data sources without a stable endpoint are skipped cleanly when their keys are
missing, so the app runs with whatever subset you have configured. You do not
need every key to work on the front end.

Before opening a pull request:

```bash
pnpm typecheck    # both apps must pass
pnpm lint
```

## Pull requests

- Branch off `main`, keep the change focused, and describe what it does and why.
- Match the style of the code around you: small, readable functions, comments
  that explain intent rather than restating the code, and plain language in any
  user-facing text.
- If your change touches a data source or the methodology, update the relevant
  source listing and the methodology changelog in the same pull request.
- New dependencies should earn their place. Prefer the standard library and what
  is already here.

## Adding or changing a data source

Because credibility is the whole point, a new dataset needs:

- the source organisation and a working link,
- the license, and confirmation that it permits the use,
- the coverage and the retrieval method, and
- an entry in the Data Sources catalog and the methodology.

If credible open data does not exist for something, that is fine. Record it as a
known gap and name the provider where the real data lives, rather than
approximating.

## Reporting a problem

Open an issue with enough detail to reproduce or verify it: what you saw, where,
and a link to the source if it is a data question.

For anything that does not fit an issue, you can reach the maintainer on Threads
at [@r.rasyidi](https://www.threads.com/@r.rasyidi).

## License

By contributing, you agree to the [Contributor License Agreement](./CLA.md):
your contributions are licensed under the **GNU AGPL-3.0-or-later** (the same
terms that cover the rest of the code), and you grant the maintainer the rights
described there so the project can stay under one consistent license. The Mandum
Rimba name and logos are trademarks and are not part of that grant
([TRADEMARK.md](./TRADEMARK.md)). Data remains the property of its original
providers under their own licenses.
