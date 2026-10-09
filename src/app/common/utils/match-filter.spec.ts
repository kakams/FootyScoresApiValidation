import { describe, expect, it } from 'vitest';
import type { ParsedMatch } from '../models/parsed-match.model';
import { roundsInOrder } from './match-filter';

const match = (round: string | undefined, kickoff?: string): ParsedMatch => ({
  code: 'X',
  gender: 'M',
  warnings: [],
  source: {},
  response: { competition: { round }, kickoff },
});

describe('roundsInOrder', () => {
  it('orders rounds by the day of their first match, then alphabetically, without a fixed list of names', () => {
    const rounds = roundsInOrder([
      match('Gold Medal Match', '2024-08-09T18:00:00+02:00'),
      match('Group B', '2024-07-24T15:00:00+02:00'),
      match('Quarter-final', '2024-08-02T15:00:00+02:00'),
      match('Group A', '2024-07-24T21:00:00+02:00'),
      match('Group A', '2024-07-27T17:00:00+02:00'),
      match('Bronze Medal Match', '2024-08-08T17:00:00+02:00'),
      match('Unknown kickoff'),
      match(undefined, '2024-07-20T12:00:00+02:00'),
    ]);
    expect(rounds).toEqual(['Group A', 'Group B', 'Quarter-final', 'Bronze Medal Match', 'Gold Medal Match', 'Unknown kickoff']);
  });
});
