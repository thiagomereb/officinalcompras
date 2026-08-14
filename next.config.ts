import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sem isso, o Turbopack sobe até achar o primeiro package-lock.json em um
  // diretório pai (ex: na pasta do usuário) e trata ele como raiz do
  // workspace, quebrando a resolução de módulos e o build da Netlify.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
