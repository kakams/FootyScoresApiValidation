import { toExportJson } from './match-export';
import { ImportError, parseImportedJson } from './match-import';
import { validateResponse } from '../../common/parser/response-validator';
import { buildMatch } from '../../common/parser/match.parser';
import { sortMatches } from '../../common/parser/schedule.parser';
import type { ResultFeed, ScheduleFeed } from '../../common/models/olympics-feed.model';
import scheduleFeed from '../../../testing/fixtures/schedule.json';
import goldAet from '../../../testing/fixtures/men-gold-aet.json';
import groupOwnGoal from '../../../testing/fixtures/men-group-own-goal.json';

const units = (scheduleFeed as unknown as ScheduleFeed).schedules;
const exported = toExportJson(
  sortMatches([
    buildMatch(units.find((u) => u.code === 'FBLMTEAM11------------FNL-000100--')!, goldAet as unknown as ResultFeed),
    buildMatch(units.find((u) => u.code === 'FBLMTEAM11------------GPD-000100--')!, groupOwnGoal as unknown as ResultFeed),
  ]),
);

const importError = (text: string): ImportError => {
  try {
    parseImportedJson(text);
  } catch (e) {
    if (e instanceof ImportError) return e;
    throw e;
  }
  throw new Error('expected ImportError');
};

describe('parseImportedJson', () => {
  it('round-trips a file exported by the app', () => {
    const matches = parseImportedJson(exported);
    expect(matches).toHaveLength(2);
    expect(matches.map((m) => m.response.teams.home)).toEqual(['Mali', 'France']);
    expect(matches.every((m) => m.gender === 'M' && m.source === undefined && m.warnings.length === 0)).toBe(true);
    expect(toExportJson(sortMatches(matches))).toBe(exported);
  });

  it('accepts a single object', () => {
    const single = JSON.stringify(JSON.parse(exported)[0]);
    expect(parseImportedJson(single)).toHaveLength(1);
  });

  it('sorts imported matches by kickoff on display', () => {
    const reversed = JSON.stringify(JSON.parse(exported).reverse());
    expect(sortMatches(parseImportedJson(reversed)).map((m) => m.response.teams.home)).toEqual(['Mali', 'France']);
  });

  it('flags duplicate matches', () => {
    const [first] = JSON.parse(exported);
    const matches = parseImportedJson(JSON.stringify([first, first]));
    expect(matches[1]!.warnings[0]).toMatch(/duplicate of item #1/);
  });

  it('rejects invalid JSON and empty files', () => {
    expect(importError('{not json').message).toMatch(/not valid JSON/);
    expect(importError('[]').message).toMatch(/empty/);
  });

  it('rejects items that differ from the expected JSON format, with paths', () => {
    const data = JSON.parse(exported);
    delete data[0].venue.city;
    data[0].extra = true;
    data[1].score.home = '3';
    data[1].lineups.away.startingXI[0].number = 1.5;
    const err = importError(JSON.stringify(data));
    expect(err.message).toMatch(/4 issues/);
    expect(err.issues).toEqual([
      '[0].venue.city: missing',
      '[0].extra: unexpected field',
      '[1].score.home: expected integer, got string',
      '[1].lineups.away.startingXI[0].number: expected integer, got number',
    ]);
  });
});

describe('validateResponse', () => {
  it('treats only scorer "assist" as optional', () => {
    const item = JSON.parse(exported)[1];
    item.scorers.forEach((s: { assist?: string }) => delete s.assist);
    expect(validateResponse(item)).toEqual([]);
    delete item.scorers[0].type;
    expect(validateResponse(item)).toEqual(['.scorers[0].type: missing']);
  });

  it('rejects an invalid kickoff date', () => {
    const item = JSON.parse(exported)[0];
    item.kickoff = 'tomorrow';
    expect(validateResponse(item)).toEqual(['.kickoff: not a valid ISO 8601 date']);
  });
});
