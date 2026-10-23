import type { UserObject } from "../types/index.js";

export const PHONE_EMAIL_SCRIPT_SRC = "https://www.phone.email/verify_email_v1.js";

type Receiver = (userObj: UserObject) => void;

// phone.email calls a single global `window.phoneEmailReceiver`. Mounted buttons
// register here; the most recently mounted one receives the callback, and
// unmounting restores the previous one (also safe under React StrictMode).
const receivers: Receiver[] = [];
const loads = new Map<string, { promise: Promise<void>; done: boolean }>();
// Each run of the widget script adds another message listener, so after a
// re-render one verification can arrive more than once. Every verification has
// its own URL, so repeats are dropped.
const seen = new Set<string>();

function dispatch(userObj: UserObject): void {
  if (seen.has(userObj.user_json_url)) return;
  seen.add(userObj.user_json_url);
  const active = receivers[receivers.length - 1];
  if (active) active(userObj);
}

/** Registers a verification receiver. Returns a function that unregisters it. */
export function registerReceiver(receiver: Receiver): () => void {
  receivers.push(receiver);
  window.phoneEmailReceiver = dispatch;
  return () => {
    const index = receivers.lastIndexOf(receiver);
    if (index !== -1) receivers.splice(index, 1);
    if (receivers.length === 0) delete window.phoneEmailReceiver;
  };
}

/**
 * Loads the phone.email widget script, which draws its button into the first
 * `.pe_verify_email` element on the page when it runs. It only runs once per
 * load, so if the button was unmounted and mounted again (e.g. after sign-out)
 * and the element is empty, the script is run again to draw a new button.
 * Rejects if the script can't be loaded, e.g. offline or blocked.
 */
export function loadPhoneEmailScript(src: string = PHONE_EMAIL_SCRIPT_SRC): Promise<void> {
  const cached = loads.get(src);
  if (cached && (!cached.done || !widgetIsEmpty())) return cached.promise;

  // Re-running: drop the previous script element first (its listeners stay).
  document.querySelectorAll(`script[data-pe-src="${src}"]`).forEach((el) => el.remove());
  const entry = { promise: Promise.resolve(), done: false };
  entry.promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.peSrc = src;
    script.onload = () => {
      entry.done = true;
      resolve();
    };
    script.onerror = () => {
      loads.delete(src);
      script.remove();
      reject(new Error("Could not load the email verification widget."));
    };
    document.body.appendChild(script);
  });
  loads.set(src, entry);
  return entry.promise;
}

function widgetIsEmpty(): boolean {
  const el = document.querySelector(".pe_verify_email");
  return el !== null && el.childElementCount === 0;
}

/** Test helper: forget loaded scripts and receivers. */
export function resetPhoneEmailScriptState(): void {
  loads.clear();
  seen.clear();
  receivers.length = 0;
  delete window.phoneEmailReceiver;
}
