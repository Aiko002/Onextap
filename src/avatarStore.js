/**
 * Avatar Store
 *
 * The picture shown in the dashboard's profile block. There is no avatar
 * endpoint on the server, and an uploaded photo is personal data, so it stays
 * where CLAUDE.md rule 8 keeps all of it: on this device, through
 * src/storage.js (chrome.storage.local in the extension, localStorage on the
 * web). It is never sent anywhere.
 *
 * Keyed by user id, so two accounts signed in on one browser do not share a
 * face. Images are downscaled to AVATAR_PX square JPEGs before they are
 * stored: a phone photo is several MB and localStorage holds about five.
 */
import { storage } from './storage';

export const AVATAR_PX = 256;
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

const keyFor = (userId) => `onextap_avatar:${userId}`;

/**
 * @param {string} userId
 * @returns {Promise<string|null>} A data: URL, or null when none is stored.
 */
export async function getAvatar(userId) {
  if (!userId) return null;
  const value = await storage.get(keyFor(userId));
  return typeof value === 'string' && value.startsWith('data:image/') ? value : null;
}

/**
 * Downscale `file` and store it for `userId`.
 * @param {string} userId
 * @param {File} file
 * @returns {Promise<string>} The stored data: URL.
 * @throws {Error} With a message fit to show the user.
 */
export async function setAvatarFromFile(userId, file) {
  if (!userId) throw new Error('Sign in to change your avatar.');
  if (!file?.type?.startsWith('image/')) throw new Error('Please choose an image file.');
  if (file.size > MAX_AVATAR_BYTES) throw new Error('Images must be 5 MB or smaller.');
  const dataUrl = await downscale(file);
  await storage.setStrict(keyFor(userId), dataUrl);
  return dataUrl;
}

/** Centre-crop to a square and scale to AVATAR_PX. */
async function downscale(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('That image could not be read.'));
      el.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_PX;
    canvas.height = AVATAR_PX;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(
      img,
      (img.naturalWidth - side) / 2,
      (img.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      AVATAR_PX,
      AVATAR_PX,
    );
    return canvas.toDataURL('image/jpeg', 0.86);
  } finally {
    URL.revokeObjectURL(url);
  }
}
