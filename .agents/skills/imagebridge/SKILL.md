---
name: imagebridge
description: Use ImageBridge when the user explicitly asks to upload, host, share, or bridge a local image and return a temporary image URL for a compatible vision API or workflow. Do not trigger for ordinary image analysis, do not upload automatically, and never claim to bypass ChatGPT or provider upload limits.
---

# ImageBridge

Use this skill only when the user explicitly requests image hosting or a temporary share URL. For ordinary ChatGPT image understanding, attach the original image directly instead.

## 1. Resolve the server

- Default local server: `http://127.0.0.1:3000`.
- If the user configured a different server, use that exact URL via `IMAGEBRIDGE_URL`.
- Never invent or silently choose a public upload server.
- If the server is remote, require the user's configured token in `IMAGEBRIDGE_API_TOKEN`. Do not ask the user to paste secrets into chat; use a secure environment variable or credential store.

## 2. Protect the user's data

- Do not upload merely because an image exists in the workspace.
- Do not upload identity documents, credentials, private keys, medical or intimate images, or other sensitive content without explicit confirmation of both destination and purpose.
- Check that the file is a real supported image and within the server's advertised size limit.
- Tokenized image URLs are bearer secrets: share them only with the intended recipient and do not place them in logs, public issues, or unrelated output.

## 3. Upload with the bundled script

Use Node.js 20+; the script has no third-party dependencies. Resolve the bundled script path relative to this skill's directory and run:

```bash
node scripts/upload.mjs "/absolute/path/to/image.png"
```

If running from a different working directory, use the absolute path to the bundled `scripts/upload.mjs`.

Environment variables:
- `IMAGEBRIDGE_URL`: server base URL; defaults to `http://127.0.0.1:3000`.
- `IMAGEBRIDGE_API_TOKEN`: bearer token when the server has authentication enabled.

The script checks server health, file size, extension and file signature, uploads raw bytes, verifies the resulting URL with an HTTP GET, and prints the temporary URL and expiration time. If any check fails, stop and report the actual error; do not repeatedly retry.

## 4. How the receiving AI consumes the image

A compatible vision API must pass the absolute URL in its image input field (for example, OpenAI Responses API `input_image.image_url`). Merely pasting the URL as ordinary chat text is not equivalent to an image attachment.

For ChatGPT Web or the Windows app, use ImageBridge Desktop's **Copiar imagen** button and paste with Ctrl+V. This places the actual image bytes on the clipboard so ChatGPT can create a native attachment, subject to its normal limits.

## 5. Report honestly

Return the URL only when requested. State its expiration time and explain that anyone who has the tokenized URL can access it until it expires or is deleted. Never describe ImageBridge as unlimited uploads, a ChatGPT limit bypass, or a way to evade provider controls.
