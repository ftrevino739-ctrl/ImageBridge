using System.IO;
using System.Net;
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
            "Inicio" => "Tu centro de control para archivos y conexiones de IA.",
            "Archivos" => "Consulta los archivos que siguen disponibles en tu almacenamiento.",
            "Subir archivos" => "Envía imágenes y documentos desde Windows a tu servidor.",
            "Historial" => "Revisa la actividad reciente de ImageBridge.",
            "Integraciones" => "Administra las conexiones de ImageBridge con otras herramientas.",
            "Almacenamiento" => "Consulta el proveedor y las políticas de retención.",
            "Configuración" => "Administra la dirección del servidor y tu token privado.",
            _ => "ImageBridge Desktop"
        };

        UIElement[] pages = [HomePage, FilesPage, UploadPage, ActivityPage, IntegrationsPage, StoragePage, SettingsPage];
        foreach (var panel in pages) panel.Visibility = Visibility.Collapsed;

        switch (page)
        {
            case "Inicio":
                HomePage.Visibility = Visibility.Visible;
                _ = RefreshHistoryAsync();
                break;
            case "Archivos":
                FilesPage.Visibility = Visibility.Visible;
                _ = RefreshHistoryAsync();
                break;
            case "Subir archivos":
                UploadPage.Visibility = Visibility.Visible;
                break;
            case "Historial":
                ActivityPage.Visibility = Visibility.Visible;
                _ = RefreshHistoryAsync();
                break;
            case "Integraciones":
                IntegrationsPage.Visibility = Visibility.Visible;
                break;
            case "Almacenamiento":
                StoragePage.Visibility = Visibility.Visible;
                break;
            case "Configuración":
                SettingsPage.Visibility = Visibility.Visible;
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

            using var healthResponse = await _http.GetAsync(GetServerUrl() + "/api/health");
            var healthBody = await healthResponse.Content.ReadAsStringAsync();
            if (!healthResponse.IsSuccessStatusCode)
                throw new InvalidOperationException(ReadError(healthBody, (int)healthResponse.StatusCode));

            using var healthJson = JsonDocument.Parse(healthBody);
            var root = healthJson.RootElement;
            var storage = root.TryGetProperty("storage", out var storageValue)
                ? storageValue.GetString() : "Servidor local";
            var configured = !root.TryGetProperty("configured", out var configuredValue) || configuredValue.GetBoolean();
            if (!configured)
                throw new InvalidOperationException("El servidor responde, pero el proveedor de almacenamiento no está configurado.");

            // Health is public. A successful authenticated history request verifies the saved token too.
            using var historyRequest = new HttpRequestMessage(HttpMethod.Get, GetServerUrl() + "/api/history");
            AddAuthorization(historyRequest);
            using var historyResponse = await _http.SendAsync(historyRequest);
            var historyBody = await historyResponse.Content.ReadAsStringAsync();
            if (historyResponse.StatusCode == HttpStatusCode.Unauthorized)
                throw new InvalidOperationException("El servidor responde, pero el token privado no coincide. Pega el token actual en Configuración y vuelve a probar.");
            if (!historyResponse.IsSuccessStatusCode)
                throw new InvalidOperationException(ReadError(historyBody, (int)historyResponse.StatusCode));

            StorageCardText.Text = storage ?? "Servidor conectado";
            StorageProviderText.Text = storage ?? "Conectado";
            if (root.TryGetProperty("ttlHours", out var ttlValue) && ttlValue.TryGetInt32(out var ttl))
                RetentionText.Text = ttl == 1 ? "1 hora" : $"{ttl} horas";
            if (root.TryGetProperty("maxUploadMB", out var maxValue) && maxValue.TryGetInt32(out var max))
                UploadLimitText.Text = $"Límite por archivo: {max} MB";

            using var historyJson = JsonDocument.Parse(historyBody);
            PopulateHistory(historyJson.RootElement);
            ConnectionCardText.Text = "Servidor y token verificados";
            SetConnectionState(true, "Conectado");
            SettingsStatusText.Text = "Conexión verificada: servidor, almacenamiento y token privado funcionan.";
        }
        catch (Exception ex)
        {
            SetConnectionState(false, "Error de conexión");
            ConnectionCardText.Text = "Revisar conexión";
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
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException(ReadError(body, (int)response.StatusCode));
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
            if (!response.IsSuccessStatusCode)
            {
                var error = ReadError(body, (int)response.StatusCode);
                ClearHistory(error);
                if (response.StatusCode == HttpStatusCode.Unauthorized)
                    SetConnectionState(false, "Token incorrecto");
                return;
            }

            using var json = JsonDocument.Parse(body);
            PopulateHistory(json.RootElement);
            SetConnectionState(true, "Conectado");
        }
        catch (Exception ex)
        {
            ClearHistory("No se pudo cargar el historial: " + ex.Message);
        }
    }

    private void PopulateHistory(JsonElement root)
    {
        HistoryList.Items.Clear();
        FilesList.Items.Clear();
        ActivityList.Items.Clear();

        if (!root.TryGetProperty("images", out var images) || images.ValueKind != JsonValueKind.Array)
        {
            ClearHistory("El servidor no devolvió una lista de archivos.");
            return;
        }

        var count = 0;
        foreach (var item in images.EnumerateArray())
        {
            var name = item.TryGetProperty("name", out var nameValue) ? nameValue.GetString() : "Archivo";
            var size = item.TryGetProperty("size", out var sizeValue) ? sizeValue.GetInt64() : 0;
            var mime = item.TryGetProperty("mime", out var mimeValue) ? mimeValue.GetString() : "tipo desconocido";
            var created = item.TryGetProperty("createdAt", out var createdValue) && createdValue.TryGetInt64(out var createdMs)
                ? DateTimeOffset.FromUnixTimeMilliseconds(createdMs).ToLocalTime().ToString("g") : "fecha desconocida";
            var expires = item.TryGetProperty("expiresAt", out var expiresValue) && expiresValue.TryGetInt64(out var expiresMs)
                ? DateTimeOffset.FromUnixTimeMilliseconds(expiresMs).ToLocalTime().ToString("g") : "sin fecha";
            var line = $"{name}   ·   {FormatSize(size)}   ·   {mime}   ·   vence {expires}";
            HistoryList.Items.Add(line);
            FilesList.Items.Add(line);
            ActivityList.Items.Add($"{created}   —   {name}   ·   {FormatSize(size)}");
            count++;
        }

        FileCountText.Text = count.ToString();
        if (count == 0)
        {
            HistoryList.Items.Add("Todavía no hay archivos en el servidor.");
            FilesList.Items.Add("Tu biblioteca está vacía. Sube tu primer archivo para comenzar.");
            ActivityList.Items.Add("Todavía no hay actividad registrada.");
        }
    }

    private void ClearHistory(string message)
    {
        HistoryList.Items.Clear();
        FilesList.Items.Clear();
        ActivityList.Items.Clear();
        HistoryList.Items.Add(message);
        FilesList.Items.Add(message);
        ActivityList.Items.Add(message);
        FileCountText.Text = "—";
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
        if (!Uri.TryCreate(server, UriKind.Absolute, out var uri))
            throw new InvalidOperationException("La URL del servidor no es válida.");
        return uri.GetLeftPart(UriPartial.Authority).TrimEnd('/');
    }

    private void AddAuthorization(HttpRequestMessage request)
    {
        var token = ApiTokenBox.Password.Trim();
        if (!string.IsNullOrEmpty(token))
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
    }

    private void SetConnectionState(bool connected, string label)
    {
        ConnectionStatusText.Text = label;
        SidebarStatusText.Text = label;
        var brush = connected
            ? new SolidColorBrush(Color.FromRgb(90, 205, 151))
            : new SolidColorBrush(Color.FromRgb(220, 155, 105));
        ConnectionDot.Fill = brush;
        HeaderConnectionDot.Fill = brush;
    }

    private static string ReadError(string body, int status)
    {
        try
        {
            using var json = JsonDocument.Parse(body);
            if (json.RootElement.TryGetProperty("error", out var error))
                return error.GetString() ?? $"Error HTTP {status}.";
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
