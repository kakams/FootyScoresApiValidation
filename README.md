# FootyScores · API reference generator

A lightweight Angular app (no backend) that builds the **expected FootyScores API response for every football match
of the Paris 2024 Olympic Games**.

## Quick start

Requirements: an LTS version of Node.js supported by Angular 22, and npm.

```bash
npm install
npm start          # http://localhost:4200
```

| Command         | Purpose                                                    |
| --------------- | ---------------------------------------------------------- |
| `npm start`     | Dev server with live reload (`ng serve`)                   |
| `npm run build` | Production build into `dist/browser`                       |
| `npm test`      | Unit and component tests (Vitest via `ng test`), single run |
| `npm run watch` | Development build in watch mode                            |

## Deployment

`npm run build` produces a static site in `dist/browser`. It can be hosted on any static server (GitHub Pages,
Netlify, Azure Static Web Apps, S3…). To host it under a sub-path, build with
`npx ng build --base-href /sub/path/`. The app talks directly to the public data feeds, so it needs no server-side
code.

## How it works

### Data retrieval

The official Paris 2024 site loads its competition data from two public JSON feeds, which allow CORS from any origin:

- schedule: `https://stacy.olympics.com/OG2024/data/SCH_StartList~comp=OG2024~disc=FBL~lang=ENG.json`
- match details: `https://stacy.olympics.com/OG2024/data/RES_ByRSC_H2H~comp=OG2024~disc=FBL~rscResult={unitCode}~lang=ENG.json`

Both URLs come from the official site's own front-end code: its schedule list uses `SCH_StartList`, and its
match-centre page uses `RES_ByRSC_H2H` ("results by result schedule code, head-to-head"). The day-by-day schedule
page (`/en/paris-2024/schedule/football`) instead requests
`SCH_ByDisciplineH2H~comp=OG2024~disc=FBL~lang=ENG~date=YYYY-MM-DD.json`, one request per competition day, and
returns only the matches of that day. Its match entries include teams, score, half-time and formation, but **no
scorers, lineups or coaches**, which expected json format requires. So the app uses:

- `SCH_StartList`, which lists all 58 matches (plus 2 ceremonies) in one request, as the authoritative match list;
- `RES_ByRSC_H2H`, one request per match, as the only feed with play-by-play, starting XI, bench and coach.

The app loads the schedule first. It then fetches every match feed, at most 6 at a time, with a 20 s timeout per
request. The server answers unknown paths with an HTML page and HTTP 200, so each response's content type is checked.
If a single match fails, the app shows the failure and offers *Retry failed*. Export stays disabled until every match
loads, so a partial reference file is never produced.

### Algorithm: what *Load data* does

1. **Schedule request (1 request).** `GET SCH_StartList…` returns all 60 units of the football discipline.
   `selectFootballMatches` keeps only match units (see below), drops duplicates and leaves 58 matches. The schedule is
   needed to know **which matches exist**; it also gives the authoritative kickoff and venue.
2. **Match requests (58 requests, at most 6 in parallel).** For every match unit `MatchLoader` builds
   `RES_ByRSC_H2H…~rscResult={unitCode}…` and fetches it. Each response goes through the same checks: HTTP status, a
   20 s timeout, a JSON content type (unknown paths return an HTML page with HTTP 200) and `JSON.parse`. Progress is
   reported after each match (`n / 58`).
3. **Mapping (`buildMatch(scheduleUnit, matchFeed)`).** Each feed is turned into one object in the expected JSON format:
   1. the unit code gives the tournament (`M`/`W`) and so `competition.name`; it must be a football match unit.
      The round is `results.eventUnit.shortDescription`; a match feed without it fails;
   2. the match must be finished (`status = FINISHED`), otherwise the match fails;
   3. the two competitors are split by `HOME_AWAY` into home and away team;
   4. the score comes from the `TOT` period, half-time from `H1`;
   5. scorers come from the play-by-play: every `GOAL` action outside the penalty shootout, in match order, with its
      type, base minute and optional assist;
   6. lineups come from each team's athletes (`STARTER=Y` → starting XI, otherwise bench), position, bib number,
      formation and coach;
   7. consistency check: if the number of play-by-play goals differs from the score, a **warning** is added.

   A mapping error (e.g. an unfinished match) becomes a failure of that match only.
