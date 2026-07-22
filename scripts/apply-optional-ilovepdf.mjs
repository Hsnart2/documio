import { readFile, writeFile } from "node:fs/promises";

const routePath = new URL("../app/api/analyze/route.ts", import.meta.url);
const text = await readFile(routePath, "utf8");
const marker = "Compressione PDF saltata: chiavi iLovePDF non configurate.";

if (text.includes(marker)) {
  console.log("Optional iLovePDF patch already applied.");
  process.exit(0);
}

const oldBlock = `    if (isPdf && sourceBuffer.length > 4 * 1024 * 1024) {
      const publicKey = process.env.ILOVEPDF_PUBLIC_KEY;
      const secretKey = process.env.ILOVEPDF_SECRET_KEY;

      if (!publicKey || !secretKey) {
        return NextResponse.json(
          { error: "Chiavi iLovePDF non configurate." },
          { status: 500 },
        );
      }

      temporaryInputPath = path.join(
        os.tmpdir(),
        \`\${crypto.randomUUID()}-\${sourceFileName.replace(/[^a-zA-Z0-9._-]+/g, "-")}\`,
      );
      await fs.writeFile(temporaryInputPath, sourceBuffer);

      try {
        const api = new ILovePDFApi(publicKey, secretKey);
        const task = api.newTask("compress");
        await task.start();
        await task.addFile(new ILovePDFFile(temporaryInputPath));
        await task.process({ compression_level: "extreme" });
        const downloaded = await task.download();
        const compressed = Buffer.isBuffer(downloaded)
          ? downloaded
          : Buffer.from(downloaded);

        if (compressed.length > 0 && compressed.length < sourceBuffer.length) {
          sourceBuffer = compressed;
        }
      } finally {
        await fs.unlink(temporaryInputPath).catch(() => undefined);
        temporaryInputPath = null;
      }
    }
`;

const newBlock = `    if (isPdf && sourceBuffer.length > 4 * 1024 * 1024) {
      const publicKey = process.env.ILOVEPDF_PUBLIC_KEY;
      const secretKey = process.env.ILOVEPDF_SECRET_KEY;

      if (!publicKey || !secretKey) {
        console.warn("Compressione PDF saltata: chiavi iLovePDF non configurate.");
      } else {
        temporaryInputPath = path.join(
          os.tmpdir(),
          \`\${crypto.randomUUID()}-\${sourceFileName.replace(/[^a-zA-Z0-9._-]+/g, "-")}\`,
        );
        await fs.writeFile(temporaryInputPath, sourceBuffer);

        try {
          const api = new ILovePDFApi(publicKey, secretKey);
          const task = api.newTask("compress");
          await task.start();
          await task.addFile(new ILovePDFFile(temporaryInputPath));
          await task.process({ compression_level: "extreme" });
          const downloaded = await task.download();
          const compressed = Buffer.isBuffer(downloaded)
            ? downloaded
            : Buffer.from(downloaded);

          if (compressed.length > 0 && compressed.length < sourceBuffer.length) {
            sourceBuffer = compressed;
          }
        } catch (compressionError) {
          console.warn(
            "Compressione iLovePDF non riuscita, continuo con il PDF originale:",
            compressionError,
          );
        } finally {
          await fs.unlink(temporaryInputPath).catch(() => undefined);
          temporaryInputPath = null;
        }
      }
    }
`;

if (!text.includes(oldBlock)) {
  throw new Error("iLovePDF compression block not found; patch not applied.");
}

await writeFile(routePath, text.replace(oldBlock, newBlock), "utf8");
console.log("Made iLovePDF compression optional for PDFs up to 20 MB.");
