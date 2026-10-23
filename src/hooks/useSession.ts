import { useCallback, useEffect, useRef, useState } from "react";
import { AppError, errorFromStatus, handleApiError } from "../utils/errorHandler.js";
import type { Session, SessionStatus } from "../types/index.js";

export interface UseSessionOptions {
  /** Base URL of your backend (default: same origin). */
  apiUrl?: string;
}

export interface UseSessionResult {
  status: SessionStatus;
  session: Session | null;
  /** Set when the backend couldn't be reached or logout failed. */
  error: AppError | null;
  /** Re-reads the session from `GET /me`, e.g. after `onVerified`. */
  refresh: () => Promise<Session | null>;
  /** Calls `POST /logout` (revokes the session server-side). */
  logout: () => Promise<void>;
}

/**
 * Reads the signed-in user from the backend. The session itself lives in an
 * httpOnly cookie that scripts can't read, so `GET /me` is the source of truth.
 */
export function useSession({ apiUrl = "" }: UseSessionOptions = {}): UseSessionResult {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const mounted = useRef(true);
  // Only the newest request may update state (refresh can race with mount).
  const latest = useRef(0);

  const refresh = useCallback(async (): Promise<Session | null> => {
    const request = ++latest.current;
    const apply = (next: Session | null, err: AppError | null) => {
      if (!mounted.current || request !== latest.current) return;
      setSession(next);
      setError(err);
      setStatus(next ? "authenticated" : "unauthenticated");
    };
    try {
      const res = await fetch(`${apiUrl}/me`, { credentials: "include" });
      if (res.status === 401) {
        apply(null, null);
        return null;
      }
      const data = (await res.json().catch(() => ({}))) as Partial<Session> & {
        message?: string;
      };
      if (!res.ok) throw errorFromStatus(res.status, data.message);
      const next: Session = { email: data.email ?? "", expiresAt: data.expiresAt ?? null };
      apply(next, null);
      return next;
    } catch (err) {
      apply(null, handleApiError(err));
      return null;
    }
  }, [apiUrl]);

  const logout = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/logout`, { method: "POST", credentials: "include" });
      if (!res.ok) throw errorFromStatus(res.status);
      latest.current++;
      if (!mounted.current) return;
      setSession(null);
      setError(null);
      setStatus("unauthenticated");
    } catch (err) {
      if (mounted.current) setError(handleApiError(err));
    }
  }, [apiUrl]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  return { status, session, error, refresh, logout };
}
