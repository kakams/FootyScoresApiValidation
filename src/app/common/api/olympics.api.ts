import { HttpClient, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, throwError, timeout, TimeoutError } from 'rxjs';
import type { ResultFeed, ScheduleFeed } from '../models/olympics-feed.model';

export const DATA_BASE_URL = 'https://stacy.olympics.com/OG2024/data';
const COMPETITION = 'OG2024';
const DISCIPLINE = 'FBL';
const LANG = 'ENG';
const TIMEOUT_MS = 20_000;

export const scheduleUrl = (): string =>
  `${DATA_BASE_URL}/SCH_StartList~comp=${COMPETITION}~disc=${DISCIPLINE}~lang=${LANG}.json`;

export const resultUrl = (unitCode: string): string =>
  `${DATA_BASE_URL}/RES_ByRSC_H2H~comp=${COMPETITION}~disc=${DISCIPLINE}~rscResult=${encodeURIComponent(unitCode)}~lang=${LANG}.json`;

export class FetchError extends Error {
  constructor(
    readonly url: string,
    message: string,
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

/** Public, CORS-enabled data feeds of the official Paris 2024 website. */
@Injectable({ providedIn: 'root' })
export class OlympicsApi {
  private readonly http = inject(HttpClient);

  schedule(): Observable<ScheduleFeed> {
    return this.getJson<ScheduleFeed>(scheduleUrl());
  }

  result(unitCode: string): Observable<ResultFeed> {
    return this.getJson<ResultFeed>(resultUrl(unitCode));
  }

  /** Any JSON feed from a user-provided URL — its kind is recognised by the caller. */
  fromUrl(url: string): Observable<unknown> {
    return this.getJson<unknown>(url);
  }

  /** Fetches as text so the content type can be checked — unknown paths return an HTML page with HTTP 200. */
  private getJson<T>(url: string): Observable<T> {
    return this.http.get(url, { observe: 'response', responseType: 'text', headers: { Accept: 'application/json' } }).pipe(
      timeout(TIMEOUT_MS),
      map((res) => parseJson<T>(url, res)),
      catchError((e: unknown) => throwError(() => toFetchError(url, e))),
    );
  }
}

function parseJson<T>(url: string, res: HttpResponse<string>): T {
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('html')) {
    // The data server answers unknown paths with its HTML page and HTTP 200.
    throw new FetchError(url, `Expected JSON but received "${type}" — the feed probably does not exist, check the URL`);
  }
  if (!type.includes('json')) throw new FetchError(url, `Expected JSON but received "${type || 'unknown'}"`);
  try {
    return JSON.parse(res.body ?? '') as T;
  } catch {
    throw new FetchError(url, 'Response is not valid JSON');
  }
}

function toFetchError(url: string, e: unknown): FetchError {
  if (e instanceof FetchError) return e;
  if (e instanceof TimeoutError) return new FetchError(url, `Request timed out after ${TIMEOUT_MS / 1000}s`);
  if (e instanceof HttpErrorResponse && e.status !== 0) return new FetchError(url, `HTTP ${e.status} ${e.statusText}`.trim());
  return new FetchError(url, 'Request network error (offline or blocked by CORS)');
}
