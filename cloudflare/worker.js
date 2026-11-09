const TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/heic",
  "application/pdf", "text/plain", "text/markdown", "text/csv", "application/json", "application/rtf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation"
]);

const MAX_DEFAULT_MB = 15;
const TTL_DEFAULT_HOURS = 24;

function cors(headers = {}) {
  return {
    ...headers,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-File-Name",
    "Access-Control-Max-Age": "86400"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: cors({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" })
  });
}

function randomHex(bytes = 32) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return [...data].map(value => value.toString(16).padStart(2, "0")).join("");
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function safeName(value) {
  let name = "upload";
  try { name = decodeURIComponent(value || "upload"); } catch {}
  return name.replace(/[\\/\\0-\\x1f\\x7f]/g, "_").replace(/^\\.+/, "").slice(0, 180) || "upload";
}

function validSignature(type, bytes) {
  const b = new Uint8Array(bytes);
  const ascii = (start, end) => new TextDecoder().decode(b.slice(start, end));
  if (type === "image/jpeg") return b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255;
  if (type === "image/png") return b.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => b[index] === value);
  if (type === "image/webp") return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
  if (type === "image/gif") return ["GIF87a", "GIF89a"].includes(ascii(0, 6));
  if (type === "image/avif") return ascii(4, 8) === "ftyp" && ["avif", "avis", "mif1", "msf1"].includes(ascii(8, 12));
  if (type === "image/heic") return ascii(4, 8) === "ftyp" && ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(ascii(8, 12));
  if (type === "application/pdf") return ascii(0, 5) === "%PDF-";
  if (type === "application/rtf") return ascii(0, 5) === "{\\rtf";
  if (type.includes("officedocument")) return b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b;
  return type.startsWith("text/") || type === "application/json";
}

function fileResponse(object, name, mime, expiresAt) {
  const safeMime = TYPES.has(mime) ? mime : "application/octet-stream";
  const inline = safeMime.startsWith("image/") || safeMime === "application/pdf";
  return new Response(object.body, {
    headers: cors({
      "Content-Type": safeMime,
      "Content-Disposition": (inline ? "inline" : "attachment") + '; filename="' + name.replace(/["\\\\]/g, "_") + '"',
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=300",
      "Expires": new Date(expiresAt).toUTCString()
    })
  });
}

async function upload(request, env) {
  const expected = env.IMAGEBRIDGE_API_TOKEN || "";
  const provided = request.headers.get("Authorization") || "";
  if (expected.length < 32 || !constantTimeEqual(provided, "Bearer " + expected)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const mime = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (!TYPES.has(mime)) return json({ error: "Unsupported file type" }, 415);

  const maxMB = Math.max(1, Math.min(100, Number(env.MAX_UPLOAD_MB || MAX_DEFAULT_MB)));
  const maxBytes = maxMB * 1024 * 1024;
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > maxBytes) return json({ error: "File exceeds " + maxMB + " MB limit" }, 413);

  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > maxBytes) return json({ error: "Empty file or upload exceeds limit" }, 413);
  if (!validSignature(mime, bytes)) return json({ error: "File signature does not match Content-Type" }, 415);

  const name = safeName(request.headers.get("X-File-Name"));
  const id = crypto.randomUUID().replace(/-/g, "");
  const token = randomHex(32);
  const ttlHours = Math.max(1, Math.min(720, Number(env.TTL_HOURS || TTL_DEFAULT_HOURS)));
  const expiresAt = Date.now() + ttlHours * 60 * 60 * 1000;
  const tokenHash = await sha256(token);
  const key = "files/" + id;

  await env.FILES.put(key, bytes, {
    httpMetadata: { contentType: mime },
    customMetadata: { name, mime, expiresAt: String(expiresAt), tokenHash }
  });

  const url = new URL(request.url);
  url.pathname = "/api/images/" + id;
  url.search = "?token=" + encodeURIComponent(token);
  return json({ ok: true, id, name, mime, size: bytes.byteLength, expiresAt: new Date(expiresAt).toISOString(), url: url.href });
}

async function retrieve(request, env, id) {
  if (!/^[a-f0-9]{32}$/i.test(id)) return json({ error: "Not found" }, 404);
  const object = await env.FILES.get("files/" + id);
  if (!object) return json({ error: "Not found" }, 404);

  const meta = object.customMetadata || {};
  const expiresAt = Number(meta.expiresAt || 0);
  if (!expiresAt || Date.now() >= expiresAt) {
    await env.FILES.delete("files/" + id);
    return json({ error: "File expired" }, 410);
  }

  const token = new URL(request.url).searchParams.get("token") || "";
  const tokenHash = await sha256(token);
  if (!token || !constantTimeEqual(tokenHash, meta.tokenHash || "")) return json({ error: "Unauthorized" }, 401);

  return fileResponse(object, meta.name || "download", meta.mime || "application/octet-stream", expiresAt);
}

async function cleanup(env) {
  let cursor;
  do {
    const page = await env.FILES.list({ prefix: "files/", cursor, limit: 1000, include: ["customMetadata"] });
    for (const object of page.objects) {
      const expiry = Number(object.customMetadata?.expiresAt || 0);
      if (expiry && expiry <= Date.now()) await env.FILES.delete(object.key);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/health") {
      return json({ ok: true, name: "ImageBridge Cloudflare", storage: "R2", maxUploadMB: Number(env.MAX_UPLOAD_MB || MAX_DEFAULT_MB), ttlHours: Number(env.TTL_HOURS || TTL_DEFAULT_HOURS), authentication: true });
    }
    if (request.method === "POST" && url.pathname === "/api/images") return upload(request, env);
    const match = url.pathname.match(/^\/api\/images\/([a-f0-9]{32})$/i);
    if (request.method === "GET" && match) return retrieve(request, env, match[1]);
    return json({ error: "Not found" }, 404);
  },
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(cleanup(env));
  }
};
