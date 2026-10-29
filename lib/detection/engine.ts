import type { DetectedTrack } from '@/lib/types/song';
import type {
  DetectionDiagnostics,
  ExtractionResult,
  ParsedSongText,
} from '@/lib/adapters/types';
import {
  assessElementContext,
  type ElementContext,
  type ReelContext,
} from '@/lib/adapters/layout';
import { parseSongText } from '@/lib/adapters/parse';
import { normalizeForIdentity } from '@/lib/utils/identity';
import { toMatchTokens } from '@/lib/utils/text';
import { isStrongSource, sourceWeight } from './sources';
import type { Evidence, EvidenceInput, EvidenceSource } from './types';

interface PreparedEvidence {
  evidence: Evidence;
  parsed: ParsedSongText;
  context: ElementContext;
  contextScore: number;
  effective: number;
}

interface GroupResult {
  key: string;
  parsed: ParsedSongText;
  score: number;
  sources: EvidenceSource[];
  clusters: number;
  evidenceCount: number;
  context: number;
  topSource: EvidenceSource;
}

const ORIGINAL_CONTEXT_MIN = 0.35;
const AMBIGUOUS_MARGIN = 0.1;

function pairKey(parsed: ParsedSongText): string {
  const title = normalizeForIdentity(parsed.title);
  if (!parsed.artist) return `title:${title}`;
  const artist = normalizeForIdentity(parsed.artist);
  return [title, artist].sort().join('|');
}

function orientationKey(parsed: ParsedSongText): string {
  return `${normalizeForIdentity(parsed.title)}|${normalizeForIdentity(parsed.artist ?? '')}`;
}

function linked(a: Evidence, b: Evidence): boolean {
  const aElement = a.element;
  const bElement = b.element;
  if (aElement && bElement) {
    if (
      aElement === bElement ||
      aElement.contains(bElement) ||
      bElement.contains(aElement)
    ) {
      return true;
    }
  }
  if (a.href && b.href && a.href === b.href) return true;
  if (a.correlationKey && b.correlationKey && a.correlationKey === b.correlationKey) {
    return true;
  }
  return false;
}

/** Union correlated DOM/structured evidence so the same signal is counted once. */
function correlate(items: readonly PreparedEvidence[]): PreparedEvidence[][] {
  const parent = items.map((_, index) => index);

  const find = (index: number): number => {
    let current = index;
    while (true) {
      const parentIndex = parent[current];
      if (parentIndex === undefined || parentIndex === current) return current;
      const grandParent = parent[parentIndex];
      if (grandParent !== undefined) parent[current] = grandParent;
      current = parentIndex;
    }
  };

  const union = (a: number, b: number): void => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  };

  for (let a = 0; a < items.length; a += 1) {
    for (let b = a + 1; b < items.length; b += 1) {
      const first = items[a];
      const second = items[b];
      if (first && second && linked(first.evidence, second.evidence)) {
        union(a, b);
      }
    }
  }

  const clusters = new Map<number, PreparedEvidence[]>();
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item) continue;
    const root = find(index);
    const cluster = clusters.get(root);
    if (cluster) cluster.push(item);
    else clusters.set(root, [item]);
  }
  return [...clusters.values()];
}

function chooseOrientation(items: readonly PreparedEvidence[]): ParsedSongText {
  const votes = new Map<
    string,
    { weight: number; bestEffective: number; parsed: ParsedSongText }
  >();

  for (const item of items) {
    if (!item.parsed.artist) continue;
    const key = orientationKey(item.parsed);
    const existing = votes.get(key);
    if (existing) {
      existing.weight += item.effective;
      if (item.effective > existing.bestEffective) {
        existing.bestEffective = item.effective;
        existing.parsed = item.parsed;
      }
    } else {
      votes.set(key, {
        weight: item.effective,
        bestEffective: item.effective,
        parsed: item.parsed,
      });
    }
  }

  const winner = [...votes.values()].sort((a, b) => b.weight - a.weight)[0];
  if (winner) return winner.parsed;

  return (
    [...items].sort((a, b) => b.effective - a.effective)[0]?.parsed ?? {
      title: '',
      artist: null,
      confidence: 'low',
      originalAudio: false,
    }
  );
}

