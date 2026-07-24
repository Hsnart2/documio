import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

function getEncryptionKey() {
  const raw = process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("EMAIL_TOKEN_ENCRYPTION_KEY mancante");

  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("EMAIL_TOKEN_ENCRYPTION_KEY deve essere una chiave base64 da 32 byte");
  }
  return key;
}

export function encryptEmailSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptEmailSecret(value: string) {
  const [ivValue, tagValue, encryptedValue] = value.split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("Segreto cifrato non valido");

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function signEmailOauthState(payload: object) {
  const secret = process.env.EMAIL_OAUTH_STATE_SECRET;
  if (!secret) throw new Error("EMAIL_OAUTH_STATE_SECRET mancante");

  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyEmailOauthState<T>(state: string): T {
  const secret = process.env.EMAIL_OAUTH_STATE_SECRET;
  if (!secret) throw new Error("EMAIL_OAUTH_STATE_SECRET mancante");

  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) throw new Error("Stato OAuth non valido");

  const expected = createHmac("sha256", secret).update(encoded).digest("base64url");
  if (signature.length !== expected.length || !timingSafeEqualText(signature, expected)) {
    throw new Error("Firma OAuth non valida");
  }

  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as T;
}

function timingSafeEqualText(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left[index] ^ right[index];
  return result === 0;
}
