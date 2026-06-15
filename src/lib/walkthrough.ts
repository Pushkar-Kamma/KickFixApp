// First-launch walkthrough state.
//
// Tracks whether the user has seen the onboarding tutorial (persisted in
// EncryptedStorage, same convention as `kickfix.hasProfile` /
// `kickfix.seenCameraGuide`), plus a tiny pub/sub so the Profile screen can
// re-trigger the tutorial on demand ("Replay Tutorial").

import EncryptedStorage from 'react-native-encrypted-storage';

const WALKTHROUGH_KEY = 'kickfix.seenWalkthrough';

type Listener = () => void;
const replayListeners = new Set<Listener>();

/** True once the user has finished or skipped the walkthrough. */
export async function hasSeenWalkthrough(): Promise<boolean> {
  try {
    const v = await EncryptedStorage.getItem(WALKTHROUGH_KEY);
    return v === '1';
  } catch {
    // Storage unavailable — default to "seen" so we never trap the user in a
    // tutorial loop on a device where storage is broken.
    return true;
  }
}

/** Mark the walkthrough as completed so it won't auto-show again. */
export async function markWalkthroughSeen(): Promise<void> {
  try {
    await EncryptedStorage.setItem(WALKTHROUGH_KEY, '1');
  } catch {
    /* best-effort */
  }
}

/** Clear the flag and notify any mounted Walkthrough to show itself again. */
export async function replayWalkthrough(): Promise<void> {
  try {
    await EncryptedStorage.removeItem(WALKTHROUGH_KEY);
  } catch {
    /* best-effort */
  }
  replayListeners.forEach(l => {
    try {
      l();
    } catch {
      /* ignore individual listener errors */
    }
  });
}

/** Subscribe to replay requests. Returns an unsubscribe function. */
export function onReplayWalkthrough(listener: Listener): () => void {
  replayListeners.add(listener);
  return () => {
    replayListeners.delete(listener);
  };
}
