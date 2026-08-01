/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  transpilePackages: ['@lode-choir/engine'],
  images: { unoptimized: true },
};

export default nextConfig;

