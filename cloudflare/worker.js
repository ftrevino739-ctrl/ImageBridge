const TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/heic",
  "application/pdf", "text/plain", "text/markdown", "text/csv", "application/json", "application/rtf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation"
]);
const EXT = {
  "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif",
  "image/avif": ".avif", "image/heic": ".heic", "application/pdf": ".pdf",
  "text/plain": ".txt", "text/markdown": ".md", "text/csv": ".csv", "application/json": ".json",
  "application/rtf": ".rtf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx"
};
const MAX_DEFAULT_MB = 15;
const TTL_DEFAULT_HOURS = 24;
const PREFIX = "imagebridge/";

function cors(headers = {}) {
  return {
    ...headers,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
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
function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
function safeName(value) {
  let name = "upload";
  try { name = decodeURIComponent(value || "upload"); } catch {}
  return name.replace(/[\\/\0-\x1f\x7f]/g, "_").replace(/^\.+/, "").slice(0, 180) || "upload";
}
function validSignature(type, bytes) {
  const b = new Uint8Array(bytes);
  const ascii = (start, end) => new TextDecoder().decode(b.slice(start, end));
  if (type === "image/jpeg") return b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255;
  if (type === "image/png") return b.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i) => b[i] === v);
  if (type === "image/webp") return ascii(0,4) === "RIFF" && ascii(8,12) === "WEBP";
  if (type === "image/gif") return ["GIF87a","GIF89a"].includes(ascii(0,6));
  if (type === "image/avif") return ascii(4,8) === "ftyp" && ["avif","avis","mif1","msf1"].includes(ascii(8,12));
  if (type === "image/heic") return ascii(4,8) === "ftyp" && ["heic","heix","hevc","hevx","mif1","msf1"].includes(ascii(8,12));
  if (type === "application/pdf") return ascii(0,5) === "%PDF-";
  if (type === "application/rtf") return ascii(0,5) === "{\\rtf";
  if (type.includes("officedocument")) return b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b;
  return type.startsWith("text/") || type === "application/json";
}
function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
async function hmac(value, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}
async function makeAccessToken(payload, secret) {
  const encoded = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  return encoded + "." + await hmac(encoded, secret);
}
async function readAccessToken(token, secret) {
  if (!token || token.length > 4096) return null;
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) return null;
  const expected = await hmac(encoded, secret);
  if (!constantTimeEqual(signature, expected)) return null;
  try { return JSON.parse(new TextDecoder().decode(base64UrlToBytes(encoded))); } catch { return null; }
}
async function sha1(value) {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, "0")).join("");
}
function cloudinaryConfigured(env) {
  return Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET && env.IMAGEBRIDGE_API_TOKEN?.length >= 32);
}
function authorized(request, env) {
  const expected = env.IMAGEBRIDGE_API_TOKEN || "";
  const provided = request.headers.get("Authorization") || "";
  return expected.length >= 32 && constantTimeEqual(provided, "Bearer " + expected);
}
function cloudinaryAuth(env) {
  return "Basic " + btoa(env.CLOUDINARY_API_KEY + ":" + env.CLOUDINARY_API_SECRET);
}
function cloudinaryBase(env) {
  return "https://api.cloudinary.com/v1_1/" + encodeURIComponent(env.CLOUDINARY_CLOUD_NAME);
}
async function signedCloudinaryPost(env, resourceType, action, params, file) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signed = { ...params, timestamp };
  const serialized = Object.keys(signed).sort().map(key => key + "=" + signed[key]).join("&");
  const signature = await sha1(serialized + env.CLOUDINARY_API_SECRET);
  const form = new FormData();
  for (const [key, value] of Object.entries(signed)) form.append(key, String(value));
  form.append("api_key", env.CLOUDINARY_API_KEY);
  form.append("signature", signature);
  if (file) form.append("file", file);
  const response = await fetch(cloudinaryBase(env) + "/" + resourceType + "/" + action, {
    method: "POST", headers: { Authorization: cloudinaryAuth(env) }, body: form
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || "Cloudinary request failed (" + response.status + ").");
  return data;
}
async function destroyAsset(env, resourceType, publicId) {
  return signedCloudinaryPost(env, resourceType, "destroy", { public_id: publicId, invalidate: "true" });
}
function publicDeliveryUrl(env, payload) {
  const encodedId = payload.publicId.split("/").map(encodeURIComponent).join("/");
  return "https://res.cloudinary.com/" + encodeURIComponent(env.CLOUDINARY_CLOUD_NAME) + "/" +
    payload.resourceType + "/upload/v" + payload.version + "/" + encodedId;
}
async function upload(request, env) {
  if (!authorized(request, env)) return json({ error: "Unauthorized. Configure the ImageBridge API token." }, 401);
  if (!cloudinaryConfigured(env)) return json({ error: "Cloudinary is not configured on the ImageBridge server." }, 503);
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
  const resourceType = mime.startsWith("image/") ? "image" : "raw";
  const publicId = PREFIX + id + (resourceType === "raw" ? (EXT[mime] || ".bin") : "");
  const ttlHours = Math.max(1, Math.min(720, Number(env.TTL_HOURS || TTL_DEFAULT_HOURS)));
  const createdAt = Date.now();
  const expiresAt = createdAt + ttlHours * 60 * 60 * 1000;
  const meta = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ id, name, mime, size: bytes.byteLength, createdAt, expiresAt })));
  const context = "ib_meta=" + meta;
  try {
    const result = await signedCloudinaryPost(env, resourceType, "upload", {
      public_id: publicId, context, tags: "imagebridge"
    }, new Blob([bytes], { type: mime }));
    const payload = { id, publicId, resourceType, version: result.version, name, mime, size: bytes.byteLength, createdAt, expiresAt };
    const token = await makeAccessToken(payload, env.IMAGEBRIDGE_API_TOKEN);
    const url = new URL(request.url);
    url.pathname = "/api/images/" + id;
    url.search = "?token=" + encodeURIComponent(token);
    return json({ ok: true, id, name, mime, size: bytes.byteLength, createdAt, expiresAt, url: url.href, deleteUrl: url.href }, 201);
  } catch (error) {
    console.error("Cloudinary upload failed:", error);
    return json({ error: error.message || "Cloudinary upload failed." }, 502);
  }
}
async function retrieve(request, env, id) {
  if (!cloudinaryConfigured(env)) return json({ error: "Cloudinary is not configured." }, 503);
  const token = new URL(request.url).searchParams.get("token") || "";
  const payload = await readAccessToken(token, env.IMAGEBRIDGE_API_TOKEN);
  if (!payload || payload.id !== id || !/^[a-f0-9]{32}$/.test(payload.id || "") ||
      !payload.publicId?.startsWith(PREFIX) || !["image","raw"].includes(payload.resourceType)) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (!Number.isFinite(payload.expiresAt) || Date.now() >= payload.expiresAt) {
    await destroyAsset(env, payload.resourceType, payload.publicId).catch(error => console.error("Expired asset cleanup failed:", error));
    return json({ error: "File expired" }, 410);
  }
  const upstream = await fetch(publicDeliveryUrl(env, payload));
  if (!upstream.ok) return json({ error: "File not found in Cloudinary." }, 404);
  const inline = payload.mime.startsWith("image/") || payload.mime === "application/pdf";
  const safeFilename = String(payload.name || "download").replace(/["\\\r\n]/g, "_");
  return new Response(upstream.body, {
    headers: cors({
      "Content-Type": payload.mime,
      "Content-Disposition": (inline ? "inline" : "attachment") + '; filename="' + safeFilename + '"',
      "Content-Length": String(payload.size),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=60",
      "Expires": new Date(payload.expiresAt).toUTCString()
    })
  });
}
async function deleteFile(request, env, id) {
  const token = new URL(request.url).searchParams.get("token") || "";
  const payload = await readAccessToken(token, env.IMAGEBRIDGE_API_TOKEN || "");
  if (!payload || payload.id !== id || !payload.publicId?.startsWith(PREFIX)) return json({ error: "Unauthorized" }, 401);
  await destroyAsset(env, payload.resourceType, payload.publicId);
  return json({ ok: true, deleted: id });
}
async function listResources(env, resourceType) {
  const all = [];
  let cursor = "";
  for (let page = 0; page < 10; page++) {
    const url = new URL(cloudinaryBase(env) + "/resources/" + resourceType + "/upload");
    url.searchParams.set("prefix", PREFIX);
    url.searchParams.set("max_results", "500");
    url.searchParams.set("context", "true");
    if (cursor) url.searchParams.set("next_cursor", cursor);
    const response = await fetch(url, { headers: { Authorization: cloudinaryAuth(env) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || "Cloudinary history request failed.");
    all.push(...(data.resources || []));
    if (!data.next_cursor) break;
    cursor = data.next_cursor;
  }
  return all;
}
function decodeAssetMeta(resource) {
  try {
    const encoded = resource.context?.custom?.ib_meta;
    if (!encoded) return null;
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(encoded)));
  } catch { return null; }
}
async function history(env) {
  const resources = [
    ...(await listResources(env, "image")),
    ...(await listResources(env, "raw"))
  ];
  const images = [];
  for (const resource of resources) {
    const meta = decodeAssetMeta(resource);
    if (meta && meta.expiresAt > Date.now()) images.push(meta);
  }
  images.sort((a,b) => b.createdAt - a.createdAt);
  return images;
}
async function cleanup(env) {
  if (!cloudinaryConfigured(env)) return;
  for (const resourceType of ["image", "raw"]) {
    const resources = await listResources(env, resourceType);
    for (const resource of resources) {
      const meta = decodeAssetMeta(resource);
      if (meta?.expiresAt && meta.expiresAt <= Date.now()) {
        await destroyAsset(env, resourceType, resource.public_id).catch(error => console.error("Cleanup failed:", error));
      }
    }
  }
}
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/") {
      return json({ ok: true, name: "ImageBridge", health: "GET /api/health", upload: "POST /api/images", retrieve: "GET /api/images/:id?token=...", history: "GET /api/history" });
    }
    if (request.method === "GET" && url.pathname === "/api/health") {
      return json({ ok: true, name: "ImageBridge", storage: "Cloudinary", maxUploadMB: Number(env.MAX_UPLOAD_MB || MAX_DEFAULT_MB), ttlHours: Number(env.TTL_HOURS || TTL_DEFAULT_HOURS), authentication: Boolean(env.IMAGEBRIDGE_API_TOKEN), configured: cloudinaryConfigured(env) });
    }
    if (request.method === "POST" && url.pathname === "/api/images") return upload(request, env);
    if (request.method === "GET" && url.pathname === "/api/history") {
      if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
      if (!cloudinaryConfigured(env)) return json({ error: "Cloudinary is not configured." }, 503);
      try { return json({ images: await history(env) }); }
      catch (error) { return json({ error: error.message || "History unavailable." }, 502); }
    }
    const match = url.pathname.match(/^\/api\/images\/([a-f0-9]{32})$/i);
    if (match && request.method === "GET") return retrieve(request, env, match[1]);
    if (match && request.method === "DELETE") return deleteFile(request, env, match[1]);
    return json({ error: "Not found" }, 404);
  },
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(cleanup(env));
  }
};
