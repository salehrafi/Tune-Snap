import { defineConfig } from 'wxt';

const ICONS = {
  16: 'icon/16.png',
  32: 'icon/32.png',
  48: 'icon/48.png',
  128: 'icon/128.png',
} as const;

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Tune Snap',
    description:
      'Save the music you hear in Instagram Reels, then find and play it on YouTube.',
    // Chromium Manifest V3 compatibility floor; storage.session and
    // AbortSignal.timeout are the newest APIs used.
    minimum_chrome_version: '110',
    permissions: [
      // Wishlist, settings and the short-lived YouTube result cache.
      'storage',
      // Grants the active tab's URL after the toolbar button is clicked, so the
      // popup can tell whether the current page is supported.
      'activeTab',
    ],
    host_permissions: [
      // Content-script access is intentionally limited to Instagram Reels.
      'https://www.instagram.com/*',
    ],
    action: {
      default_title: 'Tune Snap',
      default_icon: ICONS,
    },
    icons: ICONS,
  },
});

