// by 拜甘教成员-大长老
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone 模式：生成自包含 server.js，用于 Docker / Node 直接部署
  output: "standalone",
};

export default nextConfig;
