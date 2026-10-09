import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { lastValueFrom, toArray } from 'rxjs';
import goldAet from '../../../testing/fixtures/men-gold-aet.json';
import qfPso from '../../../testing/fixtures/men-qf-pso.json';
import dayFeed from '../../../testing/fixtures/day-2024-08-09.json';
import scheduleFeed from '../../../testing/fixtures/schedule.json';
import { resultUrl, scheduleUrl } from '../api/olympics.api';
import type { ScheduleFeed } from '../models/olympics-feed.model';
import { ValidationError } from '../parser/response-validator';
import { SCHEDULE_FEED_NOTICE } from '../parser/url-test';
import { LoadEvent, MatchLoader } from './match-loader';

const GOLD = 'FBLMTEAM11------------FNL-000100--';
const QF = 'FBLMTEAM11------------QFNL000200--';
const WOMEN_BRONZE = 'FBLWTEAM11------------FNL-000200--';
const DAY_URL = 'https://stacy.olympics.com/OG2024/data/SCH_ByDisciplineH2H~comp=OG2024~disc=FBL~lang=ENG~date=2024-08-09.json';
const JSON_HEADERS = { 'content-type': 'application/json' };

/** Schedule reduced to two matches (plus a non-match unit that must be ignored). */
const schedule: ScheduleFeed = {
  schedules: (scheduleFeed as unknown as ScheduleFeed).schedules.filter(
    (u) => u.code === GOLD || u.code === QF || u.code.includes('VICTMEDAL'),
  ),
};

