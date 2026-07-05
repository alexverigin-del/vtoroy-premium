/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/device/:slug/index.html",
        destination: "/device/:slug",
        permanent: true,
      },
      {
        source: "/catalog/index.html",
        destination: "/catalog",
        permanent: true,
      },
      {
        source: "/:section(store|passport|trade|club)/index.html",
        destination: "/:section",
        permanent: true,
      },
      {
        source: "/index.html",
        destination: "/",
        permanent: true,
      },
    ];
  },
  // Allow optimized <Image> only from the production Directus asset host.
  images: {
    deviceSizes: [384, 640, 750, 828, 1080, 1200],
    imageSizes: [128, 256, 384, 512],
    minimumCacheTTL: 86400,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.isvoi.ru",
        pathname: "/assets/**",
      },
    ],
  },
  transpilePackages: ["@vtoroy/shared"],
};

export default nextConfig;
