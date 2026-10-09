import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import dayFeed from '../testing/fixtures/day-2024-08-09.json';
import goldAet from '../testing/fixtures/men-gold-aet.json';
import groupOwnGoal from '../testing/fixtures/men-group-own-goal.json';
import scheduleFeed from '../testing/fixtures/schedule.json';
import { App } from './app';
import { resultUrl } from './common/api/olympics.api';
import type { ResultFeed, ScheduleFeed } from './common/models/olympics-feed.model';
import { buildMatch } from './common/parser/match.parser';
import { MatchesStore } from './common/services/matches-store';

const units = (scheduleFeed as unknown as ScheduleFeed).schedules;
const build = (code: string, feed: unknown) =>
  buildMatch(units.find((u) => u.code === code)!, feed as unknown as ResultFeed);

describe('App', () => {
  let root: HTMLElement;
  let store: MatchesStore;

  const render = async () => {
    const fixture = TestBed.createComponent(App);
    root = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
    return fixture;
  };
  const rows = () => [...root.querySelectorAll<HTMLTableRowElement>('tr[app-match-row]')];
  const text = (selector: string) => root.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    store = TestBed.inject(MatchesStore);
  });

  it('shows the idle hint and no table before data is loaded', async () => {
    await render();
    expect(text('.status')).toContain('No data loaded yet.');
    expect(root.querySelector('app-match-table')).toBeNull();
  });

  it('renders matches, filters them and opens details on row click', async () => {
    store.showImported(
      [build('FBLMTEAM11------------FNL-000100--', goldAet), build('FBLMTEAM11------------GPD-000100--', groupOwnGoal)],
      'test.json',
    );
    const fixture = await render();

    expect(text('.status')).toContain('2 matches imported');
    expect(rows().map((r) => r.querySelector('.fixture__score')?.textContent)).toEqual(['1 – 1', '3 – 5']);

    rows()[1]!.click();
    await fixture.whenStable();
    expect(text('.details__title')).toBe('France 3–5 Spain');
    expect([...root.querySelectorAll('.tabs__tab')].map((t) => t.textContent?.trim())).toEqual([
      'Parsed response',
      'Source: schedule',
      'Source: match data',
    ]);
    expect(rows()[1]!.classList).toContain('row--selected');
    expect([...root.querySelectorAll('.requests__url')].map((u) => u.textContent)).toEqual([
      'https://stacy.olympics.com/OG2024/data/RES_ByRSC_H2H~comp=OG2024~disc=FBL~rscResult=FBLMTEAM11------------FNL-000100--~lang=ENG.json',
      'https://stacy.olympics.com/OG2024/data/SCH_StartList~comp=OG2024~disc=FBL~lang=ENG.json',
    ]);

    store.query.set('mali');
    await fixture.whenStable();
    expect(rows()).toHaveLength(1);
    expect(text('.filters__count')).toBe('Showing 1 of 2');
  });

  it('filters the grid to matches with data warnings', async () => {
    const gold = build('FBLMTEAM11------------FNL-000100--', goldAet);
    const group = build('FBLMTEAM11------------GPD-000100--', groupOwnGoal);
    store.showImported([gold, { ...group, warnings: ['score mismatch'] }], 'test.json');
    const fixture = await render();
    const toggle = () => root.querySelector<HTMLButtonElement>('.status__warning button')!;

    expect(toggle().textContent?.trim()).toBe('Show only these');
    toggle().click();
    await fixture.whenStable();
    expect(rows().map((r) => r.querySelector('.fixture__score')?.textContent)).toEqual(['1 – 1']);
    expect(text('.filters__count')).toBe('Showing 1 of 2');
    expect(toggle().getAttribute('aria-pressed')).toBe('true');

    toggle().click();
    await fixture.whenStable();
    expect(rows()).toHaveLength(2);
    expect(toggle().textContent?.trim()).toBe('Show only these');
  });

  it('shows no source requests for matches imported from a file', async () => {
    const { source: _, ...imported } = build('FBLMTEAM11------------FNL-000100--', goldAet);
    store.showImported([imported], 'test.json');
    const fixture = await render();
    rows()[0]!.click();
    await fixture.whenStable();
    expect(text('.details__meta')).toContain('imported file');
    expect(root.querySelector('app-source-requests')).toBeNull();
  });

  it('lists validation issues of an invalid import without a retry button', async () => {
    store.showImportError('bad.json', 'File does not match the expected JSON format (1 issue)', ['[0].venue: missing']);
    await render();
    expect(text('.status')).toContain('Could not import "bad.json".');
    expect(text('.status__list')).toBe('[0].venue: missing');
    expect(root.querySelector('.status button')).toBeNull();
  });

  describe('URL tester', () => {
    const URL_CODE = 'FBLMTEAM11------------FNL-000100--';

    const submit = async (fixture: Awaited<ReturnType<typeof render>>, url: string) => {
      const input = root.querySelector<HTMLInputElement>('.tester__input')!;
      input.value = url;
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      root.querySelector<HTMLButtonElement>('.tester button')!.click();
      await fixture.whenStable();
    };

    it('shows the single tested match and the request it came from', async () => {
      const fixture = await render();
      expect(root.querySelector<HTMLButtonElement>('.tester button')!.disabled).toBe(true);

      await submit(fixture, resultUrl(URL_CODE));
      expect(text('.status')).toContain('Testing URL…');
      TestBed.inject(HttpTestingController)
        .expectOne(resultUrl(URL_CODE))
        .flush(JSON.stringify(goldAet), { headers: { 'content-type': 'application/json' } });
      await fixture.whenStable();

      expect(text('.status')).toContain('✓ URL test passed');
      expect(rows()).toHaveLength(1);
      expect(text('.status')).not.toContain('schedule feed');
      rows()[0]!.click();
      await fixture.whenStable();
      expect([...root.querySelectorAll('.tabs__tab')].map((t) => t.textContent?.trim())).toEqual([
        'Parsed response',
        'Source: match data',
      ]);
      expect([...root.querySelectorAll('.requests__url')].map((u) => u.textContent)).toEqual([resultUrl(URL_CODE)]);
    });

    it('lists what is wrong with the response', async () => {
      const fixture = await render();
      await submit(fixture, resultUrl(URL_CODE));
      TestBed.inject(HttpTestingController)
        .expectOne(resultUrl(URL_CODE))
        .flush(JSON.stringify({ results: {} }), { headers: { 'content-type': 'application/json' } });
      await fixture.whenStable();

      expect(text('.status')).toContain('URL test failed.');
      expect(text('.status__list')).toContain('is this a match result feed?');
      expect(root.querySelector('.status button')).toBeNull();
      expect(rows()).toHaveLength(0);
    });

    it('shows incomplete records parsed from a day schedule URL, with warnings and export disabled', async () => {
      const DAY_URL =
        'https://stacy.olympics.com/OG2024/data/SCH_ByDisciplineH2H~comp=OG2024~disc=FBL~lang=ENG~date=2024-08-09.json';
      const http = TestBed.inject(HttpTestingController);
      const fixture = await render();

      await submit(fixture, DAY_URL);
      http.expectOne(DAY_URL).flush(JSON.stringify(dayFeed), { headers: { 'content-type': 'application/json' } });
      http.verify();
      await fixture.whenStable();

      expect(text('.status')).toContain('✓ URL test passed');
      expect(text('.status')).toContain('⚠ The tested URL returned a schedule feed');
      expect(text('.status')).toContain('2 match(es) have data warnings');
      expect(rows().map((r) => r.querySelector('.fixture__score')?.textContent)).toEqual(['0 – 1', '3 – 5']);
      expect(root.querySelector<HTMLButtonElement>('app-header button:last-of-type')!.disabled).toBe(true);

      rows()[1]!.click();
      await fixture.whenStable();
      expect([...root.querySelectorAll('.tabs__tab')].map((t) => t.textContent?.trim())).toEqual([
        'Parsed response',
        'Source: schedule',
      ]);
      expect([...root.querySelectorAll('.requests__url')].map((u) => u.textContent)).toEqual([DAY_URL]);
      expect(text('.details__notice')).toContain('Not available in this response: scorers, lineups.*.coach');
    });
  });
});
