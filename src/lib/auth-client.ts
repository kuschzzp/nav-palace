"use client";

import { createAuthClient } from "better-auth/react";

// 使用当前站点的认证接口，避免前端硬编码部署域名。
export const authClient = createAuthClient();
