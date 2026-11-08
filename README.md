# ImageBridge Mod

**A visual image bridge for ChatGPT and compatible AI workflows.**

ImageBridge is now a browser extension + temporary image server + optional Codex Skill. The old standalone Windows desktop application has been removed.

## What the Mod does

- Adds an **ImageBridge** button to ChatGPT Web's composer.
- Lets you choose supported images and documents without opening a separate desktop app.
- Uploads selected images to your configured ImageBridge server and creates private, expiring URLs.
- Attempts to attach the original file to ChatGPT through its native file input, so the model receives actual image bytes when ChatGPT accepts the attachment.
- Shows/copies the hosted URL as a separate shareable reference.
- Provides an options popup for the server URL and API token.

## Important platform limit

ImageBridge **does not remove, reset, or bypass ChatGPT upload quotas, file-size limits, subscription restrictions, or safety controls**. The browser mod cannot force ChatGPT's model to fetch an arbitrary URL just because it appears in the conversation. A hosted URL is a link, not a native visual attachment.

For ChatGPT Web, the mod attempts a normal native attachment using the original local file. This remains subject to ChatGPT's normal upload rules. The hosted URL is useful for sharing and for compatible APIs/agents that explicitly accept image URLs. If ChatGPT's native attachment is rejected, the URL alone is not guaranteed to be visible to the model.

## Install in Chrome / Edge

1. Download or clone this repository.
2. Open `chrome://extensions` (Chrome) or `edge://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select the repository's `extension` folder.
6. Open the ImageBridge extension's **Details** and pin it if desired.
7. Click its toolbar icon, set your ImageBridge server URL and optional API token, then save.
8. Open or refresh `https://chatgpt.com`. The ImageBridge button appears near the chat composer.

The extension supports HTTPS remote servers and local loopback development servers. Do not use public HTTP for a remote server.

## Start a local server

Requirements: Node.js 20+.

```powershell
git clone https://github.com/ftrevino739-ctrl/ImageBridge.git
cd ImageBridge
npm test
npm start
```

Keep PowerShell open. Verify `http://127.0.0.1:3000/api/health` returns `{"ok":true,...}`. Configure the extension with `http://127.0.0.1:3000`.

The local server is private to your PC by default. Other people and devices cannot reach it.

## Remote server

For a remote deployment, use HTTPS, a persistent disk, and a strong API token (at least 32 characters). Example:

```powershell
$env:HOST = "0.0.0.0"
$env:IMAGEBRIDGE_API_TOKEN = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$env:PORT = "3000"
npm start
```

Save the token securely and enter it in the extension popup. Never publish the token in a repository, chat, screenshot, or issue. Current filesystem/JSON storage is single-process and is not suitable for multi-instance scaling without shared storage/database.

## Codex Skill and CLI

The opt-in Skill remains in `.agents/skills/imagebridge/`. It uploads only when explicitly requested. CLI:

```powershell
$env:IMAGEBRIDGE_URL = "http://127.0.0.1:3000"
node .\.agents\skills\imagebridge\scripts\upload.mjs "C:\path\to\image.png"
```

Compatible vision APIs must pass the resulting URL in their actual image-input field (for example, an image URL input), not as ordinary prompt text.

## Server API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Health and configuration |
| POST | `/api/images` | Upload image bytes |
| GET | `/api/images/:id?token=...` | Retrieve an image |
| DELETE | `/api/images/:id?token=...` | Delete an image |
| GET | `/api/history` | List upload metadata |

Supported: JPEG, PNG, WEBP, GIF, AVIF, HEIC, PDF, TXT, Markdown, CSV, JSON, RTF, DOCX, XLSX and PPTX. Default max upload: 15 MB. Default retention: 24 hours.

## Security

- Local-only bind by default: `127.0.0.1`.
- Public binding requires `IMAGEBRIDGE_API_TOKEN` with at least 32 characters.
- Per-image URLs contain bearer tokens; anyone possessing a URL can access that image until expiration/deletion.
- Do not upload sensitive images to servers you do not control.
- Use HTTPS for remote servers and persistent storage.

## Tests

```bash
npm test
```

GitHub Actions validates the server/extension scripts and runs the integration suite.

## License

MIT
