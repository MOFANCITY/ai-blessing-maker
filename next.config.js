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
    // 首先配置节点解析
    if (!config.resolve) {
      config.resolve = {};
    }

    if (!config.resolve.fallback) {
      config.resolve.fallback = {};
    }

    // 添加必要的回退
    Object.assign(config.resolve.fallback, {
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
    });

    // 添加别名以解决模块解析问题
    if (!config.resolve.alias) {
      config.resolve.alias = {};
    }

    Object.assign(config.resolve.alias, {
      buffer: require.resolve('buffer'),
      'node:buffer': require.resolve('buffer'),
      'node:util': require.resolve('util'),
      'node:stream': require.resolve('stream-browserify'),
      'node:crypto': require.resolve('crypto-browserify'),
    });

    // 配置模块规则，解决buffer模块的特殊处理
    if (!config.module) {
      config.module = {};
    }

    if (!config.module.rules) {
      config.module.rules = [];
    }

    // 添加规则处理buffer相关模块
    config.module.rules.push({
      test: /node_modules\/node-stdlib-browser\/node_modules\/buffer/,
      use: {
        loader: 'babel-loader',
        options: {
          presets: [
            ['@babel/preset-env', { targets: 'defaults' }]
          ],
          plugins: [
            '@babel/plugin-transform-modules-commonjs'
          ]
        }
      }
    });

    // 为node模块添加空加载器
    config.module.rules.push({
      test: /node:/,
      use: 'null-loader',
    });

    config.module.rules.push({
      test: /@redis\/client/,
      use: 'null-loader',
    });

    // 为特定的buffer相关模块添加特殊处理
    config.module.rules.push({
      test: /buffer/,
      issuer: /node-stdlib-browser/,
      use: {
        loader: 'babel-loader',
        options: {
          presets: ['@babel/preset-env']
        }
      }
    });

    return config;
  },
};

module.exports = nextConfig;
