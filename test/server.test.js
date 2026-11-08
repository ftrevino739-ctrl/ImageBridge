import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const apiToken = "test-token-that-is-long-enough-for-ci-123456";
const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
let child, base, dataDir;

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
async function waitForServer() {
  for (let i = 0; i < 80; i++) {
    try {
      const response = await fetch(base + "/api/health");
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("ImageBridge server did not start.");
}
const auth = { Authorization: "Bearer " + apiToken };

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "imagebridge-test-"));
  const port = await freePort();
  base = "http://127.0.0.1:" + port;
  const env = { ...process.env, HOST: "127.0.0.1", PORT: String(port), IMAGEBRIDGE_DATA_DIR: dataDir, IMAGEBRIDGE_API_TOKEN: apiToken, MAX_UPLOAD_MB: "1", TTL_HOURS: "1" };
  child = spawn(process.execPath, ["src/server.js"], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] });
  await waitForServer();
});
after(async () => {
  if (child && child.exitCode === null) {
    child.kill();
    await new Promise(resolve => child.once("exit", resolve));
  }
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

test("root endpoint explains that the API server is running", async () => {
  const response = await fetch(base + "/");
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.name, "ImageBridge");
  assert.equal(data.health, "GET /api/health");
});

test("health endpoint is public and reports authentication", async () => {
  const response = await fetch(base + "/api/health");
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.authentication, true);
});

test("uploads require the configured bearer token", async () => {
  const response = await fetch(base + "/api/images", { method: "POST", headers: { "Content-Type": "image/png" }, body: png });
  assert.equal(response.status, 401);
});

test("rejects spoofed MIME types using image signatures", async () => {
  const response = await fetch(base + "/api/images", { method: "POST", headers: { ...auth, "Content-Type": "image/png" }, body: Buffer.from("not really a png") });
  assert.equal(response.status, 415);
});

test("uploads, protects retrieval, lists metadata, and deletes an image", async () => {
  const upload = await fetch(base + "/api/images", { method: "POST", headers: { ...auth, "Content-Type": "image/png", "X-File-Name": "sample.png" }, body: png });
  assert.equal(upload.status, 201);
  const result = await upload.json();
  assert.match(result.url, /^\/api\/images\//);

  const blocked = await fetch(base + result.url.replace(/token=.*/, "token=wrong"));
  assert.equal(blocked.status, 403);

  const image = await fetch(base + result.url);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);

  const historyBlocked = await fetch(base + "/api/history");
  assert.equal(historyBlocked.status, 401);
  const history = await fetch(base + "/api/history", { headers: auth });
  assert.equal(history.status, 200);
  assert.equal((await history.json()).images.length, 1);

  const deleted = await fetch(base + result.deleteUrl, { method: "DELETE" });
  assert.equal(deleted.status, 200);
  const gone = await fetch(base + result.url);
  assert.equal(gone.status, 404);
});


test("bundled Skill CLI uploads and verifies a real local file", async () => {
  const imagePath = join(dataDir, "cli-sample.png");
  await writeFile(imagePath, png);
  const env = { ...process.env, IMAGEBRIDGE_URL: base, IMAGEBRIDGE_API_TOKEN: apiToken };
  for (const script of ["scripts/imagebridge-upload.mjs", ".agents/skills/imagebridge/scripts/upload.mjs"]) {
    const output = execFileSync(process.execPath, [script, imagePath], { cwd: process.cwd(), env, encoding: "utf8" });
    const result = JSON.parse(output);
    assert.equal(result.success, true);
    assert.equal(result.mime, "image/png");
    assert.match(result.url, /^http:\/\/127\.0\.0\.1:/);
  }
});

test("rejects uploads larger than the configured limit", async () => {
  const large = Buffer.alloc(1024 * 1024 + 1, 1);
  const response = await fetch(base + "/api/images", { method: "POST", headers: { ...auth, "Content-Type": "image/png" }, body: large });
  assert.equal(response.status, 413);
});
