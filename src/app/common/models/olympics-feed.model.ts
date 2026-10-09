/**
 * Subset of the Paris 2024 Olympics data feed (stacy.olympics.com/OG2024/data) used by the app.
 * Only fields consumed by the parser are typed; everything else is ignored.
 */

export interface Described {
  code?: string;
  description?: string;
  longDescription?: string;
  shortDescription?: string;
}

export interface ScheduleUnit {
  code: string;
  order?: number;
  startDate: string;
  endDate?: string;
  status?: Described;
  venue?: Described;
  location?: Described;
  /** Present in SCH_ByDisciplineH2H (day schedule); SCH_StartList has no event unit details. */
  eventUnit?: Described;
  /**
   * Result summary. SCH_ByDisciplineH2H: periods and team items (HOME_AWAY, FORMATION) — no players, coaches or
   * play-by-play. SCH_StartList: status only.
   */
  result?: {
    periods?: PeriodScore[];
    items?: ResultItem[];
  };
  start?: Array<{
    sortOrder?: number;
    teamCode?: string;
    participant?: { code?: string; name?: string };
  }>;
}

export interface ScheduleFeed {
  schedules: ScheduleUnit[];
}

export interface Entry {
  eue_code: string;
  eue_value: string;
  eue_pos?: string;
}

export interface Person {
  code: string;
  name?: string;
  givenName?: string;
  familyName?: string;
  TVName?: string;
}

export interface TeamAthlete {
  order: number;
  bib: string;
  participantCode: string;
  athlete: Person;
  eventUnitEntries?: Entry[];
}

export interface TeamCoach {
  order?: number;
  function?: { functionCode?: string };
  coach: Person;
}

export interface ResultItem {
  teamCode: string;
  participant?: { code?: string; name?: string };
  eventUnitEntries?: Entry[];
  teamCoaches?: TeamCoach[];
  teamAthletes?: TeamAthlete[];
}

export interface PeriodScore {
  p_code: string;
  home?: { score?: string; periodScore?: string };
  away?: { score?: string; periodScore?: string };
}

export interface PbpAthlete {
  pbpat_code: string;
  pbpat_order?: string;
  pbpat_bib?: string;
  pbpat_role?: string;
}

export interface PbpAction {
  pbpa_id?: string;
  pbpa_period?: string;
  pbpa_order?: number;
  pbpa_Action: string;
  pbpa_Result?: string;
  pbpa_When?: string;
  competitors?: Array<{
    pbpc_code: string;
    athletes?: PbpAthlete[];
  }>;
}

export interface ResultFeed {
  results: {
    eventUnitCode?: string;
    eventUnit?: Described;
    status?: Described;
    extendedInfos?: Array<{ ei_code: string; ei_value: string }>;
    schedule?: {
      startDate?: string;
      status?: Described;
      venue?: Described;
      location?: Described;
    };
    periods?: PeriodScore[];
    playByPlay?: Array<{ subcode?: string; actions?: PbpAction[] }>;
    items?: ResultItem[];
  };
}
