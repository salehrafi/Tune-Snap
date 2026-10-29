import { browser } from 'wxt/browser';
import {
  detectCurrentReel,
  detectCurrentReelWhenReady,
  reelIdentity,
} from '@/lib/adapters';
import {
  musicDomSignature,
  reconcileSession,
  type ReelSessionState,
} from '@/lib/detection/session';
import { startReelWatch } from '@/lib/detection/watch';
import {
  isReelTrackRequest,
  REEL_WATCH_PORT,
  type ReelTrackResponse,
} from '@/lib/messaging';

export default defineContentScript({
  matches: ['https://www.instagram.com/*'],
  runAt: 'document_idle',
  main() {
    // Survives popup close/reopen for this page. It is not persisted to disk
    // and is recreated on a hard page load.
    let session: ReelSessionState | null = null;
    let stopWatch: (() => void) | null = null;

    browser.runtime.onConnect.addListener((port) => {
      if (port.name !== REEL_WATCH_PORT) return;

      // One observer per page. A stale/duplicate port must not stack a second
      // MutationObserver or URL poll.
      stopWatch?.();
      let stopWatchCurrent: (() => void) | null = null;
      const stop = startReelWatch(
        document,
        {
          postMessage: (message) => {
            try {
              port.postMessage(message);
            } catch {
              stopWatchCurrent?.();
            }
          },
        },
        {
          session,
          onSession: (next) => {
            session = next;
          },
        },
      );
      stopWatchCurrent = stop;
      stopWatch = stop;
      port.onDisconnect.addListener(() => {
        stop();
        if (stopWatch === stop) stopWatch = null;
      });
    });

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!isReelTrackRequest(message)) return false;

      const url = new URL(location.href);
      void detectCurrentReelWhenReady(document, url)
        .then((detected) => {
          // The wait can span an SPA navigation. Never return metadata whose
          // pageUrl belongs to a Reel the tab has already left.
          const currentUrl = new URL(location.href);
          let detection = detected;
          if (reelIdentity(new URL(detection.pageUrl)) !== reelIdentity(currentUrl)) {
            const current = detectCurrentReel(document, currentUrl);
            detection = {
              ...current,
              track: null,
              reason: 'no-metadata',
              diagnostics: undefined,
            };
          }
          const reconciled = reconcileSession(
            session,
            reelIdentity(currentUrl),
            detection,
            musicDomSignature(document),
          );
          session = reconciled.state;
          sendResponse({ ok: true, ...reconciled.detection } satisfies ReelTrackResponse);
        })
        .catch(() => {
          sendResponse({
            ok: false,
            pageUrl: location.href,
            platform: null,
            reelUrl: null,
            isReel: false,
            track: null,
            reason: 'error',
          } satisfies ReelTrackResponse);
        });

      // Keep the message channel open for the bounded MutationObserver wait.
      return true;
    });
  },
});
