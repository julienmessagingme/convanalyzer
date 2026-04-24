/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: "/analyze",
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "recharts",
      "@supabase/supabase-js",
    ],
  },
};

export default nextConfig;
