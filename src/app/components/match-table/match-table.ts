import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatchesStore } from '../../common/services/matches-store';
import { MatchRow } from './match-row/match-row';

/** Match list. Clicking a row opens (or closes) its details. */
@Component({
  selector: 'app-match-table',
  imports: [MatchRow],
  templateUrl: './match-table.html',
  styleUrl: './match-table.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatchTable {
  protected readonly store = inject(MatchesStore);

  /** Hides less important columns on wide screens, e.g. while the details panel takes up space. */
  readonly compact = input(false);

  /** Row number = position in the full (unfiltered) default order. */
  protected readonly positions = computed(() => new Map(this.store.matches().map((m, i) => [m.code, i + 1])));
}
