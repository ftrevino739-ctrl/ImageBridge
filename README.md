# ImageBridge Mod

**An inline hosted-file option for ChatGPT Web.**

ImageBridge consists of a browser extension, a local or remote temporary-file server, and an optional plugin/Skill for compatible ChatGPT and Codex workflows.

## ChatGPT Web integration

1. Open the ChatGPT composer and click its **+** button (official menu label: **Add files and more**).
2. The menu contains the normal **Add photos & files** option plus **✧ ImageBridge**.
3. Choose **ImageBridge** to select one or more files.
4. ImageBridge uploads files to your configured server and displays thumbnail/file cards in the composer. There is no URL notification and no "Ready to send" status label.
5. Send the message. The pending cards disappear from the composer; the extension submits the hosted URL as message text and locally renders a thumbnail/file card in the sent message.

The menu integration uses observed ChatGPT web UI selectors and accessible labels. The page's private DOM can change, so this is not an official ChatGPT extension API and may need updating when ChatGPT changes its interface.

## What the model receives

In this hosted-link mode, ChatGPT receives the **hosted URL as prompt text**, not original image bytes as a native attachment. The preview is a browser-side display enhancement; it does not send the image pixels to the model.

- A local URL such as `http://127.0.0.1:3000` is reachable by the browser on your PC, but not by OpenAI's remote model servers.
- For a remote model to retrieve a file, configure a public HTTPS ImageBridge server with a persistent disk. Even then, the model may not automatically fetch an arbitrary URL; it depends on its tools and access rules.
- For guaranteed visual input, use ChatGPT's ordinary native image attachment.
- ImageBridge cannot bypass quotas, file-size limits, subscription restrictions, or safety controls.

## ChatGPT Desktop app

The official desktop app has a built-in browser. OpenAI says it supports extensions, but its public instructions do not describe a guaranteed install flow for an arbitrary unpacked extension. Even when an extension is available in that browser, it modifies the browser page, not the app's native chat composer. The app plugin/Skill workflow also does not add a custom button to that native composer.

We do not patch ChatGPT's installed application files or inject code into its process. That approach is unsupported, can break when the app updates, and can compromise its signed installation. A future Windows `.exe` should be a companion installer/manager for the extension and server, not a binary patcher.

## Install in Chrome / Edge

1. Clone this repository.
2. Open `chrome://extensions` or `edge://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select this repository's `extension` folder.
5. Open or refresh `https://chatgpt.com`.
6. Click **+**. Look for **✧ ImageBridge** beneath **Add photos & files**.

Configure the popup with `http://127.0.0.1:3000` for local testing.

## Server setup

Requirements: Node.js 20+.

```powershell
npm install
npm test
npm start
```

Keep the terminal open. Verify `http://127.0.0.1:3000/api/health`.

The server binds to `127.0.0.1` by default and is reachable only from your PC. Remote deployment requires HTTPS, persistent storage, and a strong `IMAGEBRIDGE_API_TOKEN` of at least 32 characters. Do not publish bearer URLs or tokens.

## ChatGPT Desktop and Codex plugin

The optional local plugin/Skill can upload files when explicitly requested. Use the repository marketplace and `$imagebridge` Skill as described in the plugin setup documentation. This is not a native composer modification.


## Recommended remote host: Cloudflare Workers + R2

For ImageBridge, use Cloudflare Workers + R2 rather than a free Node host. R2 stores files; a Worker provides the HTTPS upload/retrieval API. The bucket remains private and individual files are retrieved through random, expiring bearer URLs.

Current published free allowances: R2 Standard includes 10 GB-month storage, 1 million Class A operations and 10 million Class B operations per month, with no egress fee. Workers Free includes 100,000 requests/day and 10 ms CPU time per invocation. Usage beyond included allowances may be billed; check current pricing and account requirements.

### Deploy

Requirements: a Cloudflare account, Node.js 20+, and Wrangler.

1. In PowerShell, open the ImageBridge repository and sign in:
   `npx wrangler login`
2. Create the storage bucket:
   `npx wrangler r2 bucket create imagebridge-files`
3. Generate a 32-byte upload token:
   ```powershell
   $token = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()
   $token
   ```
4. Save that exact token as a Worker secret (Wrangler will ask you to paste it):
   `npx wrangler secret put IMAGEBRIDGE_API_TOKEN`
5. Deploy:
   `npx wrangler deploy`
6. Copy the public `workers.dev` URL printed by Wrangler, for example `https://imagebridge-storage.<account>.workers.dev`.
7. Click the ImageBridge toolbar icon. Enter that URL as the server and paste the same token into the token field. Save.
8. Check `https://<your-worker-host>/api/health`; it should return `ok: true`, `storage: R2`, and `authentication: true`.

The Worker validates supported file signatures, requires an upload token, stores files in R2, creates per-file access tokens, expires links after 24 hours, and cleans expired objects hourly. Anyone who gets a file URL can access that file until expiry.

## Local server (optional)

Run `npm install`, `npm test`, and `npm start`. Keep the terminal open. Configure `http://127.0.0.1:3000` with an empty token. A loopback URL is only reachable from your own computer, not OpenAI's remote servers.

## Why clicking the extension icon opens settings

The toolbar icon is Chrome's extension action. Its `default_popup` is intentionally the settings panel for the server URL and upload token. It is not the file picker. To select a file, open ChatGPT Web and choose **+ → ✧ ImageBridge**.

## Missing ImageBridge option in the + menu

1. Test in `https://chatgpt.com` using the same Chrome/Edge profile where the extension is installed.
2. Open `chrome://extensions` (or `edge://extensions`), confirm ImageBridge is enabled, and click Reload.
3. In extension Details, allow access to `chatgpt.com`.
4. Reload ChatGPT with `Ctrl+Shift+R`.
5. Open DevTools Console and look for `[ImageBridge] Mod loaded on` and `[ImageBridge] Added ImageBridge to ChatGPT's + menu.`
6. If the first log appears but the second does not, the current ChatGPT menu markup or language differs; capture the console output.

## ChatGPT Desktop app and a Windows EXE

OpenAI's current documentation says the ChatGPT desktop app's built-in browser supports extensions, but the public setup guide does not guarantee installation of every unpacked Chrome extension. The extension changes a web page, not the app's native chat composer. A Windows EXE is a good idea as an installer/updater/manager: it can download signed releases, install/update the extension, configure the server, and manage the local service. It should not patch ChatGPT's installed binaries or inject into its process; that is fragile and can break on app updates.

Cloudflare pricing/limits can change. R2's free allowance is not unlimited hosting, and billing details may be required for some account features.

## Supported files

JPEG, PNG, WEBP, GIF, AVIF, HEIC, PDF, TXT, Markdown, CSV, JSON, RTF, DOCX, XLSX and PPTX. Default maximum upload: 15 MB. Default retention: 24 hours.

## Security

- Local-only server binding by default.
- Public binding requires a strong bearer token.
- Anyone with a per-file URL can access that file until expiration or deletion.
- Never upload sensitive files to servers you do not control.
- Use HTTPS for remote servers.

## License

MIT
