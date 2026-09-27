import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Keep the dev-mode "N" badge out of screen recordings.
  devIndicators: false,
};

export default config;
