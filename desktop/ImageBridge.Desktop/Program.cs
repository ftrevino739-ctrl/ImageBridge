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
    [DllImport("user32.dll")] private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint modifiers, uint key);
    [DllImport("user32.dll")] private static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    private readonly HttpClient http = new() { Timeout = TimeSpan.FromSeconds(90) };
    private readonly TextBox endpoint = new();
    private readonly Label status = new();
    private readonly Label lastLink = new();
    private readonly Button uploadButton = new();
    private readonly NotifyIcon tray = new();
    private bool hotkeyRegistered;
    private string? lastUploadedUrl;

    public MainForm()
    {
        Text = "ImageBridge";
        Width = 620; Height = 430;
        MinimumSize = new Size(560, 390);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(10, 13, 19);
        ForeColor = Color.FromArgb(235, 242, 250);
        Font = new Font("Segoe UI", 10);
        BuildUi();
        tray.Icon = SystemIcons.Application;
        tray.Text = "ImageBridge — Ctrl+Alt+I";
        tray.Visible = true;
        tray.DoubleClick += (_, _) => { Show(); WindowState = FormWindowState.Normal; Activate(); };
        var menu = new ContextMenuStrip();
        menu.Items.Add("Abrir ImageBridge", null, (_, _) => { Show(); WindowState = FormWindowState.Normal; Activate(); });
        menu.Items.Add("Subir imagen…", null, async (_, _) => await PickAndUploadAsync());
        menu.Items.Add("Salir", null, (_, _) => Close());
        tray.ContextMenuStrip = menu;
        Shown += (_, _) =>
        {
            hotkeyRegistered = RegisterHotKey(Handle, HotkeyId, ModControl | ModAlt, (uint)Keys.I);
            status.Text = hotkeyRegistered
                ? "Listo · Atajo global Ctrl + Alt + I"
                : "Listo · No se pudo registrar Ctrl + Alt + I (puede estar ocupado).";
        };
        FormClosing += (_, _) => { if (hotkeyRegistered) UnregisterHotKey(Handle, HotkeyId); tray.Visible = false; tray.Dispose(); http.Dispose(); };
    }

    private void BuildUi()
    {
        var title = new Label { Text = "IMAGEBRIDGE", Font = new Font("Segoe UI Semibold", 19), ForeColor = Color.White, AutoSize = true, Location = new Point(28, 22) };
        var subtitle = new Label { Text = "Companion de Windows · sube una imagen y prepara su URL temporal", ForeColor = Color.FromArgb(160, 177, 198), AutoSize = true, Location = new Point(30, 62) };
        var endpointLabel = new Label { Text = "Servidor ImageBridge", AutoSize = true, Location = new Point(30, 112), ForeColor = Color.FromArgb(190, 205, 222) };
        endpoint.SetBounds(30, 140, 540, 34);
        endpoint.Text = Environment.GetEnvironmentVariable("IMAGEBRIDGE_URL") ?? "http://localhost:3000";
        endpoint.BackColor = Color.FromArgb(24, 31, 43); endpoint.ForeColor = Color.White; endpoint.BorderStyle = BorderStyle.FixedSingle;
        uploadButton.Text = "＋  Seleccionar y subir imagen";
        uploadButton.SetBounds(30, 198, 540, 54);
        uploadButton.FlatStyle = FlatStyle.Flat; uploadButton.FlatAppearance.BorderColor = Color.FromArgb(91, 163, 232);
        uploadButton.BackColor = Color.FromArgb(32, 83, 132); uploadButton.ForeColor = Color.White;
        uploadButton.Font = new Font("Segoe UI Semibold", 12);
        uploadButton.Click += async (_, _) => await PickAndUploadAsync();
        status.SetBounds(30, 274, 540, 42); status.ForeColor = Color.FromArgb(153, 194, 232);
        status.Text = "Inicia ImageBridge Server y comprueba el servidor.";
        lastLink.SetBounds(30, 318, 540, 42); lastLink.ForeColor = Color.FromArgb(190, 205, 222); lastLink.AutoEllipsis = true;
        var copy = new Button { Text = "Copiar URL", Bounds = new Rectangle(30, 365, 130, 34), FlatStyle = FlatStyle.Flat, BackColor = Color.FromArgb(29, 38, 52), ForeColor = Color.White };
        copy.Click += (_, _) => CopyLastUrl();
        Controls.AddRange([title, subtitle, endpointLabel, endpoint, uploadButton, status, lastLink, copy]);
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == WmHotkey && m.WParam.ToInt32() == HotkeyId)
        {
            _ = PickAndUploadAsync();
            return;
        }
        base.WndProc(ref m);
    }

    private async Task PickAndUploadAsync()
    {
        using var dialog = new OpenFileDialog
        {
            Title = "Selecciona una imagen para ImageBridge",
            Filter = "Imágenes|*.png;*.jpg;*.jpeg;*.webp;*.gif;*.avif;*.heic|Todos los archivos|*.*",
            Multiselect = false
        };
        if (dialog.ShowDialog(this) != DialogResult.OK) return;
        await UploadAsync(dialog.FileName);
    }

    private async Task UploadAsync(string filePath)
    {
        uploadButton.Enabled = false;
        status.Text = "Subiendo imagen…";
        try
        {
            var baseUrl = endpoint.Text.Trim().TrimEnd('/');
            if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var baseUri) || (baseUri.Scheme != Uri.UriSchemeHttp && baseUri.Scheme != Uri.UriSchemeHttps))
                throw new InvalidOperationException("Introduce una URL válida, por ejemplo https://tu-servidor.example");
            var ext = Path.GetExtension(filePath).ToLowerInvariant();
            var mime = ext switch
            {
                ".jpg" or ".jpeg" => "image/jpeg", ".png" => "image/png", ".webp" => "image/webp",
                ".gif" => "image/gif", ".avif" => "image/avif", ".heic" => "image/heic",
                _ => throw new InvalidOperationException("Formato no admitido. Usa JPG, PNG, WEBP, GIF, AVIF o HEIC.")
            };
            await using var stream = File.OpenRead(filePath);
            using var request = new HttpRequestMessage(HttpMethod.Post, new Uri(baseUri, "/api/images"));
            var content = new StreamContent(stream);
            content.Headers.ContentType = new MediaTypeHeaderValue(mime);
            request.Content = content;
            request.Headers.TryAddWithoutValidation("X-File-Name", Uri.EscapeDataString(Path.GetFileName(filePath)));
            using var response = await http.SendAsync(request);
            var body = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode) throw new InvalidOperationException($"El servidor respondió {(int)response.StatusCode}: {body}");
            using var json = JsonDocument.Parse(body);
            var relative = json.RootElement.GetProperty("url").GetString() ?? throw new InvalidOperationException("El servidor no devolvió una URL.");
            lastUploadedUrl = new Uri(baseUri, relative).ToString();
            lastLink.Text = lastUploadedUrl;
            status.Text = $"Subida correcta · {new FileInfo(filePath).Length / 1024:N0} KB · URL temporal lista.";
            Clipboard.SetText(lastUploadedUrl);
            MessageBox.Show(this, "La imagen se subió correctamente. La URL se copió al portapapeles.\n\nPégala en el cliente compatible que estés usando.", "ImageBridge", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            status.Text = "No se pudo completar la subida.";
            MessageBox.Show(this, ex.Message, "ImageBridge — error", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally { uploadButton.Enabled = true; }
    }

    private void CopyLastUrl()
    {
        if (string.IsNullOrWhiteSpace(lastUploadedUrl)) { status.Text = "Primero sube una imagen."; return; }
        Clipboard.SetText(lastUploadedUrl);
        status.Text = "URL copiada al portapapeles.";
    }
}
