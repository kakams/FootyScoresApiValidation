import type { ParsedMatch } from '../models/parsed-match.model';
import type { GenderFilter } from '../services/matches-store';

export interface MatchFilters {
  gender: GenderFilter;
  round: string;
  query: string;
  /** Show only matches with data warnings. */
  warningsOnly?: boolean;
}

export function filterMatches(matches: ParsedMatch[], { gender, round, query, warningsOnly }: MatchFilters): ParsedMatch[] {
  const q = query.trim().toLowerCase();
  return matches.filter((m) => {
    const r = m.response;
    if (warningsOnly && !m.warnings.length) return false;
    if (gender !== 'all' && m.gender !== gender) return false;
    if (round !== 'all' && r.competition?.round !== round) return false;
    if (!q) return true;
    return [r.teams?.home, r.teams?.away, r.venue?.name, r.venue?.city, r.competition?.round, m.code].some((s) =>
      s?.toLowerCase().includes(q),
    );
  });
}

/**
 * Unique rounds in tournament order, taken from the data: by the day of their first match, then alphabetically
 * (so the groups, which start on the same day, stay A–D). Rounds without a kickoff go last.
 */
export function roundsInOrder(matches: ParsedMatch[]): string[] {
  const firstDay = new Map<string, string>();
  for (const { response } of matches) {
    const round = response.competition?.round;
    if (!round) continue;
    const day = response.kickoff?.slice(0, 10) ?? '\uffff';
    const known = firstDay.get(round);
    if (known === undefined || day < known) firstDay.set(round, day);
  }
  return [...firstDay].sort(([a, dayA], [b, dayB]) => dayA.localeCompare(dayB) || a.localeCompare(b)).map(([round]) => round);
}
