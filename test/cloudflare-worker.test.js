import test from "node:test";
import assert from "node:assert/strict";
import worker from "../cloudflare/worker.js";

function makeBucket() {
  const objects = new Map();
  return {
    objects,
    async put(key, value, options) {
      objects.set(key, { body: new Blob([value]), customMetadata: options.customMetadata });
    },
    async get(key) { return objects.get(key) || null; },
    async delete(key) { objects.delete(key); },
    async list() { return { objects: [], truncated: false }; }
  };
}

test("Cloudflare worker health endpoint reports R2 and authentication", async () => {
  const response = await worker.fetch(new Request("https://ib.example.workers.dev/api/health"), {
    FILES: makeBucket(),
    IMAGEBRIDGE_API_TOKEN: "a".repeat(64)
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.equal(data.storage, "R2");
  assert.equal(data.authentication, true);
});

test("Cloudflare worker rejects uploads without the bearer token", async () => {
  const response = await worker.fetch(new Request("https://ib.example.workers.dev/api/images", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "hello"
  }), { FILES: makeBucket(), IMAGEBRIDGE_API_TOKEN: "a".repeat(64) });
  assert.equal(response.status, 401);
});

test("Cloudflare worker stores and retrieves a token-protected file", async () => {
  const bucket = makeBucket();
  const apiToken = "b".repeat(64);
  const base = "https://ib.example.workers.dev";
  const uploaded = await worker.fetch(new Request(base + "/api/images", {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      "X-File-Name": "sample.txt",
      "Authorization": "Bearer " + apiToken
    },
    body: "ImageBridge test"
  }), { FILES: bucket, IMAGEBRIDGE_API_TOKEN: apiToken });

  assert.equal(uploaded.status, 200);
  const data = await uploaded.json();
  assert.equal(data.ok, true);
  assert.match(data.url, /^https:\/\/ib\.example\.workers\.dev\/api\/images\/[a-f0-9]{32}\?token=/);

  const retrieved = await worker.fetch(new Request(data.url), { FILES: bucket, IMAGEBRIDGE_API_TOKEN: apiToken });
  assert.equal(retrieved.status, 200);
  assert.equal(await retrieved.text(), "ImageBridge test");

  const denied = await worker.fetch(new Request(base + "/api/images/" + data.id + "?token=wrong"), {
    FILES: bucket,
    IMAGEBRIDGE_API_TOKEN: apiToken
  });
  assert.equal(denied.status, 401);
});
