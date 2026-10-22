import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

const ALLOWED = new Set([180, 192, 512]);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ size: string }> },
) {
  const { size: raw } = await params;
  const size = Number(raw);

  if (!ALLOWED.has(size)) {
    return new Response("Not found", { status: 404 });
  }

  const fontSize = Math.round(size * 0.38);
  const radius = Math.round(size * 0.22);

  return new ImageResponse(
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
        borderRadius: radius,
        color: "white",
        fontSize,
        fontWeight: 700,
        letterSpacing: "-0.02em",
      }}
    >
      PL
    </div>,
    {
      width: size,
      height: size,
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    },
  );
}
