# ImageBridge

**Upload once. Use anywhere.**

ImageBridge is a local-first image handoff tool for Windows, AI agents and compatible vision APIs. It combines a small desktop companion, a self-hosted temporary image service and an opt-in Agent Skill.

It does **not** bypass provider upload quotas, model limits, subscription restrictions or access controls.

## Components

- **ImageBridge Desktop:** Windows x64 app with a Liquid Glass-inspired interface, drag-and-drop, preview, temporary upload, copy URL, real image clipboard copy, tray icon and `Ctrl+Alt+I`.
- **ImageBridge Server:** Node.js 20+ service with no third-party runtime dependencies.
- **ImageBridge Skill:** Codex-compatible workflow with a bundled Node.js uploader script.
- **Web dashboard:** upload and history UI for local or token-protected deployments.

## The important distinction

- **Copy URL** creates a temporary link. A compatible vision API must pass it in an image input field such as OpenAI Responses `input_image.image_url`.
- **Copy image** places actual image data on the Windows clipboard. Paste with `Ctrl+V` into ChatGPT Web/Windows to create a normal image attachment.
- Pasting a URL as ordinary chat text is not the same as attaching an image.
- The desktop app does not replace ChatGPT's built-in **+** button and does not remove upload limits.

## Quick start — local Windows use

Requirements: Windows 10/11 x64 and Node.js 20+.

1. Download the latest successful `ImageBridge-Windows-x64` artifact from [GitHub Actions](https://github.com/ftrevino739-ctrl/ImageBridge/actions/workflows/build-windows.yml).
2. Extract the ZIP and run `ImageBridge.exe`.
3. Clone or download this repository.
4. In PowerShell, open the repository folder and run:

```powershell
node --version
npm test
npm start
```

5. Keep PowerShell open. Open `http://127.0.0.1:3000/api/health`; it should return JSON with `"ok": true`.
6. In ImageBridge Desktop, leave the server URL as `http://127.0.0.1:3000`.
7. Choose a non-sensitive PNG/JPEG, upload it, then test **Copiar imagen** and paste into ChatGPT with `Ctrl+V`.

The server binds to loopback by default and is not exposed to your local network.

## Agent Skill

The Skill lives in `.agents/skills/imagebridge/`. Open this repository as a Codex workspace, then invoke `$imagebridge` or ask Codex to use the ImageBridge skill. The skill only uploads when the user explicitly requests hosting/sharing.

For a direct CLI upload:

```powershell
$env:IMAGEBRIDGE_URL = "http://127.0.0.1:3000"
node .\.agents\skills\imagebridge\scripts\upload.mjs "C:\path\to\image.png"
```

For remote servers, set `IMAGEBRIDGE_API_TOKEN` in the environment before running the script.

## Remote hosting

Remote binding is deliberately blocked unless a strong API token is configured.

PowerShell example for a private test server:

```powershell
$env:HOST = "0.0.0.0"
$env:IMAGEBRIDGE_API_TOKEN = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$env:PORT = "3000"
npm start
```

Copy the generated token from your secure terminal environment into the **TOKEN API** field in ImageBridge Desktop or the web dashboard. Use HTTPS through a trusted reverse proxy. Never expose the service over plain public HTTP.

Use a persistent disk. The current JSON metadata store and local filesystem are designed for a single-process personal/small-team deployment, not multi-instance production.

## API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Public health/config status |
| POST | `/api/images` | Upload raw image bytes; bearer token required when configured |
| GET | `/api/images/:id?token=...` | Retrieve image bytes with the per-image token |
| DELETE | `/api/images/:id?token=...` | Delete image with the per-image token |
| GET | `/api/history` | List metadata; bearer token required when configured |

Supported signatures: JPEG, PNG, WEBP, GIF, AVIF and HEIC. Default maximum is 15 MB; default retention is 24 hours.

## Security

- Local-only binding by default: `127.0.0.1`.
- Binding to a non-loopback host requires `IMAGEBRIDGE_API_TOKEN` with at least 32 characters.
- Uploads are size-limited and checked against common image file signatures; server filenames are generated.
- Image URLs contain a high-entropy per-image access token. Treat them as passwords.
- Keep public deployments behind HTTPS, quotas, stronger durable rate limiting, content scanning/re-encoding, monitoring and abuse reporting.
- Do not upload sensitive images to servers you do not control.

## Tests

Run the built-in integration suite:

```bash
npm test
```

GitHub Actions runs the integration tests and publishes the Windows x64 executable artifact when project files change.

## Configuration

| Variable | Default | Description |
|---|---:|---|
| `PORT` | `3000` | HTTP port |
| `HOST` | `127.0.0.1` | Bind address; non-loopback requires API token |
| `MAX_UPLOAD_MB` | `15` | Maximum image size (1–100 MB) |
| `TTL_HOURS` | `24` | Retention period (1–720 hours) |
| `IMAGEBRIDGE_API_TOKEN` | empty | Required for non-loopback deployments |
| `IMAGEBRIDGE_DATA_DIR` | `./data` | Persistent storage directory |

## Research and feasibility

See [Research and architecture decisions](docs/RESEARCH-AND-ARCHITECTURE.md) for official platform documentation, prior art, compatibility boundaries and security assumptions.

## License

MIT
