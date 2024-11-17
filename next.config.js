/** @type {import('next').NextConfig} */
const nextConfig = {
    webpack: (config, { isServer }) => {
      // WebAssembly support
      config.experiments = {
        ...config.experiments,
        asyncWebAssembly: true,
      };
  
      // Add rule for WebAssembly files
      config.module.rules.push({
        test: /\.wasm$/,
        type: 'webassembly/async',
      });
  
      // Polyfills for node modules
      if (!isServer) {
        config.resolve.fallback = {
          ...config.resolve.fallback,
          crypto: require.resolve('crypto-browserify'),
          stream: require.resolve('stream-browserify'),
          buffer: require.resolve('buffer/'),
        };
      }
  
      return config;
    },
  };
  

  module.exports = nextConfig;
