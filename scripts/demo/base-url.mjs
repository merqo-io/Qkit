const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/**
 * Restrict the database the recorder may run upgrade SQL against to a
 * loopback Postgres, so a mis-set DEMO_DB_URL can never touch a hosted project.
 */
export function localDemoDbUrl(value) {
  if (!value) throw new Error("DEMO_DB_URL is not set");
  const url = new URL(value);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !LOOPBACK_HOSTS.includes(url.hostname)
  ) {
    throw new Error("DEMO_DB_URL must point at a loopback Postgres");
  }
  return value;
}

/** Restrict synthetic demo writes to a loopback app origin. */
export function localDemoBaseUrl(value = "http://localhost:3000") {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !LOOPBACK_HOSTS.includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "DEMO_BASE_URL must be a loopback HTTP(S) origin without credentials or a path",
    );
  }
  return url.origin;
}
