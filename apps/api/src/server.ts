import { config } from "dotenv";
import { fileURLToPath } from "node:url";

config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });
import { createApp } from "./app.js";

const port = Number(process.env.API_PORT ?? 4000);
createApp().listen(port, () => {
  console.log(`Tally API listening on http://localhost:${port}`);
});
