import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { ParsedMatch } from '../../../common/models/parsed-match.model';

const kickoffFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Paris',
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const TOURNAMENT = { M: 'Men', W: 'Women' } as const;

/** One table row. Used as an attribute (`<tr app-match-row>`) so the table markup stays valid. */
@Component({
  selector: 'tr[app-match-row]',
  templateUrl: './match-row.html',
  styleUrls: ['./match-row.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'row',
    tabindex: '0',
    '[class.row--selected]': 'selected()',
    '[class.row--compact]': 'compact()',
    '[attr.aria-selected]': 'selected()',
    '(click)': 'picked.emit()',
    '(keydown.enter)': 'pick($event)',
    '(keydown.space)': 'pick($event)',
  },
})
export class MatchRow {
  readonly match = input.required<ParsedMatch>();
  readonly position = input.required<number>();
  readonly selected = input(false);
  /** Hides the venue column on wide screens (see MatchTable.compact). */
  readonly compact = input(false);
  readonly picked = output();

  protected readonly response = computed(() => this.match().response);
  protected readonly kickoff = computed(() => {
    const kickoff = this.response().kickoff;
    return kickoff ? kickoffFormat.format(new Date(kickoff)) : '—';
  });
  protected readonly tournament = computed(() => {
    const gender = this.match().gender;
    return gender ? { label: TOURNAMENT[gender], modifier: `tag--${gender === 'M' ? 'men' : 'women'}` } : null;
  });
  protected readonly warnings = computed(() => this.match().warnings.join('\n'));

  protected pick(event: Event): void {
    event.preventDefault();
    this.picked.emit();
  }
}
