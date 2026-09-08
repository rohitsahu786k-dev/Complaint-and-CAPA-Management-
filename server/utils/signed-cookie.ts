import { createHmac, timingSafeEqual } from "node:crypto";

function signature(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64").replace(/=+$/, "");
}

export function signCookieValue(value: string, secret: string) {
  return `s:${value}.${signature(value, secret)}`;
}

export function unsignCookieValue(value: string, secret: string) {
  const signedValue = value.startsWith("s:") ? value.slice(2) : value;
  const signatureIndex = signedValue.lastIndexOf(".");
  if (signatureIndex <= 0) return undefined;

  const unsignedValue = signedValue.slice(0, signatureIndex);
  const expected = `${unsignedValue}.${signature(unsignedValue, secret)}`;
  const actualBuffer = Buffer.from(signedValue);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return undefined;

  return timingSafeEqual(actualBuffer, expectedBuffer) ? unsignedValue : undefined;
}
