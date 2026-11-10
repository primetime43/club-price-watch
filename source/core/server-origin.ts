export function serverOrigin(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048) throw new Error("Enter the app address, such as http://192.168.1.20:3000.");
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error("Enter a complete http:// or https:// app address."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash || url.hostname.includes("*"))
    throw new Error("Use only the app's http:// or https:// address and port, without a path, login details or query.");
  return url.origin;
}
