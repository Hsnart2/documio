$ErrorActionPreference = "Stop"

Write-Host "Scarico il globals.css funzionante da GitHub..." -ForegroundColor Cyan
git fetch origin main

if ($LASTEXITCODE -ne 0) {
    throw "Non sono riuscito a scaricare origin/main."
}

$original = git show origin/main:app/globals.css

if ($LASTEXITCODE -ne 0 -or -not $original) {
    throw "Non sono riuscito a leggere app/globals.css da GitHub."
}

$fix = @'

/* FIX MODALE NUOVA PRATICA SU MOBILE */
.upload-modal {
  display: flex;
  flex-direction: column;
  max-height: calc(100dvh - 20px);
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding-bottom: calc(18px + env(safe-area-inset-bottom));
}

.upload-modal form {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.upload-modal form > .primary.full[type="submit"] {
  position: sticky;
  bottom: 0;
  z-index: 10;
  min-height: 50px;
  flex: 0 0 auto;
  margin-top: 20px;
  margin-bottom: 0;
  justify-content: center;
  font-size: 16px !important;
  background: var(--accent);
  color: #fff;
  box-shadow: 0 -10px 24px rgba(23, 32, 51, 0.12);
}

@media (max-width: 720px) {
  .modal-backdrop {
    align-items: center;
    padding:
      max(10px, env(safe-area-inset-top))
      max(10px, env(safe-area-inset-right))
      max(10px, env(safe-area-inset-bottom))
      max(10px, env(safe-area-inset-left));
  }

  .upload-modal {
    width: 100%;
    max-height: calc(100dvh - 20px);
    padding: 20px 16px calc(16px + env(safe-area-inset-bottom));
    border-radius: 22px;
  }

  .upload-modal h2 {
    padding-right: 48px;
  }

  .upload-modal input,
  .upload-modal select,
  .upload-modal textarea,
  .upload-modal label {
    width: 100%;
    min-width: 0;
    max-width: 100%;
  }

  .upload-modal form > .primary.full[type="submit"] {
    bottom: calc(-16px - env(safe-area-inset-bottom));
    width: calc(100% + 32px);
    margin-left: -16px;
    margin-right: -16px;
    padding: 14px 16px calc(14px + env(safe-area-inset-bottom));
    border-radius: 0 0 20px 20px;
  }
}
'@

$content = ($original -join [Environment]::NewLine) + [Environment]::NewLine + $fix
Set-Content -Path "app\globals.css" -Value $content -Encoding UTF8

Write-Host ""
Write-Host "Fatto: app\globals.css è stato ripristinato da GitHub e corretto." -ForegroundColor Green
Write-Host "Ora in VS Code controlla il file e poi esegui:" -ForegroundColor Yellow
Write-Host "git add app/globals.css"
Write-Host "git commit -m `"Fix modal nuova pratica su mobile`""
Write-Host "git push origin main"
