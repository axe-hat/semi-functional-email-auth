import axios from "axios";
import React, { useEffect, useState } from "react";
import { validateEmail } from "../utils/validation";
import { handleApiError, NetworkError } from "../utils/errorHandler";

const CLIENT_ID = process.env.REACT_APP_CLIENT_ID || "YOUR_CLIENT_ID";
const API_URL = process.env.API_URL || "http://localhost:4000";

const EmailVerificationButton = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);

  useEffect(() => {
    // Load the script for the phone/email sign-in button
    const script = document.createElement("script");
    script.src = "https://www.phone.email/verify_email_v1.js";
    script.async = true;
    document.body.appendChild(script);

    // Define the listener function
    (window as any).phoneEmailReceiver = async (userObj: {
      user_json_url: string;
      user_email_id: string;
    }) => {
      const { user_json_url, user_email_id } = userObj;

      // Validate the email before sending
      const emailCheck = validateEmail(user_email_id);
      if (!emailCheck.isValid) {
        setError(emailCheck.error || "Invalid email address");
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await axios.post(`${API_URL}/create-token`, {
          user_json_url,
          user_email_id,
        });

        const token = response.data.token;
        localStorage.setItem("token", token);
        setIsVerified(true);
      } catch (err) {
        const typedError = handleApiError(err);
        setError(typedError.message);

        if (typedError instanceof NetworkError && typedError.retryable) {
          console.warn("Retryable error occurred:", typedError.message);
        }
      } finally {
        setIsLoading(false);
      }
    };

    // Cleanup script and listener on component unmount
    return () => {
      document.body.removeChild(script);
      delete (window as any).phoneEmailReceiver;
    };
  }, []);

  return (
    <div style={{ position: "relative" }}>
      {error && (
        <div
          role="alert"
          style={{
            color: "#dc3545",
            padding: "8px 12px",
            marginBottom: "8px",
            borderRadius: "4px",
            backgroundColor: "#f8d7da",
            border: "1px solid #f5c6cb",
            fontSize: "14px",
          }}
        >
          {error}
        </div>
      )}

      {isVerified && (
        <div
          style={{
            color: "#155724",
            padding: "8px 12px",
            marginBottom: "8px",
            borderRadius: "4px",
            backgroundColor: "#d4edda",
            border: "1px solid #c3e6cb",
            fontSize: "14px",
          }}
        >
          Email verified successfully!
        </div>
      )}

      {isLoading && (
        <div
          style={{
            textAlign: "center",
            padding: "8px",
            color: "#6c757d",
            fontSize: "14px",
          }}
        >
          Verifying your email...
        </div>
      )}

      <div
        className="pe_verify_email"
        data-client-id={CLIENT_ID}
        style={{ opacity: isLoading ? 0.5 : 1 }}
      ></div>
    </div>
  );
};

export default EmailVerificationButton;
