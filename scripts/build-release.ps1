$ErrorActionPreference = 'Stop'

$rootDir = Split-Path -Parent $PSScriptRoot
$packageJson = Get-Content (Join-Path $rootDir 'package.json') -Raw | ConvertFrom-Json
$distDir = Join-Path $rootDir 'dist'
$manifestV2Source = Join-Path $rootDir 'src\manifest-v2.json'
$releaseBuildDir = Join-Path $rootDir 'release-build'
$releaseArtifactsDir = Join-Path $rootDir 'release-artifacts'
$version = $packageJson.version
$packageName = $packageJson.name
$requireFirefoxSigning = $false
$firefoxApiKey = $env:WEB_EXT_API_KEY
$firefoxApiSecret = $env:WEB_EXT_API_SECRET
$firefoxExtensionId = $env:FIREFOX_EXTENSION_ID
$firefoxSignChannel = $env:FIREFOX_SIGN_CHANNEL

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Test-TruthyValue {
  param(
    [AllowEmptyString()][string]$Value
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $false
  }

  return @('1', 'true', 'yes', 'on') -contains $Value.Trim().ToLowerInvariant()
}

function Get-MissingFirefoxSigningVariables {
  param(
    [AllowEmptyString()][string]$ApiKey,
    [AllowEmptyString()][string]$ApiSecret,
    [AllowEmptyString()][string]$ExtensionId
  )

  $missing = @()

  if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    $missing += 'WEB_EXT_API_KEY'
  }

  if ([string]::IsNullOrWhiteSpace($ApiSecret)) {
    $missing += 'WEB_EXT_API_SECRET'
  }

  if ([string]::IsNullOrWhiteSpace($ExtensionId)) {
    $missing += 'FIREFOX_EXTENSION_ID'
  }

  return $missing
}

function New-ZipFromDirectoryContents {
  param(
    [Parameter(Mandatory = $true)][string]$SourceDirectory,
    [Parameter(Mandatory = $true)][string]$DestinationFile
  )

  if (Test-Path $DestinationFile) {
    Remove-Item $DestinationFile -Force
  }

  $archive = [System.IO.Compression.ZipFile]::Open($DestinationFile, [System.IO.Compression.ZipArchiveMode]::Create)
  $baseDirectory = (Resolve-Path $SourceDirectory).Path.TrimEnd('\') + '\'

  try {
    Get-ChildItem $SourceDirectory -Recurse -File | ForEach-Object {
      $relativePath = $_.FullName.Substring($baseDirectory.Length)
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $archive,
        $_.FullName,
        $relativePath,
        [System.IO.Compression.CompressionLevel]::Optimal
      ) | Out-Null
    }
  } finally {
    $archive.Dispose()
  }
}

if (-not (Test-Path $distDir)) {
  throw 'dist directory not found. Run the webpack build before packaging release artifacts.'
}

$requireFirefoxSigning = Test-TruthyValue $env:REQUIRE_FIREFOX_SIGNING

if ([string]::IsNullOrWhiteSpace($firefoxSignChannel)) {
  $firefoxSignChannel = 'unlisted'
}

