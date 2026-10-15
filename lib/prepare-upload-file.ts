export type PreparedUpload = {
  file: File;
  compressed: boolean;
  originalSize: number;
  finalSize: number;
  savingPercent: number;
};

async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 900_000) return file;

  const bitmap = await createImageBitmap(file);
  const maxSide = 1800;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }

  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.78),
  );

  if (!blob || blob.size >= file.size) return file;

  const baseName = file.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${baseName}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
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
