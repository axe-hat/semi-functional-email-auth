# Semi-Functional Email Auth

A React/TypeScript email verification component built on the [phone.email](https://www.phone.email/) API. Provides a drop-in button that handles the full email verification flow with built-in validation, error handling, and rate limiting.

## Features

- **Email Verification Button** -- React component that integrates with phone.email's client-side SDK
- **Input Validation** -- RFC 5322 email validation, password strength scoring, XSS input sanitization
- **Typed Error Handling** -- Custom error classes (AuthError, ValidationError, NetworkError) with user-friendly messages
- **Client-Side Rate Limiting** -- Sliding-window rate limiter to prevent API abuse
- **Full TypeScript Support** -- Shared interfaces for all data structures and component state
- **Environment Configuration** -- Client ID and API URL loaded from environment variables

## Installation

```bash
git clone https://github.com/axe-hat/semi-functional-email-auth.git
cd semi-functional-email-auth
npm install
```

## Environment Setup

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```
REACT_APP_CLIENT_ID=your_phone_email_client_id
API_URL=http://localhost:4000
```

You can obtain a client ID by registering at [phone.email](https://www.phone.email/).

## Usage

Import the component into your React application:

```tsx
import { EmailVerificationButton } from "semi-functional-email-auth";

function App() {
  return (
    <div>
      <h1>Sign In</h1>
      <EmailVerificationButton />
    </div>
  );
}

export default App;
```

The component handles the entire verification flow:

1. Renders the phone.email verification button
2. Validates the returned email address
3. Sends the verification payload to your backend `/create-token` endpoint
4. Stores the JWT token in localStorage
5. Displays loading, success, and error states

### Using Validation Utilities

```tsx
import { validateEmail, validatePasswordStrength, sanitizeInput } from "semi-functional-email-auth";

const emailResult = validateEmail("user@example.com");
// { isValid: true }

const pwResult = validatePasswordStrength("Str0ng!Pass");
// { strength: "strong", score: 5, criteria: {...}, unmetCriteria: [] }

const clean = sanitizeInput("<script>alert('xss')</script>");
// "&lt;script&gt;alert(&#x27;xss&#x27;)&lt;&#x2F;script&gt;"
```

### Using the Rate Limiter

```tsx
import { RateLimiter } from "semi-functional-email-auth";

const limiter = new RateLimiter({ maxRequests: 5, windowMs: 60000 });

if (limiter.recordRequest()) {
  // request allowed
} else {
  console.log(`Retry after ${limiter.getRetryAfterMs()}ms`);
}
```

## API Reference

### `EmailVerificationButton`
React component. No props required -- reads `REACT_APP_CLIENT_ID` and `API_URL` from environment variables.

### `validateEmail(email: string): EmailValidationResult`
Returns `{ isValid: boolean, error?: string }`. Checks RFC 5322 format, length limits, and TLD validity.

### `validatePasswordStrength(password: string): PasswordStrengthResult`
Returns strength level (`weak` | `medium` | `strong`), numeric score (0-5), per-criteria flags, and a list of unmet criteria.

### `sanitizeInput(input: string): string`
Escapes HTML entities (`<`, `>`, `&`, `"`, `'`, `/`) and trims whitespace.

### `RateLimiter`
Class with sliding-window rate limiting. Constructor accepts `{ maxRequests, windowMs }`. Methods: `canMakeRequest()`, `recordRequest()`, `getRemainingRequests()`, `getRetryAfterMs()`, `reset()`.

### Error Classes
- `AuthError(message, statusCode)` -- authentication failures
- `ValidationError(message, field)` -- input validation failures
- `NetworkError(message, statusCode?, retryable?)` -- network/server errors
- `handleApiError(error)` -- maps Axios errors to the above types

## Project Structure

```
semi-functional-email-auth/
├── .env.example
├── .gitignore
├── package.json
├── README.md
├── src/
│   ├── index.ts                          # Barrel export
│   ├── components/
│   │   └── EmailVerificationButton.tsx   # Main verification component
│   ├── middleware/
│   │   └── rateLimiter.ts                # Sliding-window rate limiter
│   ├── types/
│   │   └── index.ts                      # Shared TypeScript interfaces
│   └── utils/
│       ├── errorHandler.ts               # Typed errors and API error mapper
│       └── validation.ts                 # Email, password, and input validators
└── tests/
    └── validation.test.ts                # Unit tests for validation utils
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes and add tests where applicable
4. Ensure the code compiles (`npm run build`)
5. Commit with a descriptive message
6. Push to your branch and open a pull request

## License

MIT