4. **Result.** Matches are sorted (see *Ordering*) and shown in the grid. Failed matches are listed with their error
   and can be fetched again with *Retry failed*, which skips the schedule request. Export is enabled once every match
   has loaded.

#### What comes from which feed

The match feed alone is enough to build a full record: its `results.schedule` section repeats the kickoff, venue,
location and status. The schedule entry is still preferred where both exist, because it is the authoritative list.

| Data                                                    | Schedule (`SCH_StartList`) | Match feed (`RES_ByRSC_H2H`)     |
| ------------------------------------------------------- | -------------------------- | -------------------------------- |
| which matches exist, unit codes                         | ✔ (only source)            | —                                |
| kickoff, venue name, city                               | ✔ preferred                | ✔ fallback (`results.schedule`)  |
| round, status, teams, score, half-time                  | team names as fallback     | ✔                                |
| scorers, assists, lineups, formation, coach             | —                          | ✔ (only source)                  |

This is why a single match URL gives a complete record without the schedule, while a schedule URL (`SCH_StartList`
or the per-day `SCH_ByDisciplineH2H`) on its own gives only incomplete records (see *Testing a single URL*).

### Identifying football matches

Match units have codes like `FBLMTEAM11------------GPA-000100--`: `M`/`W` marks the tournament, then the phase
(`GPA`–`GPD` groups, `QFNL`, `SFNL`, `FNL`) and the match number. Other units in the same feed, such as victory
ceremonies (`…VICTMEDAL---`), are ignored. This gives 58 matches: 32 men's and 26 women's.

### Field mapping

| Expected JSON field           | Source                                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| `competition.name`            | "Men's/Women's Olympic Football Tournament", by the gender in the unit code ¹             |
| `competition.season`          | `"2024"` ¹                                                                                |
| `competition.round`           | `eventUnit.shortDescription` from the feed (`Group A`, `Quarter-final`, …), never invented |
| `venue.name` / `venue.city`   | venue name from the feed / text after the last comma of the location description       |
| `kickoff`                     | schedule start date (ISO 8601 with offset)                                                |
| `status`                      | result code `AET` → `AET`, `PSO` → `PEN`, otherwise `FT` (the match must be finished)     |
| `teams.home` / `teams.away`   | entries marked `HOME_AWAY`                                                                |
| `score` / `score.halfTime`    | period `TOT` / period `H1` (penalty shootouts are not part of the score)                  |
| `scorers[]`                   | play-by-play goals (excluding the shootout), in match order                               |
| `scorers[].type`              | `SHOT` → `open_play`, `PEN` → `penalty`, `FRD` → `free_kick`, `OG` → `own_goal`           |
| `scorers[].minute`            | base minute (`90' +3` → `90`)                                                             |
| `scorers[].assist`            | athlete with the `ASSIST` role; omitted when there is none                                |
| `lineups.*.formation / coach` | `FORMATION` team info / team member with the `COACH` function                             |
| `lineups.*.startingXI/bench`  | athletes with `STARTER=Y` (by order) / the rest; position GK/DF/MF/FW, number = bib       |

¹ The only values declared in the code. The feeds have no tournament name (only the discipline "Football" and the event
"Men"/"Women") and no season, so these two are constants (`COMPETITION_NAME`, `SEASON` in `match.parser.ts`). All
other values come from the responses; the code maps only feed codes to the enum values of the expected JSON format
(e.g. `RES_CODE` `AET`/`PSO` → `AET`/`PEN`, goal action `PEN` → `penalty`).

Player names are `givenName familyName`, or just `familyName` for single-name players (e.g. Marta). For own goals,
`team` is the scorer's own team.

### Ordering

Matches are sorted by kickoff time (absolute instant), with ties broken by Olympic unit code, so the export is
deterministic.

## Assumptions about missing or inconsistent data

