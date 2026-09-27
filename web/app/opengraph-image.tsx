import { OG_SIZE, renderOgImage } from "@/components/landing/og";

export const alt = "Afterglow: earn yield, even while Wall Street sleeps.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OpengraphImage() {
  return renderOgImage({ footer: "Fixed-rate USDG lending against tokenized stocks" });
}
