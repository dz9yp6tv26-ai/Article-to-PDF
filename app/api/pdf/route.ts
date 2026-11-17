import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { chromium } from "playwright-core";
import { blockTags, fonts, metadata, readerCss, readerVariables, widths, type Article, type Block, type ReaderStyle } from "@/lib/article";
import { sanitizeBlocks } from "@/lib/article-html";
import { errorResponse, fetchPublic, httpUrl, readJson, RequestError } from "@/lib/remote";

export const runtime = "nodejs";
export const maxDuration = 60;

const renderOrigin = "http://article-to-pdf.invalid";

function validate(input: unknown) {
  const data = input as { article?: Partial<Article>; style?: Partial<ReaderStyle> } | null;
  const article = data?.article;
  const style = data?.style;
  const invalidArticle = !article || typeof article.title !== "string" || !article.title.trim()
    || article.title.length > 500 || typeof article.byline !== "string" || article.byline.length > 300
    || typeof article.date !== "string" || article.date.length > 100
    || typeof article.domain !== "string" || article.domain.length > 255
    || !Array.isArray(article.blocks) || article.blocks.length > 2_500
    || article.blocks.some((block: Block) => !block || typeof block.id !== "string"
      || !blockTags.includes(block.tag) || typeof block.html !== "string");
  if (invalidArticle) throw new RequestError("PDF로 저장할 아티클을 확인해 주세요.");

  const hex = (value: unknown) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
  if (!style || typeof style.font !== "string" || !Object.hasOwn(fonts, style.font)
    || typeof style.fontSize !== "number" || style.fontSize < 14 || style.fontSize > 22
    || typeof style.lineHeight !== "number" || style.lineHeight < 1.5 || style.lineHeight > 2.1
    || !widths.some((width) => width === style.width)
    || ![style.background, style.text, style.accent].every(hex)) {
    throw new RequestError("PDF 스타일 설정을 확인해 주세요.");
  }
  return { article: article as Article, style: style as ReaderStyle };
}

function escapeHtml(text: string) {
  const chars: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return text.replace(/[&<>"']/g, (char) => chars[char]);
}

async function fontForPrint(font: ReaderStyle["font"]) {
  const cssFile = join(process.cwd(), "node_modules", font === "pretendard"
    ? "pretendard/dist/web/variable/pretendardvariable.css"
    : "@fontsource-variable/noto-serif-kr/index.css");
  const css = await readFile(cssFile, "utf8");
  const files = new Map<string, string>();
  return {
    css: css.replace(/url\(['"]?\.\/([^'")]+)['"]?\)/g, (_, source: string) => {
      const url = `/fonts/${source}`;
      files.set(url, join(dirname(cssFile), source));
      return `url("${url}")`;
    }),
    files,
  };
}

async function launchBrowser() {
  const executablePath = process.env.CHROME_EXECUTABLE_PATH;
  const local = process.env.PDF_CHROMIUM === "local" || process.env.NODE_ENV === "development" 
    || process.platform !== "linux" || process.arch !== "x64";
  if (executablePath || local) return chromium.launch({ headless: true, executablePath, timeout: 15_000 });

  const { default: serverless } = await import("@sparticuz/chromium");
  return chromium.launch({
    headless: true,
    args: serverless.args,
    executablePath: await serverless.executablePath(),
    timeout: 15_000,
  });
}

export async function POST(request: Request) {
  let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;

  try {
    const { article, style } = validate(await readJson(request, 5 * 1024 * 1024));
    const markup = sanitizeBlocks(article.blocks.map((block) => block.html));
    const { css: fontCss, files } = await fontForPrint(style.font);
    const variables = Object.entries(readerVariables(style)).map(([key, value]) => `${key}:${value}`).join(";");
    const blocks = markup.map((html, index) =>
      `<div class="reader-block" data-tag="${article.blocks[index].tag}">${html}</div>`
    ).join("");
    const meta = escapeHtml(metadata(article));
    const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(article.title)}</title><style>
${fontCss}
:root { ${variables}; }
@page { background: ${style.background}; }
html, body { margin: 0; padding: 0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
${readerCss}
.reader-heading, .reader-block[data-tag="figure"], .reader-block[data-tag="img"],
.reader-block[data-tag="blockquote"], figure, img, blockquote { break-inside: avoid; }
h2, h3, .reader-block[data-tag="h2"], .reader-block[data-tag="h3"] { break-after: avoid; }
.reader-content img { max-height: 215mm; }
p, li { orphans: 3; widows: 3; }
</style></head><body class="reader-paper">
<main class="reader-content">
<header class="reader-heading"><h1>${escapeHtml(article.title)}</h1>${meta ? `<p class="reader-meta">${meta}</p>` : ""}</header>
${blocks}
</main></body></html>`;

    browser = await launchBrowser();
    const page = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 794, height: 1123 } });
    page.setDefaultTimeout(20_000);
    await page.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      try {
        if (url.href === `${renderOrigin}/` && request.resourceType() === "document") {
          await route.fulfill({
            contentType: "text/html; charset=utf-8",
            headers: {
              "Content-Security-Policy": "default-src 'none'; img-src https: http:; style-src 'unsafe-inline'; font-src 'self'; base-uri 'none'",
            },
            body: html,
          });
        } else if (url.origin === renderOrigin && files.has(url.pathname) && request.resourceType() === "font") {
          await route.fulfill({ contentType: "font/woff2", body: await readFile(files.get(url.pathname)!) });
        } else if (request.resourceType() === "image" && httpUrl(url.href)) {
          const image = await fetchPublic(url, "image");
          await route.fulfill({ contentType: image.contentType, body: image.bytes });
        } else {
          await route.abort();
        }
      } catch {
        await route.abort().catch(() => {});
      }
    });

    await page.goto(renderOrigin, { waitUntil: "load" });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images, (image) => image.decode().catch(() => image.remove())));
    });

    const margin = { top: "20mm", right: "20mm", bottom: "20mm", left: "20mm" };
    const pdf = await page.pdf({ format: "A4", margin, printBackground: true });
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="article.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (!(error instanceof RequestError)) console.error("PDF rendering failed", error);
    return errorResponse(error, "PDF를 만들 수 없습니다. Chromium 설치와 서버 로그를 확인해 주세요.", 500);
  } finally {
    await browser?.close().catch(() => {});
  }
}
