import type { ScheduleFeed, ScheduleUnit } from '../models/olympics-feed.model';
import type { Gender, ParsedMatch } from '../models/parsed-match.model';

/**
 * Football match units in the Olympic feed look like:
 *   FBLMTEAM11------------GPA-000100--   (Men's group A, match 1)
 *   FBLWTEAM11------------QFNL000300--   (Women's quarter-final 3)
 *   FBLMTEAM11------------FNL-000100--   (Men's gold medal match)
 * Non-match units in the same feed (e.g. ...VICTMEDAL--- victory ceremonies) are excluded.
 */
const MATCH_CODE = /^FBL([MW])TEAM11-+(GP[A-Z]-|QFNL|SFNL|FNL-)(\d{6})--$/;

export interface MatchCodeInfo {
  gender: Gender;
  phase: string;
  number: number;
}

export function parseMatchCode(code: string): MatchCodeInfo | null {
  const m = MATCH_CODE.exec(code);
  if (!m) return null;
  return {
    gender: m[1] as Gender,
    phase: m[2]!.replace(/-$/, ''),
    number: Number(m[3]) / 100,
  };
}

export function isFootballMatch(unit: ScheduleUnit): boolean {
  return parseMatchCode(unit.code) !== null;
}

/** Returns unique football match units sorted deterministically (kickoff, then unit code). */
export function selectFootballMatches(feed: ScheduleFeed): ScheduleUnit[] {
  if (!feed || !Array.isArray(feed.schedules)) {
    throw new Error('Schedule feed has no "schedules" array');
  }
  const byCode = new Map<string, ScheduleUnit>();
  for (const unit of feed.schedules) {
    if (unit && typeof unit.code === 'string' && isFootballMatch(unit) && !byCode.has(unit.code)) {
      byCode.set(unit.code, unit);
    }
  }
  return [...byCode.values()].sort((a, b) => compareKickoff(a.startDate, a.code, b.startDate, b.code));
}

export function compareKickoff(aDate: string | undefined, aCode: string, bDate: string | undefined, bCode: string): number {
  const diff = Date.parse(aDate ?? '') - Date.parse(bDate ?? '');
  if (diff !== 0 && !Number.isNaN(diff)) return diff;
  return aCode < bCode ? -1 : aCode > bCode ? 1 : 0;
}

/** Default output order: kickoff time (absolute instant), ties broken by Olympic unit code. */
export function sortMatches<T extends ParsedMatch>(matches: T[]): T[] {
  return [...matches].sort((a, b) => compareKickoff(a.response.kickoff, a.code, b.response.kickoff, b.code));
}
