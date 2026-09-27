import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/** Link-preview card size (Open Graph and Twitter large card). */
export const OG_SIZE = { width: 1200, height: 630 };

const INK = "#0a0a0b";
const FG = "#ecebe8";
const FG2 = "#a3a19c";
const FG3 = "#6d6b67";
const GLOW = "#e9a15e";

const font = (file: string) => readFile(join(process.cwd(), "node_modules/geist/dist/fonts/geist-sans", file));

/**
 * The Afterglow link-preview card: the logo mark, the wordmark, the tagline and a glowing horizon.
 * Shared by app/opengraph-image.tsx and app/docs/opengraph-image.tsx; `kicker` labels a sub-page.
 */
export async function renderOgImage({ kicker, footer }: { kicker?: string; footer: string }) {
  const [medium, regular] = await Promise.all([font("Geist-Medium.ttf"), font("Geist-Regular.ttf")]);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 84px 64px",
          background: INK,
          color: FG,
          fontFamily: "Geist",
          position: "relative",
        }}
      >
        {/* Warm sky and a glowing horizon line near the bottom. */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 420,
            display: "flex",
            backgroundImage: "radial-gradient(60% 100% at 50% 100%, rgba(233,161,94,0.30), rgba(184,115,58,0.10) 50%, rgba(10,10,11,0) 80%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 118,
            height: 2,
            display: "flex",
            backgroundImage: "linear-gradient(90deg, rgba(233,161,94,0) 6%, rgba(233,161,94,0.7) 32%, #fff0de 50%, rgba(233,161,94,0.7) 68%, rgba(233,161,94,0) 94%)",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          {/* The logo mark (components/LogoMark.tsx, large cut), drawn on its 52 x 29 crop. */}
          <svg width="104" height="58" viewBox="6 20 52 29" fill={GLOW}>
            <path d="M10 42A22 22 0 0 1 54 42A22.74 22.74 0 0 0 10 42Z" />
            <path d="M21.5 42A10.5 10.5 0 0 1 42.5 42Z" />
            <rect x="6" y="45" width="52" height="3" />
          </svg>
          {kicker && (
            <div style={{ display: "flex", fontSize: 30, color: FG2, paddingLeft: 22, borderLeft: `2px solid rgba(255,255,255,0.14)` }}>
              {kicker}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 148, fontWeight: 500, letterSpacing: "-0.04em", lineHeight: 1 }}>Afterglow</div>
          <div style={{ display: "flex", marginTop: 26, fontSize: 46, color: GLOW, letterSpacing: "-0.01em" }}>
            Earn yield, even while Wall Street sleeps.
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: FG3 }}>
          <div style={{ display: "flex" }}>{footer}</div>
          <div style={{ display: "flex" }}>Robinhood Chain testnet</div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: "Geist", data: regular, weight: 400, style: "normal" },
        { name: "Geist", data: medium, weight: 500, style: "normal" },
      ],
    },
  );
}
