/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["maplibre-gl"],
  // Autorise l'accès aux ressources de dev (HMR) depuis l'aperçu navigateur
  // servi sur 127.0.0.1 en plus de localhost (Next 16 bloque par défaut).
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
