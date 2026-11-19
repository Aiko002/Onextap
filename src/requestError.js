/**
 * What a person reads when a call to the API fails.
 *
 * A 4xx keeps the server's own words: it writes those for people ("No credits
 * remaining"). A 5xx, a gateway's error page or a dropped connection can carry
 * internals or the browser's own wording ("Failed to fetch", Safari's "Load
 * failed", Firefox's "NetworkError when attempting to fetch resource."), so
 * those get a plain sentence. Callers log the raw answer before throwing.
 *
 * No imports and no chrome.*: the popup, the website and Node tests load it bare.
 */

export const NETWORK_MESSAGE = 'We couldn’t reach Onextap. Check your connection and try again.';
export const SERVER_MESSAGE = 'Something went wrong on our side. Try again in a moment.';

/**
 * The Error for a response that is not ok. `said` is the body's `error`
 * (or `message`), if it had one; `status` rides along on the Error.
 * @param {number} status
 * @param {unknown} said
 * @returns {Error & { status: number }}
 */
export function requestError(status, said) {
  const own = status >= 400 && status < 500 && typeof said === 'string' && said.trim();
  const error = new Error(own ? said : SERVER_MESSAGE);
  error.status = status;
  return error;
}

/** fetch(), with a dropped connection reported in plain words. An abort stays an abort. */
export function fetchOrExplain(url, options) {
  return fetch(url, options).catch((error) => {
    if (error?.name === 'AbortError') throw error;
    throw new Error(NETWORK_MESSAGE, { cause: error });
  });
}
