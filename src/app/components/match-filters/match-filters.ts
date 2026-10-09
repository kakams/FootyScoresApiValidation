import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatchesStore } from '../../common/services/matches-store';

/** Tournament / round / text filters. They only affect the table, never the export. */
@Component({
  selector: 'app-match-filters',
  imports: [FormsModule],
  templateUrl: './match-filters.html',
  styleUrl: './match-filters.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatchFilters {
  protected readonly store = inject(MatchesStore);
}
