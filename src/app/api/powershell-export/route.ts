import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

export async function GET() {
  const zipPath = path.join(process.cwd(), "public", "dirham-pulse-uae-finance.zip");
  if (!fs.existsSync(zipPath)) {
    return NextResponse.json({ error: "ZIP archive not found" }, { status: 404 });
  }
  const b64 = fs.readFileSync(zipPath).toString("base64");

  const psScript = [
    `$ErrorActionPreference = "Stop"`,
    `$targetDir = "D:\\Personal\\Personal-Projects"`,
    `$projectDir = "D:\\Personal\\Personal-Projects\\personal-finance-tracker"`,
    `New-Item -ItemType Directory -Force -Path $targetDir | Out-Null`,
    `$zipFile = Join-Path $targetDir "personal-finance-tracker.zip"`,
    `$b64 = "${b64}"`,
    `[IO.File]::WriteAllBytes($zipFile, [Convert]::FromBase64String($b64))`,
    `Expand-Archive -Path $zipFile -DestinationPath $targetDir -Force`,
    `Remove-Item $zipFile -Force`,
    `Set-Location $projectDir`,
    `if (-not (Test-Path ".git")) { git init; git branch -M main }`,
    `git add .`,
    `git commit -m "feat: DirhamPulse UAE personal finance & debt management portal" 2>$null`,
    `git remote remove origin 2>$null`,
    `git remote add origin https://github.com/ameertechy/personal-finance-tracker.git`,
    `Write-Host "✅ Project saved to $projectDir! Pushing to GitHub..." -ForegroundColor Green`,
    `git push -u origin main`,
  ].join("\r\n");

  return NextResponse.json({ script: psScript });
}
