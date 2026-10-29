import "dotenv/config";
import { createServer } from "./api/server.js";

const port = Number(process.env.PORT) || 8004;

const app = createServer();

app.listen(port, () => {
  console.log(`[sandboxed-execution-service] Server running on port ${port}`);
});
