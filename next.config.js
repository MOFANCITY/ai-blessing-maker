/** @type {import('next').NextConfig} */
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');

const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.jsdelivr.net',
        port: '',
        pathname: '/**',
      },
    ],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config) => {
    config.plugins.push(new NodePolyfillPlugin());
    config.resolve.fallback = {
      ...config.resolve.fallback,
      crypto: require.resolve('crypto-browserify'),
      stream: require.resolve('stream-browserify'),
      buffer: require.resolve('buffer'),
      util: require.resolve('util'),
      net: false,
      tls: false,
      dns: false,
      fs: false,
      timers: false,
      timersPromises: false,
      diagnostics_channel: false,
      'node:crypto': require.resolve('crypto-browserify'),
      'node:stream': require.resolve('stream-browserify'),
      'node:buffer': require.resolve('buffer'),
      'node:util': require.resolve('util'),
      'node:net': false,
      'node:tls': false,
      'node:dns': false,
      'node:fs': false,
      'node:timers': false,
      'node:timers/promises': false,
      'node:diagnostics_channel': false,
    };
    config.resolve.alias = {
      ...config.resolve.alias,
      'node:crypto': require.resolve('crypto-browserify'),
      'node:stream': require.resolve('stream-browserify'),
      'node:buffer': require.resolve('buffer'),
      'node:util': require.resolve('util'),
      'node:net': false,
      'node:tls': false,
      'node:dns': false,
      'node:fs': false,
      'node:timers': false,
      'node:timers/promises': false,
      'node:diagnostics_channel': false,
    };
    config.module.rules.push({
      test: /node:/,
      use: 'null-loader',
    });
    config.module.rules.push({
      test: /@redis\/client/,
      use: 'null-loader',
    });
    return config;
  },
};

module.exports = nextConfig;
