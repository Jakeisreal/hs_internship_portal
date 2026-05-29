param(
  [string]$ServiceAccountJson,
  [string]$SheetId,
  [string]$AdminKey,
  [string]$SheetName = "applicants",
  [switch]$Draft
)

$ErrorActionPreference = "Stop"

function Require-File($Path, $Label) {
  if (-not $Path) {
    $candidates = @(Get-ChildItem -LiteralPath "." -Filter "*.json" |
      Where-Object { $_.Name -notin @("package.json", "package-lock.json") } |
      Select-Object -ExpandProperty FullName)

    if ($candidates.Count -eq 1) {
      $Path = $candidates[0]
      Write-Host "Found $Label automatically: $Path"
    } else {
      $Path = Read-Host "Enter $Label file path"
    }
  }
  $resolved = Resolve-Path -LiteralPath $Path
  if (-not $resolved) {
    throw "$Label file was not found: $Path"
  }
  return $resolved.Path
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is required. Install Node.js and run this script again."
}

if (-not (Test-Path -LiteralPath "package.json")) {
  throw "Run this script from the project root folder."
}

$ServiceAccountJson = Require-File $ServiceAccountJson "Google Service Account JSON"
if (-not $SheetId) { $SheetId = Read-Host "Enter GOOGLE_SHEET_ID" }
if (-not $AdminKey) { $AdminKey = Read-Host "Enter ADMIN_KEY" }

$serviceAccount = Get-Content -LiteralPath $ServiceAccountJson -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $serviceAccount.client_email -or -not $serviceAccount.private_key) {
  throw "client_email/private_key was not found in the Service Account JSON."
}

$privateKeyBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($serviceAccount.private_key))

Write-Host "Installing dependencies and checking build..."
npm install
npm run check
npm run build

Write-Host "Checking Netlify login. A browser login may open..."
npx netlify login

Write-Host "Linking a Netlify site. Choose an existing site or create a new one."
npx netlify init

Write-Host "Setting Netlify environment variables..."
npx netlify env:set GOOGLE_SERVICE_ACCOUNT_EMAIL $serviceAccount.client_email
npx netlify env:set GOOGLE_PRIVATE_KEY_BASE64 $privateKeyBase64
npx netlify env:set GOOGLE_SHEET_ID $SheetId
npx netlify env:set ADMIN_KEY $AdminKey
npx netlify env:set GOOGLE_SHEET_NAME $SheetName

if ($Draft) {
  Write-Host "Deploying draft..."
  npx netlify deploy --build
} else {
  Write-Host "Deploying production..."
  npx netlify deploy --prod --build
}

Write-Host "Done. The Google Sheet must be shared with the Service Account email as an editor."