function captionSupports(caption: string, parsed: ParsedSongText): number {
  if (!caption || parsed.title.length < 3) return 0;
  const titleTokens = toMatchTokens(parsed.title);
  if (titleTokens.length === 0) return 0;
  const captionTokens = new Set(toMatchTokens(caption));
  if (!titleTokens.every((token) => captionTokens.has(token))) return 0;

  let boost = 0.03;
  if (parsed.artist) {
    const artistTokens = toMatchTokens(parsed.artist);
    if (artistTokens.length > 0 && artistTokens.every((token) => captionTokens.has(token))) {
      boost += 0.02;
    }
  }
  return boost;
}

function scoreGroup(
  key: string,
  items: PreparedEvidence[],
  caption: string,
): GroupResult {
  const clusters = correlate(items);
  const clusterTopSources = new Set<EvidenceSource>();
  let topCluster: PreparedEvidence[] = [];
  let topClusterScore = -1;
  let topClusterContext = 0;

  for (const cluster of clusters) {
    const top = [...cluster].sort((a, b) => b.effective - a.effective)[0];
    if (!top) continue;
    clusterTopSources.add(top.evidence.source);
    if (top.effective > topClusterScore) {
      topClusterScore = top.effective;
      topCluster = cluster;
      topClusterContext = top.contextScore;
    }
  }

  const primary = [...topCluster].sort((a, b) => b.effective - a.effective)[0];
  const parsed = chooseOrientation(items);
  const topSource = primary?.evidence.source ?? 'visible-label';

  // Independent clusters from different source families add a small, capped
  // corroboration bonus. Same-element link+aria signals were merged above.
  let score = Math.max(0, topClusterScore);
  score += Math.min(0.12, Math.max(0, clusterTopSources.size - 1) * 0.04);
  if (topSource !== 'visible-label') {
    score += captionSupports(caption, parsed);
  }
  if (!parsed.artist) score = Math.min(score, 0.58);
  if (topSource === 'media-session') score = Math.min(score, 0.4);
  score = Math.max(0, Math.min(1, score));

  // Only independent cluster leaders are reported, so a link's own aria-label
  // or an ancestor containing the link is not presented as extra support.
  const sources = [...clusterTopSources].sort(
    (a, b) => sourceWeight(b) - sourceWeight(a),
  );

  return {
    key,
    parsed,
    score,
    sources,
    clusters: clusters.length,
    evidenceCount: items.length,
    context: topClusterContext,
    topSource,
  };
}

function diagnosticsFor(
  group: GroupResult | null,
  runnerUp: number | null,
  evidenceCount: number,
): DetectionDiagnostics {
  const score = group?.score ?? 0;
  const margin = runnerUp === null ? score : score - runnerUp;
  return {
    score: Math.round(score * 1000) / 1000,
    runnerUp: runnerUp === null ? null : Math.round(runnerUp * 1000) / 1000,
    margin: Math.round(margin * 1000) / 1000,
    sources: group?.sources ?? [],
    clusters: group?.clusters ?? 0,
    evidence: evidenceCount,
    context: Math.round((group?.context ?? 0) * 1000) / 1000,
  };
}

/**
 * Combine all evidence into order-insensitive song groups, de-correlate
 * duplicate DOM signals, resolve conflicts, and return a track only when the
 * support is strong enough. This is a transparent weighted ensemble.
 */
