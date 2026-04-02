import { Pool, type QueryResult, type QueryResultRow } from "pg";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface DatabaseClient {
  query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
  end?: () => Promise<void>;
}

const currentDir = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(currentDir, "../sql/schema.sql");

export function createPool(connectionString: string) {
  return new Pool({
    connectionString,
    ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false }
  });
}

export async function applySchema(db: DatabaseClient) {
  const schemaSql = await readFile(schemaPath, "utf8");
  await db.query(schemaSql);
}
