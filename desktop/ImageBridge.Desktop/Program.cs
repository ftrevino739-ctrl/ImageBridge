using System.Drawing.Drawing2D;
using System.Net.Http.Headers;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows.Forms;

namespace ImageBridge.Desktop;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new MainForm());
    }
}

internal sealed class MainForm : Form
{
    private const int HotkeyId = 0x1B47;
    private const int WmHotkey = 0x0312;
    private const uint ModAlt = 0x0001, ModControl = 0x0002;
    private const int DwmUseImmersiveDarkMode = 20;
    private const int DwmSystemBackdropType = 38;
    [DllImport("user32.dll")] private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint modifiers, uint key);
    [DllImport("user32.dll")] private static extern bool UnregisterHotKey(IntPtr hWnd, int id);
    [DllImport("dwmapi.dll")] private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

    private readonly HttpClient http = new() { Timeout = TimeSpan.FromSeconds(90) };
    private readonly TextBox endpoint = new();
    private readonly Label connectionStatus = new();
    private readonly Label fileTitle = new();
    private readonly Label fileMeta = new();
    private readonly Label uploadStatus = new();
    private readonly Label linkValue = new();
    private readonly PictureBox preview = new();
    private readonly Label dropPrompt = new();
    private readonly Button uploadButton = new();
    private readonly Button selectButton = new();
    private readonly Button copyUrlButton = new();
    private readonly Button copyImageButton = new();
    private readonly NotifyIcon tray = new();
    private string? selectedPath;
    private string? lastUploadedUrl;
    private bool hotkeyRegistered;
    private bool isUploading;

    public MainForm()
    {
        Text = "ImageBridge";
        Width = 980;
        Height = 690;
        MinimumSize = new Size(820, 610);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(8, 12, 20);
        ForeColor = Color.FromArgb(239, 245, 255);
        Font = new Font("Segoe UI", 10);
        AllowDrop = true;
        BuildUi();
        LoadSettings();

        tray.Icon = SystemIcons.Application;
        tray.Text = "ImageBridge · Ctrl + Alt + I";
        tray.Visible = true;
        tray.DoubleClick += (_, _) => RestoreWindow();
        var menu = new ContextMenuStrip();
        menu.Items.Add("Abrir ImageBridge", null, (_, _) => RestoreWindow());
        menu.Items.Add("Seleccionar imagen…", null, (_, _) => { RestoreWindow(); _ = PickImageAsync(); });
        menu.Items.Add("Salir", null, (_, _) => Close());
        tray.ContextMenuStrip = menu;

        DragEnter += OnDragEnter;
        DragDrop += OnDragDrop;
        Shown += async (_, _) =>
        {
            hotkeyRegistered = RegisterHotKey(Handle, HotkeyId, ModControl | ModAlt, (uint)Keys.I);
            await CheckServerAsync();
        };
        FormClosing += (_, _) =>
        {
            if (hotkeyRegistered) UnregisterHotKey(Handle, HotkeyId);
            tray.Visible = false;
            tray.Dispose();
            http.Dispose();
            preview.Image?.Dispose();
        };
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        try
        {
            int dark = 1;
            DwmSetWindowAttribute(Handle, DwmUseImmersiveDarkMode, ref dark, sizeof(int));
            int backdrop = 2; // Mica on supported Windows 11 builds.
            DwmSetWindowAttribute(Handle, DwmSystemBackdropType, ref backdrop, sizeof(int));
        }
        catch { /* Older Windows versions simply keep the fallback dark theme. */ }
    }

    private void BuildUi()
    {
        var header = new Panel { Dock = DockStyle.Top, Height = 112, Padding = new Padding(30, 20, 30, 12), BackColor = Color.Transparent };
        var brand = new Label { Text = "ImageBridge", Font = new Font("Segoe UI Semibold", 25), ForeColor = Color.White, AutoSize = true, Location = new Point(28, 14) };
        var tagline = new Label { Text = "Tus imágenes, listas para tus herramientas de IA.", Font = new Font("Segoe UI", 10), ForeColor = Color.FromArgb(157, 177, 202), AutoSize = true, Location = new Point(32, 61) };
        var shortcut = new Label { Text = "CTRL  +  ALT  +  I", AutoSize = true, TextAlign = ContentAlignment.MiddleCenter, Font = new Font("Segoe UI Semibold", 9), ForeColor = Color.FromArgb(185, 216, 247), BackColor = Color.FromArgb(28, 48, 72), Padding = new Padding(14, 9, 14, 9), Anchor = AnchorStyles.Top | AnchorStyles.Right };
        shortcut.Location = new Point(Width - 245, 30);
        header.Controls.AddRange(new Control[] { brand, tagline, shortcut });
        header.Resize += (_, _) => shortcut.Left = header.ClientSize.Width - shortcut.Width - 8;

        var content = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(24, 8, 24, 24), ColumnCount = 2, RowCount = 1, BackColor = Color.Transparent };
        content.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 58));
        content.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 42));
        Controls.Add(content);
        Controls.Add(header);

        var uploadCard = new GlassCard { Dock = DockStyle.Fill, Padding = new Padding(22), Margin = new Padding(0, 0, 12, 0) };
        var sideCard = new GlassCard { Dock = DockStyle.Fill, Padding = new Padding(22), Margin = new Padding(12, 0, 0, 0) };
        content.Controls.Add(uploadCard, 0, 0);
        content.Controls.Add(sideCard, 1, 0);

        var uploadHeading = MakeLabel("Subir una imagen", 17, Color.White, true);
        uploadHeading.Dock = DockStyle.Top;
        uploadHeading.Height = 34;
        var uploadSub = MakeLabel("Arrastra un archivo aquí o selecciónalo desde tu equipo.", 9, Color.FromArgb(157, 177, 202));
        uploadSub.Dock = DockStyle.Top;
        uploadSub.Height = 30;

        var drop = new GlassCard { Dock = DockStyle.Fill, Margin = new Padding(0, 10, 0, 12), Padding = new Padding(10), BackColor = Color.FromArgb(22, 35, 52), AllowDrop = true };
        drop.DragEnter += OnDragEnter;
        drop.DragDrop += OnDragDrop;
        preview.Dock = DockStyle.Fill;
        preview.SizeMode = PictureBoxSizeMode.Zoom;
        preview.Visible = false;
        dropPrompt.Text = "＋\r\n\r\nSUELTA TU IMAGEN AQUÍ\r\n\r\nPNG  ·  JPG  ·  WEBP  ·  GIF  ·  AVIF  ·  HEIC";
        dropPrompt.Dock = DockStyle.Fill;
        dropPrompt.TextAlign = ContentAlignment.MiddleCenter;
        dropPrompt.ForeColor = Color.FromArgb(166, 193, 222);
        dropPrompt.Font = new Font("Segoe UI Semibold", 10);
        dropPrompt.BackColor = Color.Transparent;
        drop.Controls.Add(preview);
        drop.Controls.Add(dropPrompt);
        dropPrompt.BringToFront();
        drop.DragEnter += OnDragEnter;
        drop.DragDrop += OnDragDrop;

        fileTitle.Text = "Ninguna imagen seleccionada";
        fileTitle.Dock = DockStyle.Top;
        fileTitle.Height = 26;
        fileTitle.Font = new Font("Segoe UI Semibold", 10);
        fileTitle.ForeColor = Color.White;
        fileMeta.Text = "Elige una imagen para ver su vista previa.";
        fileMeta.Dock = DockStyle.Top;
        fileMeta.Height = 24;
        fileMeta.ForeColor = Color.FromArgb(147, 169, 194);

        var actions = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 54, FlowDirection = FlowDirection.LeftToRight, WrapContents = false, BackColor = Color.Transparent, Padding = new Padding(0, 8, 0, 0) };
        selectButton.Text = "Elegir imagen";
        StyleButton(selectButton, false);
        selectButton.Width = 142;
        selectButton.Height = 40;
        selectButton.Click += async (_, _) => await PickImageAsync();
        uploadButton.Text = "Subir a ImageBridge";
        StyleButton(uploadButton, true);
        uploadButton.Width = 190;
        uploadButton.Height = 40;
        uploadButton.Click += async (_, _) => await UploadSelectedAsync();
        actions.Controls.Add(selectButton);
        actions.Controls.Add(uploadButton);

        uploadCard.Controls.Add(drop);
        uploadCard.Controls.Add(actions);
        uploadCard.Controls.Add(fileMeta);
        uploadCard.Controls.Add(fileTitle);
        uploadCard.Controls.Add(uploadSub);
        uploadCard.Controls.Add(uploadHeading);

        var sideHeading = MakeLabel("Conexión", 17, Color.White, true);
        sideHeading.Dock = DockStyle.Top;
        sideHeading.Height = 36;
        connectionStatus.Text = "Comprobando servidor…";
        connectionStatus.Dock = DockStyle.Top;
        connectionStatus.Height = 32;
        connectionStatus.ForeColor = Color.FromArgb(155, 204, 180);

        var serverLabel = MakeLabel("SERVIDOR IMAGEBRIDGE", 8, Color.FromArgb(137, 159, 185), true);
        serverLabel.Dock = DockStyle.Top;
        serverLabel.Height = 28;
        endpoint.Dock = DockStyle.Top;
        endpoint.Height = 36;
        endpoint.Text = "http://localhost:3000";
        endpoint.BackColor = Color.FromArgb(16, 26, 40);
        endpoint.ForeColor = Color.White;
        endpoint.BorderStyle = BorderStyle.FixedSingle;
        endpoint.Margin = new Padding(0, 0, 0, 8);

        var checkButton = new Button { Text = "Comprobar conexión", Dock = DockStyle.Top, Height = 36 };
        StyleButton(checkButton, false);
        checkButton.Click += async (_, _) => await CheckServerAsync();

        var divider = new Panel { Dock = DockStyle.Top, Height = 1, BackColor = Color.FromArgb(52, 69, 91), Margin = new Padding(0, 18, 0, 18) };
        var resultHeading = MakeLabel("Última imagen", 15, Color.White, true);
        resultHeading.Dock = DockStyle.Top;
        resultHeading.Height = 36;
        uploadStatus.Text = "Todavía no has subido ninguna imagen.";
        uploadStatus.Dock = DockStyle.Top;
        uploadStatus.Height = 45;
        uploadStatus.ForeColor = Color.FromArgb(157, 177, 202);
        linkValue.Text = "La URL aparecerá aquí después de subir.";
        linkValue.Dock = DockStyle.Top;
        linkValue.Height = 62;
        linkValue.AutoEllipsis = true;
        linkValue.ForeColor = Color.FromArgb(170, 207, 244);
        linkValue.Font = new Font("Segoe UI", 9);

        var resultButtons = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 46, WrapContents = false, BackColor = Color.Transparent };
        copyUrlButton.Text = "Copiar URL";
        StyleButton(copyUrlButton, true);
        copyUrlButton.Width = 118;
        copyUrlButton.Height = 36;
        copyUrlButton.Click += (_, _) => CopyUrl();
        copyImageButton.Text = "Copiar imagen";
        StyleButton(copyImageButton, false);
        copyImageButton.Width = 126;
        copyImageButton.Height = 36;
        copyImageButton.Click += (_, _) => CopyImageForChat();
        resultButtons.Controls.Add(copyUrlButton);
        resultButtons.Controls.Add(copyImageButton);

        var note = MakeLabel("ChatGPT y Codex\r\n• Copiar URL: comparte el enlace donde se admitan imágenes por URL.\r\n• Copiar imagen: pega la imagen real en el cuadro de mensaje con Ctrl + V.", 9, Color.FromArgb(142, 163, 188));
        note.Dock = DockStyle.Top;
        note.Height = 94;

        sideCard.Controls.Add(note);
        sideCard.Controls.Add(resultButtons);
        sideCard.Controls.Add(linkValue);
        sideCard.Controls.Add(uploadStatus);
        sideCard.Controls.Add(resultHeading);
        sideCard.Controls.Add(divider);
        sideCard.Controls.Add(checkButton);
        sideCard.Controls.Add(endpoint);
        sideCard.Controls.Add(serverLabel);
        sideCard.Controls.Add(connectionStatus);
        sideCard.Controls.Add(sideHeading);
    }

    private static Label MakeLabel(string text, float size, Color color, bool bold = false) =>
        new() { Text = text, Font = new Font(bold ? "Segoe UI Semibold" : "Segoe UI", size), ForeColor = color, BackColor = Color.Transparent, AutoSize = false };

    private static void StyleButton(Button button, bool primary)
    {
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderSize = 1;
        button.FlatAppearance.BorderColor = primary ? Color.FromArgb(84, 159, 232) : Color.FromArgb(62, 83, 109);
        button.BackColor = primary ? Color.FromArgb(38, 100, 158) : Color.FromArgb(25, 39, 57);
        button.ForeColor = Color.White;
        button.Font = new Font("Segoe UI Semibold", 9);
        button.Cursor = Cursors.Hand;
        button.Margin = new Padding(0, 0, 9, 0);
    }

    private void LoadSettings()
    {
        try
        {
            var path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ImageBridge", "settings.json");
            if (File.Exists(path))
            {
                using var json = JsonDocument.Parse(File.ReadAllText(path));
                if (json.RootElement.TryGetProperty("serverUrl", out var value))
                    endpoint.Text = value.GetString() ?? endpoint.Text;
            }
            else if (!string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("IMAGEBRIDGE_URL")))
                endpoint.Text = Environment.GetEnvironmentVariable("IMAGEBRIDGE_URL")!;
        }
        catch { }
    }

    private void SaveSettings()
    {
        try
        {
            var folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ImageBridge");
            Directory.CreateDirectory(folder);
            File.WriteAllText(Path.Combine(folder, "settings.json"), JsonSerializer.Serialize(new { serverUrl = endpoint.Text.Trim() }));
        }
        catch { }
    }

    private void RestoreWindow()
    {
        Show();
        WindowState = FormWindowState.Normal;
        Activate();
    }

    private void OnDragEnter(object? sender, DragEventArgs e) =>
        e.Effect = e.Data?.GetDataPresent(DataFormats.FileDrop) == true ? DragDropEffects.Copy : DragDropEffects.None;

    private void OnDragDrop(object? sender, DragEventArgs e)
    {
        if (e.Data?.GetData(DataFormats.FileDrop) is string[] files && files.Length > 0)
            SetSelectedImage(files[0]);
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == WmHotkey && m.WParam.ToInt32() == HotkeyId)
        {
            RestoreWindow();
            _ = PickImageAsync();
            return;
        }
        base.WndProc(ref m);
    }

    private async Task PickImageAsync()
    {
        using var dialog = new OpenFileDialog
        {
            Title = "Selecciona una imagen",
            Filter = "Imágenes|*.png;*.jpg;*.jpeg;*.webp;*.gif;*.avif;*.heic|Todos los archivos|*.*",
            Multiselect = false
        };
        if (dialog.ShowDialog(this) == DialogResult.OK) SetSelectedImage(dialog.FileName);
        await Task.CompletedTask;
    }

    private void SetSelectedImage(string path)
    {
        try
        {
            var ext = Path.GetExtension(path).ToLowerInvariant();
            if (!new[] { ".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".heic" }.Contains(ext))
                throw new InvalidOperationException("Formato no admitido.");
            selectedPath = path;
            int? width = null, height = null;
            try
            {
                using var source = Image.FromFile(path);
                width = source.Width; height = source.Height;
                var copy = new Bitmap(source);
                var old = preview.Image;
                preview.Image = copy;
                old?.Dispose();
                preview.Visible = true;
                dropPrompt.Visible = false;
            }
            catch (Exception)
            {
                preview.Image?.Dispose();
                preview.Image = null;
                preview.Visible = false;
                dropPrompt.Visible = true;
                dropPrompt.Text = "VISTA PREVIA NO DISPONIBLE\\r\\n\\r\\nEl archivo se puede subir igualmente.";
            }
            fileTitle.Text = Path.GetFileName(path);
            fileMeta.Text = $"{new FileInfo(path).Length / 1024d:N0} KB" + (width.HasValue ? $"  ·  {width} × {height}" : "  ·  Formato admitido");
            uploadStatus.Text = "Imagen lista para subir.";
        }
        catch (Exception ex) { MessageBox.Show(this, ex.Message, "No se pudo abrir la imagen", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
    }

    private async Task CheckServerAsync()
    {
        try
        {
            var baseUri = GetBaseUri();
            using var response = await http.GetAsync(new Uri(baseUri, "/api/health"));
            response.EnsureSuccessStatusCode();
            connectionStatus.Text = "●  Servidor conectado";
            connectionStatus.ForeColor = Color.FromArgb(133, 220, 174);
            SaveSettings();
        }
        catch
        {
            connectionStatus.Text = "○  Sin conexión · revisa la URL";
            connectionStatus.ForeColor = Color.FromArgb(246, 174, 130);
        }
    }

    private Uri GetBaseUri()
    {
        var raw = endpoint.Text.Trim().TrimEnd('/') + "/";
        if (!Uri.TryCreate(raw, UriKind.Absolute, out var uri) || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
            throw new InvalidOperationException("Escribe una dirección válida, por ejemplo https://tu-servidor.example");
        return uri;
    }

    private async Task UploadSelectedAsync()
    {
        if (isUploading) return;
        if (string.IsNullOrWhiteSpace(selectedPath) || !File.Exists(selectedPath))
        {
            await PickImageAsync();
            if (string.IsNullOrWhiteSpace(selectedPath)) return;
        }
        isUploading = true;
        uploadButton.Enabled = false;
        uploadButton.Text = "Subiendo…";
        try
        {
            var baseUri = GetBaseUri();
            var ext = Path.GetExtension(selectedPath!).ToLowerInvariant();
            var mime = ext switch
            {
                ".jpg" or ".jpeg" => "image/jpeg", ".png" => "image/png", ".webp" => "image/webp",
                ".gif" => "image/gif", ".avif" => "image/avif", ".heic" => "image/heic",
                _ => throw new InvalidOperationException("Formato no admitido.")
            };
            await using var stream = File.OpenRead(selectedPath!);
            using var request = new HttpRequestMessage(HttpMethod.Post, new Uri(baseUri, "/api/images"));
            request.Content = new StreamContent(stream);
            request.Content.Headers.ContentType = new MediaTypeHeaderValue(mime);
            request.Headers.TryAddWithoutValidation("X-File-Name", Uri.EscapeDataString(Path.GetFileName(selectedPath!)));
            using var response = await http.SendAsync(request);
            var body = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode) throw new InvalidOperationException($"Servidor {(int)response.StatusCode}: {body}");
            using var json = JsonDocument.Parse(body);
            var relative = json.RootElement.GetProperty("url").GetString() ?? throw new InvalidOperationException("El servidor no devolvió una URL.");
            lastUploadedUrl = new Uri(baseUri, relative).ToString();
            linkValue.Text = lastUploadedUrl;
            uploadStatus.Text = $"✓ Subida correcta · {new FileInfo(selectedPath!).Length / 1024d:N0} KB";
            Clipboard.SetText(lastUploadedUrl);
            SaveSettings();
        }
        catch (Exception ex)
        {
            uploadStatus.Text = "No se pudo subir la imagen.";
            MessageBox.Show(this, ex.Message, "ImageBridge", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            isUploading = false;
            uploadButton.Enabled = true;
            uploadButton.Text = "Subir a ImageBridge";
        }
    }

    private void CopyUrl()
    {
        if (string.IsNullOrWhiteSpace(lastUploadedUrl)) { uploadStatus.Text = "Primero sube una imagen."; return; }
        Clipboard.SetText(lastUploadedUrl);
        uploadStatus.Text = "URL copiada. Pégala en el cliente compatible.";
    }

    private void CopyImageForChat()
    {
        if (string.IsNullOrWhiteSpace(selectedPath) || !File.Exists(selectedPath)) { uploadStatus.Text = "Selecciona primero una imagen."; return; }
        try
        {
            using var source = Image.FromFile(selectedPath);
            Clipboard.SetImage(new Bitmap(source));
            uploadStatus.Text = "Imagen copiada. En ChatGPT, haz clic en el cuadro de mensaje y pulsa Ctrl + V.";
        }
        catch (Exception ex) { MessageBox.Show(this, ex.Message, "No se pudo copiar la imagen", MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }
}

internal sealed class GlassCard : Panel
{
    public GlassCard()
    {
        DoubleBuffered = true;
        BackColor = Color.FromArgb(20, 30, 45);
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint, true);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        var rect = ClientRectangle;
        rect.Width -= 1;
        rect.Height -= 1;
        if (rect.Width < 2 || rect.Height < 2) return;
        using var path = Rounded(rect, 18);
        using var fill = new LinearGradientBrush(rect, Color.FromArgb(242, 30, 46, 66), Color.FromArgb(238, 16, 25, 39), 35f);
        using var border = new Pen(Color.FromArgb(90, 131, 163, 195), 1f);
        e.Graphics.FillPath(fill, path);
        e.Graphics.DrawPath(border, path);
    }

    private static GraphicsPath Rounded(Rectangle rect, int radius)
    {
        int d = radius * 2;
        var path = new GraphicsPath();
        path.AddArc(rect.X, rect.Y, d, d, 180, 90);
        path.AddArc(rect.Right - d, rect.Y, d, d, 270, 90);
        path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90);
        path.AddArc(rect.X, rect.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }
}
