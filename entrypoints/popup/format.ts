import type { SongSource } from '@/lib/types/song';

export function platformName(source: SongSource): string {
  switch (source) {
    case 'instagram':
      return 'Instagram';
    default:
      return 'Manual';
  }
}

export function platformNoun(source: SongSource): string {
  switch (source) {
    case 'instagram':
      return `${platformName(source)} Reel`;
    default:
      return 'Manual entry';
  }
}
