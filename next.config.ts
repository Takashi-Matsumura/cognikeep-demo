import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 変換パイプラインで使うライブラリはネイティブ依存やバンドル非対応のものが
  // あるため、サーバ側で Node.js の require をそのまま使わせる。
  // cacheComponents は有効化しない（実装計画 §1-E: 全画面が DB 依存の動的
  // レンダリングで恩恵が薄く、use cache 境界の設計コストだけが乗る）。
  serverExternalPackages: ["unpdf", "exceljs", "mammoth", "turndown", "@napi-rs/canvas"],
};

export default nextConfig;
