/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: "/analyze",
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns"],
  },
};

export default nextConfig;