export function runDetectionEngine(
  inputs: readonly EvidenceInput[],
  context: ReelContext,
  caption: string,
): ExtractionResult {
  const prepared: PreparedEvidence[] = [];
  const originalEvidence: PreparedEvidence[] = [];

  for (const input of inputs) {
    const parsed =
      input.parsed ??
      parseSongText(input.text, { allowByPattern: input.allowByPattern === true });
    if (!parsed) continue;

    let contextAssessment: ElementContext;
    if (input.element) {
      contextAssessment = assessElementContext(input.element, context);
      if (!contextAssessment.rendered) continue;
    } else {
      const hint = Math.max(0, Math.min(1, input.contextHint ?? 0));
      contextAssessment = {
        rendered: true,
        visibility: 1,
        nearVideo: false,
        inReelContainer: hint >= 0.55,
        distance: null,
        score: hint,
      };
    }

    if (contextAssessment.score <= 0.05) continue;

    const evidence: Evidence = {
      ...input,
      parsed,
      element: input.element ?? null,
      href: input.href ?? null,
      allowByPattern: input.allowByPattern === true,
      reelMatch: input.reelMatch === true,
      contextHint: input.contextHint ?? 0,
      correlationKey: input.correlationKey ?? '',
    };

    const item: PreparedEvidence = {
      evidence,
      parsed,
      context: contextAssessment,
      contextScore: contextAssessment.score,
      effective:
        sourceWeight(evidence.source) * (0.55 + 0.45 * contextAssessment.score),
    };

    if (parsed.originalAudio) {
      originalEvidence.push(item);
    } else {
      prepared.push(item);
    }
  }

  // Group by an order-insensitive title/artist key so "Artist · Song" and
  // "Song · Artist" from different sources corroborate instead of conflicting.
  const groups = new Map<string, { key: string; items: PreparedEvidence[] }>();
  const titleOnly: PreparedEvidence[] = [];

  for (const item of prepared) {
    if (!item.parsed.artist) {
      titleOnly.push(item);
      continue;
    }
    const key = pairKey(item.parsed);
    const existing = groups.get(key);
    if (existing) existing.items.push(item);
    else groups.set(key, { key, items: [item] });
  }

  for (const item of titleOnly) {
    const targetTitle = normalizeForIdentity(item.parsed.title);
    const matches = [...groups.values()].filter((group) =>
      group.items.some(
        (candidate) => normalizeForIdentity(candidate.parsed.title) === targetTitle,
      ),
    );
    if (matches.length > 0) {
      const best = matches.sort((a, b) => {
        const aScore = Math.max(...a.items.map((entry) => entry.effective));
        const bScore = Math.max(...b.items.map((entry) => entry.effective));
        return bScore - aScore;
      })[0];
      best?.items.push(item);
    } else {
      const key = `title:${targetTitle}`;
      const existing = groups.get(key);
      if (existing) existing.items.push(item);
      else groups.set(key, { key, items: [item] });
    }
  }

  const scored = [...groups.values()]
    .map((group) => scoreGroup(group.key, group.items, caption))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.context - a.context;
    });

  const top = scored[0] ?? null;
  const second = scored[1] ?? null;
  const runnerUp = second?.score ?? null;
  const margin = top ? top.score - (second?.score ?? 0) : 0;
  const hasArtist = Boolean(top?.parsed.artist);
  const strong = top?.sources.some(isStrongSource) === true;
  const conflict =
    second !== null && second.score >= 0.5 && margin < AMBIGUOUS_MARGIN;

  let confidence: DetectedTrack['confidence'] | null = null;
  if (!top || conflict) {
    confidence = null;
  } else if (
    top.score >= 0.8 &&
    strong &&
    top.context >= 0.6 &&
    margin >= 0.1
  ) {
    confidence = 'high';
  } else if (
    top.score >= 0.6 &&
    top.context >= 0.45 &&
    margin >= 0.07
  ) {
    confidence = 'medium';
  } else if (
    top.score >= 0.48 &&
    top.context >= 0.55 &&
    margin >= 0.05 &&
    top.topSource !== 'visible-label' &&
    top.topSource !== 'media-session' &&
    (hasArtist || strong)
  ) {
    confidence = 'low';
  }

  const bestOriginal = originalEvidence.sort(
    (a, b) => b.effective - a.effective,
  )[0];
  const diagnostics = diagnosticsFor(
    top,
    runnerUp,
    prepared.length + originalEvidence.length,
  );

  // A strong current "Original audio" label must not be overridden by a
  // weaker, visible song label from a neighboring preloaded Reel.
  if (
    bestOriginal &&
    bestOriginal.contextScore >= 0.7 &&
    bestOriginal.effective > (top?.score ?? 0) + 0.05
  ) {
    return { track: null, reason: 'original-audio', reelUrl: null, diagnostics };
  }

  if (top && confidence) {
    return {
      track: {
        title: top.parsed.title,
        artist: top.parsed.artist,
        confidence,
        originalAudio: false,
        evidence: top.sources.join('+'),
      },
      reason: 'detected',
      reelUrl: null,
      diagnostics,
    };
  }

  if (bestOriginal && bestOriginal.contextScore >= ORIGINAL_CONTEXT_MIN) {
    return { track: null, reason: 'original-audio', reelUrl: null, diagnostics };
  }

  if (top && second && top.score >= 0.4 && margin < 0.1) {
    return { track: null, reason: 'ambiguous', reelUrl: null, diagnostics };
  }

  return { track: null, reason: 'no-metadata', reelUrl: null, diagnostics };
}
