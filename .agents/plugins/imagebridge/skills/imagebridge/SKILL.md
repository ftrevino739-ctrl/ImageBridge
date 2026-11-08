---
name: imagebridge
description: Use ImageBridge only when the user explicitly asks to host, share, or bridge a local image or document and return a temporary URL for a compatible vision API or workflow. Never claim to bypass ChatGPT or provider upload limits.
---

# ImageBridge

Use only after an explicit request to host/share a local file. Do not upload automatically during ordinary image analysis.

## Setup
- The ImageBridge server must already be running.
- Default local endpoint: `http://127.0.0.1:3000`.
- Set `IMAGEBRIDGE_URL` to a configured server when needed.
- Remote servers require HTTPS and `IMAGEBRIDGE_API_TOKEN`.
- Never ask the user to paste secrets into chat.

## Upload
Run the bundled script with a local file path:
```powershell
node "<plugin-root>/skills/imagebridge/scripts/upload.mjs" "C:\path\to\image.png"
```
Node.js 20+ is required.

## Privacy
Never upload identity documents, credentials, private keys, medical/intimate content, or confidential work without explicit confirmation of destination and purpose. Tokenized URLs are bearer secrets.

## Model compatibility and limits
A URL pasted as ordinary prompt text is not a native visual attachment. Compatible vision APIs must receive the URL in their actual image-input field. The ChatGPT browser extension attempts a normal native attachment using original file bytes and remains subject to ChatGPT's standard limits. ImageBridge cannot bypass quotas, file-size limits, subscription restrictions, or safety controls.

Report expiration and explain that anyone possessing a tokenized URL can access the file until it expires or is deleted.
