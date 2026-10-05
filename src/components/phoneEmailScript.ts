import type { UserObject } from "../types/index.js";

export const PHONE_EMAIL_SCRIPT_SRC = "https://www.phone.email/verify_email_v1.js";

type Receiver = (userObj: UserObject) => void;

// phone.email calls a single global `window.phoneEmailReceiver`. Mounted buttons
// register here; the most recently mounted one receives the callback, and
// unmounting restores the previous one (also safe under React StrictMode).
const receivers: Receiver[] = [];
const loads = new Map<string, Promise<void>>();

function dispatch(userObj: UserObject): void {
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
 * Loads the phone.email widget script once per page (re-used by every button).
 * Rejects if the script can't be loaded, e.g. offline or blocked.
 */
export function loadPhoneEmailScript(src: string = PHONE_EMAIL_SCRIPT_SRC): Promise<void> {
  const cached = loads.get(src);
  if (cached) return cached;

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loads.delete(src);
      script.remove();
      reject(new Error("Could not load the email verification widget."));
    };
    document.body.appendChild(script);
  });
  loads.set(src, promise);
  return promise;
}

/** Test helper: forget loaded scripts and receivers. */
export function resetPhoneEmailScriptState(): void {
  loads.clear();
  receivers.length = 0;
  delete window.phoneEmailReceiver;
}
