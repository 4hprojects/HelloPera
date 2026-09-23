import { describe, expect, it } from 'vitest';
import { takeLookaheadPage } from './lookahead';

describe('takeLookaheadPage', () => {
  it('keeps a full page and reports another row', () => {
    expect(takeLookaheadPage([1, 2, 3, 4], 3)).toEqual({
      items: [1, 2, 3],
      hasNext: true,
    });
  });

  it('reports the final page without requiring a total count', () => {
    expect(takeLookaheadPage([1, 2], 3)).toEqual({
      items: [1, 2],
      hasNext: false,
    });
  });
});
