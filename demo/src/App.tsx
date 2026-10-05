import { useEffect, useState } from "react";
import { EmailVerificationButton, type VerifiedUser } from "semi-functional-email-auth";

const CLIENT_ID = import.meta.env.VITE_PHONE_EMAIL_CLIENT_ID as string | undefined;

interface Session {
  email: string;
  expiresAt: string | null;
}

// The session lives in an httpOnly cookie, so ask the backend who we are.
async function fetchSession(): Promise<Session | null> {
  try {
    const res = await fetch("/me", { credentials: "include" });
    return res.ok ? ((await res.json()) as Session) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);

  const refresh = () =>
    fetchSession().then((s) => {
      setSession(s);
      setChecking(false);
    });

  useEffect(() => {
    let active = true;
    fetchSession().then((s) => {
      if (!active) return;
      setSession(s);
      setChecking(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const logout = async () => {
    await fetch("/logout", { method: "POST", credentials: "include" });
    setSession(null);
  };

  return (
    <main className="card">
      <h1>Verify with email</h1>
      <p className="muted">
        phone.email verifies the address; the backend confirms it and sets an httpOnly session
        cookie.
      </p>

      {!CLIENT_ID && (
        <p className="warn">
          Set <code>VITE_PHONE_EMAIL_CLIENT_ID</code> in <code>demo/.env</code> to show the button.
        </p>
      )}

      {checking ? (
        <p className="muted">Checking your session…</p>
      ) : session ? (
        <section className="profile">
          <p>
            Signed in as <strong>{session.email}</strong>
          </p>
          {session.expiresAt && (
            <p className="muted">Session expires {new Date(session.expiresAt).toLocaleString()}</p>
          )}
          <button onClick={logout}>Sign out</button>
        </section>
      ) : (
        CLIENT_ID && (
          <EmailVerificationButton
            clientId={CLIENT_ID}
            onVerified={(_user: VerifiedUser) => void refresh()}
          />
        )
      )}
    </main>
  );
}
