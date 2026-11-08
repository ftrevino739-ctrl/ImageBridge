# ImageBridge Desktop (Windows MVP)

Este primer companion crea un ejecutable de Windows que se conecta al servidor ImageBridge existente.

## Qué incluye ahora

- Aplicación de bandeja del sistema.
- Ventana oscura de escritorio.
- Atajo global **Ctrl + Alt + I** para abrir el selector de imágenes.
- Sube JPG, PNG, WEBP, GIF, AVIF y HEIC a `POST /api/images`.
- Copia al portapapeles la URL temporal devuelta por el servidor.
- Permite configurar el servidor local o uno remoto HTTPS.

## Lo que todavía NO hace

Esta versión no reemplaza ni modifica el botón + de ChatGPT, ChatGPT Classic, Codex ni otras aplicaciones. Tampoco puede convertir una URL pegada como texto en un adjunto visual nativo. Eso requiere una integración compatible por aplicación; el cliente debe aceptar la imagen o descargar la URL. No elimina límites de cuenta ni mensajes de suscripción.

El atajo global es un primer flujo funcional independiente, no una inyección en procesos de terceros.

## Requisitos

- Windows 10/11 x64.
- .NET 8 SDK.
- Servidor ImageBridge iniciado y accesible.

## Ejecutar desde el código

Desde PowerShell, en la raíz del repositorio:

```powershell
dotnet run --project .\desktop\ImageBridge.Desktop\ImageBridge.Desktop.csproj
```

El campo de servidor inicia con `http://localhost:3000`. Para un servidor remoto, usa su URL HTTPS. También puedes definir `IMAGEBRIDGE_URL`.

## Crear ImageBridge.exe

```powershell
.\desktop\build-release.ps1
```

El ejecutable autocontenido se genera en:

`desktop\ImageBridge.Desktop\bin\Release\net8.0-windows\win-x64\publish\ImageBridge.exe`

## Siguiente fase

Implementar integraciones soportadas, empezando por clientes web mediante mecanismos oficiales/permitidos y un adaptador de API de visión. No inyectar DLL, parchear binarios ni interceptar tráfico privado de ChatGPT.
