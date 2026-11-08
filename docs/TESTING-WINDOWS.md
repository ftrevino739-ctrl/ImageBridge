# ImageBridge — Windows smoke test

This is the first end-to-end test for the Windows desktop MVP. It verifies the app and local server; it does not yet test automatic attachment insertion into ChatGPT.

## 1. Download the Windows build

1. Open the [latest successful Windows build](https://github.com/ftrevino739-ctrl/ImageBridge/actions/runs/42483932854).
2. Under **Artifacts**, download **ImageBridge-Windows-x64**.
3. Extract the ZIP to a normal folder such as `%USERPROFILE%\\Downloads\\ImageBridge`.
4. Run `ImageBridge.exe`.

The build is self-contained for Windows x64, so a separate .NET installation should not be needed.

## 2. Start the local image server

Install Node.js 20 or newer if it is not installed. In PowerShell, open the cloned ImageBridge repository folder and run:

```powershell
node --version
npm start
```

Keep that PowerShell window open. The server should report that it is listening on port 3000.

Open `http://localhost:3000/api/health` in a browser. Expected: JSON containing `"ok":true`.

## 3. Connect the desktop app

1. In ImageBridge, leave the server field as `http://localhost:3000`.
2. Click **Comprobar conexión**.
3. Confirm it says **Servidor conectado**.
4. Click **Elegir imagen** and select a non-sensitive PNG or JPG under 15 MB.
5. Confirm the preview and filename appear.
6. Click **Subir a ImageBridge**.
7. Confirm **Subida correcta**, and that a temporary URL appears.
8. Open that URL in a browser. The image should display.

## 4. Test native ChatGPT attachment

1. Return to ImageBridge and click **Copiar imagen**.
2. Open ChatGPT Web or the Windows app.
3. Click the message composer and press **Ctrl+V**.
4. Confirm ChatGPT displays an image attachment preview before sending.
5. Send a harmless prompt such as: `Describe los objetos visibles en esta imagen.`

This tests a real image attachment through the clipboard. It does not make ChatGPT consume the ImageBridge URL and does not bypass account upload limits.

## 5. Test the global shortcut and tray

- Press **Ctrl+Alt+I**. ImageBridge should come to the foreground and open the image picker.
- Close or minimize the window and confirm the tray icon remains available.
- Use the tray icon to reopen the app.

## 6. Report the result

If something fails, report the exact step, the full error text, and whether `/api/health` opens. Do not publish tokenized image URLs in screenshots or public issues.

## Known MVP limitations

- The desktop app does not replace ChatGPT's built-in **+** button.
- It does not automatically inject an image into Codex or other applications.
- A pasted URL is not equivalent to a native visual attachment.
- The current upload endpoint is not production-hardened for public anonymous use. Keep the server local during testing. Before public deployment, add authentication, quotas, rate limiting, content scanning, HTTPS, persistent storage, and abuse monitoring.
