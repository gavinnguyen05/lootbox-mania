const isProd = process.env.NODE_ENV === "production";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  images: {
    // Only Discord's CDN may be proxied through the image optimizer.
    remotePatterns: [{ protocol: "https", hostname: "cdn.discordapp.com", pathname: "/**" }],
    formats: ["image/webp"],
    minimumCacheTTL: 60 * 60 * 24, // optimized images are cached for a day
  },

  async headers() {
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
    ];
    return [
      { source: "/:path*", headers: security },
      // Logo, candy art, and icons rarely change. Live game data is never cached.
      { source: "/assets/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] },
      // Font files never change.
      { source: "/fonts/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ];
  },

  // The rules page used to live at /royale.
  async redirects() {
    return [{ source: "/royale", destination: "/how-it-works", permanent: true }];
  },
};

export default nextConfig;
