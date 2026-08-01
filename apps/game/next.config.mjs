const isPages = process.env.GITHUB_PAGES === 'true';
const basePath = isPages ? '/lode-choir' : '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  transpilePackages: ['@lode-choir/engine'],
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  ...(isPages ? { basePath, assetPrefix: `${basePath}/` } : {}),
};

export default nextConfig;
