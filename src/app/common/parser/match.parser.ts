import type { GoalType, Lineup, MatchResponse, MatchStatus, ParsedResponse, Player, Scorer } from '../models/match-response.model';
import type { Entry, PbpAction, Person, ResultFeed, ResultItem, ScheduleUnit } from '../models/olympics-feed.model';
import type { CompleteMatch, Gender, ParsedMatch } from '../models/parsed-match.model';
import { parseMatchCode } from './schedule.parser';

export class MatchParseError extends Error {
  constructor(
    public readonly code: string | undefined,
    message: string,
  ) {
    super(code ? `${code}: ${message}` : message);
    this.name = 'MatchParseError';
  }
}

export const SEASON = '2024';

const COMPETITION_NAME: Record<Gender, string> = {
  M: "Men's Olympic Football Tournament",
  W: "Women's Olympic Football Tournament",
};

const GOAL_TYPE_BY_ACTION: Record<string, GoalType> = {
  SHOT: 'open_play',
  PEN: 'penalty',
  FRD: 'free_kick',
  OG: 'own_goal',
};

const STATUS_BY_RES_CODE: Record<string, MatchStatus> = {
  AET: 'AET',
  PSO: 'PEN',
};

/**
 * Maps a match feed (RES_ByRSC_H2H) to the expected JSON format.
 * Kickoff and venue come from the schedule entry when given (the schedule is the source of truth),
 * otherwise from the `results.schedule` section of the match feed itself.
 */
export function buildMatch(schedule: ScheduleUnit | undefined, result: ResultFeed): CompleteMatch {
  const res = result?.results;
  const code = schedule?.code ?? res?.eventUnitCode;
  if (!code) throw new MatchParseError(undefined, 'match feed has no "results.eventUnitCode" — is this a match result feed?');
  const info = parseMatchCode(code);
  if (!info) throw new MatchParseError(code, 'not a football match unit');
  if (!res) throw new MatchParseError(code, 'result feed has no "results" object');

  const fail = (msg: string): never => {
    throw new MatchParseError(code, msg);
  };
  const warnings: string[] = [];

  const items = res.items ?? [];
  const home = findSide(items, 'HOME') ?? fail('home team not found');
  const away = findSide(items, 'AWAY') ?? fail('away team not found');
  const teamName = (item: ResultItem): string =>
    item.participant?.name ?? schedule?.start?.find((s) => s.teamCode === item.teamCode)?.participant?.name ?? fail(`team name missing for ${item.teamCode}`);
  const teamNames = new Map<string, string>([
    [home.teamCode, teamName(home)],
    [away.teamCode, teamName(away)],
  ]);

  const players = new Map<string, string>();
  for (const item of [home, away]) {
    for (const a of item.teamAthletes ?? []) players.set(a.participantCode, personName(a.athlete));
  }

  const periods = res.periods ?? [];
  const total = periods.find((p) => p.p_code === 'TOT') ?? fail('final score (TOT period) missing');
  const firstHalf = periods.find((p) => p.p_code === 'H1') ?? fail('half-time score (H1 period) missing');

  const location = schedule?.location?.description ?? res.schedule?.location?.description ?? fail('location missing');
  const venueName = schedule?.venue?.description ?? res.schedule?.venue?.description ?? fail('venue missing');

  const response: MatchResponse = {
    competition: {
      name: COMPETITION_NAME[info.gender],
      season: SEASON,
      round: res.eventUnit?.shortDescription ?? fail('round (results.eventUnit.shortDescription) missing'),
    },
    venue: {
      name: venueName,
      city: cityFromLocation(location),
    },
    kickoff: schedule?.startDate ?? res.schedule?.startDate ?? fail('kickoff missing'),
    status: matchStatus(schedule, result, fail),
    teams: {
      home: teamNames.get(home.teamCode)!,
      away: teamNames.get(away.teamCode)!,
    },
    score: {
      home: toInt(total.home?.score) ?? fail('home final score missing'),
      away: toInt(total.away?.score) ?? fail('away final score missing'),
      halfTime: {
        home: toInt(firstHalf.home?.score) ?? fail('home half-time score missing'),
        away: toInt(firstHalf.away?.score) ?? fail('away half-time score missing'),
      },
    },
    scorers: buildScorers(res.playByPlay, teamNames, players, fail),
    lineups: {
      home: buildLineup(home, teamNames.get(home.teamCode)!, warnings),
      away: buildLineup(away, teamNames.get(away.teamCode)!, warnings),
    },
  };

  checkScorersMatchScore(response, home.teamCode, away.teamCode, res.playByPlay, warnings);

  return { code, gender: info.gender, response, warnings, source: schedule ? { schedule, result } : { result } };
}

