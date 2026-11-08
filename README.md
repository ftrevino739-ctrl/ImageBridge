# ImageBridge Mod

**A visual file bridge for ChatGPT and Codex.**

ImageBridge consists of a browser extension for ChatGPT Web, a local/remote temporary-file server, and a native Agent Skill/plugin package for ChatGPT Desktop and Codex.

## What is integrated

- **ChatGPT Web (Chrome/Edge):** adds an ImageBridge button beside the composer using the browser extension.
- **ChatGPT Desktop app:** a repo-scoped local plugin marketplace exposes the ImageBridge plugin in the app's Plugins Directory. The plugin provides an opt-in skill, not a permanent button injected into the native composer.
- **Codex Desktop / CLI:** the same local plugin marketplace and skill provide the upload workflow. The skill can be invoked explicitly as `$imagebridge` in Codex.
- **Local server:** stores uploaded files and returns private, expiring URLs.

## Important platform limits

ImageBridge does **not** remove, reset, or bypass ChatGPT upload quotas, file-size limits, subscription restrictions, or safety controls. A hosted URL pasted as ordinary prompt text is not a native visual attachment. The browser extension attempts a normal native attachment using original bytes, subject to ChatGPT's own rules. The desktop plugin/skill can host files and return links; it cannot force the native ChatGPT or Codex composer to attach those bytes.

## Install in Chrome / Edge (ChatGPT Web)

1. Clone this repository.
2. Open `chrome://extensions` (Chrome) or `edge://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the repository's `extension` folder.
5. Pin ImageBridge if desired.
6. Configure the server URL in the extension popup.
7. Open or refresh `https://chatgpt.com`.

## Install in ChatGPT Desktop and Codex

Requirements: current ChatGPT desktop app / Codex client and Git installed.

1. Clone this repository to a permanent folder, for example `C:\\Users\\%USERNAME%\\ImageBridge`.
2. Open PowerShell in the repository folder.
3. Add the repo marketplace to Codex:
   ```powershell
   codex plugin marketplace add .
   ```
   If the command reports that Codex is not installed, install/update Codex CLI or use the ChatGPT desktop app's repo marketplace discovery.
4. Restart the ChatGPT desktop app.
5. Open **Plugins** in the sidebar, choose the **ImageBridge** local marketplace, and install **ImageBridge**.
6. In Codex Desktop, open the same repository as a trusted project. Open **Plugins** / **Sources**, find ImageBridge, and enable it. In Codex CLI, run `codex` and use `/plugins` to install/enable it.
7. Start a new chat/task and explicitly invoke `$imagebridge` (or select ImageBridge from the plugin/skill picker).

The skill is intentionally opt-in: it will not upload files during normal image analysis. The app plugin adds a reusable workflow, not an unsupported native composer button.

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
- Extension: visit ChatGPT Web and confirm the ImageBridge button appears.
- ChatGPT Desktop: confirm ImageBridge appears under the local Plugins marketplace and can be invoked in a new chat.
- Codex: confirm ImageBridge appears in `/plugins` and the `$imagebridge` skill is available.
- Test only with a non-sensitive sample image first.

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
