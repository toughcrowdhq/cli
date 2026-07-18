export const defaultApiOrigin = "https://api.toughcrowd.dev";

export class ApiOriginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiOriginError";
  }
}

export function parseApiOrigin(input: string): string {
  let url: URL;

  try {
    url = new URL(input);
  } catch {
    throw new ApiOriginError("API origin must be an absolute URL");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ApiOriginError("API origin must use HTTP or HTTPS");
  }

  if (url.username !== "" || url.password !== "") {
    throw new ApiOriginError("API origin must not include user info");
  }

  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") {
    throw new ApiOriginError(
      "API origin must not include a path, query, or fragment",
    );
  }

  if (url.protocol === "http:" && !isLoopbackHost(url.hostname)) {
    throw new ApiOriginError("API origin must use HTTPS unless it is loopback");
  }

  return url.origin;
}

export function resolveApiOrigin(input = defaultApiOrigin): string {
  return parseApiOrigin(input);
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();

  return (
    normalized === "localhost" ||
    normalized === "[::1]" ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized)
  );
}
