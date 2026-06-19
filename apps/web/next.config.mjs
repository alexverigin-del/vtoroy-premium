/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
  // Allow optimized <Image> from the Directus instance once configured.
  // NEXT_PUBLIC_DIRECTUS_URL is read at build/runtime; this is a placeholder
  // pattern and should be tightened to the real host before production.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
        pathname: "/assets/**",
      },
    ],
  },
  transpilePackages: ["@vtoroy/shared"],
};

export default nextConfig;
