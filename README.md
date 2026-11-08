# ImageBridge

**Upload once. Use anywhere.**

ImageBridge is a self-hosted service for uploading images and handing temporary, token-protected URLs to compatible AI clients, agents, and workflows. It does not bypass provider upload quotas, model limits, or access controls; the receiving integration must support fetching image URLs.

## MVP

- Liquid Glass responsive dashboard.
- Drag-and-drop and multi-image upload.
- JPEG, PNG, WEBP, GIF, AVIF and HEIC MIME acceptance.
- 15 MB default per-file limit (configurable).
- Random unguessable access tokens for each image.
- Private image URLs and manual deletion through the API.
- 24-hour automatic expiration and cleanup.
- Upload history (metadata only).

## Run locally

Requires Node.js 20+.

```bash
npm start
```

Open http://localhost:3000. Copy `.env.example` to `.env` and configure environment variables. No third-party packages are required.

## API

- `POST /api/images`: raw image bytes; set `Content-Type` to the image MIME type and optionally `X-File-Name` to the URL-encoded original filename.
- `GET /api/images/:id?token=...`: retrieve image bytes (token required).
- `DELETE /api/images/:id?token=...`: delete image immediately.
- `GET /api/history`: active image metadata (no access tokens).
- `GET /api/health`: service status and configured limits.

Upload success returns an ID, temporary URL, delete URL, size and expiration timestamps. Treat the tokenized URL like a password.

## Deployment and security

The MVP stores files under `data/uploads` and metadata in `data/images.json`. Use a persistent disk; ephemeral hosting filesystems lose uploads on restart or redeploy. For multiple instances, use shared object storage and a database.

Before exposing this service publicly, add authentication, rate limiting, upload quotas, content scanning, HTTPS and abuse monitoring. Do not place private or sensitive images on a public instance. HEIC is accepted by MIME type but is not converted in this MVP. A compatible AI integration must fetch the URL and separately confirm whether the provider retained the attachment before the temporary copy is deleted.

## Configuration

| Variable | Default | Description |
|---|---:|---|
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `MAX_UPLOAD_MB` | `15` | Maximum upload size |
| `TTL_HOURS` | `24` | Temporary retention period |

## License

MIT
