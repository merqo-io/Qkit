const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/**
 * Restrict the database the recorder may run upgrade SQL against to a
 * loopback Postgres, so a mis-set DEMO_DB_URL can never touch a hosted project.
 */
export function localDemoDbUrl(value) {
  if (!value) throw new Error("DEMO_DB_URL is not set");
  const url = new URL(value);
  // libpq lets ?host=, ?hostaddr= and ?service= override the hostname, so any
  // query string could redirect psql to a hosted database.
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    !LOOPBACK_HOSTS.includes(url.hostname) ||
    url.search
  ) {
    throw new Error(
      "DEMO_DB_URL must point at a loopback Postgres, without query parameters",
    );
  }
  return value;
}

/** Throw unless a page URL is on a loopback host, before the recorder interacts with it. */
export function assertLoopback(value) {
  const url = new URL(value);
  if (!LOOPBACK_HOSTS.includes(url.hostname)) {
    throw new Error(
      `Refusing to drive ${url.origin}: the demo only interacts with loopback hosts`,
    );
  }
  return url.origin;
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
