import { fetchPublic, httpUrl } from "@/lib/remote";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = httpUrl(new URL(request.url).searchParams.get("src") ?? "");
  if (!url) return new Response(null, { status: 400 });

  try {
    const { bytes, contentType } = await fetchPublic(url, "image");
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": contentType.split(";")[0].trim(),
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
