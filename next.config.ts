import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: https:",
              "connect-src 'self' https://*.supabase.co https://generativelanguage.googleapis.com https://api.github.com",
              "frame-ancestors 'none'",
            ].join('; '),
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
        ],
      },
    ];
  },
  // Allow larger request bodies for video uploads
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
  // Next.js standard for native modules to avoid bundling issues
  serverExternalPackages: [
    'tree-sitter',
    'tree-sitter-typescript',
    'tree-sitter-javascript',
    'tree-sitter-python',
    'tree-sitter-go',
    'tree-sitter-java',
    'tree-sitter-php',
    'tree-sitter-ruby',
    'tree-sitter-c',
    'tree-sitter-cpp',
  ],
  webpack: (config, { isServer }) => {
    // Disable persistent filesystem cache to prevent EISDIR/readlink errors on Windows
    config.cache = false;

    if (isServer) {
      // tell webpack to leave .node files alone
      // merging with existing externals if any
      const externals = Array.isArray(config.externals) ? config.externals : [config.externals];
      externals.push({
        'tree-sitter': 'commonjs tree-sitter',
        'tree-sitter-typescript': 'commonjs tree-sitter-typescript',
        'tree-sitter-javascript': 'commonjs tree-sitter-javascript',
        'tree-sitter-python': 'commonjs tree-sitter-python',
        'tree-sitter-go': 'commonjs tree-sitter-go',
        'tree-sitter-java': 'commonjs tree-sitter-java',
        'tree-sitter-php': 'commonjs tree-sitter-php',
        'tree-sitter-ruby': 'commonjs tree-sitter-ruby',
        'tree-sitter-c': 'commonjs tree-sitter-c',
        'tree-sitter-cpp': 'commonjs tree-sitter-cpp',
      });
      config.externals = externals;
    }
    // handle .node native binaries
    config.module.rules.push({
      test: /\.node$/,
      use: 'node-loader',
    });
    return config;
  },
};

export default nextConfig;
