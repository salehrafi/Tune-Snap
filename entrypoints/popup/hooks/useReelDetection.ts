import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import {
  findAdapter,
  isStaleReelResponse,
  type ReelDetection,
} from '@/lib/adapters';
import {
  isReelChangedMessage,
  REEL_WATCH_PORT,
  requestReelTrackWithRetry,
} from '@/lib/messaging';
import type { SocialPlatform } from '@/lib/types/song';

export type ReelDetectionState =
  | { status: 'loading' }
  | { status: 'ready'; detection: ReelDetection }
  | { status: 'not-reel'; pageUrl: string }
  | { status: 'unsupported'; pageUrl: string | null }
  | {
      status: 'unavailable';
      pageUrl: string;
      platform: SocialPlatform;
      reelUrl: string | null;
      isReel: boolean;
    }
  | { status: 'error'; message: string; pageUrl: string | null };

/**
 * Ask the content script for the Reel on the active Instagram tab, and re-ask
 * whenever that tab navigates to a different URL (Instagram is an SPA).
 */
export function useReelDetection() {
  const [state, setState] = useState<ReelDetectionState>({ status: 'loading' });
  const tabIdRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);
  const watchPortRef = useRef<ReturnType<typeof browser.tabs.connect> | null>(null);
  const watchTabIdRef = useRef<number | null>(null);
  const tabUrlRef = useRef<string | null>(null);

  const applyDetection = useCallback((detection: ReelDetection) => {
    // A live-watch result is newer than any request already in flight.
    requestIdRef.current += 1;
    tabUrlRef.current = detection.pageUrl;
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }

    if (detection.reason === 'error') {
      setState({
        status: 'error',
        message: 'Tune Snap could not read this Reel. Reload the tab and try again.',
        pageUrl: detection.pageUrl,
      });
      return;
    }
    if (detection.reason === 'unsupported') {
      watchPortRef.current?.disconnect();
      watchPortRef.current = null;
      watchTabIdRef.current = null;
      setState({ status: 'unsupported', pageUrl: detection.pageUrl });
      return;
    }
    if (!detection.isReel) {
      // Keep the port alive: an SPA can briefly expose a non-Reel URL and then
      // return to a Reel. The watcher will send the next Reel detection.
      setState({ status: 'not-reel', pageUrl: detection.pageUrl });
      return;
    }
    setState({ status: 'ready', detection });
  }, []);

  const ensureWatchPort = useCallback(
    (tabId: number) => {
      if (watchPortRef.current && watchTabIdRef.current === tabId) return;
      watchPortRef.current?.disconnect();
      watchPortRef.current = null;
      watchTabIdRef.current = null;

      try {
        const port = browser.tabs.connect(tabId, { name: REEL_WATCH_PORT });
        watchPortRef.current = port;
        watchTabIdRef.current = tabId;

        port.onMessage.addListener((message: unknown) => {
          if (!isReelChangedMessage(message)) return;
          applyDetection(message.detection);
        });
        port.onDisconnect.addListener(() => {
          if (watchPortRef.current === port) {
            watchPortRef.current = null;
            watchTabIdRef.current = null;
          }
        });
      } catch {
        // The content script may not be present on an old tab; the request
        // below will surface the reload state.
      }
    },
    [applyDetection],
  );

  const refresh = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setState({ status: 'loading' });

    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (requestId !== requestIdRef.current) return;
      const tab = tabs[0];
      tabIdRef.current = tab?.id ?? null;

      if (!tab?.id || !tab.url) {
        if (requestId === requestIdRef.current) {
          setState({ status: 'unsupported', pageUrl: null });
        }
        return;
      }

      let url: URL;
      try {
        url = new URL(tab.url);
      } catch {
        if (requestId === requestIdRef.current) {
          setState({ status: 'unsupported', pageUrl: tab.url ?? null });
        }
        return;
      }

      tabUrlRef.current = url.href;
      const adapter = findAdapter(url);
      if (!adapter) {
        watchPortRef.current?.disconnect();
        watchPortRef.current = null;
        watchTabIdRef.current = null;
        if (requestId === requestIdRef.current) {
          setState({ status: 'unsupported', pageUrl: url.href });
        }
        return;
      }

      if (!adapter.isReel(url)) {
        // Do not kill an existing watcher here. The popup may be open across a
        // transient non-Reel URL during SPA navigation.
        if (requestId === requestIdRef.current) {
          setState({ status: 'not-reel', pageUrl: url.href });
        }
        return;
      }

      // Subscribe to live changes while the popup is open. The content script
      // disconnects the observer when this port closes.
      ensureWatchPort(tab.id);

      // The content script waits for delayed rendering with a bounded
      // MutationObserver, so a single request is enough here.
      const response = await requestReelTrackWithRetry(tab.id, { attempts: 1 });
      if (requestId !== requestIdRef.current) return;

      if (!response) {
        setState({
          status: 'unavailable',
          pageUrl: url.href,
          platform: adapter.platform,
          reelUrl: adapter.reelUrl(url),
          isReel: adapter.isReel(url),
        });
        return;
      }

      if (!response.ok || response.reason === 'error') {
        setState({
          status: 'error',
          message: 'Tune Snap could not read this Reel. Reload the tab and try again.',
          pageUrl: url.href,
        });
        return;
      }

      // Discard a response that was produced for the Reel we just left. A
      // response for a newer URL is still accepted; only an old response under
      // a changed active URL is stale.
      if (isStaleReelResponse(response.pageUrl, url, tabUrlRef.current)) return;

      tabUrlRef.current = response.pageUrl;
      setState({
        status: 'ready',
        detection: {
          ...response,
          platform: response.platform ?? adapter.platform,
        },
      });
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Could not read this tab.',
        pageUrl: null,
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return () => {
      watchPortRef.current?.disconnect();
      watchPortRef.current = null;
      watchTabIdRef.current = null;
    };
  }, []);

  useEffect(() => {
    const listener = (tabId: number, changeInfo: { url?: string }) => {
      if (tabId !== tabIdRef.current || !changeInfo.url) return;
      if (changeInfo.url === tabUrlRef.current) return;

      // Clear the old card immediately; do not wait for the debounce/request.
      tabUrlRef.current = changeInfo.url;
      requestIdRef.current += 1;
      setState({ status: 'loading' });
      if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = undefined;
        void refresh();
      }, 300);
    };
    browser.tabs.onUpdated.addListener(listener);
    return () => {
      browser.tabs.onUpdated.removeListener(listener);
      if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
    };
  }, [refresh]);

  // `tabs.onUpdated` is not guaranteed to report every SPA history change.
  // One active-tab URL check per second, only while the popup is open, is the
  // fallback that keeps a production popup from staying on the previous Reel.
  useEffect(() => {
    let cancelled = false;
    const interval = window.setInterval(() => {
      if (cancelled || tabIdRef.current === null) return;
      void browser.tabs
        .query({ active: true, currentWindow: true })
        .then((tabs) => {
          if (cancelled) return;
          const tab = tabs[0];
          if (!tab?.id || tab.id !== tabIdRef.current || !tab.url) return;
          if (tab.url === tabUrlRef.current) return;

          tabUrlRef.current = tab.url;
          requestIdRef.current += 1;
          setState({ status: 'loading' });
          if (timerRef.current !== undefined) {
            window.clearTimeout(timerRef.current);
            timerRef.current = undefined;
          }
          void refresh();
        })
        .catch(() => undefined);
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [refresh]);

  return { state, refresh };
}

