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
    // Safety net: NFT-level exclude. Pairs with the webpack externals
    // below — webpack stops emitting the chunk, NFT stops tracing the
    // node_modules folder. Both layers needed to fully drop jspdf from
    // every Lambda. Lives under `experimental` in Next 14.x.
    outputFileTracingExcludes: {
      "*": [
        "node_modules/jspdf/**",
        "node_modules/jspdf-autotable/**",
      ],
    },
  },
  // Webpack-level fix: mark jspdf and jspdf-autotable as server externals.
  // jspdf is only ever loaded client-side through `await import("jspdf")`
  // inside ExportPdfButton, but Next 14 webpack still emits a server chunk
  // (~880 KB) for the dynamic import because the module graph is shared
  // between server and client builds. Marking it as external tells webpack
  // "don't bundle this on the server" — no chunk emitted, no NFT trace,
  // no Lambda payload bloat.
  webpack: (config, { isServer }) => {
    if (isServer) {
      const externals = Array.isArray(config.externals)
        ? config.externals
        : [config.externals].filter(Boolean);
      config.externals = [
        ...externals,
        // Exact-match externals (matches the exact import string).
        // We do NOT use a wildcard regex because jspdf is genuinely
        // imported by pdf-dashboard.ts / pdf-conversation.ts via
        // `await import("jspdf")`. The dynamic import would, on the
        // server, try to require it — but those files are themselves
        // only ever invoked from the client side (ExportPdfButton).
        "jspdf",
        "jspdf-autotable",
      ];
    }
    return config;
  },
};

export default nextConfig;
