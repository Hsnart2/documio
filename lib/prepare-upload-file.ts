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
  const originalSize = file.size;

  if (file.size < 2 * 1024 * 1024) {
    return {
      file,
      compressed: false,
      originalSize,
      finalSize: file.size,
      savingPercent: 0,
    };
  }

  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await fetch("/api/compress-file", {
      method: "POST",
      body: formData,
    });

    const contentType = response.headers.get("content-type") ?? "";

    if (!response.ok || contentType.includes("application/json")) {
      return {
        file,
        compressed: false,
        originalSize,
        finalSize: file.size,
        savingPercent: 0,
      };
    }

    const blob = await response.blob();
    if (!blob.size || blob.size >= file.size) {
      return {
        file,
        compressed: false,
        originalSize,
        finalSize: file.size,
        savingPercent: 0,
      };
    }

    const compressedFile = new File([blob], file.name, {
      type: "application/pdf",
      lastModified: Date.now(),
    });

    return {
      file: compressedFile,
      compressed: true,
      originalSize,
      finalSize: compressedFile.size,
      savingPercent: Math.round(
        ((originalSize - compressedFile.size) / originalSize) * 100,
      ),
    };
  } catch (error) {
    console.warn("PDF compression skipped:", error);

    return {
      file,
      compressed: false,
      originalSize,
      finalSize: file.size,
      savingPercent: 0,
    };
  }
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
