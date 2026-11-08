# ImageBridge — prueba completa en Windows

Esta guía comprueba el servidor, la app de escritorio, el portapapeles y la Skill. Usa una imagen de prueba no sensible.

## 1. Descargar ImageBridge Desktop

1. Abre [Build ImageBridge for Windows en GitHub Actions](https://github.com/ftrevino739-ctrl/ImageBridge/actions/workflows/build-windows.yml).
2. Entra en la ejecución más reciente que tenga resultado **Success**.
3. En **Artifacts**, descarga `ImageBridge-Windows-x64`.
4. Extrae el ZIP y ejecuta `ImageBridge.exe`.

Es un ejecutable autocontenido para Windows x64.

## 2. Descargar y arrancar el servidor local

Instala Node.js 20 o posterior. Descarga el repositorio y abre PowerShell en su carpeta:

```powershell
git clone https://github.com/ftrevino739-ctrl/ImageBridge.git
cd ImageBridge
node --version
npm test
npm start
```

El servidor local se enlaza solo a `127.0.0.1`. Deja PowerShell abierto.

Abre `http://127.0.0.1:3000/api/health`. La respuesta debe incluir `"ok": true` y `"authentication": false`.

## 3. Probar la app

1. Abre ImageBridge Desktop.
2. Deja `http://127.0.0.1:3000` como servidor.
3. Pulsa **Comprobar conexión** y confirma **Servidor conectado**.
4. Arrastra una imagen PNG o JPG menor de 15 MB.
5. Comprueba la vista previa y el nombre.
6. Pulsa **Subir a ImageBridge**.
7. Abre la URL temporal que aparece y verifica que se ve la imagen.
8. Pulsa **Copiar URL** y pégala en el Bloc de notas.
9. Pulsa **Copiar imagen**, abre ChatGPT, haz clic en el compositor y presiona `Ctrl+V`.
10. Confirma que ChatGPT muestra una tarjeta/miniatura de imagen antes de enviar. Envía: `Describe los objetos visibles en esta imagen.`

La URL y el adjunto son dos mecanismos distintos: el paso 9 pega los bytes reales de la imagen, no la URL.

## 4. Probar atajo y bandeja

- Pulsa `Ctrl+Alt+I`; la app debe mostrarse y abrir el selector.
- Minimiza la ventana y comprueba que el icono sigue en la bandeja.
- Haz doble clic en el icono para restaurarla.

## 5. Probar el dashboard web y la Skill

En el navegador abre `http://127.0.0.1:3000`. Sube una imagen desde el dashboard.

Para probar la Skill desde Codex, abre el repositorio como workspace y escribe:

```text
$imagebridge Sube esta imagen de prueba al servidor local y devuélveme el enlace temporal: C:\ruta\a\imagen.png
```

También puedes ejecutar el script incluido directamente:

```powershell
$env:IMAGEBRIDGE_URL = "http://127.0.0.1:3000"
node .\.agents\skills\imagebridge\scripts\upload.mjs "C:\ruta\a\imagen.png"
```

El script comprueba el servidor, tamaño, extensión y firma, sube los bytes y verifica que la URL responde.

## 6. Servidor remoto protegido (solo si tienes HTTPS)

No expongas el servidor local a internet sin HTTPS y un proxy confiable. Para una prueba privada detrás de HTTPS, configura en el host:

- `HOST=0.0.0.0`
- `IMAGEBRIDGE_API_TOKEN` con al menos 32 caracteres aleatorios.
- `MAX_UPLOAD_MB=15`
- `TTL_HOURS=24`
- Disco persistente montado en `IMAGEBRIDGE_DATA_DIR` o en `./data`.

Pega el token en el campo **TOKEN API** de la app de escritorio o del dashboard web. El campo web solo conserva el token mientras la pestaña está abierta. No compartas el token ni URLs con token.

## Si algo falla

Anota el número de paso, el mensaje completo del error y si `/api/health` responde. No publiques capturas con enlaces tokenizados ni tokens.

## Qué significa que pase la prueba

- `npm test` correcto: el backend pasa las pruebas de integración incluidas.
- URL visible en el navegador: la subida y recuperación temporal funcionan.
- Miniatura en ChatGPT después de Ctrl+V: el cliente acepta el portapapeles como adjunto real.
- Skill ejecutada: Codex puede seguir el flujo de hosting temporal.

Ninguna de estas pruebas significa que ImageBridge elimine cuotas o límites de ChatGPT ni que reemplace el botón +.
