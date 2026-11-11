import test from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.js";

const TOKEN = "a".repeat(64);
const env = {
  IMAGEBRIDGE_API_TOKEN: TOKEN,
  CLOUDINARY_CLOUD_NAME: "demo",
  CLOUDINARY_API_KEY: "123456",
  CLOUDINARY_API_SECRET: "secret-value",
  MAX_UPLOAD_MB: "15",
  TTL_HOURS: "24"
};
const png = Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]);

function request(path, options = {}) {
  return new Request("https://imagebridge.example" + path, options);
}

test("health identifies Cloudinary and reports configuration", async () => {
  const response = await worker.fetch(request("/api/health"), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.storage, "Cloudinary");
  assert.equal(body.configured, true);
});

test("upload requires the ImageBridge bearer token", async () => {
  const response = await worker.fetch(request("/api/images", {
    method: "POST",
    headers: { "Content-Type": "image/png" },
    body: png
  }), env);
  assert.equal(response.status, 401);
});

test("uploads to authenticated Cloudinary storage and proxies the file", async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let uploadUrl = "";
  let deliveryUrl = "";
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.includes("api.cloudinary.com")) {
      uploadUrl = url;
      assert.equal(init.method, "POST");
      const form = init.body;
      assert.equal(form.get("type"), "authenticated");
      assert.equal(form.get("tags"), "imagebridge");
      assert.match(form.get("public_id"), /^imagebridge\/[a-f0-9]{32}$/);
      assert.ok(form.get("signature"));
      assert.equal(form.get("api_key"), env.CLOUDINARY_API_KEY);
      return Response.json({ version: 123456, bytes: png.byteLength, public_id: form.get("public_id") });
    }
    deliveryUrl = url;
    assert.match(url, /\/image\/authenticated\/s--[A-Za-z0-9_-]{8}--\/v123456\/imagebridge\//);
    return new Response(png, { status: 200, headers: { "Content-Type": "image/png" } });
  };

  const uploaded = await worker.fetch(request("/api/images", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + TOKEN,
      "Content-Type": "image/png",
      "X-File-Name": "sample.png"
    },
    body: png
  }), env);
  assert.equal(uploaded.status, 201);
  const result = await uploaded.json();
  assert.equal(result.ok, true);
  assert.equal(result.name, "sample.png");
  assert.match(result.url, /^https:\/\/imagebridge\.example\/api\/images\/[a-f0-9]{32}\?token=/);
  assert.match(uploadUrl, /\/image\/upload$/);

  const retrieved = await worker.fetch(request(new URL(result.url).pathname + new URL(result.url).search), env);
  assert.equal(retrieved.status, 200);
  assert.equal(retrieved.headers.get("Content-Type"), "image/png");
  assert.deepEqual(new Uint8Array(await retrieved.arrayBuffer()), png);
  assert.ok(deliveryUrl);
});

test("rejects an invalid or altered access token", async () => {
  const response = await worker.fetch(request("/api/images/0123456789abcdef0123456789abcdef?token=bad.token"), env);
  assert.equal(response.status, 401);
});

test("health reports an unconfigured Cloudinary account without exposing secrets", async () => {
  const response = await worker.fetch(request("/api/health"), {
    IMAGEBRIDGE_API_TOKEN: TOKEN,
    CLOUDINARY_CLOUD_NAME: "demo"
  });
  const body = await response.json();
  assert.equal(body.configured, false);
  assert.equal(JSON.stringify(body).includes("secret-value"), false);
});
