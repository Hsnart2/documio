import { readFile, writeFile } from "node:fs/promises";

const pagePath = new URL("../app/page.tsx", import.meta.url);
let text = await readFile(pagePath, "utf8");

const replacements = [
  [
    '"Per registrarti devi accettare Privacy Policy e Termini beta."',
    '"Per registrarti devi accettare Privacy Policy e Termini e condizioni."',
  ],
  [
    '"You must accept the Privacy Policy and beta Terms to register."',
    '"You must accept the Privacy Policy and Terms and Conditions to register."',
  ],
  ['{language === "it" ? "Termini beta" : "beta Terms"}', '{language === "it" ? "Termini e condizioni" : "Terms and Conditions"}'],
];

for (const [from, to] of replacements) {
  if (text.includes(from)) text = text.replace(from, to);
}

const oldSignUpOptions = `      options: {
        emailRedirectTo: "https://documio.vercel.app",
      },`;

const newSignUpOptions = `      options: {
        emailRedirectTo: "https://documio.vercel.app",
        data: {
          privacy_policy_version: "1.0",
          terms_version: "1.0",
          cookie_policy_version: "1.0",
          legal_accepted_at: new Date().toISOString(),
          legal_acceptance_source: "web_registration",
          legal_locale: language,
        },
      },`;

if (text.includes(oldSignUpOptions)) {
  text = text.replace(oldSignUpOptions, newSignUpOptions);
}

const oldLegalLinks = `            <a href="/terms" target="_blank">
              {language === "it" ? "Termini e condizioni" : "Terms and Conditions"}
            </a>
            .`;

const newLegalLinks = `            <a href="/terms" target="_blank">
              {language === "it" ? "Termini e condizioni" : "Terms and Conditions"}
            </a>
            {language === "it" ? ", inclusa la " : ", including the "}
            <a href="/cookie" target="_blank">
              Cookie Policy
            </a>
            .`;

if (text.includes(oldLegalLinks)) {
  text = text.replace(oldLegalLinks, newLegalLinks);
}

await writeFile(pagePath, text, "utf8");
console.log("Applied DocuMio legal compliance labels and acceptance metadata.");
