import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { SPLASH_DEVICES, splashFile } from "@/lib/splash";

export const dynamicParams = false;

export function generateStaticParams() {
  return [...new Set(SPLASH_DEVICES.map(splashFile))].map((file) => ({ file }));
}

/** Black launch screen with the app mark centred, so opening from the home screen never flashes white. */
export async function GET(_req: Request, ctx: RouteContext<"/splash/[file]">) {
  const { file } = await ctx.params;
  const m = /^(\d+)x(\d+)\.png$/.exec(file);
  if (!m) return new Response("Not found", { status: 404 });
  const width = Number(m[1]);
  const height = Number(m[2]);
  const icon = await readFile(path.join(process.cwd(), "public/icon-512.png"));
  const src = `data:image/png;base64,${icon.toString("base64")}`;
  const size = Math.round(width * 0.42);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#000" }}>
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={src} width={size} height={size} />
      </div>
    ),
    { width, height, headers: { "Cache-Control": "public, max-age=31536000, immutable" } },
  );
}