- The number of play-by-play goals is compared with the final score. If they differ, the match gets a **warning** in
  the UI and the data is never invented. Known case: USA 3–0 Guinea (men's group A), where the source play-by-play is
  missing two first-half goals.
- A match feed that is missing or not finished counts as a failure, not a partial response.
- Duplicate schedule units are de-duplicated by unit code.
- The data server returns HTTP 403 to some non-browser user agents (`HeadlessChrome`, default `curl`,
  `python-requests`). Regular browsers and Postman are unaffected. The *Copy curl* command therefore sends
  `-A 'Mozilla/5.0'`.

## UI

- **Load data from stacy.olympics.com**: fetch and generate, with a progress bar (`n / 58`).
- **Test a match URL**: check a single match feed or schedule feed request and show the resulting record(s) (see
  *Testing a single URL*).
- Clear **idle**, **loading**, **error** (with *Try again*) and **partial failure** (with *Retry failed*) states.
- Table: kickoff (Paris time), tournament, round, match and score (scores aligned in one column), venue, status,
  warning indicator.
- Filters: tournament, round (rounds found in the data, ordered by the day of their first match), and free-text
  search (team, venue, city, unit code). *Show only these* next to the
  data-warning message limits the grid to matches with warnings. Filters never affect the export.
- Click a row (or press Enter/Space) to open details:
  - **Source requests**: the exact GET URLs used for this match (its match feed and, after a full load, the shared
    schedule feed). Each
    has *Copy URL*, *Copy curl* and *Open ↗*, so a QA engineer can run the request on its own.
  - The **parsed response**, plus the raw **schedule** entry and **match data** used to build it. Copy and download
    per match.
- **Export JSON**: all matches in default order.
- **Import JSON**: review a previously exported file (see below).

## Testing a single URL

The **Test a match URL** field at the top of the page checks one request on its own. Paste a URL and click **Test**
(or press Enter). Two kinds of feed are accepted:

| Response                                                            | Example                                                                                                                       |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| match feed (`{ "results": … }`)                                     | `…/RES_ByRSC_H2H~comp=OG2024~disc=FBL~rscResult=FBLMTEAM11------------GPB-000100--~lang=ENG.json`                              |
| schedule feed (`{ "schedules": [ … ] }`): one day or the full list  | `…/SCH_ByDisciplineH2H~comp=OG2024~disc=FBL~lang=ENG~date=2024-08-10.json`, `…/SCH_StartList~comp=OG2024~disc=FBL~lang=ENG.json` |

The app then:

1. checks that the text is an absolute `http(s)` URL (no request is sent otherwise);
2. sends `GET` to exactly that URL, with the same HTTP status, timeout, content-type and JSON checks as a full load;
3. recognises the feed by its shape (`results` or `schedules`; anything else is rejected as unsupported);
4. for a **match feed**, maps the response with `buildMatch` **without a schedule entry**: the unit code comes from
   `results.eventUnitCode`, and kickoff and venue from `results.schedule`. It also compares the `rscResult` in the
   URL with the unit code in the response and warns if they differ;
5. for a **schedule feed**, parses every football match it lists **from that response only**
   (`parseScheduleUnit`); no other request is made. The record contains only the fields found in the entry:

   | Field                              | `SCH_ByDisciplineH2H` (one day)                     | `SCH_StartList`          |
   | ---------------------------------- | --------------------------------------------------- | ------------------------ |
   | competition, venue, kickoff        | ✔ (round from the event unit)                       | ✔ (without round)        |
   | status                             | ✔ from the periods: `PSO` → PEN, `ET-H1` → AET, else FT | —                    |
   | teams, score, half-time            | ✔ (`HOME_AWAY` items, `TOT` / `H1` periods)         | —                        |
   | `lineups.*.team` / `formation`     | ✔                                                   | —                        |
   | scorers, `lineups.*.coach` / `startingXI` / `bench` | —                                  | —                        |

   The missing fields become a **warning of each match** (e.g. `Not available in this response: scorers,
   lineups.*.coach, lineups.*.startingXI, lineups.*.bench`). The status bar also explains that the record is
   incomplete and that the match data URL gives a complete one. A match that cannot be parsed, such as an unfinished
   one, is listed as a failure;
6. validates the result against the expected JSON format (the same validator as *Import JSON*). A record from a
   schedule feed is checked in partial mode: every field that is present must have the right type and no unknown
   fields are allowed, while the absent fields are only reported as missing.

On success the status bar shows **✓ URL test passed** and the grid contains the parsed record(s). The details show
the **Parsed response**, with only the data obtained from the request, and list that request as the source. The
*Source: schedule* tab is shown for a schedule URL, and *Source: match data* for a match feed. **Export is disabled**
while incomplete records are shown, because they do not match the expected JSON format. *Show only these* next to the
warning count filters the grid to records with warnings.

Otherwise the status bar shows **URL test failed** with the reason, for example `HTTP 404`, an HTML response for a
feed that does not exist (e.g. a day without matches), JSON that is neither a match nor a schedule feed, a schedule
without football matches, a non-football unit, an unfinished match, or a list of structure problems. Network and server
errors offer *Try again*. *Load data from stacy.olympics.com* always switches back to the full list.

## Importing a JSON file

**Import JSON** accepts a file exported by this app: an array of objects in the expected JSON format (a single
object is accepted too). The file is validated strictly before anything is shown:

- every field of the expected JSON format must be present with the right type (scores, minutes and shirt numbers must be
  integers);
- only the scorer `assist` field is optional, and extra fields are not allowed;
- `kickoff` must be a valid ISO 8601 date.

If any item fails, the whole file is rejected and up to 20 problems are listed with their paths (e.g.
`[3].venue: missing`). Duplicates (same kickoff and teams) are flagged with a warning. Raw source data is not part of
the export, so the source tabs are not available for imported matches. Exporting right after an import produces a
byte-identical file.

## Frontend architecture

- **Angular 22**: standalone components, signals, zoneless change detection, `OnPush` everywhere.
- **Every component has its own template and styles**: `name.ts` + `name.html` + `name.scss`, with BEM class
  names. Styles are scoped by Angular view encapsulation. There are no inline styles and no HTML strings; events are
  bound in templates (`(click)`, `(keydown.enter)`).
- **State**: `MatchesStore` (a signal-based service) holds the data, filters and selection. Components read its
  signals and call its actions; derived data (filtered rows, rounds, export availability) are `computed` signals.
- **Data access**: `OlympicsApi` uses `HttpClient`. `MatchLoader` runs the load as an RxJS stream (`mergeMap` with
  concurrency 6), and unsubscribing cancels pending requests.
- **Domain logic** (parsers, import validation) is plain TypeScript functions, independent of Angular and easy to
  test.

## Project structure

```
src/
  index.html, main.ts, styles.scss      entry point and global styles (base, buttons, utilities)
  styles/                               SCSS tokens (_variables) and mixins shared by component styles
  testing/fixtures/                     real feed data used by tests (schedule, a day schedule, match feeds)
  app/
    app.ts|html|scss                    page shell (layout of the components below)
    app.config.ts                       providers (HttpClient; no zone.js — zoneless by default)
    common/                             used across the whole app
      api/olympics.api.ts               feed URLs and HttpClient access (timeouts, content-type check)
      models/                           output (expected JSON format, also partial), feed and ParsedMatch types
      parser/                           unit code → match, feed → expected JSON mapping (complete from a match
                                        feed, partial from a schedule entry), ordering, format validator,
                                        single-URL check (url-test.ts)
      services/matches-store.ts         application state (signals) and actions
      services/match-loader.ts          loads schedule + matches (collects failures) or tests a single URL
      services/file-download.ts         saves JSON files
      utils/match-filter.ts             table filters, round order derived from the data
      components/json-viewer/           syntax-highlighted JSON preview
      components/copy-button/           copy to clipboard with feedback
    components/                         one folder per component, with everything it needs
      header/                           load / import / export actions + import validation and export format
      url-tester/                       "Test a match URL" form
      status-bar/                       idle / loading / error / summary
      match-filters/                    tournament, round, search
      match-table/                      match list; match-row/ is the <tr> component
      match-details/                    response and source data of the selected match;
                                        source-requests/ lists the request URLs (copy URL / curl, open)
```

## Tests

`npm test` runs Vitest through the Angular builder (`ng test`):

- `common/parser/match.parser.spec.ts`: mapping on real feeds (gold medal match after extra time, quarter-final
  decided on penalties, group match with an own goal), partial records from schedule entries (`parseScheduleUnit`), match identification, ordering, export format;
- `common/utils/match-filter.spec.ts`: round order derived from the data;
- `components/header/match-import.spec.ts`: import round-trip and validation errors;
- `common/services/match-loader.spec.ts`: loading with `HttpTestingController` (progress, single-match failures,
  HTML responses, retry, schedule errors) and single-URL tests (success without a schedule, code mismatch warning,
  invalid URL, HTTP/HTML errors, unsupported or unmappable feeds, a day schedule parsed without extra requests,
  an unfinished match in a schedule, an empty schedule);
- `app.spec.ts`: component integration (empty state, table, filters, details, import errors, URL tester success and
  failure, day schedule URL with incomplete records, warnings and export disabled).
