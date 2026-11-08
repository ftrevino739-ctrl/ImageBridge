import http from "node:http";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, unlink } from "node:fs/promises";
import { once } from "node:events";
import { extname, join, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PUBLIC = join(ROOT, "public");
const DATA = resolve(process.env.IMAGEBRIDGE_DATA_DIR || join(ROOT, "data"));
const UPLOADS = join(DATA, "uploads");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const MAX_MB = Number(process.env.MAX_UPLOAD_MB || 15);
const MAX_BYTES = MAX_MB * 1024 * 1024;
const TTL_HOURS = Number(process.env.TTL_HOURS || 24);
const API_TOKEN = process.env.IMAGEBRIDGE_API_TOKEN || "";
const META = join(DATA, "images.json");
const types = new Map([
  ["image/jpeg", { ext: ".jpg", test: b => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff }],
  ["image/png", { ext: ".png", test: b => b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) }],
  ["image/webp", { ext: ".webp", test: b => b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP" }],
  ["image/gif", { ext: ".gif", test: b => ["GIF87a","GIF89a"].includes(b.toString("ascii",0,6)) }],
  ["image/avif", { ext: ".avif", test: b => b.length >= 12 && b.toString("ascii",4,8) === "ftyp" && ["avif","avis","mif1","msf1"].includes(b.toString("ascii",8,12)) }],
  ["image/heic", { ext: ".heic", test: b => b.length >= 12 && b.toString("ascii",4,8) === "ftyp" && ["heic","heix","hevc","hevx","mif1","msf1"].includes(b.toString("ascii",8,12)) }]
]);
if (!Number.isFinite(MAX_MB) || MAX_MB <= 0 || MAX_MB > 100) throw new Error("MAX_UPLOAD_MB must be between 0 and 100.");
if (!Number.isFinite(TTL_HOURS) || TTL_HOURS <= 0 || TTL_HOURS > 720) throw new Error("TTL_HOURS must be between 0 and 720.");
const localHosts = new Set(["127.0.0.1","localhost","::1"]);
if (!localHosts.has(HOST) && API_TOKEN.length < 32) {
  throw new Error("Public binding requires IMAGEBRIDGE_API_TOKEN with at least 32 characters. Keep HOST=127.0.0.1 for local-only use.");
}
await mkdir(UPLOADS, { recursive: true });

async function metadata() {
  try { return JSON.parse(await readFile(META, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
}
async function save(rows) {
  const temp = META + "." + randomUUID() + ".tmp";
  await import("node:fs/promises").then(({writeFile}) => writeFile(temp, JSON.stringify(rows, null, 2), {flag:"wx"}));
  await rename(temp, META);
}
let mutationQueue = Promise.resolve();
function mutateRows(mutator) {
  const task = mutationQueue.then(async () => {
    const rows = await metadata();
    const next = await mutator(rows);
    await save(next);
    return next;
  });
  mutationQueue = task.catch(() => {});
  return task;
}
function send(res, status, data, headers = {}) {
  if (res.headersSent || res.destroyed) return;
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...headers });
  res.end(JSON.stringify(data));
}
function safeEqual(a, b) {
  const x = Buffer.from(a || ""), y = Buffer.from(b || "");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}
function authorized(req) {
  if (!API_TOKEN) return true;
  const value = req.headers.authorization || "";
  return value.startsWith("Bearer ") && safeEqual(value.slice(7), API_TOKEN);
}
function token() { return randomBytes(32).toString("hex"); }
function validImage(mime, prefix) { return types.get(mime)?.test(prefix) === true; }

async function cleanup() {
  const expired = [];
  await mutateRows(rows => {
    const now = Date.now();
    const keep = rows.filter(row => {
      if (row.expiresAt <= now) { expired.push(row.diskName); return false; }
      return true;
    });
    return keep;
  });
  await Promise.all(expired.map(name => unlink(join(UPLOADS, name)).catch(() => {})));
}
setInterval(() => cleanup().catch(error => console.error("Cleanup failed:", error)), 15 * 60 * 1000).unref();

const uploadWindows = new Map();
function rateLimited(req) {
  const ip = req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const row = uploadWindows.get(ip);
  if (!row || now - row.startedAt > 10 * 60 * 1000) {
    uploadWindows.set(ip, { startedAt: now, count: 1 });
    return false;
  }
  row.count++;
  return row.count > 60;
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET" && url.pathname === "/api/health")
      return send(res, 200, { ok: true, name: "ImageBridge", maxUploadMB: MAX_MB, ttlHours: TTL_HOURS, authentication: Boolean(API_TOKEN) });

    if (req.method === "POST" && url.pathname === "/api/images") {
      if (!authorized(req)) return send(res, 401, { error: "Authentication required. Configure the ImageBridge API token." });
      if (rateLimited(req)) return send(res, 429, { error: "Upload rate limit exceeded. Try again later." });
      const mime = (req.headers["content-type"] || "").split(";")[0].toLowerCase();
      const type = types.get(mime);
      if (!type) return send(res, 415, { error: "Unsupported image type. Use JPEG, PNG, WEBP, GIF, AVIF or HEIC." });
      const declared = Number(req.headers["content-length"] || 0);
      if (declared > MAX_BYTES) return send(res, 413, { error: "Image exceeds upload limit." });

      const id = randomUUID(), accessToken = token(), diskName = id + type.ext, path = join(UPLOADS, diskName);
      const out = createWriteStream(path, { flags: "wx" });
      let size = 0, prefix = Buffer.alloc(0);
      try {
        for await (const chunk of req) {
          size += chunk.length;
          if (size > MAX_BYTES) {
            out.destroy();
            await unlink(path).catch(() => {});
            return send(res, 413, { error: "Image exceeds upload limit." });
          }
          if (prefix.length < 32) prefix = Buffer.concat([prefix, chunk.subarray(0, 32 - prefix.length)]);
          if (!out.write(chunk)) await once(out, "drain");
        }
        out.end();
        await once(out, "finish");
        if (size === 0) throw Object.assign(new Error("Empty upload."), { status: 400 });
        if (!validImage(mime, prefix)) throw Object.assign(new Error("Image signature does not match Content-Type."), { status: 415 });
        const rawName = req.headers["x-file-name"] || "image" + type.ext;
        let decoded = "image" + type.ext;
        try { decoded = decodeURIComponent(rawName); } catch {}
        const safeName = basename(decoded).replace(/[\x00-\x1f\x7f]/g, "").slice(0, 120) || "image" + type.ext;
        const now = Date.now();
        const row = { id, diskName, name: safeName, mime, size, token: accessToken, createdAt: now, expiresAt: now + TTL_HOURS * 3600000 };
        await mutateRows(rows => [row, ...rows]);
        return send(res, 201, { id, name: row.name, mime, size, createdAt: now, expiresAt: row.expiresAt, url: `/api/images/${id}?token=${accessToken}`, deleteUrl: `/api/images/${id}?token=${accessToken}` });
      } catch (error) {
        out.destroy();
        await unlink(path).catch(() => {});
        return send(res, error.status || 400, { error: error.status ? error.message : "Upload could not be completed." });
      }
    }

    const match = url.pathname.match(/^\/api\/images\/([\w-]+)$/);
    if (match) {
      const rows = await metadata(), row = rows.find(x => x.id === match[1]);
      if (!row || row.expiresAt <= Date.now()) return send(res, 404, { error: "Image not found or expired." });
      if (!safeEqual(url.searchParams.get("token"), row.token)) return send(res, 403, { error: "Invalid access token." });
      if (req.method === "GET") {
        res.writeHead(200, { "content-type": row.mime, "content-length": row.size, "cache-control": "private, max-age=60", "x-content-type-options": "nosniff", "content-disposition": "inline" });
        return createReadStream(join(UPLOADS, row.diskName)).pipe(res);
      }
      if (req.method === "DELETE") {
        await mutateRows(current => current.filter(x => x.id !== row.id));
        await unlink(join(UPLOADS, row.diskName)).catch(() => {});
        return send(res, 200, { ok: true, deleted: row.id });
      }
    }
    if (req.method === "GET" && url.pathname === "/api/history") {
      if (!authorized(req)) return send(res, 401, { error: "Authentication required." });
      const rows = await metadata();
      return send(res, 200, { images: rows.filter(x => x.expiresAt > Date.now()).map(({ id, name, mime, size, createdAt, expiresAt }) => ({ id, name, mime, size, createdAt, expiresAt })) });
    }
    if (req.method === "GET") {
      const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      if (file.includes("..") || file.includes("\\")) return send(res, 400, { error: "Bad path" });
      try {
        const path = join(PUBLIC, file), info = await stat(path);
        if (!info.isFile()) throw new Error("Not a file");
        const ext = extname(path);
        const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" }[ext] || "application/octet-stream";
        res.writeHead(200, { "content-type": mime, "x-content-type-options": "nosniff" });
        return createReadStream(path).pipe(res);
      } catch { return send(res, 404, { error: "Not found" }); }
    }
    return send(res, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error("Request failed:", error);
    return send(res, 500, { error: "Internal server error." });
  }
});
server.requestTimeout = 30_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;
server.maxRequestsPerSocket = 100;
server.listen(PORT, HOST, () => console.log(`ImageBridge running at http://${HOST}:${PORT}`));
