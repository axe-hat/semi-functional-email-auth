import type { CSSProperties } from "react";
import {
  useEmailVerification,
  type UseEmailVerificationOptions,
} from "../hooks/useEmailVerification.js";
import type { VerificationClassNames, VerificationLabels } from "../types/index.js";

export interface EmailVerificationButtonProps extends UseEmailVerificationOptions {
  /** Your phone.email client ID. */
  clientId: string;
  /** Extra class for the wrapper element. */
  className?: string;
  /** Extra classes for the status, success, error and widget elements. */
  classNames?: VerificationClassNames;
  /** Drop the built-in inline styles and style everything with `classNames`. */
  unstyled?: boolean;
  /** Override the built-in English text. */
  labels?: Partial<VerificationLabels>;
}

export const DEFAULT_LABELS: VerificationLabels = {
  verifying: "Verifying your email...",
  verified: (email) => `Email verified: ${email}`,
};

const box: CSSProperties = {
  padding: "8px 12px",
  marginBottom: "8px",
  borderRadius: "4px",
  fontSize: "14px",
};

const STYLES = {
  status: { ...box, textAlign: "center", color: "#6c757d" },
  success: { ...box, color: "#155724", backgroundColor: "#d4edda", border: "1px solid #c3e6cb" },
  error: { ...box, color: "#721c24", backgroundColor: "#f8d7da", border: "1px solid #f5c6cb" },
} satisfies Record<string, CSSProperties>;

/**
 * "Verify with email" button backed by phone.email. On success it posts the
 * verification URL to `${apiUrl}/create-token`; the backend reads the verified
 * email from phone.email and sets an httpOnly session cookie (no token is
 * stored in the browser). For a fully custom UI use `useEmailVerification`.
 */
export default function EmailVerificationButton({
  clientId,
  className,
  classNames = {},
  unstyled = false,
  labels,
  ...options
}: EmailVerificationButtonProps) {
  const { state } = useEmailVerification(options);
  const text = { ...DEFAULT_LABELS, ...labels };
  const style = (key: keyof typeof STYLES) => (unstyled ? undefined : STYLES[key]);

  return (
    <div className={className} style={unstyled ? undefined : { position: "relative" }}>
      <div role="status" aria-live="polite">
        {state.isLoading && (
          <div className={classNames.status} style={style("status")}>
            {text.verifying}
          </div>
        )}
        {state.isVerified && state.email && (
          <div className={classNames.success} style={style("success")}>
            {text.verified(state.email)}
          </div>
        )}
      </div>
      {state.error && (
        <div role="alert" className={classNames.error} style={style("error")}>
          {state.error}
        </div>
      )}
      <div
        className={["pe_verify_email", classNames.widget].filter(Boolean).join(" ")}
        data-client-id={clientId}
        aria-busy={state.isLoading}
        style={{
          opacity: state.isLoading ? 0.5 : 1,
          pointerEvents: state.isLoading ? "none" : "auto",
        }}
      />
    </div>
  );
}
