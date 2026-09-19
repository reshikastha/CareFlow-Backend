import pg from "pg";

// Get PostgreSQL's Pool class.
// A pool manages and reuses database connections.
const { Pool } = pg;

// Create a PostgreSQL connection pool using values from .env.
const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

// Listen for unexpected errors from idle database connections.
pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL error:", error);
});

// Export the pool so controllers can execute SQL queries.
export default pool;