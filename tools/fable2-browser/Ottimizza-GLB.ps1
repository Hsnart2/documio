param(
  [Parameter(Mandatory=$true)]
  [string]$Cartella,
  [ValidateSet("mobile","ultra","alta")]
  [string]$Qualita = "mobile"
)
$ErrorActionPreference = "Stop"
$tool = Join-Path $PSScriptRoot "gltfpack.exe"
if (!(Test-Path -LiteralPath $tool)) { throw "gltfpack.exe mancante accanto al file PS1" }
if (!(Test-Path -LiteralPath $Cartella -PathType Container)) { throw "La cartella non esiste: $Cartella" }
$root = (Resolve-Path -LiteralPath $Cartella).Path.TrimEnd('\','/')
$outputDir = Join-Path $root "GLB_MOBILE_OTTIMIZZATI"
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

switch ($Qualita) {
    "alta"   { $texture = "0.75"; $mesh = "1";    $textureQuality = "8" }
    "mobile" { $texture = "0.5";  $mesh = "0.85"; $textureQuality = "6" }
    "ultra"  { $texture = "0.25"; $mesh = "0.65"; $textureQuality = "5" }
}
$files = @(Get-ChildItem -LiteralPath $root -Recurse -File -Filter "*.glb" |
  Where-Object {
    -not $_.FullName.StartsWith($outputDir + '\', [System.StringComparison]::OrdinalIgnoreCase) -and
    -not $_.BaseName.EndsWith("_mobile", [System.StringComparison]::OrdinalIgnoreCase) -and
    -not $_.BaseName.EndsWith("_f2ab_export_temp", [System.StringComparison]::OrdinalIgnoreCase)
  })
if ($files.Count -eq 0) { Write-Host "Nessun GLB originale da ottimizzare."; exit 0 }
Write-Host "File GLB trovati:" $files.Count
$totalInput=0L; $totalOutput=0L; $ok=0
foreach($file in $files) {
    $totalInput += [int64]$file.Length
    $relative = $file.FullName.Substring($root.Length).TrimStart('\','/')
    $relativeDir = Split-Path -Path $relative -Parent
    $destParent = if ($relativeDir) { Join-Path $outputDir $relativeDir } else { $outputDir }
    New-Item -ItemType Directory -Force -Path $destParent | Out-Null
    $target = Join-Path $destParent ($file.BaseName + "_mobile.glb")
    $candidate = Join-Path $destParent ($file.BaseName + "_mobile_in_compressione.glb")
    Remove-Item -LiteralPath $candidate -Force -ErrorAction SilentlyContinue
    Write-Host "Ottimizzo:" $relative
    & $tool -i $file.FullName -o $candidate -cc -tw -ts $texture -si $mesh -tq $textureQuality -kn -km -ke
    if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $candidate)) {
        Write-Warning "Conversione fallita: $relative"
        Remove-Item -LiteralPath $candidate -Force -ErrorAction SilentlyContinue
        continue
    }
    $size = (Get-Item -LiteralPath $candidate).Length
    $stream = [System.IO.File]::OpenRead($candidate)
    $magicBytes = New-Object byte[] 4
    try { $read = $stream.Read($magicBytes,0,4) } finally { $stream.Dispose() }
    $isGlb = $read -eq 4 -and [System.Text.Encoding]::ASCII.GetString($magicBytes) -eq "glTF"
    if (!$isGlb -or $size -ge $file.Length) {
        Write-Warning "Risultato non valido o non piu' piccolo: $relative"
        Remove-Item -LiteralPath $candidate -Force -ErrorAction SilentlyContinue
        continue
    }
    Move-Item -LiteralPath $candidate -Destination $target -Force
    $ok++
    $totalOutput += [int64]$size
    Write-Host ("OK: {0:N1} MB -> {1:N1} MB" -f ($file.Length / 1MB), ($size / 1MB))
}
Write-Host ("Convertiti {0}/{1}; input convertiti non sempre pari al totale indicato" -f $ok, $files.Count)
Write-Host ("Output mobile complessivo {0:N1} MB" -f ($totalOutput / 1MB))
Write-Host "Output:" $outputDir
Write-Host "I GLB originali NON sono stati toccati."
