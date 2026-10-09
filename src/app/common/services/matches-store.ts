import { computed, inject, Injectable, signal } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import type { Gender, ParsedMatch } from '../models/parsed-match.model';
import { ValidationError } from '../parser/response-validator';
import { sortMatches } from '../parser/schedule.parser';
import { filterMatches, roundsInOrder } from '../utils/match-filter';
import { errorMessage, LoadEvent, MatchFailure, MatchLoader } from './match-loader';

export type Phase = 'idle' | 'loading' | 'ready' | 'error';
export type GenderFilter = 'all' | Gender;
/** Where the displayed matches come from: all feeds, an imported file, or a single tested URL. */
export type DataOrigin = { kind: 'feed' } | { kind: 'file'; name: string } | { kind: 'url'; url: string };

export interface LoadError {
  title: string;
  message: string;
  /** Individual validation problems (path: problem). */
  issues?: string[];
  /** Whether repeating the same request may help (network/server errors, not invalid data). */
  retryable?: boolean;
}

/** Application state shared by all components. Components read signals and call the actions below. */
@Injectable({ providedIn: 'root' })
export class MatchesStore {
  private readonly loader = inject(MatchLoader);
  private loading?: Subscription;

  // ---------- state ----------
  readonly phase = signal<Phase>('idle');
  readonly progress = signal({ done: 0, total: 0 });
  readonly matches = signal<ParsedMatch[]>([]);
  readonly failures = signal<MatchFailure[]>([]);
  /** Warnings about the loaded/tested response as a whole. */
  readonly notices = signal<string[]>([]);
  readonly origin = signal<DataOrigin>({ kind: 'feed' });
  readonly error = signal<LoadError | undefined>(undefined);
  readonly selectedCode = signal<string | undefined>(undefined);

  // filters — bound directly by the filter component
  readonly gender = signal<GenderFilter>('all');
  readonly round = signal('all');
  readonly query = signal('');
  readonly warningsOnly = signal(false);

  // ---------- derived ----------
  readonly hasData = computed(() => this.matches().length > 0);
  /** Only complete records can be exported (a partial record would not match the expected JSON format). */
  readonly hasIncomplete = computed(() => this.matches().some((m) => m.missing?.length));
  readonly canExport = computed(
    () => this.phase() === 'ready' && this.hasData() && this.failures().length === 0 && !this.hasIncomplete(),
  );
  readonly rounds = computed(() =>
    roundsInOrder(this.matches()),
  );
  readonly visibleMatches = computed(() =>
    filterMatches(this.matches(), {
      gender: this.gender(),
      round: this.round(),
      query: this.query(),
      warningsOnly: this.warningsOnly(),
    }),
  );
  readonly selected = computed(() => this.matches().find((m) => m.code === this.selectedCode()));

  // ---------- actions ----------
  /** Loads everything from the data feeds. */
  load(): void {
    this.run({ kind: 'feed' }, this.loader.load());
  }

  /** Loads again only the matches that failed during a full load, keeping the loaded ones. */
  retryFailed(): void {
    if (this.origin().kind !== 'feed') return;
    this.run({ kind: 'feed' }, this.loader.load(this.failures().map((f) => f.unit)), this.matches());
  }

  /** Requests a single match feed URL and shows the resulting match (or what is wrong with it). */
  testUrl(url: string): void {
    this.run({ kind: 'url', url: url.trim() }, this.loader.testUrl(url));
  }

  /** Repeats the last failed request (full load or URL test). */
  retry(): void {
    const origin = this.origin();
    if (origin.kind === 'url') this.testUrl(origin.url);
    else if (origin.kind === 'feed') this.load();
  }

  showImported(matches: ParsedMatch[], fileName: string): void {
    this.loading?.unsubscribe();
    this.reset(sortMatches(matches), { kind: 'file', name: fileName });
    this.phase.set('ready');
  }

  showImportError(fileName: string, message: string, issues?: string[]): void {
    this.loading?.unsubscribe();
    this.reset([], { kind: 'file', name: fileName });
    this.phase.set('error');
    this.error.set({ title: `Could not import "${fileName}".`, message, issues });
  }

  /** Subscribes to a load stream; `previous` matches are kept when retrying failed matches. */
  private run(origin: DataOrigin, events: Observable<LoadEvent>, previous?: ParsedMatch[]): void {
    this.loading?.unsubscribe();
    this.phase.set('loading');
    this.error.set(undefined);
    this.progress.set({ done: 0, total: 0 });
    if (!previous) this.reset([], origin);

    this.loading = events.subscribe({
      next: (event) => {
        if (event.type === 'progress') {
          this.progress.set({ done: event.done, total: event.total });
          return;
        }
        this.setMatches(sortMatches([...(previous ?? []), ...event.matches]));
        this.failures.set(event.failures);
        // A retry of failed matches keeps the notices of the original request.
        if (!previous) this.notices.set(event.notices ?? []);
        this.phase.set('ready');
      },
      error: (e: unknown) => {
        this.phase.set('error');
        this.error.set({
          title: origin.kind === 'url' ? 'URL test failed.' : 'Could not load the schedule.',
          message: errorMessage(e),
          issues: e instanceof ValidationError && e.issues.length ? e.issues : undefined,
          retryable: !(e instanceof ValidationError),
        });
      },
    });
  }

  /** Selects a match; selecting the already selected one (or nothing) closes the details. */
  toggleSelection(code?: string): void {
    this.selectedCode.update((current) => (code === undefined || current === code ? undefined : code));
  }

  private reset(matches: ParsedMatch[], origin: DataOrigin): void {
    this.setMatches(matches);
    this.failures.set([]);
    this.notices.set([]);
    this.error.set(undefined);
    this.selectedCode.set(undefined);
    this.origin.set(origin);
  }

  private setMatches(matches: ParsedMatch[]): void {
    this.matches.set(matches);
    if (!matches.some((m) => m.warnings.length)) this.warningsOnly.set(false);
    if (this.round() !== 'all' && !this.rounds().includes(this.round())) this.round.set('all');
  }
}
