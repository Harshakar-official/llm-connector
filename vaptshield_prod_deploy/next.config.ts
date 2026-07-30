import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit ships with its own /data folder of AFM font files that the
  // webpack bundler does not copy across. Marking it as an external
  // server package keeps Node's require() resolution intact, which is
  // the supported fix for the "ENOENT ... Helvetica.afm" crash on
  // Vercel/serverless deployments.
  serverExternalPackages: ['pdfkit', 'pdfkit/js/pdfkit.standalone', 'fontkit'],
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "recharts",
      "@radix-ui/react-avatar",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-select",
      "@radix-ui/react-tabs",
      "@radix-ui/react-tooltip",
    ],
  },
};

export default nextConfig;
