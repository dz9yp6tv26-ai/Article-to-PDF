"use client";

import { useMemo, useState, type CSSProperties, type FormEvent, type SyntheticEvent } from "react";
import {
  ArrowDownToLine, ArrowRight, BookOpen, ChevronDown, Eye, EyeOff, FileText,
  Link2, LoaderCircle, Palette, Scissors, Trash2, Type, Undo2,
} from "lucide-react";
import { defaultStyle, fonts, metadata, presets, readerVariables, widths, type Article, type Block, type BlockTag, type ReaderStyle } from "@/lib/article";

const sample: Article = {
  title: "아침을 천천히 시작하는 법",
  byline: "편집 예시",
  date: "",
  domain: "",
  blocks: ([
    ["p", "<p>아침이 되면 우리는 가장 가까운 화면부터 켠다. 밤새 도착한 메시지를 읽고 오늘의 할 일을 떠올리는 사이, 커피는 식고 창밖의 빛은 이미 바뀌어 있다.</p>"],
    ["p", "<p>하루의 시작을 조금 느리게 보내는 일에는 특별한 준비가 필요 없다. 책 한 쪽을 읽거나, 차가 우러날 때까지 잠깐 창가에 머물러 보는 것만으로도 충분하다.</p>"],
    ["blockquote", "<blockquote><p>오늘의 첫 몇 분을 어떻게 보낼지, 먼저 내가 정해 본다.</p></blockquote>"],
    ["h2", "<h2>작게 시작하기</h2>"],
    ["p", "<p>시계를 보지 않고 할 수 있는 일을 하나 골라 보자. 이불을 정리하는 일도 좋고, 어제 읽다 만 책의 한 문장을 다시 읽는 일도 좋다. 날마다 같은 일을 할 필요는 없다.</p>"],
    ["p", "<p>며칠 뒤에는 무엇이 마음에 남았는지 돌아본다. 그날의 날씨였을 수도 있고, 평소에는 지나쳤던 바깥의 소리였을 수도 있다.</p>"],
  ] as [BlockTag, string][]).map(([tag, html], i) => ({ id: `sample-${i + 1}`, tag, html })),
};

const colorControls = [
  ["background", "배경색"],
  ["text", "글자색"],
  ["accent", "강조색"],
] as const;

const isMedia = (block: Block) => block.tag === "img" || (block.tag === "figure" && block.html.includes("<img"));

function previewHtml(html: string) {
  if (!html.includes("<img")) return html;
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("img[src]").forEach((img) => {
    img.setAttribute("src", `/api/image?src=${encodeURIComponent(img.getAttribute("src")!)}`);
    img.setAttribute("loading", "lazy");
  });
  return template.innerHTML;
}

function showImageFallback(event: SyntheticEvent<HTMLDivElement>) {
  const image = event.target;
  if (!(image instanceof HTMLImageElement)) return;
  const fallback = document.createElement("span");
  fallback.className = "image-unavailable";
  fallback.textContent = image.alt
    ? `이미지를 불러오지 못했습니다. (${image.alt})`
    : "이미지를 불러오지 못했습니다.";
  image.replaceWith(fallback);
}

async function responseError(response: Response, fallback: string) {
  const data = await response.json().catch(() => null);
  return new Error(data?.error || fallback);
}