/**
 * Parses a schedule entry (SCH_ByDisciplineH2H or SCH_StartList) on its own — without requesting the match feed.
 * Only fields found in the entry are set; e.g. scorers, coaches and players are never part of a schedule feed.
 * The caller reports the fields that are missing.
 */
export function parseScheduleUnit(unit: ScheduleUnit): ParsedMatch {
  const code = unit.code;
  const info = parseMatchCode(code) ?? fail(code, 'not a football match unit');
  if (unit.status?.code !== 'FINISHED') fail(code, `match is not finished (status: ${unit.status?.code ?? 'unknown'})`);

  const items = unit.result?.items ?? [];
  const periods = unit.result?.periods ?? [];
  const home = findSide(items, 'HOME');
  const away = findSide(items, 'AWAY');
  const total = periods.find((p) => p.p_code === 'TOT');
  const firstHalf = periods.find((p) => p.p_code === 'H1');
  const location = unit.location?.description;
  const lineup = (item: ResultItem | undefined) =>
    item && { team: item.participant?.name, formation: entryValue(item.eventUnitEntries, 'FORMATION') };

  const response = compact({
    competition: {
      name: COMPETITION_NAME[info.gender],
      season: SEASON,
      round: unit.eventUnit?.shortDescription,
    },
    venue: { name: unit.venue?.description, city: location && cityFromLocation(location) },
    kickoff: unit.startDate,
    status: periods.length ? statusFromPeriods(periods.map((p) => p.p_code)) : undefined,
    teams: { home: home?.participant?.name, away: away?.participant?.name },
    score: {
      home: toInt(total?.home?.score),
      away: toInt(total?.away?.score),
      halfTime: { home: toInt(firstHalf?.home?.score), away: toInt(firstHalf?.away?.score) },
    },
    lineups: { home: lineup(home), away: lineup(away) },
  }) as ParsedResponse;

  return { code, gender: info.gender, response, warnings: [], source: { schedule: unit } };
}

/** A schedule entry has no result code: extra time / shoot-out are recognised by their periods. */
function statusFromPeriods(periodCodes: string[]): MatchStatus {
  if (periodCodes.includes('PSO')) return 'PEN';
  if (periodCodes.includes('ET-H1') || periodCodes.includes('ET-H2')) return 'AET';
  return 'FT';
}

