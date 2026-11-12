import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

// Runs the unit tests against a fresh in-memory PostgreSQL (PGlite), no Docker needed.
export default async function setup() {
  const db = await PGlite.create();
  const port = 54000 + Math.floor(Math.random() * 1000);
  // Test files run one at a time; extra connection slots only cover a closing worker's socket.
  const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 4 });
  await server.start();

  process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;
  process.env.DATABASE_POOL_MAX = "1"; // PGlite is a single session

  return async () => {
    await server.stop();
    await db.close();
  };
}
