import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import ILovePDFApi from "@ilovepdf/ilovepdf-nodejs";
import ILovePDFFile from "@ilovepdf/ilovepdf-nodejs/ILovePDFFile";

export const runtime = "nodejs";
export const maxDuration = 60;

const MIN_PDF_SIZE = 2 * 1024 * 1024;
const MAX_PDF_SIZE = 40 * 1024 * 1024;
const MIN_SAVING_PERCENT = 10;

function safePdfName(name: string) {
  const base = name
    .replace(/\.pdf$/i, "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return `${base || "documento"}.pdf`;
}

export async function POST(request: Request) {
  let inputPath: string | null = null;

  try {
    const publicKey = process.env.ILOVEPDF_PUBLIC_KEY;
    const secretKey = process.env.ILOVEPDF_SECRET_KEY;

    if (!publicKey || !secretKey) {
      return NextResponse.json(
        { error: "Chiavi iLovePDF non configurate." },
        { status: 500 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File mancante." }, { status: 400 });
    }

    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      return NextResponse.json(
        { compressed: false, reason: "not-pdf" },
        { status: 200 },
      );
    }

    if (file.size < MIN_PDF_SIZE) {
      return NextResponse.json(
        {
          compressed: false,
          reason: "below-threshold",
          originalSize: file.size,
        },
        { status: 200 },
      );
    }

    if (file.size > MAX_PDF_SIZE) {
      return NextResponse.json(
        { error: "Il PDF supera il limite di 40 MB." },
        { status: 413 },
      );
    }

    const tempName = `${crypto.randomUUID()}-${safePdfName(file.name)}`;
    inputPath = path.join(os.tmpdir(), tempName);
    await fs.writeFile(inputPath, Buffer.from(await file.arrayBuffer()));

    const api = new ILovePDFApi(publicKey, secretKey);
    const task = api.newTask("compress");

    await task.start();
    await task.addFile(new ILovePDFFile(inputPath));
    await task.process({ compression_level: "extreme" });

    const downloaded = await task.download();
    const compressedBuffer = Buffer.isBuffer(downloaded)
      ? downloaded
      : Buffer.from(downloaded);

    const savingPercent =
      ((file.size - compressedBuffer.length) / file.size) * 100;

    if (
      compressedBuffer.length >= file.size ||
      savingPercent < MIN_SAVING_PERCENT
    ) {
      return NextResponse.json(
        {
          compressed: false,
          reason: "insufficient-saving",
          originalSize: file.size,
          attemptedSize: compressedBuffer.length,
          savingPercent: Math.max(0, Math.round(savingPercent)),
        },
        { status: 200 },
      );
    }

    return new NextResponse(new Uint8Array(compressedBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safePdfName(file.name)}"`,
        "X-Documio-Compressed": "true",
        "X-Original-Size": String(file.size),
        "X-Compressed-Size": String(compressedBuffer.length),
        "X-Saving-Percent": String(Math.round(savingPercent)),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("PDF compression error:", error);

    return NextResponse.json(
      {
        error: "Compressione PDF non disponibile.",
        fallbackToOriginal: true,
      },
      { status: 502 },
    );
  } finally {
    if (inputPath) {
      await fs.unlink(inputPath).catch(() => undefined);
    }
  }
}
