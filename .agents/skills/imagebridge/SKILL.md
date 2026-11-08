---
name: imagebridge
description: Use ImageBridge only when the user explicitly asks to host, share, or bridge a local image or document and return a temporary URL for a compatible vision API or workflow. Never claim to bypass ChatGPT or provider upload limits.
---

# ImageBridge Skill

Use this skill only when the user explicitly requests file hosting or a temporary share URL. Do not upload automatically during ordinary image analysis.

## Server

- Default local server: `http://127.0.0.1:3000`.
- Respect a user-configured `IMAGEBRIDGE_URL`.
- Remote servers require `IMAGEBRIDGE_API_TOKEN` in the environment.
- Never invent a public server or ask the user to paste secrets into chat.

## Privacy

Do not upload sensitive images, identity documents, credentials, private keys, medical/intimate content, or confidential work without explicit confirmation of destination and purpose. Tokenized URLs are bearer secrets.

## Upload

Use Node.js 20+ and the bundled script:

```bash
node scripts/upload.mjs "/absolute/path/to/image.png"
```

The script checks server health, supported file signature and size, uploads the bytes, verifies the URL, and reports expiration.

## Model compatibility

A compatible vision API must receive the URL in its actual image-input field. A URL pasted as ordinary text is not a visual attachment. The ImageBridge browser mod attempts to attach the original local image through ChatGPT's native attachment interface, subject to ChatGPT's normal limits. ImageBridge cannot remove quotas, bypass subscription restrictions, or force ChatGPT to fetch external URLs.

## Report honestly

State expiration and that anyone with the tokenized URL can access the image until it expires or is deleted.
