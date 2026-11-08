const DEFAULTS = { serverUrl: "http://127.0.0.1:3000", apiToken: "" };

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "IMAGEBRIDGE_CONFIG") {
    chrome.storage.local.get(DEFAULTS).then(sendResponse);
    return true;
  }
  if (message?.type === "IMAGEBRIDGE_UPLOAD") {
    upload(message.file).then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});

async function upload(file) {
  const config = await chrome.storage.local.get(DEFAULTS);
  const base = String(config.serverUrl || "").replace(/\/+$/, "");
  let parsed;
  try { parsed = new URL(base); } catch { throw new Error("Server URL is invalid."); }
  const local = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) {
    throw new Error("Remote ImageBridge servers must use HTTPS.");
  }
  if (!file?.data || !file?.name || !file?.type) throw new Error("Missing image data.");
  const binary = atob(file.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const headers = { "Content-Type": file.type, "X-File-Name": encodeURIComponent(file.name) };
  if (config.apiToken) headers.Authorization = "Bearer " + config.apiToken;
  const response = await fetch(base + "/api/images", { method: "POST", headers, body: bytes });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "ImageBridge upload failed (" + response.status + ").");
  return { ok: true, ...data, url: new URL(data.url, base).href };
}
