import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O repositório fica dentro de ~/Documents; sem isto o Turbopack
  // sobe até o package-lock.json do diretório home.
  turbopack: { root: __dirname },
  // O selo de dev do Next cobre o canto inferior esquerdo, onde fica
  // a navegação do Studio.
  devIndicators: false,
  images: {
    // A logo tem contornos finos e precisa de qualidade acima do padrão.
    qualities: [75, 95],
  },
  experimental: {
    serverActions: {
      // O padrão é 1 MB, insuficiente para enviar áudio: acompanha o
      // teto de 40 MB do áudio + 8 MB da capa validados em storage.ts.
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
