import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { scheduleUrl } from './common/api/olympics.api';
import { MatchesStore } from './common/services/matches-store';
import { Header } from './components/header/header';
import { MatchDetails } from './components/match-details/match-details';
import { MatchFilters } from './components/match-filters/match-filters';
import { MatchTable } from './components/match-table/match-table';
import { StatusBar } from './components/status-bar/status-bar';
import { UrlTester } from './components/url-tester/url-tester';

/** Page shell: lays out the feature components. */
@Component({
  selector: 'app-root',
  imports: [Header, UrlTester, StatusBar, MatchFilters, MatchTable, MatchDetails],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly store = inject(MatchesStore);
  protected readonly scheduleUrl = scheduleUrl();
}
