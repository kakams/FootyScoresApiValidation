import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatchesStore } from '../../common/services/matches-store';

/** Shows what the app is doing: idle hint, loading progress, errors, or a summary of loaded data. */
@Component({
  selector: 'app-status-bar',
  templateUrl: './status-bar.html',
  styleUrl: './status-bar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'status', 'aria-live': 'polite' },
})
export class StatusBar {
  protected readonly store = inject(MatchesStore);

  protected readonly isEmpty = computed(() => !this.store.hasData() && this.store.failures().length === 0);
  protected readonly menCount = computed(() => this.store.matches().filter((m) => m.gender === 'M').length);
  protected readonly womenCount = computed(() => this.store.matches().filter((m) => m.gender === 'W').length);
  protected readonly warningCount = computed(() => this.store.matches().filter((m) => m.warnings.length).length);

  /** A tested URL returned a schedule (matches were loaded from its list) rather than a single match feed. */
  protected readonly testedSchedule = computed(() => this.store.matches().some((m) => m.source?.schedule));

  /** Retrying makes sense for network/server errors, not for invalid data. */
  protected readonly canRetry = computed(() => this.store.origin().kind !== 'file' && !!this.store.error()?.retryable);
}
