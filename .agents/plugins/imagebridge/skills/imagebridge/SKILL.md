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
The ChatGPT Web mod can display a visual preview in the browser while submitting the hosted URL as message text. The preview itself is not sent to the model as image pixels. A local URL such as 127.0.0.1 cannot be fetched by remote model servers. Use a public HTTPS endpoint only when the receiving model/tool can retrieve remote files. Even then, a URL pasted into a prompt is not guaranteed to be opened or analyzed automatically.

ImageBridge cannot bypass quotas, file-size limits, subscription restrictions, or safety controls. Report expiration and explain that anyone possessing a tokenized URL can access the file until it expires or is deleted.
