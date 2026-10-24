import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Avoid advertising the framework in response headers.
  poweredByHeader: false,
  // Keep the development badge out of demo recordings.
  devIndicators: false,

  // Vercel handles image optimization outside the route function bundles.
  outputFileTracingExcludes: {
    "*": ["node_modules/@img/**", "node_modules/sharp/**"],
  },

  images: {
    remotePatterns: [
      { protocol: "http", hostname: "127.0.0.1", port: "54321" },
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.googleusercontent.com" },
    ],
  },

  async redirects() {
    return [{ source: "/register", destination: "/login", permanent: false }];
  },

  async headers() {
    // Allow embedded development previews; deny framing in production.
    // The CSP and X-Robots-Tag are set per request in src/proxy.ts.
    const frameHeaders =
      process.env.NODE_ENV === "production"
        ? [{ key: "X-Frame-Options", value: "DENY" }]
        : [];

    return [
      {
        source: "/(.*)",
        headers: [
          ...frameHeaders,
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "X-XSS-Protection", value: "0" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