$missingFirefoxSigningVariables = Get-MissingFirefoxSigningVariables `
  -ApiKey $firefoxApiKey `
  -ApiSecret $firefoxApiSecret `
  -ExtensionId $firefoxExtensionId

$firefoxSigningConfigured = $missingFirefoxSigningVariables.Count -eq 0
$partialFirefoxSigningConfiguration = $missingFirefoxSigningVariables.Count -gt 0 -and $missingFirefoxSigningVariables.Count -lt 3

if ($partialFirefoxSigningConfiguration) {
  throw ("Firefox signing configuration is incomplete. Set all of WEB_EXT_API_KEY, WEB_EXT_API_SECRET, and FIREFOX_EXTENSION_ID or leave all of them unset. Missing: {0}" -f ($missingFirefoxSigningVariables -join ', '))
}

if ($requireFirefoxSigning -and -not $firefoxSigningConfigured) {
  throw ("Firefox signing is required for this release, but these variables are missing: {0}" -f ($missingFirefoxSigningVariables -join ', '))
}

Remove-Item $releaseBuildDir -Recurse -Force -ErrorAction Ignore
Remove-Item $releaseArtifactsDir -Recurse -Force -ErrorAction Ignore
New-Item -ItemType Directory -Path $releaseBuildDir | Out-Null
New-Item -ItemType Directory -Path $releaseArtifactsDir | Out-Null

$manifestV3Dir = Join-Path $releaseBuildDir 'manifest-v3'
$manifestV2Dir = Join-Path $releaseBuildDir 'manifest-v2'

Copy-Item $distDir $manifestV3Dir -Recurse
Copy-Item $distDir $manifestV2Dir -Recurse

$manifestV2 = Get-Content $manifestV2Source -Raw | ConvertFrom-Json
$manifestV2.description = $packageJson.description
$manifestV2.version = $version

if (-not [string]::IsNullOrWhiteSpace($firefoxExtensionId)) {
  if (-not $manifestV2.PSObject.Properties['browser_specific_settings']) {
    $manifestV2 | Add-Member -MemberType NoteProperty -Name browser_specific_settings -Value ([PSCustomObject]@{})
  }

  if (-not $manifestV2.browser_specific_settings.PSObject.Properties['gecko']) {
    $manifestV2.browser_specific_settings | Add-Member -MemberType NoteProperty -Name gecko -Value ([PSCustomObject]@{})
  }

  if ($manifestV2.browser_specific_settings.gecko.PSObject.Properties['id']) {
    $manifestV2.browser_specific_settings.gecko.id = $firefoxExtensionId
  } else {
    $manifestV2.browser_specific_settings.gecko | Add-Member -MemberType NoteProperty -Name id -Value $firefoxExtensionId
  }
}

$manifestV2 | ConvertTo-Json -Depth 100 | Set-Content (Join-Path $manifestV2Dir 'manifest.json') -Encoding utf8

$manifestV3Zip = Join-Path $releaseArtifactsDir "$packageName-$version-manifest-v3.zip"
$manifestV2Zip = Join-Path $releaseArtifactsDir "$packageName-$version-manifest-v2.zip"
$manifestV2Xpi = Join-Path $releaseArtifactsDir "$packageName-$version-manifest-v2.xpi"

New-ZipFromDirectoryContents -SourceDirectory $manifestV3Dir -DestinationFile $manifestV3Zip
New-ZipFromDirectoryContents -SourceDirectory $manifestV2Dir -DestinationFile $manifestV2Zip

if ($firefoxSigningConfigured) {
  if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
    throw 'Firefox signing requires npx, but it was not found on PATH.'
  }

  Write-Host "Signing Firefox XPI via Mozilla ($firefoxSignChannel channel)..."

  & npx web-ext sign `
    --channel $firefoxSignChannel `
    --source-dir $manifestV2Dir `
    --artifacts-dir $releaseArtifactsDir `
    --api-key $firefoxApiKey `
    --api-secret $firefoxApiSecret `
    --filename ([System.IO.Path]::GetFileName($manifestV2Xpi)) `
    --approval-timeout 600000

  if ($LASTEXITCODE -ne 0) {
    throw 'Firefox signing failed.'
  }
} else {
  Write-Host 'Firefox signing skipped. Configure REQUIRE_FIREFOX_SIGNING=true plus WEB_EXT_API_KEY, WEB_EXT_API_SECRET, and FIREFOX_EXTENSION_ID to produce a signed XPI.'
}

Write-Host ''
Write-Host 'Release artifacts created:'
Get-ChildItem $releaseArtifactsDir | Sort-Object Name | Select-Object Name, Length | Format-Table -AutoSize
Write-Host 'Chromium note: use the manifest-v3 ZIP for browser-store submission and manual unpacked installs. GitHub Releases no longer produce a CRX because Chromium rejects external CRX installs.'
