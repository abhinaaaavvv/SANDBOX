import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://qmzsnlviwmbdecyomgbh.supabase.co",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://qmzsnlviwmbdecyomgbh.supabase.co",
      "font-src 'self'",
      "connect-src 'self' https://qmzsnlviwmbdecyomgbh.supabase.co wss://qmzsnlviwmbdecyomgbh.supabase.co",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  poweredByHeader: false,
  turbopack: {
    // Pin module resolution to this project (a stray package-lock.json in
    // the parent directory otherwise becomes the detected workspace root).
    root: __dirname,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
