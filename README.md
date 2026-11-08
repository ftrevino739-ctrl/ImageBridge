# ImageBridge Mod

**A visual file bridge for ChatGPT Web and compatible AI workflows.**

ImageBridge includes a browser extension, a temporary-file server, and an optional plugin/Skill for ChatGPT Desktop and Codex.

## ChatGPT Web visual workflow

1. Click **✧ ImageBridge** beside the ChatGPT Web composer.
2. Select one or more supported images or documents.
3. ImageBridge uploads them to your configured server.
4. A thumbnail/file preview appears in the composer. There is no URL toast.
5. When you send your message, the extension adds the hosted URL to the submitted message payload. It then visually replaces the URL in your local chat view with an image/file preview.

This is a best-effort browser integration and depends on ChatGPT's current web composer DOM. OpenAI can change that interface, so test after extension or ChatGPT updates.

## Important: what ChatGPT actually receives

In this visual-link mode, the browser extension sends the **hosted URL as message text**, not the original image bytes as a native ChatGPT attachment. The preview shown in your browser is a local UI enhancement; it does not itself provide image pixels to the model.

- A local URL such as `http://127.0.0.1:3000` is reachable from your own PC, but not from OpenAI's cloud servers. The model cannot fetch that local image URL.
- To let a remote model potentially retrieve the file, configure a public HTTPS ImageBridge server with a persistent disk and authentication. The model still may not automatically open arbitrary links; ask it to open the link, and access depends on the model/tools available.
- For reliable visual analysis inside ChatGPT, use ChatGPT's normal native image attachment. ImageBridge does not bypass quotas, file-size limits, subscription restrictions, or safety controls.

## Platform support

- **ChatGPT Web in Chrome/Edge:** visual composer button, thumbnail preview, hidden-link submission, and sent-message preview.
- **ChatGPT Desktop app:** local plugin/Skill workflow. It does not inject the same button into the native ChatGPT composer.
- **Codex Desktop / CLI:** opt-in plugin/Skill workflow, invoked explicitly as `$imagebridge`.

The ChatGPT desktop app's plugin system supports reusable workflows, but it does not provide arbitrary injection of a custom button into the native chat composer. The browser extension runs on ChatGPT Web. Extensions supported by the desktop app's built-in browser apply to pages opened in that browser, not the app's native chat composer.

## Install in Chrome / Edge (ChatGPT Web)

1. Clone this repository.
2. Open `chrome://extensions` (Chrome) or `edge://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the repository's `extension` folder.
5. Pin ImageBridge if desired.
6. Configure the server URL in the extension popup.
7. Open or refresh `https://chatgpt.com`.

For local testing, use `http://127.0.0.1:3000`. Remember: local loopback URLs are not accessible to remote model servers.

## Install in ChatGPT Desktop and Codex

Requirements: current ChatGPT desktop app / Codex client and Git installed.

1. Clone this repository to a permanent folder, for example `C:\\Users\\%USERNAME%\\ImageBridge`.
2. Open PowerShell in the repository folder.
3. Add the repo marketplace to Codex:
   ```powershell
   codex plugin marketplace add .
   ```
4. Restart ChatGPT Desktop.
5. Open **Plugins**, choose the **ImageBridge** local marketplace, and install **ImageBridge**.
6. In Codex Desktop, open the repository as a trusted project. Open **Plugins** / **Sources**, find ImageBridge, and enable it. In Codex CLI, use `/plugins`.
7. Invoke `$imagebridge` when you explicitly want to host a local file.

The plugin/Skill uploads files when explicitly requested; it does not create a visual composer button in the native app.

## Start the local server

Requirements: Node.js 20+.

```powershell
npm install
npm test
npm start
```

Keep the terminal open. Verify `http://127.0.0.1:3000/api/health` returns `{"ok":true,...}`. Configure the browser extension with `http://127.0.0.1:3000`.

The local server binds to loopback by default and is reachable only from this PC.

## Remote server

For remote deployment, use HTTPS, persistent storage, and a strong token (at least 32 characters):

```powershell
$env:HOST = "0.0.0.0"
$env:IMAGEBRIDGE_API_TOKEN = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$env:PORT = "3000"
npm start
```

Save the token securely and configure it in the extension. Never publish it in a repository, chat, screenshot, or issue. Filesystem/JSON storage is single-process and not suitable for multi-instance scaling without shared storage/database.

## Verify

- Server: `Invoke-RestMethod http://127.0.0.1:3000/api/health`
- Extension: choose a sample image and confirm the composer preview appears without a URL notification.
- Send a test message and confirm the link is submitted and then locally rendered as a preview.
- Use a public HTTPS server only when a remote model needs to retrieve the file.
- Test with a non-sensitive sample image first.

## Supported files

JPEG, PNG, WEBP, GIF, AVIF, HEIC, PDF, TXT, Markdown, CSV, JSON, RTF, DOCX, XLSX and PPTX. Default max upload: 15 MB. Default retention: 24 hours.

## Security

- Local-only bind by default: `127.0.0.1`.
- Public binding requires `IMAGEBRIDGE_API_TOKEN` with at least 32 characters.
- Per-file URLs contain bearer tokens; anyone possessing a URL can access the file until expiration/deletion.
- Never upload sensitive images or documents to servers you do not control.
- Use HTTPS for remote servers.

## License

MIT
