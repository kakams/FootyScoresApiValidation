import type { ResultFeed, ScheduleFeed, ScheduleUnit } from '../models/olympics-feed.model';
import type { ParsedMatch } from '../models/parsed-match.model';
import { buildMatch, MatchParseError, parseScheduleUnit } from './match.parser';
import { issueCount, limitIssues, validatePartialResponse, validateResponse, ValidationError } from './response-validator';
import { selectFootballMatches } from './schedule.parser';

/** Parses the URL typed by the user; only absolute http(s) URLs are accepted. */
export function parseTestUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new ValidationError('Invalid URL — enter a full address starting with https://');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ValidationError(`Unsupported protocol "${url.protocol}" — only http(s) URLs can be tested`);
  }
  return url;
}

/** Match unit code requested by a RES_ByRSC_H2H URL (`…~rscResult={code}~…`), if present. */
export function requestedUnitCode(url: URL): string | undefined {
  const match = /~rscResult=([^~]+)/.exec(decodeURIComponent(url.pathname));
  return match?.[1];
}

/**
 * A tested URL may return:
 * - a match feed (RES_ByRSC_H2H) — one complete match;
 * - a schedule feed (SCH_StartList, or SCH_ByDisciplineH2H for one day) — a list of matches without scorers,
 *   players or coaches; each match is parsed from what the feed contains.
 */
export type TestedFeed = { kind: 'result'; feed: ResultFeed } | { kind: 'schedule'; units: ScheduleUnit[] };

export function recogniseFeed(json: unknown): TestedFeed {
  const feed = (json ?? {}) as Partial<ResultFeed & ScheduleFeed>;
  if (typeof feed === 'object' && feed.results && typeof feed.results === 'object') {
    return { kind: 'result', feed: feed as ResultFeed };
  }
  if (typeof feed === 'object' && Array.isArray(feed.schedules)) {
    const units = selectFootballMatches(feed as ScheduleFeed);
    if (!units.length) throw new ValidationError('The schedule response lists no football matches');
    return { kind: 'schedule', units };
  }
  throw new ValidationError(
    'Unsupported response — expected a match feed ("results", e.g. RES_ByRSC_H2H) ' +
      'or a schedule feed ("schedules", e.g. SCH_StartList or SCH_ByDisciplineH2H)',
  );
}

/** Warning shown after a schedule URL was tested — the records parsed from it are incomplete. */
export const SCHEDULE_FEED_NOTICE =
  'The tested URL returned a schedule feed: it has no scorers, players or coaches, so the parsed records contain ' +
  'only the fields found in it (see the warnings of each match). Use the match data URL (RES_ByRSC_H2H) of a match ' +
  'to get a complete record. Export is disabled for incomplete records.';

/** Throws ValidationError when a generated response does not match the expected JSON format. */
export function assertValidResponse(match: ParsedMatch): ParsedMatch {
  const issues = validateResponse(match.response, '$');
  if (issues.length) {
    throw new ValidationError(
      `The parsed response does not match the expected JSON format (${issueCount(issues.length)})`,
      limitIssues(issues),
    );
  }
  return match;
}

/**
 * Builds the expected response from a single match feed (without a schedule entry) and checks it.
 * Throws ValidationError with the list of problems; non-fatal findings are returned as warnings.
 */
export function checkMatchFeed(url: URL, feed: ResultFeed): ParsedMatch {
  let match: ParsedMatch;
  try {
    match = buildMatch(undefined, feed);
  } catch (e) {
    if (!(e instanceof MatchParseError)) throw e;
    throw new ValidationError('The response cannot be mapped to the expected JSON format', [e.message]);
  }
  assertValidResponse(match);

  const warnings = [...match.warnings];
  const requested = requestedUnitCode(url);
  if (requested && requested !== match.code) {
    warnings.push(`URL requests ${requested}, but the response describes ${match.code}`);
  }
  return { ...match, warnings, source: { result: feed, requestUrl: url.href } };
}

/**
 * Parses one match of a tested schedule feed. Present fields are validated; the missing ones are listed in
 * `missing` and reported as a warning of the match.
 */
export function checkScheduleUnit(unit: ScheduleUnit, scheduleUrl: string): ParsedMatch {
  const match = parseScheduleUnit(unit);
  const { issues, missing } = validatePartialResponse(match.response, '$');
  if (issues.length) {
    throw new ValidationError(
      `The parsed response does not match the expected JSON format (${issueCount(issues.length)})`,
      limitIssues(issues),
    );
  }
  const warnings = missing.length ? [`Not available in this response: ${summarizeMissing(missing).join(', ')}`] : [];
  return { ...match, missing, warnings, source: { schedule: unit, scheduleUrl } };
}

/** "lineups.home.coach" + "lineups.away.coach" → "lineups.*.coach" (one side only stays as it is). */
export function summarizeMissing(missing: string[]): string[] {
  const set = new Set(missing);
  const counterpart = (field: string) =>
    field.replace(/\b(home|away)\b/, (side) => (side === 'home' ? 'away' : 'home'));
  const summary = missing.map((field) =>
    /\b(home|away)\b/.test(field) && set.has(counterpart(field)) ? field.replace(/\b(home|away)\b/, '*') : field,
  );
  return [...new Set(summary)];
}
