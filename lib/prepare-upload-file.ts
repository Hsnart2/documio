export type PreparedUpload = {
  file: File;
  compressed: boolean;
  originalSize: number;
  finalSize: number;
  savingPercent: number;
};

async function compressImage(file: File): Promise<File> {
  const heic = /\.(heic|heif)$/i.test(file.name) ||
    /image\/hei[cf]/i.test(file.type);
  if (!file.type.startsWith("image/") && !heic) return file;
  if (!heic && file.size < 900_000) return file;

  // I telefoni Apple possono produrre HEIC. Quando il browser sa leggerli
  // la conversione avviene SOLO in locale, senza inviare il file originale
  // a un servizio esterno di compressione.
  if (typeof createImageBitmap !== "function") {
    if (heic) throw new Error("HEIC non convertibile qui: scegli JPG o PDF.");
    return file;
  }
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); }
  catch {
    if (heic) throw new Error("Il browser non legge HEIC: esporta la foto in JPG.");
    return file;
  }
  try {
    const maxSide = 1800;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      if (heic) throw new Error("Impossibile convertire HEIC: prova JPG.");
      return file;
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.78),
    );
    if (!blob) {
      if (heic) throw new Error("Conversione HEIC non disponibile: prova JPG.");
      return file;
    }
    if (!heic && blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",lastModified:Date.now(),
    });
  } finally {
    bitmap.close();
  }
}
async function compressPdf(file: File): Promise<PreparedUpload> {
  // La vecchia rotta /api/compress-file accettava tutto il PDF e poi
  // restituiva sempre "not compressed": solo traffico e latenza.
  // Il file originale passa direttamente a Supabase Storage in una sola volta.
  return {
    file,
    compressed: false,
    originalSize: file.size,
    finalSize: file.size,
    savingPercent: 0,
  };
}

export async function prepareFileForUpload(file: File): Promise<PreparedUpload> {
  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  if (isPdf) {
    return compressPdf(file);
  }

  const preparedImage = await compressImage(file);

  return {
    file: preparedImage,
    compressed: preparedImage.size < file.size,
    originalSize: file.size,
    finalSize: preparedImage.size,
    savingPercent:
      preparedImage.size < file.size
        ? Math.round(((file.size - preparedImage.size) / file.size) * 100)
        : 0,
  };
}
