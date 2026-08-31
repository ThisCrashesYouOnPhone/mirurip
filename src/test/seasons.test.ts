import { describe, expect, it } from 'vitest';
import { sortSeasonRelations } from '../components/Watch/Seasons';

const relation = (id: string, releaseDate: number, title: string, type = 'TV') => ({
  id,
  releaseDate,
  seasonYear: releaseDate,
  type,
  relationType: 'SEQUEL',
  title: { english: title, romaji: title, native: '', userPreferred: title },
}) as any;

describe('franchise season ordering', () => {
  it('sorts chronologically without mutating the source list', () => {
    const input = [relation('3', 2024, 'Later'), relation('1', 2020, 'First'), relation('2', 2022, 'Middle')];
    const sorted = sortSeasonRelations(input);
    expect(sorted.map((item) => item.id)).toEqual(['1', '2', '3']);
    expect(input.map((item) => item.id)).toEqual(['3', '1', '2']);
  });
});
