---
name: imagebridge
description: Use ImageBridge to upload a local image to a configured ImageBridge server and return a temporary, token-protected image URL when the user explicitly asks to host, share, or bridge an image. Do not use it to bypass ChatGPT upload limits, and do not upload sensitive images or send images to public servers without explicit permission.
---

# ImageBridge skill

## Purpose

Bridge a local image file to an ImageBridge server. This skill is for workflows that need a temporary image URL. It does not create a native ChatGPT attachment and does not bypass model, plan, file-size, or upload limits.

## Before uploading

1. Confirm the user explicitly asked to upload, host, or share the image. Do not upload automatically just because an image is present in the workspace.
2. Use a local ImageBridge server by default: `http://localhost:3000`.
3. If the user configured another server, use that exact base URL. Do not guess a public server.
4. Never upload credentials, private keys, identity documents, medical images, intimate images, or other sensitive material unless the user explicitly confirms the destination and purpose.
5. Check the file exists, is an image, and is no larger than the server's configured limit (default 15 MB).

## Upload workflow

Use a shell tool available in the host environment. Detect MIME from the file, not from an untrusted filename. Supported MIME types are:

- `image/jpeg`
- `image/png`
- `image/webp`
- `image/gif`
- `image/avif`
- `image/heic`

Send the raw file bytes:

```bash
curl --fail-with-body -sS -X POST \
  -H "Content-Type: image/png" \
  -H "X-File-Name: example.png" \
  --data-binary @"/absolute/path/to/example.png" \
  "http://localhost:3000/api/images"
```

Replace the MIME type, filename, file path, and server URL with the actual values. On Windows PowerShell, use `curl.exe` rather than the `curl` alias.

## Validate and return

1. Parse the JSON response. A successful upload returns an `id`, relative `url`, `size`, and `expiresAt`.
2. Build the absolute URL by resolving the returned `url` against the configured server base URL.
3. Verify the URL with an HTTP GET before reporting success. Do not expose the tokenized URL in public logs or unrelated output.
4. Tell the user the expiration time and that anyone possessing the tokenized URL can access the image until it expires or is deleted.
5. Return the URL as a link only when the user asked for it.

## How the receiving AI can use it

A compatible vision API must pass the absolute URL as an image input field (for example, an API's image-URL input), not merely paste it as ordinary text. A normal ChatGPT conversation may not treat a pasted URL as an image attachment. For ChatGPT Web or the Windows app, use ImageBridge Desktop's **Copiar imagen** button and paste with Ctrl+V to create a native image attachment.

## Failure handling

- If `/api/health` fails, tell the user the server is unreachable and stop.
- If upload returns 413, the file exceeds the configured limit.
- If upload returns 415, the file type is unsupported.
- If the image URL returns 403 or 404, do not claim the image is accessible.
- Never retry repeatedly against an unavailable or public server.
- Never claim that an upload bypasses ChatGPT or model limits.
