import { OG_SIZE, renderOgImage } from "@/components/landing/og";

export const alt = "Afterglow docs: how fixed-rate USDG loans on tokenized stocks stay open over the weekend.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function DocsOpengraphImage() {
  return renderOgImage({ kicker: "Docs", footer: "How the weekend-proof credit line works" });
}
