export function databaseName(connectionString: string): string {
  const normalized = connectionString.replace(/^postgres(ql)?:\/\//i, "http://");
  try {
    const url = new URL(normalized);
    return decodeURIComponent(url.pathname.replace(/^\//, "").split("/")[0] ?? "");
  } catch {
    return "";
  }
}

/** Rejects a URL whose path names a non-test database. An empty path is checked after connect. */
export function assertSafeTestDatabase(connectionString: string): void {
  const name = databaseName(connectionString);
  if (name && !name.toLowerCase().includes("test")) {
    throw new Error(
      `Refusing to drop schemas: database "${name}" does not contain "test". HAUNTED_TEST_DATABASE_URL must name a database whose name contains "test".`,
    );
  }
}
