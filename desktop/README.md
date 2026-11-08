# ImageBridge Desktop

ImageBridge Desktop is a small Windows companion for the ImageBridge image-hosting service. The goal is one simple workflow, not a complicated control panel.

## Current MVP

- Dark Liquid Glass-inspired dashboard with a Windows 11 Mica backdrop where available.
- Drag-and-drop image selection and a preview.
- Server connection check and remembered server URL.
- Upload to the existing ImageBridge API; copy the temporary HTTPS URL.
- Copy the actual image to the Windows clipboard so it can be pasted as a native image attachment into a chat composer that supports image paste.
- Tray icon and global `Ctrl + Alt + I` shortcut.

## Important distinction: URL versus native attachment

The **Copy URL** action gives a URL. A model only receives image pixels from that URL if the receiving integration sends it as an image input (for example, an API request with an `input_image.image_url` field) or the receiving client explicitly downloads it. Pasting a URL as ordinary chat text does not guarantee visual analysis.

The **Copy image** action puts image data on the clipboard. Pasting it into ChatGPT's composer creates a normal image attachment, but this sends the image bytes through the client rather than making the model read the ImageBridge URL. This is intentionally an honest fallback; it does not bypass plan limits or upload restrictions.

## Integrations and feasibility

| Client | Feasibility | Current status |
|---|---|---|
| ChatGPT Web in Chrome/Edge | UI automation can stage a real image attachment; URL-as-image requires an API integration, not just a DOM preview | Clipboard image workflow available |
| ChatGPT Windows app / Classic | No supported public plugin point to replace the built-in + button globally; clipboard paste is the least invasive test | Clipboard image workflow available |
| Codex CLI | A local image path can be included in a prompt where the CLI supports image/file input; URL support depends on the specific client workflow | Not yet automated |
| Codex desktop | Depends on the desktop client's supported attachment/tool interfaces; don't assume an MCP image or markdown URL renders as an attachment | Not yet automated |
| Other API clients | Vision APIs that accept remote image URLs can consume the ImageBridge URL as an image input | Adapter design documented, not yet implemented |

## Existing projects and prior art

- [Clippy](https://github.com/Alfroud/Clippy) is a close Windows precedent: a native tray utility with global hotkeys and Windows UI Automation that can add a captured screenshot to an existing ChatGPT draft in Chrome. It demonstrates that desktop-to-chat attachment automation is feasible, but it pastes a real image rather than replacing ChatGPT's upload transport with a URL.
- [chatgpt-clipboard-upload](https://github.com/dev-newb/chatgpt-clipboard-upload) demonstrates staged attachment automation for a Codex in-app browser using clipboard paste and attachment-card checks.
- [ShareX](https://getsharex.com/) demonstrates the separate upload-and-copy-link workflow for images and files.

ImageBridge's differentiator should be a simple bridge between temporary hosted images, native desktop clipboard attachment, and API clients that explicitly accept image URLs—not a claim that it can remove ChatGPT plan restrictions.

## Build

Requires Windows 10/11 x64 and the .NET 8 SDK.

```powershell
dotnet run --project .\desktop\ImageBridge.Desktop\ImageBridge.Desktop.csproj
```

Create a self-contained single-file Windows executable:

```powershell
.\desktop\build-release.ps1
```

The GitHub Actions workflow also builds a Windows x64 artifact on pushes to `desktop/**`.

## Setup

1. Start the ImageBridge server with `npm start`.
2. Start ImageBridge Desktop.
3. Keep `http://localhost:3000` if the server runs on this PC, or enter your public HTTPS server URL.
4. Drop an image into the preview area.
5. Choose **Subir a ImageBridge** to upload and copy its URL.
6. Choose **Copiar imagen** if you want to paste a native image attachment into a chat composer.

The server must use persistent storage and HTTPS before it is exposed publicly. Tokenized image URLs are private credentials; do not share them publicly.
