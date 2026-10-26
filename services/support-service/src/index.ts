import { createApp } from "./app.js";
import { config } from "./config/env.js";

const app = createApp();

app.listen(config.port, () => {
  console.log(`[SupportService] Running on port ${config.port}`);
  console.log(`[SupportService] Admin Email: ${config.adminEmail}`);
  console.log(`[SupportService] Ready to process audit dispute and support tickets.`);
});
