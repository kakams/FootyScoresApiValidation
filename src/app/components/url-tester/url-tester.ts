import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { resultUrl } from '../../common/api/olympics.api';
import { MatchesStore } from '../../common/services/matches-store';


/** Tests a single feed URL: fetches it, parses it to the expected JSON format and shows the result in the grid. */
@Component({
  selector: 'app-url-tester',
  imports: [FormsModule],
  templateUrl: './url-tester.html',
  styleUrl: './url-tester.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UrlTester {
  protected readonly store = inject(MatchesStore);

  protected readonly url = signal('');
  protected readonly placeholder = 'paste url here';
  protected readonly canTest = computed(() => this.url().trim().length > 0 && this.store.phase() !== 'loading');

  protected test(): void {
    if (this.canTest()) this.store.testUrl(this.url());
  }
}
