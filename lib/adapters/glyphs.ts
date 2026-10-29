/** Shared music-note characters used by both platforms' audio labels. */
const MUSIC_NOTE_CLASS = '\\u266B\\u266A\\u266C\\u{1F3B5}\\u{1F3B6}';

/** Stateless test for a single music note (safe to reuse). */
export const MUSIC_GLYPH = new RegExp(`[${MUSIC_NOTE_CLASS}]`, 'u');

/** Global variant for stripping notes out of a label. */
export const MUSIC_GLYPHS = new RegExp(`[${MUSIC_NOTE_CLASS}]`, 'gu');
