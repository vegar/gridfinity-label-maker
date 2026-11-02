// Anonymous usage counts via GoatCounter (https://www.goatcounter.com).
// It sets no cookies and stores no personal data, so no consent banner is needed.
// The script is loaded from index.html and skips localhost by itself.

declare global {
  interface Window {
    goatcounter?: { count?: (vars: { path: string; title?: string; event?: boolean }) => void };
  }
}

function count(path: string, title: string, event: boolean) {
  try {
    window.goatcounter?.count?.({ path, title, event });
  } catch {
    // Analytics must never break the app.
  }
}

/** One event per download, e.g. "download/3mf/5-labels", so the dashboard can add up labels. */
export function trackDownload(format: "3mf" | "stl", labels: number) {
  count(`download/${format}/${labels}-label${labels === 1 ? "" : "s"}`, `Download ${format.toUpperCase()}`, true);
}

/** Count the #about and #features pages, which the script's page-load count can't see. */
export function trackHashPage(hash: string) {
  if (hash) count(location.pathname + hash, document.title, false);
}
