import { detectCurrentReel, reelIdentity, type ReelDetection } from '@/lib/adapters';
import {
  REEL_CHANGED,
  type ReelChangedMessage,
  type ReelTrackResponse,
} from '@/lib/messaging';
import {
  musicDomSignature,
  reconcileSession,
  type ReelSessionState,
} from './session';

export interface WatchPort {
  postMessage(message: ReelChangedMessage): void;
}

export interface ReelWatchOptions {
  debounceMs?: number;
  getUrl?: () => URL;
  /** Cheap SPA URL check while the popup is open. */
  urlPollMs?: number;
  /** Content-script lifetime state; survives popup close/reopen. */
  session?: ReelSessionState | null;
  onSession?: (state: ReelSessionState) => void;
}

export function detectionSignature(detection: ReelDetection): string {
  return [
    detection.pageUrl,
    detection.reason,
    detection.track?.title ?? '',
    detection.track?.artist ?? '',
    detection.track?.confidence ?? '',
  ].join('|');
}

/**
 * Watch the page for as long as the popup holds the port.
 *
 * Instagram is an SPA. The old Reel's DOM can be updated before the URL commits,
 * or the URL can commit without another MutationObserver callback. Both are
 * handled here: the watcher also checks the URL while the popup is open, sends
 * an immediate invalidation when the Reel identity changes, and uses the shared
 * content-script session to reject the previous Reel's still-mounted metadata.
 */
export function startReelWatch(
  document: Document,
  port: WatchPort,
  options: ReelWatchOptions = {},
): () => void {
  const debounceMs = Math.max(0, options.debounceMs ?? 250);
  const urlPollMs = Math.max(0, options.urlPollMs ?? 500);
  const readUrl = (): URL => {
    if (options.getUrl) return options.getUrl();
    const href = document.defaultView?.location?.href;
    try {
      return new URL(href ?? 'https://www.instagram.com/');
    } catch {
      return new URL('https://www.instagram.com/');
    }
  };

  const initialUrl = readUrl();
  const initialIdentity = reelIdentity(initialUrl);
  const initialDetection = detectCurrentReel(document, initialUrl);
  const initialSignature = detectionSignature(initialDetection);
  let currentIdentity = initialIdentity;
  let session = options.session ?? null;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const initialReconciled = reconcileSession(
    session,
    currentIdentity,
    initialDetection,
    musicDomSignature(document),
  );
  session = initialReconciled.state;
  options.onSession?.(session);

  let lastSignature = detectionSignature(initialReconciled.detection);
  if (detectionSignature(initialReconciled.detection) !== initialSignature) {
    // A previous session is stale for this already-open Reel. Clear it before
    // the first mutation arrives.
    port.postMessage({
      type: REEL_CHANGED,
      detection: { ok: true, ...initialReconciled.detection } satisfies ReelTrackResponse,
    });
  }

  const send = (detection: ReelDetection): void => {
    const signature = detectionSignature(detection);
    if (signature === lastSignature) return;
    lastSignature = signature;
    port.postMessage({
      type: REEL_CHANGED,
      detection: { ok: true, ...detection } satisfies ReelTrackResponse,
    });
  };

  const invalidate = (url: URL): void => {
    const detection = detectCurrentReel(document, url);
    send({
      ...detection,
      track: null,
      reason: detection.isReel ? 'no-metadata' : detection.reason,
      diagnostics: undefined,
    });
  };

  const switchReel = (url: URL): void => {
    currentIdentity = reelIdentity(url);
    // Clear the old card immediately. The next evaluation fills in the new
    // Reel only when it is actually available.
    invalidate(url);
    schedule();
  };

  const evaluate = (): void => {
    if (stopped) return;
    const url = readUrl();
    if (reelIdentity(url) !== currentIdentity) {
      switchReel(url);
      return;
    }

    const detection = detectCurrentReel(document, url);
    const reconciled = reconcileSession(
      session,
      currentIdentity,
      detection,
      musicDomSignature(document),
    );
    session = reconciled.state;
    options.onSession?.(session);
    send(reconciled.detection);
  };

  const schedule = (): void => {
    if (stopped || timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      evaluate();
    }, debounceMs);
  };

  const checkUrl = (): void => {
    if (stopped) return;
    const url = readUrl();
    if (reelIdentity(url) !== currentIdentity) {
      switchReel(url);
    }
  };

  const onMutation = (): void => {
    checkUrl();
    schedule();
  };

  const onUrlEvent = (): void => {
    checkUrl();
  };

  const observer =
    typeof MutationObserver === 'undefined' || !document.documentElement
      ? null
      : new MutationObserver(onMutation);

  observer?.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['aria-label', 'title', 'href', 'src', 'hidden', 'aria-hidden'],
  });

  const view = document.defaultView;
  view?.addEventListener('popstate', onUrlEvent);
  view?.addEventListener('hashchange', onUrlEvent);
  const poll =
    urlPollMs > 0
      ? setInterval(() => {
          checkUrl();
        }, urlPollMs)
      : undefined;

  return () => {
    stopped = true;
    observer?.disconnect();
    view?.removeEventListener('popstate', onUrlEvent);
    view?.removeEventListener('hashchange', onUrlEvent);
    if (poll !== undefined) clearInterval(poll);
    if (timer !== undefined) clearTimeout(timer);
  };
}
