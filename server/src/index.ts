import "dotenv/config";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = createApp({ config });

app.listen(config.port, () => {
  console.log(`Email auth server listening on http://localhost:${config.port}`);
  if (!process.env.JWT_SECRET) {
    console.warn(
      "JWT_SECRET not set: using a random development secret (sessions reset on restart).",
    );
  }
});
