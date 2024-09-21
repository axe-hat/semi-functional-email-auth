import axios from "axios";
import React, { useEffect } from "react";

const EmailVerificationButton= () => {
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
        console.log("I am in phoneEmailReceiver")
      const { user_json_url, user_email_id } = userObj;

      console.log(user_json_url);

 Const token_Response = await axios
        .post("http://localhost:4000/create-token", {
          user_json_url,
          user_email_id,
        })
        .then((response) => {

          console.log(response);
          const token = response.data.token;
          console.log("token", token);
          localStorage.setItem("token", token);

        })
        .catch((error) => {
          console.log(error);
        });
    };


    // Cleanup script and listener on component unmount
    return () => {
      document.body.removeChild(script);
      delete (window as any).phoneEmailReceiver;
    };

  }, []);

  return (
    <div
      className="pe_verify_email"
      data-client-id="YOUR_CLIENT_ID"
    ></div>
  );
};

export default EmailVerificationButton;