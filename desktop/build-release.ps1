$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "ImageBridge.Desktop\ImageBridge.Desktop.csproj"
dotnet --version
dotnet publish $project -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true
$out = Join-Path $PSScriptRoot "ImageBridge.Desktop\bin\Release\net8.0-windows\win-x64\publish"
Write-Host ""
Write-Host "Build terminado. Ejecutable: $out\ImageBridge.exe" -ForegroundColor Green
