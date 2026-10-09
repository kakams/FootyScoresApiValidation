import { buildMatch, cityFromLocation, parseMinute, parseScheduleUnit, personName } from './match.parser';
import { validatePartialResponse } from './response-validator';
import { summarizeMissing } from './url-test';
import dayFeed from '../../../testing/fixtures/day-2024-08-09.json';
import { parseMatchCode, selectFootballMatches, sortMatches } from './schedule.parser';
import { toExportJson } from '../../components/header/match-export';
import type { ResultFeed, ScheduleFeed, ScheduleUnit } from '../models/olympics-feed.model';
import scheduleFeed from '../../../testing/fixtures/schedule.json';
import goldAet from '../../../testing/fixtures/men-gold-aet.json';
import qfPso from '../../../testing/fixtures/men-qf-pso.json';
import groupOwnGoal from '../../../testing/fixtures/men-group-own-goal.json';

const schedule = scheduleFeed as unknown as ScheduleFeed;
const unit = (code: string): ScheduleUnit => schedule.schedules.find((s) => s.code === code)!;
const clone = <T>(v: T): T => structuredClone(v);

const GOLD = 'FBLMTEAM11------------FNL-000100--';
const QF = 'FBLMTEAM11------------QFNL000200--';
const GROUP = 'FBLMTEAM11------------GPD-000100--';

const EXAMPLE_KEYS = ['competition', 'venue', 'kickoff', 'status', 'teams', 'score', 'scorers', 'lineups'];

describe('selectFootballMatches', () => {
  const matches = selectFootballMatches(schedule);

  it('keeps all 58 matches and drops medal ceremonies', () => {
    expect(schedule.schedules).toHaveLength(60);
    expect(matches).toHaveLength(58);
    expect(matches.filter((m) => m.code.startsWith('FBLM'))).toHaveLength(32);
    expect(matches.filter((m) => m.code.startsWith('FBLW'))).toHaveLength(26);
    expect(matches.some((m) => m.code.includes('MEDAL'))).toBe(false);
  });

  it('has no duplicates, even if the feed repeats a unit', () => {
    const dup = { schedules: [...schedule.schedules, ...schedule.schedules] };
    expect(selectFootballMatches(dup)).toHaveLength(58);
    expect(new Set(matches.map((m) => m.code)).size).toBe(58);
  });

  it('orders by kickoff, then unit code, independent of input order', () => {
    const reversed = { schedules: [...schedule.schedules].reverse() };
    expect(selectFootballMatches(reversed).map((m) => m.code)).toEqual(matches.map((m) => m.code));
    expect(matches[0]!.code).toBe('FBLMTEAM11------------GPB-000100--');
    expect(matches.at(-1)!.code).toBe('FBLWTEAM11------------FNL-000100--');
    for (let i = 1; i < matches.length; i++) {
      expect(Date.parse(matches[i]!.startDate)).toBeGreaterThanOrEqual(Date.parse(matches[i - 1]!.startDate));
    }
  });

  it('rejects malformed feeds', () => {
    expect(() => selectFootballMatches({} as ScheduleFeed)).toThrow(/schedules/);
  });
});

describe('parseMatchCode', () => {
  it('parses match units and ignores ceremonies', () => {
    expect(parseMatchCode(GOLD)).toEqual({ gender: 'M', phase: 'FNL', number: 1 });
    expect(parseMatchCode('FBLWTEAM11------------GPC-000400--')).toEqual({ gender: 'W', phase: 'GPC', number: 4 });
    expect(parseMatchCode('FBLMTEAM11------------VICTMEDAL---')).toBeNull();
    expect(parseMatchCode('HBLMTEAM7-------------FNL-000100--')).toBeNull();
  });
});

