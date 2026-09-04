// 本地开发时为空（vite proxy 代理 /api），
// 构建时由 PUBLIC_API_BASE 环境变量替换为 Workers URL
declare const __API_BASE__: string;
export const API_BASE: string = __API_BASE__;

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}