/** Expected FootyScores API response for one match — mirrors the expected JSON format exactly. */

export type MatchStatus = 'FT' | 'AET' | 'PEN';

export type GoalType = 'open_play' | 'penalty' | 'free_kick' | 'own_goal';

export interface Scorer {
  team: string;
  player: string;
  minute: number;
  assist?: string;
  type: GoalType;
}

export interface Player {
  name: string;
  number: number;
  position: string;
}

export interface Lineup {
  team: string;
  formation: string;
  coach: string;
  startingXI: Player[];
  bench: Player[];
}

export interface MatchResponse {
  competition: {
    name: string;
    season: string;
    round: string;
  };
  venue: {
    name: string;
    city: string;
  };
  kickoff: string;
  status: MatchStatus;
  teams: {
    home: string;
    away: string;
  };
  score: {
    home: number;
    away: number;
    halfTime: {
      home: number;
      away: number;
    };
  };
  scorers: Scorer[];
  lineups: {
    home: Lineup;
    away: Lineup;
  };
}

/** Arrays are kept whole; objects may miss any field. */
type DeepPartial<T> = T extends unknown[] ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

/**
 * Response parsed from a single request. Complete for match feeds; a schedule feed lacks e.g. scorers and lineups,
 * so the parsed record contains only the fields found in it.
 */
export type ParsedResponse = DeepPartial<MatchResponse>;
