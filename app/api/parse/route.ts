import { parseArticle } from "@/lib/article-html";
import { errorResponse, fetchPublic, httpUrl, readJson, RequestError } from "@/lib/remote";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = await readJson(request, 10_000) as { url?: unknown } | null;
    const value = typeof input?.url === "string" ? input.url.trim() : "";
    const target = httpUrl(/^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`);
    if (!target) throw new RequestError("올바른 공개 기사 URL을 입력해 주세요.");

    const { bytes, url, contentType } = await fetchPublic(target, "html");
    return Response.json(parseArticle(bytes, url, contentType));
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return errorResponse(new RequestError("원본 사이트의 응답 시간이 초과되었습니다.", 504), "");
    }
    return errorResponse(error, "아티클을 불러올 수 없습니다. URL이나 원본 페이지 접속 상태를 확인해 주세요.");
  }
}
