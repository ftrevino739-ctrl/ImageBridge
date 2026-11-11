# ImageBridge

**A companion file bridge for AI workflows.**

ImageBridge currently contains:
- A Chrome/Edge extension that adds `✧ ImageBridge` to ChatGPT Web's **+** menu.
- A local Node.js file server for private/local testing.
- A Cloudflare Worker backend that stores files in Cloudinary and serves short-lived, authenticated links.
- A Codex/ChatGPT Skill integration.

The Windows Desktop application is a planned product component and is **not included in the current release yet**. It will be built as a real standalone manager, not as a patcher for ChatGPT.

## How the ChatGPT Web extension works

1. Open ChatGPT Web in Chrome or Edge.
2. Click **+ → ✧ ImageBridge**.
3. Select images or documents from Windows.
4. ImageBridge uploads them and shows preview cards in the composer.
5. When you send, the extension adds a temporary ImageBridge URL to the message and keeps a local preview in the sent message.

**Important limitation:** the hosted-link workflow sends a URL as message text. A browser preview is not a native ChatGPT attachment and does not itself transmit the file's bytes to the model. Whether the model can retrieve a URL depends on the platform's tools and access rules. For guaranteed image input, use ChatGPT's normal native image attachment. ImageBridge does not bypass model quotas, subscription restrictions, or file-size limits.

The extension uses observed ChatGPT Web DOM labels and selectors, not an official extension API. ChatGPT may change its UI and require compatibility updates.

## Cloudflare Worker + Cloudinary (no R2 bucket)

The Worker is the HTTPS API. Cloudinary stores the uploaded objects. Files are uploaded as **authenticated** Cloudinary assets; the Worker creates a signed delivery URL internally and proxies the bytes through an expiring ImageBridge URL. The Cloudinary delivery URL is not returned to the browser.

Default settings:
- Maximum upload: 15 MB
- Link lifetime: 24 hours
- Supported formats: JPEG, PNG, WEBP, GIF, AVIF, HEIC, PDF, TXT, Markdown, CSV, JSON, RTF, DOCX, XLSX and PPTX
- Hourly cleanup of expired Cloudinary assets
- Upload API protected by a 32+ character ImageBridge bearer token

Cloudinary raw uploads are used for documents; image uploads are used for images. Cloudinary's plan limits, supported file types, and credit usage apply. Check the current [Cloudinary pricing](https://cloudinary.com/pricing) before relying on the free allowance. Cloudflare Workers usage limits also apply.

### Configure secrets

The repository already contains the Cloudinary cloud name and API key in `wrangler.jsonc`. The API secret must remain private and must **never** be committed to GitHub or entered into the browser extension.

From the repository folder in PowerShell:

1. Sign in to Cloudflare:
   `npx wrangler login`
2. Create a strong ImageBridge API token:
   ```powershell
   $token = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()
   $token
   ```
3. Save the Cloudinary API secret as a Worker secret:
   `npx wrangler secret put CLOUDINARY_API_SECRET`
4. Save the generated ImageBridge token:
   `npx wrangler secret put IMAGEBRIDGE_API_TOKEN`
5. Deploy:
   `npx wrangler deploy`
6. Open `https://YOUR-WORKER.workers.dev/api/health`. Confirm `storage: "Cloudinary"` and `configured: true`.
7. Open the ImageBridge extension settings. Set the Worker URL and the same ImageBridge token.

Do not paste either secret into a chat, issue, commit, or source file. The API secret belongs only in the Worker secret store. If Cloudflare asks for billing activation or a payment card, stop; do not add a card just to continue this setup.

Cloudinary API references:
- [Upload API](https://cloudinary.com/documentation/image_upload_api_reference)
- [Authentication signatures](https://cloudinary.com/documentation/authentication_signatures)
- [Authenticated delivery URL signatures](https://cloudinary.com/documentation/delivery_url_signatures)
- [Asset deletion](https://cloudinary.com/documentation/delete_assets)

## Local server (optional)

Requires Node.js 20+.

```powershell
npm install
npm test
npm start
```

The local server binds to `127.0.0.1:3000` by default. Check `http://127.0.0.1:3000/api/health`. It stores files on the local disk and is only reachable from your computer.

## Install the browser extension

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this repository's `extension` folder.
4. Open `https://chatgpt.com` in the same browser profile.
5. Use **+ → ✧ ImageBridge**.

The toolbar icon opens extension settings; it is not the file picker.

## Windows Desktop application

The planned ImageBridge Desktop app will be an independent Windows application for file management, upload history, storage status, integrations, settings, and updates. It will use the same ImageBridge API and will not patch ChatGPT binaries or inject into its process. It is not part of this branch yet.

## Security

- Cloudinary assets use authenticated delivery; direct Cloudinary delivery requires a signature.
- ImageBridge links are signed, expire, and are validated by the Worker.
- Anyone who obtains a valid ImageBridge link can access that file until its expiry.
- Never upload sensitive files unless you trust the Cloudinary account and deployment.
- Rotate secrets immediately if they are exposed.
