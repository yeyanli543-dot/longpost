<#
.SYNOPSIS
    把 LongPost 源码打成一份"干净"的 zip（排除 node_modules / dist / .git 等）。

.DESCRIPTION
    默认输出到 桌面/LongPost-v<版本>-Complete.zip，版本号从 package.json 读取，
    不再写死 —— 之前写死 2.9.5 且把绝对路径钉在某一台机器上，换机或发版就会打错包。

.EXAMPLE
    pwsh ./scripts/create-clean-zip.ps1
    pwsh ./scripts/create-clean-zip.ps1 -SourceDir D:\antigravity\longpost -ZipFile D:\tmp\lp.zip
#>
param(
    [string]$SourceDir = (Split-Path -Parent $PSScriptRoot),
    [string]$ZipFile
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path (Join-Path $SourceDir 'package.json'))) {
    throw "未找到 package.json，SourceDir 看起来不是 LongPost 仓库根目录: $SourceDir"
}

# 版本号以 package.json 为唯一事实来源
$pkgVersion = (Get-Content (Join-Path $SourceDir 'package.json') -Raw | ConvertFrom-Json).version

if (-not $ZipFile) {
    $desktop = [Environment]::GetFolderPath('Desktop')
    $ZipFile = Join-Path $desktop "LongPost-v$pkgVersion-Complete.zip"
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zipDir = Split-Path -Parent $ZipFile
if ($zipDir -and -not (Test-Path $zipDir)) {
    New-Item -ItemType Directory -Path $zipDir -Force | Out-Null
}

if (Test-Path $ZipFile) {
    Remove-Item $ZipFile -Force
}

$zip = [System.IO.Compression.ZipFile]::Open($ZipFile, [System.IO.Compression.ZipArchiveMode]::Create)

$excludeFolders = @(
    'node_modules', '.git', 'dist', 'build', '.spark_project', 'coverage',
    '.vscode', '.idea', 'archive', 'release', '.verify'
)

$files = Get-ChildItem -Path $SourceDir -Recurse -File | Where-Object {
    $item = $_
    $rel = $item.FullName.Substring($SourceDir.Length).TrimStart('\', '/')
    $parts = $rel.Split([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
    $skip = $false
    foreach ($part in $parts) {
        if ($excludeFolders -contains $part) {
            $skip = $true
            break
        }
    }
    -not $skip
}

Write-Host "Adding $($files.Count) files to $ZipFile..."

foreach ($f in $files) {
    $rel = $f.FullName.Substring($SourceDir.Length).TrimStart('\', '/')
    $entryName = $rel.Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $f.FullName, $entryName, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
}

$zip.Dispose()

$size = (Get-Item $ZipFile).Length
Write-Host "Created $ZipFile successfully. Size: $([math]::Round($size / 1MB, 2)) MB ($size bytes)"
