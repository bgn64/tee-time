# Reset demo data + seed pro imposter accounts in one go.
#
# Prerequisites (one-time):
#   1. Migration 016 applied via Supabase Dashboard -> SQL Editor.
#      File: supabase/migrations/016_demo_seeds_auto_friend.sql
#   2. .env at the repo root with SUPABASE_URL and
#      SUPABASE_SERVICE_ROLE_KEY (you already have these).
#
# Usage:
#   ./scripts/reset-and-seed-demo.ps1
#   ./scripts/reset-and-seed-demo.ps1 -SkipConfirm   # no prompts (CI-like)
#
# What it does:
#   1. Verifies you have a clean working tree (commits aren't required;
#      but uncommitted local edits won't be reflected if you also push
#      a new app build afterward).
#   2. Dry-runs the demo seed script and prints the plan.
#   3. Asks for confirmation (unless -SkipConfirm).
#   4. Wipes every auth.users row and reseeds pro imposters with
#      enriched venues + rounds + auto-friend trigger active.

param(
    [switch]$SkipConfirm
)

$ErrorActionPreference = 'Stop'

# Resolve repo root regardless of where the script is invoked from.
$repoRoot = (Resolve-Path -Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Demo data reset + pro imposter seeding"                     -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Repo root: $repoRoot"
Write-Host ""

# --- Sanity: required files ---
$migration = Join-Path $repoRoot 'supabase\migrations\016_demo_seeds_auto_friend.sql'
$seedScript = Join-Path $repoRoot 'scripts\seed-demo-pros.ts'
foreach ($p in @($migration, $seedScript)) {
    if (-not (Test-Path $p)) {
        Write-Host "Missing required file: $p" -ForegroundColor Red
        exit 1
    }
}

# --- Sanity: .env has the keys we need ---
$envPath = Join-Path $repoRoot '.env'
if (-not (Test-Path $envPath)) {
    Write-Host "Missing .env at $envPath" -ForegroundColor Red
    exit 1
}
$envText = Get-Content $envPath -Raw
foreach ($key in @('SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY')) {
    if ($envText -notmatch "(?m)^$key=") {
        Write-Host "$key not found in .env" -ForegroundColor Red
        exit 1
    }
}

# --- Reminder about migration 016 ---
Write-Host "PREREQUISITE — migration 016 must already be applied." -ForegroundColor Yellow
Write-Host "If you have not yet pasted supabase/migrations/016_demo_seeds_auto_friend.sql"
Write-Host "into the Supabase Dashboard SQL editor and run it, do that first."
Write-Host "(If it has been applied, the seed will succeed; otherwise it will fail with"
Write-Host " a clear 'column is_demo_seed does not exist' error and nothing will be wiped.)"
Write-Host ""

if (-not $SkipConfirm) {
    $proceed = Read-Host "Migration applied? [y/N]"
    if ($proceed -ne 'y' -and $proceed -ne 'Y') {
        Write-Host "Aborting. Apply migration 016 first." -ForegroundColor Yellow
        exit 0
    }
}

# --- Step 1: dry-run plan ---
Write-Host ""
Write-Host "Step 1/2: dry-run plan" -ForegroundColor Cyan
Write-Host "------------------------------------------------------------" -ForegroundColor Cyan
& npx tsx scripts/seed-demo-pros.ts --dry-run
if ($LASTEXITCODE -ne 0) {
    Write-Host "Dry-run failed (exit $LASTEXITCODE)." -ForegroundColor Red
    exit $LASTEXITCODE
}

# --- Confirmation gate ---
Write-Host ""
Write-Host "WARNING — this will DELETE every auth.users row + cascade." -ForegroundColor Yellow
Write-Host "Course catalog stays intact. Custom user courses go with their users."
Write-Host ""

if (-not $SkipConfirm) {
    $proceed = Read-Host "Proceed with the destructive reset + seed? [y/N]"
    if ($proceed -ne 'y' -and $proceed -ne 'Y') {
        Write-Host "Aborted before any writes." -ForegroundColor Yellow
        exit 0
    }
}

# --- Step 2: real run ---
Write-Host ""
Write-Host "Step 2/2: applying writes" -ForegroundColor Cyan
Write-Host "------------------------------------------------------------" -ForegroundColor Cyan
& npx tsx scripts/seed-demo-pros.ts
if ($LASTEXITCODE -ne 0) {
    Write-Host "Seed failed (exit $LASTEXITCODE)." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Done." -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next: sign in to the deployed app with Google. Migration 016's"
Write-Host "trigger auto-friends you with every pro on profile insert. Open"
Write-Host "the Feed tab and you should see ~20 rounds across 4 pros."
Write-Host ""
