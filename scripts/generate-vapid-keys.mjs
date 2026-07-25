import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
});
const publicJwk = publicKey.export({ format: "jwk" });
const privateJwk = privateKey.export({ format: "jwk" });

if (!publicJwk.x || !publicJwk.y || !privateJwk.d) {
  throw new Error("Generazione chiavi VAPID non riuscita.");
}

const x = Buffer.from(publicJwk.x, "base64url");
const y = Buffer.from(publicJwk.y, "base64url");
const uncompressedPublicKey = Buffer.concat([Buffer.from([4]), x, y]);

console.log("NEXT_PUBLIC_VAPID_PUBLIC_KEY=" + uncompressedPublicKey.toString("base64url"));
console.log("VAPID_PRIVATE_KEY=" + privateJwk.d);
console.log("VAPID_SUBJECT=mailto:INSERISCI_LA_TUA_EMAIL");
console.log("\nConserva la chiave privata solo nelle variabili protette di Vercel.");
