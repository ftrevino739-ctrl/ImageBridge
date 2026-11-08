#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import { basename, resolve, extname } from "node:path";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/imagebridge-upload.mjs <image-path>");
  process.exit(2);
}
const base = (process.env.IMAGEBRIDGE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const apiToken = process.env.IMAGEBRIDGE_API_TOKEN || "";
const parsedBase = new URL(base);
const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(parsedBase.hostname);
if (!isLoopback && parsedBase.protocol !== "https:") throw new Error("Remote ImageBridge servers must use HTTPS.");
const mimeByExt = new Map([
  [".jpg","image/jpeg"],[".jpeg","image/jpeg"],[".png","image/png"],
  [".webp","image/webp"],[".gif","image/gif"],[".avif","image/avif"],[".heic","image/heic"]
]);
const path = resolve(file);
const info = await stat(path);
if (!info.isFile()) throw new Error("The selected path is not a file.");
const healthResponse = await fetch(base + "/api/health");
if (!healthResponse.ok) throw new Error("ImageBridge server is unreachable: HTTP " + healthResponse.status);
const health = await healthResponse.json();
const maxBytes = Number(health.maxUploadMB || 15) * 1024 * 1024;
if (info.size === 0 || info.size > maxBytes) throw new Error("Image must be non-empty and no larger than " + health.maxUploadMB + " MB.");
const bytes = await readFile(path);
const mime = mimeByExt.get(extname(path).toLowerCase());
if (!mime) throw new Error("Unsupported image extension.");
const prefix = bytes.subarray(0, 32);
const signatures = {
  "image/jpeg": b => b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255,
  "image/png": b => b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
  "image/webp": b => b.length >= 12 && b.toString("ascii",0,4) === "RIFF" && b.toString("ascii",8,12) === "WEBP",
  "image/gif": b => ["GIF87a","GIF89a"].includes(b.toString("ascii",0,6)),
  "image/avif": b => b.length >= 12 && b.toString("ascii",4,8) === "ftyp" && ["avif","avis","mif1","msf1"].includes(b.toString("ascii",8,12)),
  "image/heic": b => b.length >= 12 && b.toString("ascii",4,8) === "ftyp" && ["heic","heix","hevc","hevx","mif1","msf1"].includes(b.toString("ascii",8,12))
};
if (!signatures[mime](prefix)) throw new Error("The file signature does not match its extension.");
const headers = { "Content-Type": mime, "X-File-Name": encodeURIComponent(basename(path)) };
if (apiToken) headers.Authorization = "Bearer " + apiToken;
const uploaded = await fetch(base + "/api/images", { method: "POST", headers, body: bytes });
const data = await uploaded.json().catch(() => ({}));
if (!uploaded.ok) throw new Error("Upload failed: HTTP " + uploaded.status + " " + (data.error || ""));
const imageUrl = new URL(data.url, base).toString();
const verify = await fetch(imageUrl);
if (!verify.ok) throw new Error("The server accepted the upload but image verification failed: HTTP " + verify.status);
console.log(JSON.stringify({ success: true, name: data.name, mime: data.mime, size: data.size, url: imageUrl, expiresAt: new Date(data.expiresAt).toISOString() }, null, 2));
