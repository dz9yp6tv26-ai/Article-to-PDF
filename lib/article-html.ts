import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { blockTags, type Article, type Block, type BlockTag } from "./article";
import { httpUrl, RequestError } from "./remote";

const blocks = new Set<string>(blockTags);
const structural = "article,section,div,header,footer,main,aside,figure,p,h2,h3,ul,ol,blockquote,pre,img";
const allowedTags = [
  ...blockTags, "figcaption", "li", "a", "b", "strong", "i", "em", "u", "s",
  "del", "small", "mark", "sup", "sub", "span", "br", "code", "kbd", "samp",
  "article", "section", "div", "header", "footer", "main", "aside", "hr",
];

function sanitizer(window: JSDOM["window"]) {
  const purify = createDOMPurify(window);
  return (html: string) => purify.sanitize(html, {
    ALLOWED_TAGS: allowedTags,
    ALLOWED_ATTR: ["href", "src", "alt", "title", "start", "reversed", "value"],
    ALLOWED_URI_REGEXP: /^https?:\/\//i,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
  });
}

function normalizeImages(document: ParentNode, base: string) {
  for (const img of document.querySelectorAll("img")) {
    const picture = img.closest("picture");
    const srcset = img.getAttribute("data-srcset") ?? img.getAttribute("srcset")
      ?? picture?.querySelector("source[srcset]")?.getAttribute("srcset");
    const candidates = [
      img.getAttribute("data-src"),
      img.getAttribute("data-lazy-src"),
      img.getAttribute("data-original"),
      img.getAttribute("src"),
      srcset?.trim().split(/\s|,/)[0],
    ];
    const source = candidates.map((src) => src?.trim() && httpUrl(src.trim(), base)).find(Boolean);
    if (source) img.setAttribute("src", source.href);
    else img.removeAttribute("src");
    for (const name of ["srcset", "sizes", "loading", "data-src", "data-lazy-src", "data-original", "data-srcset"]) {
      img.removeAttribute(name);
    }
  }
}

function unwrap(node: Element) {
  node.replaceWith(...node.childNodes);
}

function present(node: Element) {
  return Boolean(node.textContent?.trim() || node.matches("img[src]") || node.querySelector("img[src]"));
}

function articleBlocks(root: DocumentFragment): Block[] {
  const result: Block[] = [];
  const document = root.ownerDocument;

  function add(node: Element) {
    if (present(node)) {
      result.push({ id: `block-${result.length + 1}`, tag: node.localName as BlockTag, html: node.outerHTML });
    }
  }

  function collect(block: Element) {
    if (block.matches("figure,img")) {
      add(block);
      return;
    }
    const media = Array.from(block.querySelectorAll("figure,img[src]"))
      .filter((node) => !node.parentElement?.closest("figure"));
    if (!media.length) {
      add(block);
      return;
    }

    // Lift embedded media into independent blocks while preserving inline text.
    const range = document.createRange();
    range.selectNodeContents(block);
    const addSegment = () => {
      const segment = block.cloneNode(false) as Element;
      segment.append(range.cloneContents());
      add(segment);
    };
    for (const image of media) {
      range.setEndBefore(image);
      addSegment();
      add(image);
      range.setStartAfter(image);
      range.setEnd(block, block.childNodes.length);
    }
    addSegment();
  }

  function visit(parent: ParentNode) {
    const openParagraph = document.createElement("p");
    const flush = () => {
      collect(openParagraph);
      openParagraph.replaceChildren();
    };
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType === 1 && blocks.has((node as Element).localName)) {
        flush();
        collect(node as Element);
      } else if (node.nodeType === 1 && ((node as Element).matches(structural) || (node as Element).querySelector(structural))) {
        flush();
        visit(node as Element);
      } else if (node.nodeType === 1 || node.nodeType === 3) {
        openParagraph.append(node.cloneNode(true));
      }
    }
    flush();
  }

  visit(root);
  return result;
}

export function parseArticle(bytes: Buffer, url: URL, contentType: string): Article {
  const dom = new JSDOM(bytes, { url: url.href, contentType });

  try {
    const { document } = dom.window;
    const base = httpUrl(document.baseURI)?.href ?? url.href;
    const date = document.querySelector('meta[property="article:published_time"]')?.getAttribute("content")
      ?? document.querySelector("article time[datetime]")?.getAttribute("datetime") ?? "";
    const byline = document.querySelector('meta[name="author"]')?.getAttribute("content") ?? "";
    normalizeImages(document, base);
    for (const picture of document.querySelectorAll("picture")) {
      const image = picture.querySelector("img");
      if (image) picture.replaceWith(image);
    }
    const article = new Readability(document, { maxElemsToParse: 45_000 }).parse();
    if (!article?.content) throw new RequestError("본문을 찾지 못했습니다. 공개 기사 URL을 확인해 주세요.", 422);

    const title = article.title?.trim() || "제목 없는 아티클";
    const fragment = JSDOM.fragment(article.content);
    const firstHeading = fragment.querySelector("h1,h2");
    if (firstHeading?.textContent?.replace(/\s+/g, " ").trim() === title.replace(/\s+/g, " ")) {
      firstHeading.remove();
    }
    normalizeImages(fragment, base);
    for (const img of fragment.querySelectorAll("img")) {
      const src = img.getAttribute("src");
      const resolved = src && httpUrl(src, base);
      if (resolved) img.setAttribute("src", resolved.href);
      else img.remove();
    }
    for (const link of fragment.querySelectorAll("a[href]")) {
      const href = httpUrl(link.getAttribute("href")!, base);
      if (href) link.setAttribute("href", href.href);
      else link.removeAttribute("href");
    }
    for (const heading of fragment.querySelectorAll("h1,h4,h5,h6")) {
      const replacement = heading.ownerDocument.createElement(heading.matches("h1") ? "h2" : "h3");
      replacement.append(...heading.childNodes);
      heading.replaceWith(replacement);
    }
    // Keep images that are the only contents of an anchor independently removable.
    for (const link of fragment.querySelectorAll("a")) {
      if (!link.textContent?.trim() && link.querySelector("img")) unwrap(link);
    }
    const cleanContainer = fragment.ownerDocument.createElement("div");
    cleanContainer.append(fragment);
    const clean = sanitizer(dom.window)(cleanContainer.innerHTML);
    const result = articleBlocks(clean);
    if (!result.length) throw new RequestError("편집할 수 있는 본문 블록을 찾지 못했습니다.", 422);
    return {
      title: title.slice(0, 500),
      byline: (article.byline || byline).trim().slice(0, 300),
      date: (article.publishedTime || date).trim().slice(0, 100),
      domain: url.hostname.replace(/^www\./i, ""),
      blocks: result,
    };
  } finally {
    dom.window.close();
  }
}

export function sanitizeBlocks(html: string[]) {
  const dom = new JSDOM("");
  try {
    const sanitize = sanitizer(dom.window);
    return html.map((value) => {
      const fragment = sanitize(value);
      const container = fragment.ownerDocument.createElement("div");
      container.append(fragment);
      return container.innerHTML;
    });
  } finally {
    dom.window.close();
  }
}
