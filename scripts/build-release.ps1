$ErrorActionPreference = 'Stop'

$rootDir = Split-Path -Parent $PSScriptRoot
$packageJson = Get-Content (Join-Path $rootDir 'package.json') -Raw | ConvertFrom-Json
$distDir = Join-Path $rootDir 'dist'
$manifestV2Source = Join-Path $rootDir 'src\\manifest-v2.json'
$releaseBuildDir = Join-Path $rootDir 'release-build'
$releaseArtifactsDir = Join-Path $rootDir 'release-artifacts'
$version = $packageJson.version
$packageName = $packageJson.name

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

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

$browserCandidates = @(
  'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files\Google\Chrome\Application\chrome.exe',
  'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'
)

$browserExecutable = $browserCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $browserExecutable) {
  throw 'No Chromium-based browser executable found for CRX packaging.'
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
$manifestV2 | ConvertTo-Json -Depth 100 | Set-Content (Join-Path $manifestV2Dir 'manifest.json')

$manifestV3Zip = Join-Path $releaseArtifactsDir "$packageName-$version-manifest-v3.zip"
$manifestV2Zip = Join-Path $releaseArtifactsDir "$packageName-$version-manifest-v2.zip"
$manifestV2Xpi = Join-Path $releaseArtifactsDir "$packageName-$version-manifest-v2.xpi"
$manifestV3Crx = Join-Path $releaseArtifactsDir "$packageName-$version-manifest-v3.crx"

New-ZipFromDirectoryContents -SourceDirectory $manifestV3Dir -DestinationFile $manifestV3Zip
New-ZipFromDirectoryContents -SourceDirectory $manifestV2Dir -DestinationFile $manifestV2Zip
Copy-Item $manifestV2Zip $manifestV2Xpi -Force

& $browserExecutable "--pack-extension=$manifestV3Dir"

$generatedCrx = "$manifestV3Dir.crx"
$generatedPem = "$manifestV3Dir.pem"

for ($i = 0; $i -lt 30 -and -not (Test-Path $generatedCrx); $i++) {
  Start-Sleep -Seconds 1
}

if (-not (Test-Path $generatedCrx)) {
  throw 'CRX packaging did not produce an output file.'
}

Move-Item $generatedCrx $manifestV3Crx -Force
Remove-Item $generatedPem -Force -ErrorAction Ignore
Remove-Item (Join-Path $rootDir 'dist.crx') -Force -ErrorAction Ignore
Remove-Item (Join-Path $rootDir 'dist.pem') -Force -ErrorAction Ignore

Write-Host 'Release artifacts created:'
Get-ChildItem $releaseArtifactsDir | Select-Object Name, Length | Format-Table -AutoSize
