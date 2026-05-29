import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
const basePath = isProd ? (process.env.NEXT_PUBLIC_BASE_PATH ?? "") : "";
// GitHub Pages serves this app at the custom-domain root (/), but a repo basePath
// would point assets at /repo/_next/... and break on www.example.com/. Use an
// absolute URL so JS/CSS load from the real host (see deploy workflow env).
const assetPrefix = isProd ? (process.env.NEXT_PUBLIC_ASSET_PREFIX ?? basePath) : "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  basePath,
  assetPrefix,
  transpilePackages: ["react-pdf", "pdfjs-dist", "@react-pdf/renderer"],
  // Turbopack is the default in Next.js 16; provide an empty config to silence
  // the "webpack config ignored" warning while keeping webpack fallbacks for CI.
  turbopack: {},
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      canvas: false,
      fs: false,
      path: false,
      stream: false,
      zlib: false,
    };
    return config;
  },
};

export default nextConfig;