describe('MatchLoader', () => {
  let loader: MatchLoader;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    loader = TestBed.inject(MatchLoader);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const flushJson = (url: string, body: unknown) =>
    http.expectOne(url).flush(JSON.stringify(body), { headers: JSON_HEADERS });

  it('loads the schedule and every match, reporting progress', async () => {
    const events = lastValueFrom(loader.load().pipe(toArray()));
    flushJson(scheduleUrl(), schedule);
    flushJson(resultUrl(QF), qfPso);
    flushJson(resultUrl(GOLD), goldAet);

    const all = await events;
    expect(all.filter((e) => e.type === 'progress').map((e) => (e as { done: number }).done)).toEqual([0, 1, 2]);
    const done = all.at(-1) as Extract<LoadEvent, { type: 'done' }>;
    expect(done.matches.map((m) => m.code)).toEqual([QF, GOLD]);
    expect(done.failures).toEqual([]);
  });

  it('collects failures of single matches without failing the whole load', async () => {
    const events = lastValueFrom(loader.load().pipe(toArray()));
    flushJson(scheduleUrl(), schedule);
    http.expectOne(resultUrl(QF)).flush('not found', { status: 404, statusText: 'Not Found' });
    // The data server answers unknown paths with an HTML page and HTTP 200.
    http.expectOne(resultUrl(GOLD)).flush('<html></html>', { headers: { 'content-type': 'text/html' } });

    const done = (await events).at(-1) as Extract<LoadEvent, { type: 'done' }>;
    expect(done.matches).toEqual([]);
    expect(done.failures.map((f) => [f.code, f.message])).toEqual([
      [QF, 'HTTP 404 Not Found'],
      [GOLD, 'Expected JSON but received "text/html" — the feed probably does not exist, check the URL'],
    ]);
  });

  it('retries only the given units without fetching the schedule again', async () => {
    const unit = schedule.schedules.find((u) => u.code === GOLD)!;
    const events = lastValueFrom(loader.load([unit]).pipe(toArray()));
    flushJson(resultUrl(GOLD), goldAet);

    const done = (await events).at(-1) as Extract<LoadEvent, { type: 'done' }>;
    expect(done.matches.map((m) => m.code)).toEqual([GOLD]);
  });

  it('errors when the schedule cannot be loaded', async () => {
    const events = lastValueFrom(loader.load());
    http.expectOne(scheduleUrl()).error(new ProgressEvent('error'));
    await expect(events).rejects.toThrow('Request network error (offline or blocked by CORS)');
  });

  describe('testUrl', () => {
    const doneOf = async (events: Promise<LoadEvent[]>) => (await events).at(-1) as Extract<LoadEvent, { type: 'done' }>;

    it('builds and validates a single match from the given URL, without the schedule', async () => {
      const events = lastValueFrom(loader.testUrl(`  ${resultUrl(GOLD)}  `).pipe(toArray()));
      flushJson(resultUrl(GOLD), goldAet);

      const all = await events;
      expect(all[0]).toEqual({ type: 'progress', done: 0, total: 0 });
      const [match] = (await doneOf(Promise.resolve(all))).matches;
      expect(match?.code).toBe(GOLD);
      expect(match?.response.teams).toEqual({ home: 'France', away: 'Spain' });
      expect(match?.response.venue).toEqual({ name: 'Parc des Princes', city: 'Paris' });
      expect(match?.source).toEqual({ result: goldAet, requestUrl: resultUrl(GOLD) });
      expect(match?.warnings).toEqual([]);
      expect((await doneOf(Promise.resolve(all))).notices).toBeUndefined();
    });

    it('warns when the response describes a different match than the URL asks for', async () => {
      const events = lastValueFrom(loader.testUrl(resultUrl(QF)).pipe(toArray()));
      flushJson(resultUrl(QF), goldAet);
      const [match] = (await doneOf(events)).matches;
      expect(match?.warnings).toEqual([`URL requests ${QF}, but the response describes ${GOLD}`]);
    });

    it('rejects text that is not an http(s) URL without sending a request', async () => {
      await expect(lastValueFrom(loader.testUrl('not a url'))).rejects.toThrow('Invalid URL');
      await expect(lastValueFrom(loader.testUrl('ftp://example.com/x.json'))).rejects.toThrow('Unsupported protocol');
    });

    it('reports HTTP errors and non-JSON responses', async () => {
      const notFound = lastValueFrom(loader.testUrl(resultUrl(GOLD)));
      http.expectOne(resultUrl(GOLD)).flush('not found', { status: 404, statusText: 'Not Found' });
      await expect(notFound).rejects.toThrow('HTTP 404 Not Found');

      const html = lastValueFrom(loader.testUrl(resultUrl(GOLD)));
      http.expectOne(resultUrl(GOLD)).flush('<html></html>', { headers: { 'content-type': 'text/html' } });
      await expect(html).rejects.toThrow('Expected JSON but received "text/html"');
    });

    it('fails with a validation error when the JSON is neither a match nor a schedule feed', async () => {
      const wrongFeed = lastValueFrom(loader.testUrl(DAY_URL));
      flushJson(DAY_URL, { hello: 'world' });
      const error = await wrongFeed.catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toContain('Unsupported response');
    });

    it('fails when a match feed cannot be mapped', async () => {
      const broken = lastValueFrom(loader.testUrl(resultUrl(GOLD)));
      flushJson(resultUrl(GOLD), { results: {} });
      const error = await broken.catch((e: unknown) => e);
      expect((error as ValidationError).issues[0]).toContain('is this a match result feed?');
    });

    it('parses a day schedule (SCH_ByDisciplineH2H) on its own, without requesting match feeds', async () => {
      const events = lastValueFrom(loader.testUrl(DAY_URL).pipe(toArray()));
      flushJson(DAY_URL, dayFeed);
      // afterEach → http.verify(): no RES_ByRSC_H2H request was made.

      const done = (await events).at(-1) as Extract<LoadEvent, { type: 'done' }>;
      expect(done.matches.map((m) => m.code)).toEqual([WOMEN_BRONZE, GOLD]);
      expect(done.failures).toEqual([]);
      expect(done.notices).toEqual([SCHEDULE_FEED_NOTICE]);

      const gold = done.matches[1]!;
      expect(gold.source).toEqual({ schedule: expect.objectContaining({ code: GOLD }), scheduleUrl: DAY_URL });
      expect(gold.missing).toEqual([
        'scorers',
        'lineups.home.coach',
        'lineups.home.startingXI',
        'lineups.home.bench',
        'lineups.away.coach',
        'lineups.away.startingXI',
        'lineups.away.bench',
      ]);
      expect(gold.warnings).toEqual([
        'Not available in this response: scorers, lineups.*.coach, lineups.*.startingXI, lineups.*.bench',
      ]);
    });

    it('collects schedule entries that cannot be parsed as failures', async () => {
      const events = lastValueFrom(loader.testUrl(DAY_URL));
      const [first, second] = (dayFeed as unknown as ScheduleFeed).schedules.filter((u) => u.code.includes('FNL-'));
      flushJson(DAY_URL, { schedules: [first, { ...second, status: { code: 'SCHEDULED' } }] });

      const done = (await events) as Extract<LoadEvent, { type: 'done' }>;
      expect(done.matches).toHaveLength(1);
      expect(done.failures.map((f) => f.message)).toEqual([`${second!.code}: match is not finished (status: SCHEDULED)`]);
    });

    it('rejects a schedule response without football matches', async () => {
      const empty = lastValueFrom(loader.testUrl(DAY_URL));
      flushJson(DAY_URL, { schedules: [] });
      await expect(empty).rejects.toThrow('The schedule response lists no football matches');
    });
  });
});
