// Local development without Docker: starts PGlite (PostgreSQL in WebAssembly),
// stored in .data/pglite, and runs `next dev` against it.
// Usage: npm run dev:local
import { spawn } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const port = Number(process.env.PGLITE_PORT || 54329);
const db = await PGlite.create("./.data/pglite");
const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1" });
await server.start();
console.log(`PGlite listening on 127.0.0.1:${port}`);

const child = spawn("npx", ["next", "dev", "-p", "43120"], {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`,
    DATABASE_POOL_MAX: "1", // PGlite is a single session
  },
});

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  child.kill();
  await server.stop();
  await db.close();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", stop);
