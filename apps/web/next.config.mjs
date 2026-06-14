/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
