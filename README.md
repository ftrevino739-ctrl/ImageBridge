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
