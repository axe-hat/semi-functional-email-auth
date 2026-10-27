// CommonJS consumers (Node 20.19+ require(esm), Jest in CJS mode) must be able to load both entry points.
const main = require("semi-functional-email-auth");
const passkeys = require("semi-functional-email-auth/passkeys");
if (
  typeof main.EmailVerificationButton !== "function" ||
  typeof passkeys.usePasskeys !== "function"
) {
  throw new Error("Unexpected exports");
}
console.log("require() of both entry points works");
