/** Establish the static-host service worker before an editable workspace appears. */
export async function ensureIsolation() {
  const key = 'devcpp-coi-reload:' + import.meta.env.BASE_URL;
  if (crossOriginIsolated) { sessionStorage.removeItem(key); return; }
  if (!isSecureContext || !('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register(import.meta.env.BASE_URL + 'coi-serviceworker.js');
    await navigator.serviceWorker.ready;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    location.reload();
    // Do not show an editor that would be discarded by the initial isolation reload.
    await new Promise<void>(() => {});
  } catch (error) { console.warn('Could not enable the browser runtime', error); }
}
