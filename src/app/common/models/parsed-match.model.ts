import type { MatchResponse, ParsedResponse } from './match-response.model';
import type { ResultFeed, ScheduleUnit } from './olympics-feed.model';

export type Gender = 'M' | 'W';

/** A parsed (or imported) API response plus the metadata the UI needs. */
export interface ParsedMatch {
  /** Olympic event unit code — unique per match (synthetic "import-NNNN" id for imported files). */
  code: string;
  /** null when it cannot be determined (imported data with an unknown competition name). */
  gender: Gender | null;
  /** Parsed response — contains only the fields found in the source request(s). */
  response: ParsedResponse;
  /**
   * Fields of the expected JSON format that the source request does not provide (e.g. lineups in a schedule feed).
   * Absent or empty for complete records.
   */
  missing?: string[];
  /** Non-fatal issues found while building the response (including missing fields). */
  warnings: string[];
  /** Raw feed data used to build the response; absent for matches imported from a JSON file. */
  source?: {
    /** Schedule entry — absent when the match was built from a single tested match feed URL. */
    schedule?: ScheduleUnit;
    /** Match feed — absent when the match was parsed from a tested schedule URL only. */
    result?: ResultFeed;
    /** URL the match feed was requested from (set for tested URLs; otherwise derived from the code). */
    requestUrl?: string;
    /** URL of the schedule feed the match was parsed from (set for tested URLs; otherwise SCH_StartList). */
    scheduleUrl?: string;
  };
}

/** A record with every field of the expected JSON format (built from a match feed, or imported). */
export type CompleteMatch = ParsedMatch & { response: MatchResponse };
