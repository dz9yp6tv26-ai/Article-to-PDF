import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import ipaddr from "ipaddr.js";

export class RequestError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const imageTypes = /^image\/(?:jpeg|png|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon)$/i;

export function httpUrl(value: string, base?: string) {
  try {
    const url = new URL(value, base);
    if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password) return url;
  } catch {
    // Invalid URLs are omitted from articles.
  }
}

async function open(url: URL, signal: AbortSignal, accept: string): Promise<IncomingMessage> {
  if (url.port) throw new RequestError("공개 웹의 기본 HTTP 또는 HTTPS 포트만 사용할 수 있습니다.");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const records = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true });
  const isPublic = (address: string) => {
    const ip = ipaddr.process(address);
    return ip.range() === "unicast" && (ip.kind() === "ipv4" || /^[23]/.test(ip.toString()));
  };
  if (!records.length || records.some(({ address }) => !isPublic(address))) {
    throw new RequestError("공개 인터넷 주소만 불러올 수 있습니다.");
  }

  // Connect to the checked address and retain the original HTTP/TLS host.
  const address = records.find((record) => isIP(record.address) === 4)?.address ?? records[0].address;
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const req = request({
      hostname: address,
      servername: isIP(hostname) ? undefined : hostname,
      path: url.pathname + url.search,
      agent: false,
      signal,
      headers: {
        Host: url.host,
        Accept: accept,
        "Accept-Encoding": "gzip, deflate, br",
        "User-Agent": "Mozilla/5.0 (compatible; ArticleToPDF/1.0)",
      },
    }, resolve);
    req.on("error", reject);
    req.end();
  });
}

export async function readBytes(stream: AsyncIterable<Uint8Array>, maxBytes: number) {
  const parts: Uint8Array[] = [];
  let size = 0;
  for await (const bytes of stream) {
    size += bytes.length;
    if (size > maxBytes) throw new RequestError("파일 또는 요청의 크기가 너무 큽니다.", 413);
    parts.push(bytes);
  }
  return Buffer.concat(parts, size);
}

export async function readJson(req: Request, limit: number): Promise<unknown> {
  if (!req.body) throw new RequestError("요청 내용이 비어 있습니다.");
  const reader = req.body.getReader();
  async function* chunks() {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        yield value;
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
  }
  const body = await readBytes(chunks(), limit);
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    throw new RequestError("요청 내용을 확인해 주세요.");
  }
}

export async function fetchPublic(url: URL, kind: "html" | "image") {
  const html = kind === "html";
  const signal = AbortSignal.timeout(html ? 12_000 : 8_000);
  const accept = html ? "text/html,application/xhtml+xml;q=0.9" : "image/avif,image/webp,image/*";
  const maxBytes = html ? 4 * 1024 * 1024 : 10 * 1024 * 1024;

  for (let hop = 0; hop <= 5; hop++) {
    const response = await open(url, signal, accept);
    const status = response.statusCode ?? 0;
    const location = response.headers.location;
    if ([301, 302, 303, 307, 308].includes(status) && location) {
      response.destroy();
      const next = httpUrl(location, url.href);
      if (!next) throw new RequestError("이동할 웹 주소가 올바르지 않습니다.", 502);
      url = next;
      continue;
    }

    try {
      if (status < 200 || status >= 300) {
        throw new RequestError(`원본 사이트가 요청에 응답하지 않았습니다 (HTTP ${status}).`, 502);
      }
      const contentType = response.headers["content-type"] ?? "";
      const mime = contentType.split(";")[0].trim();
      if (html ? !/^(text\/html|application\/xhtml\+xml)$/i.test(mime) : !imageTypes.test(mime)) {
        throw new RequestError(html ? "HTML 기사 페이지의 URL을 입력해 주세요." : "지원하지 않는 이미지 형식입니다.", 415);
      }
      if (Number(response.headers["content-length"]) > maxBytes) {
        throw new RequestError("원본 파일의 크기가 너무 큽니다.", 413);
      }

      const encoding = response.headers["content-encoding"];
      const decoder = encoding === "gzip" ? createGunzip()
        : encoding === "br" ? createBrotliDecompress()
          : encoding === "deflate" ? createInflate() : null;

      if (decoder) response.on("error", (error) => decoder.destroy(error));
      const bytes = await readBytes(decoder ? response.pipe(decoder) : response, maxBytes);
      return { bytes, url, contentType };
    } finally {
      response.destroy();
    }
  }
  throw new RequestError("원본 주소가 너무 여러 번 이동했습니다.", 502);
}

export function errorResponse(error: unknown, fallback: string, status = 502) {
  if (error instanceof RequestError) return Response.json({ error: error.message }, { status: error.status });
  return Response.json({ error: fallback }, { status });
}
