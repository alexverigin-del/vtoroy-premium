import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import { Agent, request } from "node:https";
import { resolve } from "node:path";
import { rootCertificates } from "node:tls";

export const MAX_API_ORIGIN = "https://platform-api2.max.ru";
export const MAX_ROOT_CA_SHA256 =
  "D2:6D:2D:02:31:B7:C3:9F:92:CC:73:85:12:BA:54:10:35:19:E4:40:5D:68:B5:BD:70:3E:97:88:CA:8E:CF:31";
export const DEFAULT_MAX_CA_PATH = resolve(
  import.meta.dirname,
  "../../infra/communications/certificates/russian_trusted_root_ca.crt",
);

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const clients = new Map();

export function verifyMaxRootCertificate(pem) {
  let certificate;
  try {
    certificate = new X509Certificate(pem);
  } catch {
    throw new Error("MAX_CA_INVALID");
  }
  if (
    certificate.fingerprint256 !== MAX_ROOT_CA_SHA256 ||
    certificate.subject !== certificate.issuer ||
    !certificate.subject.includes("CN=Russian Trusted Root CA") ||
    certificate.ca !== true ||
    Date.parse(certificate.validFrom) > Date.now() ||
    Date.parse(certificate.validTo) <= Date.now()
  ) {
    throw new Error("MAX_CA_VERIFICATION_FAILED");
  }
  return certificate;
}

function requestBody(body) {
  if (body === undefined || body === null) return null;
  if (typeof body === "string" || Buffer.isBuffer(body) || body instanceof Uint8Array) return body;
  if (body instanceof URLSearchParams) return body.toString();
  throw new Error("MAX_API_BODY_UNSUPPORTED");
}

export function createMaxApiFetch(certificatePath = DEFAULT_MAX_CA_PATH) {
  const absolutePath = resolve(certificatePath);
  const cached = clients.get(absolutePath);
  if (cached) return cached;

  const pem = readFileSync(absolutePath, "utf8");
  verifyMaxRootCertificate(pem);
  const agent = new Agent({ ca: [...rootCertificates, pem], keepAlive: true, maxSockets: 8 });

  const client = async (input, init = {}) => {
    const url = input instanceof URL ? input : new URL(String(input));
    if (url.origin !== MAX_API_ORIGIN || url.username || url.password || url.port)
      throw new Error("MAX_API_ORIGIN_FORBIDDEN");
    const body = requestBody(init.body);
    return new Promise((resolveResponse, reject) => {
      const req = request(
        url,
        {
          agent,
          method: init.method || "GET",
          headers: init.headers,
          signal: init.signal,
        },
        (res) => {
          const chunks = [];
          let length = 0;
          res.on("data", (chunk) => {
            length += chunk.length;
            if (length > MAX_RESPONSE_BYTES) {
              res.destroy(new Error("MAX_API_RESPONSE_TOO_LARGE"));
              return;
            }
            chunks.push(chunk);
          });
          res.on("end", () => {
            const headers = new Headers();
            for (let index = 0; index < res.rawHeaders.length; index += 2)
              headers.append(res.rawHeaders[index], res.rawHeaders[index + 1]);
            resolveResponse(
              new Response(Buffer.concat(chunks), {
                status: res.statusCode || 500,
                statusText: res.statusMessage,
                headers,
              }),
            );
          });
          res.on("error", reject);
        },
      );
      req.on("error", reject);
      req.end(body);
    });
  };
  clients.set(absolutePath, client);
  return client;
}
