import type { NextConfig } from "next";

/**
 * Two build targets:
 *  - default (`pnpm build`): Node server or Vercel, with the /api/chain route for Live mode.
 *  - static export (`pnpm build:pages`, STATIC_EXPORT=true): plain files for GitHub Pages,
 *    served under NEXT_PUBLIC_BASE_PATH (e.g. /OP-Stack-Deposit-Token). Simulation mode only.
 */
const staticExport = process.env.STATIC_EXPORT === "true";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const nextConfig: NextConfig = staticExport
  ? {
      output: "export",
      basePath,
      trailingSlash: true,
      images: { unoptimized: true },
      // The export build moves app/api aside, which leaves generated route types from earlier
      // builds pointing at a missing file. Types are checked by `pnpm typecheck` instead
      // (CI and the Pages workflow run it before building).
      typescript: { ignoreBuildErrors: true },
    }
  : {};

export default nextConfig;
