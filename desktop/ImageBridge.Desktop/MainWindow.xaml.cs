using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using ImageBridge.Desktop.Services;
using Microsoft.Win32;

namespace ImageBridge.Desktop;

public partial class MainWindow : Window
{
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromMinutes(2) };
    private AppSettings _settings = new();

    public MainWindow()
    {
        InitializeComponent();
    }

    private void Window_Loaded(object sender, RoutedEventArgs e)
    {
        _settings = SettingsStore.Load();
        ServerUrlBox.Text = _settings.ServerUrl;
        ApiTokenBox.Password = SettingsStore.Unprotect(_settings.ProtectedToken);
        SetConnectionState(false, "Sin comprobar");
    }

    private void Window_Closed(object? sender, EventArgs e) => _http.Dispose();

    private void Nav_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button button || button.Tag is not string page) return;
        PageTitle.Text = page;
        PageDescription.Text = page switch
        {
            "Inicio" => "Tu centro de archivos para flujos de trabajo con IA.",
            "Archivos" => "Consulta los archivos que has enviado al servidor.",
            "Subir archivos" => "Selecciona imágenes y documentos desde Windows.",
            "Historial" => "Revisa las cargas registradas en el servidor.",
            "Integraciones" => "Conecta ImageBridge con ChatGPT Web y herramientas compatibles.",
            "Almacenamiento" => "Estado del proveedor y límites de almacenamiento.",
            "Configuración" => "Administra la dirección del servidor y tu token.",
            _ => "ImageBridge Desktop"
        };

        UIElement[] panels = [OverviewCards, ConnectionPanel, UploadPanel, HistoryPanel, IntegrationsPanel, StoragePanel];
        foreach (var panel in panels) panel.Visibility = Visibility.Collapsed;

        switch (page)
        {
            case "Inicio":
                OverviewCards.Visibility = Visibility.Visible;
                ConnectionPanel.Visibility = Visibility.Visible;
                UploadPanel.Visibility = Visibility.Visible;
                HistoryPanel.Visibility = Visibility.Visible;
                break;
            case "Archivos":
            case "Historial":
                HistoryPanel.Visibility = Visibility.Visible;
                _ = RefreshHistoryAsync();
                break;
            case "Subir archivos":
                UploadPanel.Visibility = Visibility.Visible;
                break;
            case "Integraciones":
                IntegrationsPanel.Visibility = Visibility.Visible;
                break;
            case "Almacenamiento":
                OverviewCards.Visibility = Visibility.Visible;
                StoragePanel.Visibility = Visibility.Visible;
                break;
            case "Configuración":
                ConnectionPanel.Visibility = Visibility.Visible;
                ServerUrlBox.Focus();
                break;
        }
    }

    private void SaveSettings_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            SaveSettings();
            SettingsStatusText.Text = "Configuración guardada. El token está cifrado con DPAPI para este usuario de Windows.";
        }
        catch (Exception ex)
        {
            SettingsStatusText.Text = "No se pudo guardar: " + ex.Message;
        }
    }

    private async void Connect_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            SaveSettings();
            ConnectionStatusText.Text = "Comprobando…";
            SidebarStatusText.Text = "Conectando…";
            var response = await _http.GetAsync(GetServerUrl() + "/api/health");
            var body = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode) throw new InvalidOperationException(ReadError(body, (int)response.StatusCode));
            using var json = JsonDocument.Parse(body);
            var root = json.RootElement;
            var storage = root.TryGetProperty("storage", out var storageValue) ? storageValue.GetString() : "Servidor local";
            var configured = !root.TryGetProperty("configured", out var configuredValue) || configuredValue.GetBoolean();
            StorageCardText.Text = storage ?? "Servidor conectado";
            ConnectionCardText.Text = configured ? "Servidor disponible" : "Falta configurar Cloudinary";
            SetConnectionState(configured, configured ? "Conectado" : "Conectado · falta configurar proveedor");
            SettingsStatusText.Text = "El servidor respondió correctamente.";
        }
        catch (Exception ex)
        {
            SetConnectionState(false, "Sin conexión");
            ConnectionCardText.Text = "No se pudo conectar";
            SettingsStatusText.Text = ex.Message;
        }
    }

    private async void SelectUpload_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new OpenFileDialog
        {
            Title = "Seleccionar archivos para ImageBridge",
            Multiselect = true,
            Filter = "Archivos compatibles|*.jpg;*.jpeg;*.png;*.webp;*.gif;*.avif;*.heic;*.pdf;*.txt;*.md;*.csv;*.json;*.rtf;*.docx;*.xlsx;*.pptx|Todos los archivos|*.*"
        };
        if (dialog.ShowDialog(this) != true) return;

        try
        {
            SaveSettings();
            var uploaded = 0;
            foreach (var path in dialog.FileNames)
            {
                UploadStatusText.Text = $"Subiendo {Path.GetFileName(path)}…";
                await UploadFileAsync(path);
                uploaded++;
            }
            UploadStatusText.Text = $"Se subieron {uploaded} archivo(s) correctamente.";
            await RefreshHistoryAsync();
        }
        catch (Exception ex)
        {
            UploadStatusText.Text = "Error de carga: " + ex.Message;
        }
    }

    private async Task UploadFileAsync(string path)
    {
        var bytes = await File.ReadAllBytesAsync(path);
        using var request = new HttpRequestMessage(HttpMethod.Post, GetServerUrl() + "/api/images");
        var content = new ByteArrayContent(bytes);
        content.Headers.ContentType = new MediaTypeHeaderValue(GetMimeType(path));
        request.Content = content;
        request.Headers.TryAddWithoutValidation("X-File-Name", Uri.EscapeDataString(Path.GetFileName(path)));
        AddAuthorization(request);
        using var response = await _http.SendAsync(request);
        var body = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException(ReadError(body, (int)response.StatusCode));
    }

    private async void RefreshHistory_Click(object sender, RoutedEventArgs e) => await RefreshHistoryAsync();

    private async Task RefreshHistoryAsync()
    {
        try
        {
            SaveSettings();
            using var request = new HttpRequestMessage(HttpMethod.Get, GetServerUrl() + "/api/history");
            AddAuthorization(request);
            using var response = await _http.SendAsync(request);
            var body = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode) throw new InvalidOperationException(ReadError(body, (int)response.StatusCode));
            using var json = JsonDocument.Parse(body);
            HistoryList.Items.Clear();
            if (!json.RootElement.TryGetProperty("images", out var images) || images.ValueKind != JsonValueKind.Array)
            {
                HistoryList.Items.Add("El servidor no devolvió una lista de archivos.");
                return;
            }
            foreach (var item in images.EnumerateArray())
            {
                var name = item.TryGetProperty("name", out var nameValue) ? nameValue.GetString() : "Archivo";
                var size = item.TryGetProperty("size", out var sizeValue) ? sizeValue.GetInt64() : 0;
                var expires = item.TryGetProperty("expiresAt", out var expiresValue) && expiresValue.TryGetInt64(out var millis)
                    ? DateTimeOffset.FromUnixTimeMilliseconds(millis).ToLocalTime().ToString("g")
                    : "sin fecha";
                HistoryList.Items.Add($"{name}   ·   {FormatSize(size)}   ·   vence {expires}");
            }
            if (HistoryList.Items.Count == 0) HistoryList.Items.Add("No hay archivos en el historial.");
        }
        catch (Exception ex)
        {
            HistoryList.Items.Clear();
            HistoryList.Items.Add("No se pudo cargar el historial: " + ex.Message);
        }
    }

    private void SaveSettings()
    {
        var server = ServerUrlBox.Text.Trim().TrimEnd('/');
        if (!Uri.TryCreate(server, UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttps && !(uri.IsLoopback && uri.Scheme == Uri.UriSchemeHttp)))
            throw new InvalidOperationException("Usa una URL HTTPS o una dirección HTTP local (127.0.0.1).");
        _settings.ServerUrl = uri.GetLeftPart(UriPartial.Authority).TrimEnd('/');
        _settings.ProtectedToken = SettingsStore.Protect(ApiTokenBox.Password.Trim());
        SettingsStore.Save(_settings);
    }

    private string GetServerUrl()
    {
        var server = ServerUrlBox.Text.Trim().TrimEnd('/');
        if (!Uri.TryCreate(server, UriKind.Absolute, out var uri)) throw new InvalidOperationException("La URL del servidor no es válida.");
        return uri.GetLeftPart(UriPartial.Authority).TrimEnd('/');
    }

    private void AddAuthorization(HttpRequestMessage request)
    {
        var token = ApiTokenBox.Password.Trim();
        if (!string.IsNullOrEmpty(token)) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
    }

    private void SetConnectionState(bool connected, string label)
    {
        ConnectionStatusText.Text = label;
        SidebarStatusText.Text = label;
        ConnectionDot.Fill = connected ? new SolidColorBrush(Color.FromRgb(90, 205, 151)) : new SolidColorBrush(Color.FromRgb(119, 132, 154));
    }

    private static string ReadError(string body, int status)
    {
        try
        {
            using var json = JsonDocument.Parse(body);
            if (json.RootElement.TryGetProperty("error", out var error)) return error.GetString() ?? $"Error HTTP {status}.";
        }
        catch { }
        return $"Error HTTP {status}.";
    }

    private static string GetMimeType(string path) => Path.GetExtension(path).ToLowerInvariant() switch
    {
        ".jpg" or ".jpeg" => "image/jpeg",
        ".png" => "image/png",
        ".webp" => "image/webp",
        ".gif" => "image/gif",
        ".avif" => "image/avif",
        ".heic" => "image/heic",
        ".pdf" => "application/pdf",
        ".txt" => "text/plain",
        ".md" => "text/markdown",
        ".csv" => "text/csv",
        ".json" => "application/json",
        ".rtf" => "application/rtf",
        ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        _ => "application/octet-stream"
    };

    private static string FormatSize(long bytes) => bytes switch
    {
        < 1024 => $"{bytes} B",
        < 1024 * 1024 => $"{bytes / 1024d:0.0} KB",
        _ => $"{bytes / 1024d / 1024d:0.0} MB"
    };
}
