export const blockTags = ["p", "h2", "h3", "ul", "ol", "blockquote", "figure", "img", "pre"] as const;
export type BlockTag = (typeof blockTags)[number];

export type Block = { id: string; tag: BlockTag; html: string };
export type Article = {
  title: string;
  byline: string;
  date: string;
  domain: string;
  blocks: Block[];
};

export const fonts = {
  pretendard: { label: "Pretendard", css: 'Pretendard Variable, Pretendard, "Apple SD Gothic Neo", sans-serif' },
  noto: { label: "Noto Serif KR", css: '"Noto Serif KR Variable", "Noto Serif KR", serif' },
  georgia: { label: "Georgia", css: 'Georgia, "Noto Serif KR Variable", serif' },
};

export const widths = [600, 680, 760] as const;

export type Colors = { background: string; text: string; accent: string };
export type ReaderStyle = Colors & {
  font: keyof typeof fonts;
  fontSize: number;
  lineHeight: number;
  width: (typeof widths)[number];
};

export const presets: { label: string; colors: Colors }[] = [
  { label: "화이트", colors: { background: "#ffffff", text: "#252334", accent: "#6b4ecf" } },
  { label: "세피아", colors: { background: "#f7edda", text: "#3d3024", accent: "#934e32" } },
  { label: "라이트그레이", colors: { background: "#edf0f4", text: "#243143", accent: "#425baa" } },
  { label: "다크", colors: { background: "#21212a", text: "#efedf7", accent: "#c4adff" } },
];

export const defaultStyle: ReaderStyle = {
  ...presets[0].colors, font: "pretendard", fontSize: 18, lineHeight: 1.8, width: 680,
};

export function readerVariables(style: ReaderStyle) {
  return {
    "--reader-bg": style.background,
    "--reader-text": style.text,
    "--reader-accent": style.accent,
    "--reader-font": fonts[style.font].css,
    "--reader-size": `${style.fontSize}px`,
    "--reader-leading": String(style.lineHeight),
    "--reader-width": `${style.width}px`,
  };
}

export function metadata(article: Pick<Article, "byline" | "date" | "domain">) {
  const date = article.date.match(/^(\d{4})-(\d{2})-(\d{2})/)?.slice(1).join(". ") ?? article.date;
  return [article.byline, date, article.domain].filter(Boolean).join(" · ");
}

export const readerCss = `
.reader-paper { background: var(--reader-bg); color: var(--reader-text); }
.reader-content { max-width: var(--reader-width); margin-inline: auto; font: var(--reader-size)/var(--reader-leading) var(--reader-font); word-break: keep-all; overflow-wrap: anywhere; }
.reader-content h1 { margin: 0; font-size: 2.65em; line-height: 1.22; font-weight: 720; letter-spacing: -.045em; text-wrap: balance; }
.reader-meta { margin: .95em 0 0; color: var(--reader-accent); font-size: .76em; font-weight: 620; }
.reader-heading { margin-bottom: 1.55em; padding-bottom: 1.25em; border-bottom: 1px solid color-mix(in srgb, var(--reader-text) 14%, transparent); }
.reader-block { position: relative; margin: 0 0 .95em; }
.reader-block > :first-child { margin-top: 0; }
.reader-block > :last-child { margin-bottom: 0; }
.reader-content h2, .reader-content h3 { line-height: 1.34; letter-spacing: -.03em; font-weight: 700; }
.reader-content h2 { font-size: 1.55em; margin: 1.25em 0 .52em; }
.reader-content h3 { font-size: 1.24em; margin: 1.1em 0 .45em; }
.reader-block[data-tag="h2"], .reader-block[data-tag="h3"] { margin-top: 1.45em; margin-bottom: .48em; }
.reader-content p { margin: .8em 0; }
.reader-content a { color: var(--reader-accent); text-decoration: underline; text-underline-offset: .18em; }
.reader-content ul, .reader-content ol { padding-left: 1.55em; margin: .7em 0; }
.reader-content ul { list-style-type: disc; }
.reader-content ol { list-style-type: decimal; }
.reader-content li + li { margin-top: .26em; }
.reader-content blockquote { margin: .85em 0; border-left: 3px solid var(--reader-accent); background: color-mix(in srgb, var(--reader-accent) 7%, var(--reader-bg)); padding: .85em 1.15em; }
.reader-content blockquote > :first-child { margin-top: 0; }
.reader-content blockquote > :last-child { margin-bottom: 0; }
.reader-content figure { margin: 1em 0; }
.reader-content figure img, .reader-content img { display: block; max-width: 100%; width: auto; height: auto; object-fit: contain; }
.reader-content figcaption { margin-top: .45em; font-size: .8em; color: var(--reader-accent); }
.reader-content pre { white-space: pre-wrap; overflow-wrap: anywhere; margin: .85em 0; padding: .8em 1em; background: color-mix(in srgb, var(--reader-text) 7%, var(--reader-bg)); font: .8em/1.6 ui-monospace, monospace; }
.reader-content :not(pre) > code { font-family: ui-monospace, monospace; font-size: .85em; }
`;
