"use strict";

const { ElectronBlocker } = require("@ghostery/adblocker-electron");
const fetch = require("cross-fetch");

/*
 * One shared blocker instance is used for all Electron sessions.
 * A separate WeakMap keeps track of sessions that are already
 * enabled OR currently being enabled. This prevents Electron's
 * "second handler" error when two startup paths race.
 */
const engines = new WeakMap();
const enabling = new WeakMap();

let blockerPromise = null;

async function createBlocker() {
  if (!blockerPromise) {
    blockerPromise = ElectronBlocker
      .fromPrebuiltAdsAndTracking(fetch)
      .then((blocker) => {
        console.log("Ad/tracker filter lists loaded successfully.");
        return blocker;
      })
      .catch((error) => {
        blockerPromise = null;
        console.error("Failed to load ad blocker:", error);
        throw error;
      });
  }

  return blockerPromise;
}

async function enableForSession(ses) {
  if (!ses) {
    throw new Error("Electron session is required.");
  }

  // Already enabled.
  const existing = engines.get(ses);
  if (existing) {
    return existing;
  }

  // Another caller is already enabling this same session.
  // Wait for it instead of registering the handler twice.
  const pending = enabling.get(ses);
  if (pending) {
    return pending;
  }

  const promise = (async () => {
    try {
      const blocker = await createBlocker();

      // Check again after the async operation because another
      // startup path may have completed while we were waiting.
      const alreadyEnabled = engines.get(ses);
      if (alreadyEnabled) {
        return alreadyEnabled;
      }

      blocker.enableBlockingInSession(ses);
      engines.set(ses, blocker);

      console.log("Privacy/ad blocking enabled for session.");

      return blocker;
    } finally {
      enabling.delete(ses);
    }
  })();

  enabling.set(ses, promise);

  return promise;
}

function disableForSession(ses) {
  if (!ses) {
    return;
  }

  const blocker = engines.get(ses);
  if (!blocker) {
    return;
  }

  try {
    blocker.disableBlockingInSession(ses);
  } catch (error) {
    console.warn(
      "Failed to disable blocker:",
      error?.message || error
    );
  }

  engines.delete(ses);
}

module.exports = {
  enableForSession,
  disableForSession
};
