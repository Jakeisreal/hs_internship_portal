$ErrorActionPreference = "Stop"

$workspace = (Resolve-Path ".").Path
$packageDir = Join-Path $workspace "__netlify_source"
$zipPath = Join-Path $workspace "hwashin_netlify_source.zip"

if (Test-Path -LiteralPath $packageDir) {
  $resolved = (Resolve-Path -LiteralPath $packageDir).Path
  if (-not $resolved.StartsWith($workspace)) {
    throw "Refusing to remove outside workspace: $resolved"
  }
  Remove-Item -LiteralPath $resolved -Recurse -Force
}

if (Test-Path -LiteralPath $zipPath) {
  $resolvedZip = (Resolve-Path -LiteralPath $zipPath).Path
  if (-not $resolvedZip.StartsWith($workspace)) {
    throw "Refusing to remove outside workspace: $resolvedZip"
  }
  Remove-Item -LiteralPath $resolvedZip -Force
}

New-Item -ItemType Directory -Path $packageDir | Out-Null

$items = @(
  ".gitignore",
  "admin.html",
  "applicants_sample.csv",
  "deploy_netlify.ps1",
  "index.html",
  "NETLIFY_QUICK_DEPLOY.md",
  "netlify.toml",
  "package-lock.json",
  "package.json",
  "README.md",
  "result.html",
  "netlify",
  "scripts"
)

foreach ($item in $items) {
  $source = Join-Path $workspace $item
  $target = Join-Path $packageDir $item
  if (Test-Path -LiteralPath $source -PathType Container) {
    Copy-Item -LiteralPath $source -Destination $target -Recurse
  } elseif (Test-Path -LiteralPath $source -PathType Leaf) {
    $parent = Split-Path -Parent $target
    if ($parent -and -not (Test-Path -LiteralPath $parent)) {
      New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    Copy-Item -LiteralPath $source -Destination $target
  }
}

Compress-Archive -Path (Join-Path $packageDir "*") -DestinationPath $zipPath -Force
Remove-Item -LiteralPath $packageDir -Recurse -Force

Write-Output $zipPath