describe('buildMatch', () => {
  it('builds the men\'s gold medal match (after extra time) in the expected JSON format', () => {
    const { response, warnings } = buildMatch(unit(GOLD), goldAet as unknown as ResultFeed);
    expect(warnings).toEqual([]);
    expect(Object.keys(response)).toEqual(EXAMPLE_KEYS);
    expect(response.competition).toEqual({ name: "Men's Olympic Football Tournament", season: '2024', round: 'Gold Medal Match' });
    expect(response.venue).toEqual({ name: 'Parc des Princes', city: 'Paris' });
    expect(response.kickoff).toBe('2024-08-09T18:00:00+02:00');
    expect(response.status).toBe('AET');
    expect(response.teams).toEqual({ home: 'France', away: 'Spain' });
    expect(response.score).toEqual({ home: 3, away: 5, halfTime: { home: 1, away: 3 } });
    expect(response.scorers).toHaveLength(8);
    expect(response.scorers.at(-1)).toMatchObject({ team: 'Spain', minute: 120, type: 'open_play' });
    expect(Object.keys(response.scorers[0]!)).toEqual(expect.arrayContaining(['team', 'player', 'minute', 'type']));

    const fra = response.lineups.home;
    expect(Object.keys(fra)).toEqual(['team', 'formation', 'coach', 'startingXI', 'bench']);
    expect(fra).toMatchObject({ team: 'France', formation: '4-1-2-1-2', coach: 'Thierry Henry' });
    expect(fra.startingXI).toHaveLength(11);
    expect(fra.startingXI[0]).toEqual({ name: expect.any(String), number: 16, position: 'GK' });
    expect(Object.keys(fra.startingXI[0]!)).toEqual(['name', 'number', 'position']);
    expect(fra.bench.length).toBeGreaterThan(0);
  });

  it('places "assist" between minute and type, and only when present', () => {
    const { response } = buildMatch(unit(GOLD), goldAet as unknown as ResultFeed);
    const withAssist = response.scorers.find((s) => s.assist);
    const without = response.scorers.find((s) => !s.assist);
    expect(Object.keys(withAssist!)).toEqual(['team', 'player', 'minute', 'assist', 'type']);
    expect(Object.keys(without!)).toEqual(['team', 'player', 'minute', 'type']);
  });

  it('excludes penalty shoot-out kicks and reports status PEN', () => {
    const { response, warnings } = buildMatch(unit(QF), qfPso as unknown as ResultFeed);
    expect(warnings).toEqual([]);
    expect(response.status).toBe('PEN');
    expect(response.score.home + response.score.away).toBe(response.scorers.length);
  });

  it('marks own goals and keeps regulation-time matches as FT', () => {
    const { response, warnings } = buildMatch(unit(GROUP), groupOwnGoal as unknown as ResultFeed);
    expect(warnings).toEqual([]);
    expect(response.status).toBe('FT');
    expect(response.competition.round).toBe('Group D');
    expect(response.teams).toEqual({ home: 'Mali', away: 'Israel' });
    const og = response.scorers.find((s) => s.type === 'own_goal');
    expect(og).toMatchObject({ team: 'Mali', minute: 56 });
  });

  it('is deterministic', () => {
    const a = buildMatch(unit(GOLD), clone(goldAet) as unknown as ResultFeed).response;
    const b = buildMatch(unit(GOLD), clone(goldAet) as unknown as ResultFeed).response;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('fails with a clear error when essential data is missing', () => {
    const broken = clone(goldAet) as unknown as ResultFeed;
    broken.results.periods = broken.results.periods!.filter((p) => p.p_code !== 'TOT');
    expect(() => buildMatch(unit(GOLD), broken)).toThrow(/TOT/);

    const notFinished = clone(goldAet) as unknown as ResultFeed;
    notFinished.results.schedule!.status = { code: 'SCHEDULED' };
    expect(() => buildMatch(unit(GOLD), notFinished)).toThrow(/not finished/);
  });

  it('warns when play-by-play goals do not add up to the score', () => {
    const tampered = clone(goldAet) as unknown as ResultFeed;
    tampered.results.periods!.find((p) => p.p_code === 'TOT')!.home!.score = '4';
    expect(buildMatch(unit(GOLD), tampered).warnings[0]).toMatch(/do not match final score/);
  });
});

describe('parseScheduleUnit (schedule feed only)', () => {
  const dayUnits = (dayFeed as unknown as ScheduleFeed).schedules;
  const goldUnit = dayUnits.find((u) => u.code === 'FBLMTEAM11------------FNL-000100--')!;

  it('keeps only the fields found in a day schedule entry (SCH_ByDisciplineH2H)', () => {
    const { response, source } = parseScheduleUnit(goldUnit);
    expect(response).toEqual({
      competition: { name: "Men's Olympic Football Tournament", season: '2024', round: 'Gold Medal Match' },
      venue: { name: 'Parc des Princes', city: 'Paris' },
      kickoff: '2024-08-09T18:00:00+02:00',
      status: 'AET',
      teams: { home: 'France', away: 'Spain' },
      score: { home: 3, away: 5, halfTime: { home: 1, away: 3 } },
      lineups: {
        home: { team: 'France', formation: '4-1-2-1-2' },
        away: { team: 'Spain', formation: '4-2-3-1' },
      },
    });
    expect(source).toEqual({ schedule: goldUnit });
    // Same values as the complete record built from the match feed.
    const full = buildMatch(goldUnit, goldAet as unknown as ResultFeed).response;
    expect({ ...full, scorers: undefined, lineups: undefined }).toEqual({ ...response, scorers: undefined, lineups: undefined });
  });

  it('recognises a penalty shoot-out from the periods', () => {
    const periods = ['H1', 'H2', 'ET-H1', 'ET-H2', 'PSO', 'TOT'].map((p_code) => ({ p_code }));
    expect(parseScheduleUnit({ ...goldUnit, result: { ...goldUnit.result, periods } }).response.status).toBe('PEN');
  });

  it('parses a SCH_StartList entry, which has no result data nor round', () => {
    const { response } = parseScheduleUnit(unit(GOLD));
    expect(Object.keys(response)).toEqual(['competition', 'venue', 'kickoff']);
    expect(response.competition).toEqual({ name: "Men's Olympic Football Tournament", season: '2024' });
    expect(validatePartialResponse(response).missing).toEqual(['competition.round', 'status', 'teams', 'score', 'scorers', 'lineups']);
  });

  it('fails for matches that are not finished', () => {
    expect(() => parseScheduleUnit({ ...goldUnit, status: { code: 'SCHEDULED' } })).toThrow('match is not finished');
  });

  it('summarizes missing fields of both sides', () => {
    expect(summarizeMissing(['scorers', 'lineups.home.coach', 'lineups.away.coach', 'lineups.home.bench'])).toEqual([
      'scorers',
      'lineups.*.coach',
      'lineups.home.bench',
    ]);
  });
});

describe('helpers', () => {
  it('parses minutes including stoppage time', () => {
    expect(parseMinute("45'")).toBe(45);
    expect(parseMinute("90' +3")).toBe(90);
    expect(parseMinute(undefined)).toBeUndefined();
  });

  it('formats names from given/family name, falling back for single-name players', () => {
    expect(personName({ code: '1', givenName: 'Thierry', familyName: 'Henry' })).toBe('Thierry Henry');
    expect(personName({ code: '2', familyName: 'Marta', name: 'MARTA' })).toBe('Marta');
  });

  it('extracts the city from the location', () => {
    expect(cityFromLocation('Geoffroy-Guichard, St-Etienne')).toBe('St-Etienne');
    expect(cityFromLocation('Paris')).toBe('Paris');
  });
});

describe('export', () => {
  it('exports an array of responses sorted by kickoff', () => {
    const matches = [
      buildMatch(unit(GOLD), goldAet as unknown as ResultFeed),
      buildMatch(unit(GROUP), groupOwnGoal as unknown as ResultFeed),
      buildMatch(unit(QF), qfPso as unknown as ResultFeed),
    ];
    const parsed = JSON.parse(toExportJson(sortMatches(matches)));
    expect(parsed.map((r: { teams: { home: string } }) => r.teams.home)).toEqual(['Mali', 'Egypt', 'France']);
    expect(toExportJson(sortMatches(matches))).toBe(toExportJson(sortMatches([...matches].reverse())));
  });
});