export default function Editor() {
  const [url, setUrl] = useState("");
  const [article, setArticle] = useState(sample);
  const [style, setStyle] = useState(defaultStyle);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [hideImages, setHideImages] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [pdfError, setPdfError] = useState("");
  const [announcement, setAnnouncement] = useState("");

  const visible = article.blocks.filter((block) => !deleted.includes(block.id) && (!hideImages || !isMedia(block)));
  const preview = useMemo(() => new Map(article.blocks.map((block) => [block.id, previewHtml(block.html)])), [article]);
  const articleMeta = metadata(article);

  function change<K extends keyof ReaderStyle>(key: K, value: ReaderStyle[K]) {
    setStyle((previous) => ({ ...previous, [key]: value }));
  }

  async function loadArticle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setLoadError("");
    setPdfError("");
    try {
      const response = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!response.ok) throw await responseError(response, "아티클을 불러올 수 없습니다.");
      setArticle(await response.json() as Article);
      setDeleted([]);
      setAnnouncement("아티클을 불러왔습니다.");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "아티클을 불러올 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function savePdf() {
    setExporting(true);
    setPdfError("");
    try {
      const response = await fetch("/api/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ article: { ...article, blocks: visible }, style }),
      });
      if (!response.ok) throw await responseError(response, "PDF를 저장할 수 없습니다.");

      const href = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = href;
      link.download = `${article.title.replace(/[<>:"/\\|?*]/g, "_").trim().slice(0, 90) || "article"}.pdf`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 15_000);
      setAnnouncement("PDF 다운로드를 시작했습니다.");
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : "PDF를 저장할 수 없습니다.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header flex items-center">
        <div className="brand-icon"><BookOpen size={21} strokeWidth={1.85} aria-hidden="true" /></div>
        <div>
          <div className="brand-title">Article to PDF</div>
          <p className="brand-subtitle">아티클 편집기</p>
        </div>
      </header>

      <main className="workspace">
        <aside className="controls" aria-label="아티클 설정">
          <div className="control-scroll">
            <section className="control-section">
              <h2><Link2 /> 아티클 가져오기</h2>
              <form onSubmit={loadArticle} className="space-y-2.5">
                <label className="sr-only" htmlFor="article-url">아티클 URL</label>
                <input id="article-url" className="control-input" type="text" inputMode="url" autoComplete="url"
                  placeholder="https://example.com/article" value={url} onChange={(event) => setUrl(event.target.value)} required />
                <button className="load-button" type="submit" disabled={loading || !url.trim()}>
                  {loading ? <LoaderCircle className="animate-spin" /> : <ArrowRight />}
                  {loading ? "불러오는 중…" : "아티클 불러오기"}
                </button>
                {loadError && <p className="error-message" role="alert">{loadError}</p>}
              </form>
            </section>

            <section className="control-section">
              <h2><Type /> 타이포그래피</h2>
              <div className="select-wrap">
                <label className="sr-only" htmlFor="reader-font">폰트</label>
                <select id="reader-font" className="control-input" value={style.font}
                  onChange={(event) => change("font", event.target.value as ReaderStyle["font"])}>
                  {Object.entries(fonts).map(([key, font]) => <option key={key} value={key}>{font.label}</option>)}
                </select>
                <ChevronDown size={15} aria-hidden="true" />
              </div>
              <label className="slider-field">
                <span>글자 크기 <output>{style.fontSize}px</output></span>
                <input type="range" min="14" max="22" step="1" value={style.fontSize}
                  onChange={(event) => change("fontSize", event.target.valueAsNumber)} />
              </label>
              <label className="slider-field">
                <span>줄 간격 <output>{style.lineHeight.toFixed(1)}</output></span>
                <input type="range" min="1.5" max="2.1" step="0.1" value={style.lineHeight}
                  onChange={(event) => change("lineHeight", event.target.valueAsNumber)} />
              </label>
              <fieldset className="width-field">
                <legend>본문 너비</legend>
                <div className="width-options">
                  {widths.map((width) =>
                    <button type="button" key={width} aria-pressed={style.width === width} onClick={() => change("width", width)}>
                      {width}px
                    </button>
                  )}
                </div>
              </fieldset>
            </section>

            <section className="control-section">
              <h2><Palette /> 색상 커스텀</h2>
              <div className="preset-grid">
                {presets.map(({ label, colors }) => (
                  <button type="button" key={label}
                    aria-pressed={colorControls.every(([key]) => style[key] === colors[key])}
                    onClick={() => setStyle((previous) => ({ ...previous, ...colors }))}>
                    <span className="preset-dot" style={{ backgroundColor: colors.background }} />{label}
                  </button>
                ))}
              </div>
              <div className="color-fields">
                {colorControls.map(([key, label]) => (
                  <label key={key}>
                    <input aria-label={label} type="color" value={style[key]} onChange={(event) => change(key, event.target.value)} />
                    {label}
                  </label>
                ))}
              </div>
            </section>

            <section className="control-section">
              <h2><Scissors /> 편집 도구</h2>
              <div className="edit-actions">
                <button type="button" disabled={!deleted.length}
                  onClick={() => { setDeleted((previous) => previous.slice(0, -1)); setAnnouncement("마지막으로 삭제한 블록을 복원했습니다."); }}>
                  <Undo2 /> 삭제 되돌리기
                </button>
                <button type="button" aria-pressed={hideImages}
                  onClick={() => { setHideImages(!hideImages); setAnnouncement(hideImages ? "이미지를 표시합니다." : "모든 이미지를 숨겼습니다."); }}>
                  {hideImages ? <EyeOff /> : <Eye />} {hideImages ? "이미지 보이기" : "이미지 숨기기"}
                </button>
              </div>
            </section>
          </div>

          <footer className="control-footer">
            {pdfError && <p className="error-message" role="alert">{pdfError}</p>}
            <button type="button" className="save-button" onClick={savePdf} disabled={exporting || loading}>
              {exporting ? <LoaderCircle className="animate-spin" /> : <ArrowDownToLine />}
              {exporting ? "PDF 만드는 중…" : "PDF로 저장하기"}
            </button>
          </footer>
        </aside>

        <section className="preview" aria-labelledby="preview-title">
          <div className="preview-bar">
            <h2 id="preview-title"><FileText /> 미리보기</h2>
            <span className="preview-count">{visible.length}개 블록</span>
            <span className="paper-size">A4 <span>210 × 297 mm</span></span>
          </div>
          <article className="paper reader-paper" aria-label="편집할 아티클" style={readerVariables(style) as CSSProperties}>
            <div className="reader-content">
              <header className="reader-heading">
                <h1>{article.title}</h1>
                {articleMeta && <p className="reader-meta">{articleMeta}</p>}
              </header>
              {visible.map((block, index) => (
                <div className="reader-block editable-block" data-tag={block.tag} key={block.id}>
                  <div className="block-html" onErrorCapture={showImageFallback} dangerouslySetInnerHTML={{ __html: preview.get(block.id)! }} />
                  <button type="button" className="delete-block" title="블록 삭제" aria-label={`${index + 1}번째 블록 삭제`}
                    onClick={() => { setDeleted((previous) => [...previous, block.id]); setAnnouncement(`${index + 1}번째 블록을 삭제했습니다.`); }}>
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
              ))}
              {!visible.length && <p className="empty-copy">표시할 본문 블록이 없습니다.</p>}
            </div>
          </article>
        </section>
      </main>
      <div className="sr-only" role="status">{announcement}</div>
    </div>
  );
}
