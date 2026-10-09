import { inject, Injectable } from '@angular/core';
import { catchError, concat, defer, from, map, mergeMap, Observable, of, startWith, switchMap } from 'rxjs';
import { OlympicsApi } from '../api/olympics.api';
import type { ScheduleUnit } from '../models/olympics-feed.model';
import type { ParsedMatch } from '../models/parsed-match.model';
import { buildMatch } from '../parser/match.parser';
import { compareKickoff, selectFootballMatches, sortMatches } from '../parser/schedule.parser';
import { ValidationError } from '../parser/response-validator';
import {
  assertValidResponse,
  checkMatchFeed,
  checkScheduleUnit,
  parseTestUrl,
  recogniseFeed,
  SCHEDULE_FEED_NOTICE,
} from '../parser/url-test';

const CONCURRENCY = 6;

export interface MatchFailure {
  code: string;
  unit: ScheduleUnit;
  message: string;
}

export type LoadEvent =
  | { type: 'progress'; done: number; total: number }
  | {
      type: 'done';
      matches: ParsedMatch[];
      failures: MatchFailure[];
      /** Warnings about the tested response as a whole (not about a single match). */
      notices?: string[];
    };

/** Downloads the schedule and every match feed, and maps them to expected API responses. */
@Injectable({ providedIn: 'root' })
export class MatchLoader {
  private readonly api = inject(OlympicsApi);

  /**
   * Emits progress events and finally a single `done` event. Failures of single matches are collected,
   * a failure of the schedule request errors the stream. Unsubscribing cancels pending requests.
   * @param only load just these units (used to retry failed matches)
   */
  load(only?: ScheduleUnit[]): Observable<LoadEvent> {
    const units$ = only ? of(only) : this.api.schedule().pipe(map(selectFootballMatches));
    return units$.pipe(switchMap((units) => this.loadUnits(units)));
  }

  /**
   * Tests a user-provided URL: request, JSON/content-type checks, parsing and validation. Only the tested
   * response is used — no other request is made.
   * - match feed (RES_ByRSC_H2H): one complete match; any problem errors the stream (ValidationError / FetchError);
   * - schedule feed (SCH_StartList, SCH_ByDisciplineH2H): every listed match is parsed from the feed alone,
   *   giving incomplete records; matches that cannot be parsed are collected as failures.
   */
  testUrl(input: string): Observable<LoadEvent> {
    return defer(() => {
      const url = parseTestUrl(input);
      return this.api.fromUrl(url.href).pipe(
        map(recogniseFeed),
        switchMap((tested) =>
          tested.kind === 'result'
            ? of<LoadEvent>({ type: 'done', matches: [checkMatchFeed(url, tested.feed)], failures: [] })
            : of(parseSchedule(tested.units, url.href)),
        ),
      );
    }).pipe(startWith<LoadEvent>({ type: 'progress', done: 0, total: 0 }));
  }

  private loadUnits(units: ScheduleUnit[]): Observable<LoadEvent> {
    const matches: ParsedMatch[] = [];
    const failures: MatchFailure[] = [];
    let done = 0;

    const results$ = from(units).pipe(
      mergeMap(
        (unit) =>
          this.api.result(unit.code).pipe(
            map((feed) => matches.push(assertValidResponse(buildMatch(unit, feed)))),
            catchError((e: unknown) => of(failures.push({ code: unit.code, unit, message: failureMessage(e) }))),
          ),
        CONCURRENCY,
      ),
      map((): LoadEvent => ({ type: 'progress', done: ++done, total: units.length })),
    );

    return concat(
      of<LoadEvent>({ type: 'progress', done: 0, total: units.length }),
      results$,
      defer(() =>
        of<LoadEvent>({
          type: 'done',
          matches: sortMatches(matches),
          failures: failures.sort((a, b) => compareKickoff(a.unit.startDate, a.code, b.unit.startDate, b.code)),
        }),
      ),
    );
  }
}

export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const failureMessage = (e: unknown): string =>
  e instanceof ValidationError && e.issues.length ? `${e.message}: ${e.issues.join('; ')}` : errorMessage(e);

function parseSchedule(units: ScheduleUnit[], scheduleUrl: string): LoadEvent {
  const matches: ParsedMatch[] = [];
  const failures: MatchFailure[] = [];
  for (const unit of units) {
    try {
      matches.push(checkScheduleUnit(unit, scheduleUrl));
    } catch (e) {
      failures.push({ code: unit.code, unit, message: failureMessage(e) });
    }
  }
  return { type: 'done', matches: sortMatches(matches), failures, notices: [SCHEDULE_FEED_NOTICE] };
}
