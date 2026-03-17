import { createOSPClient } from "@osp/shared";

export const api = createOSPClient({
  baseUrl: process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3000",
  getAccessToken: () => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("osp_access_token");
  },
  onUnauthorized: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("osp_access_token");
      localStorage.removeItem("osp_refresh_token");
      window.location.href = "/login";
    }
  },
});
