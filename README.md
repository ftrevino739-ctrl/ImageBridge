# ImageBridge

**Upload once. Use anywhere.**

ImageBridge is a self-hosted service and Windows companion for moving images between local workflows and compatible AI clients. It provides temporary, token-protected image URLs and a native clipboard workflow. It does **not** bypass provider upload quotas, model limits, or access controls.

## What works today

- Responsive Liquid Glass-inspired web dashboard.
- Node.js image server with a 15 MB default per-file limit and 24-hour default retention.
- Temporary token-protected image URLs.
- Windows x64 desktop companion with drag-and-drop, preview, upload, copy URL, copy image, tray icon, and `Ctrl+Alt+I` shortcut.
- Codex-compatible Agent Skill for explicitly requested image hosting workflows.
- GitHub Actions build for a self-contained Windows x64 executable.

## What is not implemented

- Replacing ChatGPT's built-in **+** button.
- Automatically injecting images into ChatGPT, Codex, or other apps.
- Making ChatGPT Web treat a pasted URL as a native image attachment.
- Bypassing subscription, model, or file-upload limits.

For ChatGPT Web/Windows, use **Copiar imagen** in the desktop app and paste with `Ctrl+V` to create a normal image attachment. A compatible vision API can use the temporary URL only when its request explicitly sends the URL as an image input.

## Run the server locally

Requires Node.js 20+.

```bash
npm start
```

Open `http://localhost:3000`. No third-party Node packages are required.

## Windows desktop app

Download the latest successful build from [GitHub Actions](https://github.com/ftrevino739-ctrl/ImageBridge/actions/workflows/build-windows.yml). Download the `ImageBridge-Windows-x64` artifact and extract it.

Detailed first-run steps: [Windows smoke test](docs/TESTING-WINDOWS.md).

## Agent Skill

The repository includes `.agents/skills/imagebridge/SKILL.md`. Codex can discover it when this repository is opened as a workspace. It is intentionally opt-in and only uploads an image when the user explicitly asks. The skill helps with the temporary-URL workflow; it does not replace the desktop app or attach images to the ChatGPT composer.

## API

- `POST /api/images`: raw image bytes; set `Content-Type` and optionally `X-File-Name`.
- `GET /api/images/:id?token=...`: retrieve image bytes (token required).
- `DELETE /api/images/:id?token=...`: delete image immediately.
- `GET /api/history`: active image metadata (no access tokens).
- `GET /api/health`: service status and configured limits.

Treat tokenized URLs like passwords.

## Deployment and security

The MVP stores files under `data/uploads` and metadata in `data/images.json`. Use a persistent disk. Before exposing the service publicly, add authentication, rate limiting, upload quotas, content scanning, HTTPS, and abuse monitoring. Keep the server local during initial testing and do not upload sensitive images to an untrusted host.

## Configuration

| Variable | Default | Description |
|---|---:|---|
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `MAX_UPLOAD_MB` | `15` | Maximum upload size |
| `TTL_HOURS` | `24` | Temporary retention period |

## License

MIT
