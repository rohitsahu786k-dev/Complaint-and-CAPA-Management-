import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const detectors = [
  {
    name: "MongoDB URI with embedded credentials",
    regex: /mongodb(?:\+srv)?:\/\/(?!<)[^:\s/]+:(?!<)[^@\s]+@/gi
  },
  {
    name: "Cloudinary URL with embedded credentials",
    regex: /cloudinary:\/\/(?!<)[^:\s]+:(?!<)[^@\s]+@/gi
  },
  {
    name: "Private key material",
    regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g
  },
  {
    name: "AWS access key",
    regex: /AKIA[0-9A-Z]{16}/g
  },
  {
    name: "Non-placeholder SMTP app password assignment",
    regex: /^\+?SMTP_APP_PASSWORD[ \t]*=[ \t]*(?![ \t]*(?:$|<|YOUR_|REPLACE_|CHANGE_ME|xxxx))[^\r\n#]{8,}$/gim
  },
  {
    name: "Non-placeholder Cloudinary API secret assignment",
    regex: /^\+?CLOUDINARY_API_SECRET[ \t]*=[ \t]*(?![ \t]*(?:$|<|YOUR_|REPLACE_|CHANGE_ME))[^\r\n#]{8,}$/gim
  }
];

const excluded = new Set(["scripts/secret-scan.mjs", "package-lock.json"]);

function containsSecret(text) {
  return detectors
    .filter(({ regex }) => {
      regex.lastIndex = 0;
      return regex.test(text);
    })
    .map(({ name }) => name);
}

let failed = false;
const files = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
for (const file of files) {
  if (excluded.has(file)) continue;
  let content = "";
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const findings = containsSecret(content);
  if (findings.length) {
    failed = true;
    console.error(`Secret hygiene failure in tracked file: ${file} (${findings.join(", ")})`);
  }
}

try {
  const history = execFileSync("git", ["log", "-p", "--all", "--format="], {
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024
  });
  const historyFindings = containsSecret(history);
  if (historyFindings.length) {
    failed = true;
    console.error(
      `Secret hygiene failure in Git history (${historyFindings.join(", ")}). Rotate the affected credential and purge history before release.`
    );
  }
} catch (error) {
  console.error("Unable to inspect Git history for secrets.");
  process.exitCode = 2;
  throw error;
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log("Secret hygiene scan passed for tracked files and Git patch history.");
}
