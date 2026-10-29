import type { DetectionConfidence } from '@/lib/types/song';
import { normalizeWhitespace } from '@/lib/utils/text';
import { MUSIC_GLYPHS } from './glyphs';
import type { ParsedSongText } from './types';

const LABEL_PREFIX = /^(?:now playing|playing|audio|music|song|sound)\s*[:·•–—-]\s*/i;
const ORIGINAL_AUDIO = /^(?:original (?:audio|sound|song|track)|original)$/i;
const BY_PATTERN = /^(.{1,120}?)\s+(?:by|from)\s+(.{1,80})$/i;

const GENERIC_TEXT = new Set([
  'audio',
  'music',
  'song',
  'sound',
  'reel',
  'reels',
  'instagram',
  'watch',
  'log in',
  'login',
  'sign up',
  'share',
  'more',
  'menu',
  'play',
  'pause',
  'next',
  'previous',
  'follow',
  'following',
  'see more',
  'suggested for you',
  'sponsored',
  'like',
  'comment',
  'send',
  'save',
  'close',
  'mute',
  'unmute',
  'muted',
  'volume',
]);

const UI_NOISE: RegExp[] = [
  /^audio (?:is )?(?:muted|unmuted|on|off)$/i,
  /^(?:un)?mute(?: audio)?$/i,
  /^(?:play|pause)(?: video)?$/i,
  /^(?:open|view|see|show) (?:audio|music|song|profile|page)\b/i,
  /^(?:loading|sponsored|suggested for you)$/i,
  /^(?:like|comment|share|send|save|more)$/i,
  /^\d[\d,.]* (?:views?|likes?|comments?)$/i,
];

const DELIMITERS: ReadonlyArray<{ pattern: RegExp; confidence: DetectionConfidence }> = [
  { pattern: /\s+·\s+/, confidence: 'high' },
  { pattern: /\s+•\s+/, confidence: 'high' },
  { pattern: /·|•/, confidence: 'high' },
  { pattern: /・/, confidence: 'high' },
  { pattern: /\s+\|\s+/, confidence: 'medium' },
  { pattern: /\s+[–—]\s+/, confidence: 'medium' },
  { pattern: /\s+-\s+/, confidence: 'medium' },
];

function cleanPart(value: string): string {
  return normalizeWhitespace(
    value.replace(/^[\s\-–—:|•·]+/, '').replace(/[\s\-–—:|•·]+$/, ''),
  );
}

function isPlausible(value: string, maxLength: number): boolean {
  if (value.length === 0 || value.length > maxLength) return false;
  if (!/\p{L}/u.test(value)) return false;
  if (/^\d+$/.test(value)) return false;
  if (GENERIC_TEXT.has(value.toLowerCase())) return false;
  if (UI_NOISE.some((pattern) => pattern.test(value))) return false;
  return true;
}

function makeOriginalAudio(): ParsedSongText {
  return { title: '', artist: null, confidence: 'low', originalAudio: true };
}

/**
 * True for values that look like a list of artist names, e.g.
 * "Artist One, Artist Two".
 *
 * This is only used to disambiguate the common "Artist A, Artist B • Song"
 * layout; everything else keeps the title-first convention.
 */
function looksLikeArtistList(value: string): boolean {
  if (value.length > 80) return false;
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length < 2) return false;
  return parts.every(
    (part) => /\p{L}/u.test(part) && part.split(/\s+/).length <= 4,
  );
}

/**
 * Both platforms usually show title first, but some label variants (including
 * Instagram's artist-first audio link) put a comma-separated artist list
 * first. Infer that case; mark it medium confidence so the popup shows the
 * "double-check" hint and the swap control remains available.
 */
function orderTitleAndArtist(
  first: string,
  second: string,
  confidence: DetectionConfidence,
): Pick<ParsedSongText, 'title' | 'artist' | 'confidence'> {
  if (looksLikeArtistList(first) && !looksLikeArtistList(second)) {
    return { title: second, artist: first, confidence: 'medium' };
  }
  return { title: first, artist: second, confidence };
}

export interface ParseSongOptions {
  /**
   * Accept "Title by Artist" / "Title from Artist" phrasing. Only enabled for
   * aria-labels, because visible song lines can legitimately contain "by"
   * (e.g. "Stand by Me").
   */
  allowByPattern?: boolean;
}

/**
 * Parse a music attribution string such as:
 *   "♫ Blinding Lights · The Weeknd"
 *   "Blinding Lights by The Weeknd"
 *   "Original audio"
 *
 * The convention on both platforms is title first, artist second. When a line
 * has no separator only the title is returned with low confidence; the popup
 * lets the user correct or swap the two values.
 */
export function parseSongText(
  raw: string | null | undefined,
  options: ParseSongOptions = {},
): ParsedSongText | null {
  if (typeof raw !== 'string') return null;

  let text = normalizeWhitespace(raw.replace(MUSIC_GLYPHS, ' '));
  text = text.replace(LABEL_PREFIX, '').trim();
  if (text.length === 0) return null;

  if (ORIGINAL_AUDIO.test(text)) return makeOriginalAudio();

  if (options.allowByPattern) {
    const byMatch = BY_PATTERN.exec(text);
    if (byMatch) {
      const title = cleanPart(byMatch[1] ?? '');
      const artist = cleanPart(byMatch[2] ?? '');
      if (isPlausible(title, 120) && isPlausible(artist, 80)) {
        return { title, artist, confidence: 'medium', originalAudio: false };
      }
    }
  }

  for (const { pattern, confidence } of DELIMITERS) {
    if (!pattern.test(text)) continue;
    const parts = text
      .split(pattern)
      .map(cleanPart)
      .filter((part) => part.length > 0);
    if (parts.length < 2) continue;

    const first = parts[0] ?? '';
    const second = parts[1] ?? '';
    if (ORIGINAL_AUDIO.test(first)) return makeOriginalAudio();
    if (!isPlausible(first, 120) || !isPlausible(second, 80)) continue;

    return {
      ...orderTitleAndArtist(first, second, confidence),
      originalAudio: false,
    };
  }

  if (!isPlausible(text, 120)) return null;
  return { title: text, artist: null, confidence: 'low', originalAudio: false };
}

/** Normalize an aria-label before handing it to the parser. */
export function ariaLabelToText(label: string | null | undefined): string | null {
  if (typeof label !== 'string') return null;
  const text = normalizeWhitespace(label);
  return text.length > 0 ? text : null;
}
