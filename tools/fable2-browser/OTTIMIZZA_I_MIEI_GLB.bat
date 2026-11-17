@echo off
setlocal
chcp 65001 >nul
set "CARTELLA=%~1"
if not defined CARTELLA (
  echo Trascina la cartella con i tuoi GLB su questo .bat
  echo oppure incolla qui sotto il percorso della cartella.
  set /p "CARTELLA=Cartella GLB: "
)
if not defined CARTELLA (
  echo Nessuna cartella indicata.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Ottimizza-GLB.ps1" -Cartella "%CARTELLA%" -Qualita mobile
echo.
echo Per compressione ultra, apri il .ps1 con -Qualita ultra
pause
