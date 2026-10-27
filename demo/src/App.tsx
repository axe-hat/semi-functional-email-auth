import { useState } from "react";
import { EmailVerificationButton, useSession } from "semi-functional-email-auth";
import { usePasskeys } from "semi-functional-email-auth/passkeys";

const CLIENT_ID = import.meta.env.VITE_PHONE_EMAIL_CLIENT_ID as string | undefined;

export default function App() {
  // The session lives in an httpOnly cookie, so the hook asks the backend (GET /me).
  const { status, session, error, refresh, logout } = useSession();
  const passkeys = usePasskeys();
  const [added, setAdded] = useState(false);
  const notice = error ?? passkeys.error;

  const addPasskey = async () => setAdded(await passkeys.register());
  const signInWithPasskey = async () => {
    if (await passkeys.signIn()) await refresh();
  };

  return (
    <main className="card">
      <h1>Verify with email</h1>
      <p className="muted">
        phone.email verifies the address; the backend confirms it and sets an httpOnly session
        cookie. Add a passkey to skip the email step next time.
      </p>

      {!CLIENT_ID && (
        <p className="warn">
          Set <code>VITE_PHONE_EMAIL_CLIENT_ID</code> in <code>demo/.env</code> to show the button.
        </p>
      )}
      {notice && (
        <p className="warn" role="alert">
          {notice.message}
        </p>
      )}

      {status === "loading" ? (
        <p className="muted">Checking your session…</p>
      ) : session ? (
        <section className="profile">
          <p>
            Signed in as <strong>{session.email}</strong>
          </p>
          {session.expiresAt && (
            <p className="muted">Session expires {new Date(session.expiresAt).toLocaleString()}</p>
          )}
          {added && <p className="ok">Passkey added. Next time, sign in with it.</p>}
          <div className="actions">
            {passkeys.supported && (
              <button onClick={() => void addPasskey()} disabled={passkeys.isWorking}>
                Add a passkey
              </button>
            )}
            <button
              className="secondary"
              onClick={() => {
                setAdded(false);
                void logout();
              }}
            >
              Sign out
            </button>
          </div>
        </section>
      ) : (
        <section className="signin">
          {CLIENT_ID && (
            <EmailVerificationButton clientId={CLIENT_ID} onVerified={() => void refresh()} />
          )}
          {passkeys.supported && (
            <button onClick={() => void signInWithPasskey()} disabled={passkeys.isWorking}>
              Sign in with a passkey
            </button>
          )}
        </section>
      )}
    </main>
  );
}
