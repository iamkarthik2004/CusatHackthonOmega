import { createApp } from "./app.js";

const port = Number(process.env.API_PORT ?? 4000);
createApp().listen(port, () => {
  console.log(`Tally API listening on http://localhost:${port}`);
});