/** Drops undefined values and objects left empty, keeping the key order. */
function compact(value: unknown): unknown {
  if (Array.isArray(value) || value === null || typeof value !== 'object') return value;
  const entries = Object.entries(value)
    .map(([k, v]) => [k, compact(v)] as const)
    .filter(([, v]) => v !== undefined);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function fail(code: string, message: string): never {
  throw new MatchParseError(code, message);
}

function findSide(items: ResultItem[], side: 'HOME' | 'AWAY'): ResultItem | undefined {
  return items.find((i) => entryValue(i.eventUnitEntries, 'HOME_AWAY') === side);
}

function entryValue(entries: Entry[] | undefined, code: string, pos?: string): string | undefined {
  return entries?.find((e) => e.eue_code === code && (pos === undefined || (e.eue_pos ?? '1') === pos))?.eue_value;
}

export function personName(p: Person): string {
  if (p.givenName && p.familyName) return `${p.givenName} ${p.familyName}`;
  return p.familyName ?? p.givenName ?? p.TVName ?? p.name ?? p.code;
}

export function cityFromLocation(location: string): string {
  const idx = location.lastIndexOf(',');
  return idx === -1 ? location.trim() : location.slice(idx + 1).trim();
}

function matchStatus(schedule: ScheduleUnit | undefined, result: ResultFeed, fail: (m: string) => never): MatchStatus {
  const state = result.results.schedule?.status?.code ?? schedule?.status?.code;
  if (state !== 'FINISHED') fail(`match is not finished (status: ${state ?? 'unknown'})`);
  const resCode = result.results.extendedInfos?.find((e) => e.ei_code === 'RES_CODE')?.ei_value;
  return (resCode && STATUS_BY_RES_CODE[resCode]) || 'FT';
}

function toInt(v: string | undefined): number | undefined {
  if (v === undefined || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isInteger(n) ? n : undefined;
}

/** "45'" -> 45, "90' +3" -> 90, "120' +1" -> 120 */
export function parseMinute(when: string | undefined): number | undefined {
  const m = /^\s*(\d+)/.exec(when ?? '');
  return m ? Number(m[1]) : undefined;
}

/** Goals scored in play (penalty shoot-out kicks excluded), in chronological order. */
function goalActions(playByPlay: ResultFeed['results']['playByPlay']): PbpAction[] {
  return (playByPlay ?? [])
    .flatMap((p) => p.actions ?? [])
    .filter((a) => a.pbpa_Result === 'GOAL' && a.pbpa_period !== 'PSO')
    .sort((a, b) => (a.pbpa_order ?? 0) - (b.pbpa_order ?? 0) || Number(a.pbpa_id ?? 0) - Number(b.pbpa_id ?? 0));
}

function buildScorers(
  playByPlay: ResultFeed['results']['playByPlay'],
  teamNames: Map<string, string>,
  players: Map<string, string>,
  fail: (m: string) => never,
): Scorer[] {
  return goalActions(playByPlay).map((a): Scorer => {
    const competitor = a.competitors?.[0] ?? fail(`goal ${a.pbpa_id} has no team`);
    const athletes = competitor.athletes ?? [];
    const scorer = athletes.find((x) => x.pbpat_role === 'SCR') ?? athletes.find((x) => !x.pbpat_role) ?? fail(`goal ${a.pbpa_id} has no scorer`);
    const assist = athletes.find((x) => x.pbpat_role === 'ASSIST');
    const player = (id: string) => players.get(id) ?? fail(`unknown player ${id} in goal ${a.pbpa_id}`);

    const team = teamNames.get(competitor.pbpc_code) ?? fail(`unknown team ${competitor.pbpc_code} in goal ${a.pbpa_id}`);
    const minute = parseMinute(a.pbpa_When) ?? fail(`goal ${a.pbpa_id} has no minute`);
    const type = GOAL_TYPE_BY_ACTION[a.pbpa_Action] ?? 'open_play';
    // Key order mirrors the expected JSON format; "assist" is present only when the feed records one.
    return assist
      ? { team, player: player(scorer.pbpat_code), minute, assist: player(assist.pbpat_code), type }
      : { team, player: player(scorer.pbpat_code), minute, type };
  });
}

function buildLineup(item: ResultItem, team: string, warnings: string[]): Lineup {
  const athletes = [...(item.teamAthletes ?? [])].sort((a, b) => a.order - b.order);
  const toPlayer = (a: (typeof athletes)[number]): Player => ({
    name: personName(a.athlete),
    number: Number(a.bib),
    position: entryValue(a.eventUnitEntries, 'POSITION', '1') ?? '',
  });
  const isStarter = (a: (typeof athletes)[number]) => entryValue(a.eventUnitEntries, 'STARTER') === 'Y';

  const startingXI = athletes.filter(isStarter).map(toPlayer);
  const bench = athletes.filter((a) => !isStarter(a)).map(toPlayer);
  if (startingXI.length !== 11) warnings.push(`${team}: starting XI has ${startingXI.length} players`);

  const coaches = [...(item.teamCoaches ?? [])].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  const coach = coaches.find((c) => c.function?.functionCode === 'COACH') ?? coaches[0];
  if (!coach) warnings.push(`${team}: head coach missing`);
  const formation = entryValue(item.eventUnitEntries, 'FORMATION');
  if (!formation) warnings.push(`${team}: formation missing`);

  return {
    team,
    formation: formation ?? '',
    coach: coach ? personName(coach.coach) : '',
    startingXI,
    bench,
  };
}

/** Cross-check: goals credited to each side (own goals count for the opponent) must equal the final score. */
function checkScorersMatchScore(
  response: MatchResponse,
  homeCode: string,
  awayCode: string,
  playByPlay: ResultFeed['results']['playByPlay'],
  warnings: string[],
): void {
  let home = 0;
  let away = 0;
  for (const a of goalActions(playByPlay)) {
    const scorerTeam = a.competitors?.[0]?.pbpc_code;
    const benefits = a.pbpa_Action === 'OG' ? (scorerTeam === homeCode ? awayCode : homeCode) : scorerTeam;
    if (benefits === homeCode) home++;
    else if (benefits === awayCode) away++;
  }
  if (home !== response.score.home || away !== response.score.away) {
    warnings.push(`goals in play-by-play (${home}-${away}) do not match final score (${response.score.home}-${response.score.away})`);
  }
}
