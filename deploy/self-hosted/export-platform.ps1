param(
    [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\..\prod-backups\platform-$(Get-Date -Format 'yyyyMMdd-HHmmss')")
)

$ErrorActionPreference = "Stop"
if (-not $env:SOURCE_DB_URL) {
    throw "Set SOURCE_DB_URL to the hosted Supabase direct or session-pooler connection string."
}
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$cli = Join-Path $root "node_modules\.bin\supabase.cmd"
if (-not (Test-Path $cli)) {
    throw "Run npm ci in the repository first."
}
if (Test-Path $OutputDirectory) {
    throw "Choose a new output directory; existing exports will not be overwritten."
}
New-Item -ItemType Directory -Path $OutputDirectory | Out-Null
$destination = (Resolve-Path $OutputDirectory).Path
$exports = @(
    @{ File = "roles.sql"; Flags = @("--role-only") },
    @{ File = "schema.sql"; Flags = @() },
    @{ File = "data.sql"; Flags = @("--data-only", "--use-copy") },
    @{ File = "history-schema.sql"; Flags = @("--schema", "supabase_migrations") },
    @{ File = "history-data.sql"; Flags = @("--schema", "supabase_migrations", "--data-only", "--use-copy") }
)
Push-Location $root
try {
    foreach ($export in $exports) {
        $arguments = @("db", "dump", "--db-url", $env:SOURCE_DB_URL, "--file", (Join-Path $destination $export.File)) + $export.Flags
        & $cli @arguments
        if ($LASTEXITCODE -ne 0) {
            throw "Export failed: $($export.File). This directory is incomplete; do not restore it."
        }
        if ((Get-Item (Join-Path $destination $export.File)).Length -eq 0) {
            throw "Export is empty: $($export.File). Do not restore this directory."
        }
    }
    $checksums = Get-ChildItem -LiteralPath $destination -Filter "*.sql" |
        Get-FileHash -Algorithm SHA256 |
        ForEach-Object { "$($_.Hash.ToLowerInvariant())  $(Split-Path $_.Path -Leaf)" }
    Set-Content -LiteralPath (Join-Path $destination "SHA256SUMS") `
        -Value (($checksums -join "`n") + "`n") -NoNewline -Encoding ascii
} finally {
    Pop-Location
}
Write-Host "Export complete: $destination. Contains private data; protect it and transfer over SSH."
