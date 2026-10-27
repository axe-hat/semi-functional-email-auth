// Uses the packed package exactly as an app would: both entry points, types included.
import { createRoot } from "react-dom/client";
import {
  DEFAULT_LABELS,
  EmailVerificationButton,
  useEmailVerification,
  useSession,
  validateEmail,
  type Session,
  type VerifiedUser,
} from "semi-functional-email-auth";
import { usePasskeys } from "semi-functional-email-auth/passkeys";

function SignIn() {
  const { state } = useEmailVerification({ apiUrl: "https://api.example.com" });
  return <p>{state.error ?? DEFAULT_LABELS.verifying}</p>;
}

function App() {
  const { session } = useSession({ apiUrl: "https://api.example.com" });
  const { supported, signIn } = usePasskeys({ apiUrl: "https://api.example.com" });
  const current: Session | null = session;
  return (
    <>
      <EmailVerificationButton
        clientId="client-id"
        labels={{ verified: (email) => `Verified ${email}` }}
        onVerified={(user: VerifiedUser) => console.log(validateEmail(user.email).isValid, current)}
      />
      <SignIn />
      {supported && <button onClick={() => void signIn()}>Sign in with a passkey</button>}
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
