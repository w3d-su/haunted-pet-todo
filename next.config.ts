import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // web-push uses Node crypto and https. Leave it out of the client bundle.
  serverExternalPackages: ["web-push"],
};

export default nextConfig;
