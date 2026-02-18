import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import DashboardLoadingPage from "../dashboard/DashboardLoadingPage";
import { apiRequest } from "../../lib/api";
import { readAuthToken } from "../../lib/auth";

export default function LegacyModelsRedirect() {
  const [targetPath, setTargetPath] = useState("");

  useEffect(() => {
    let cancelled = false;

    const resolveTarget = async () => {
      const token = readAuthToken();
      if (!token) {
        if (!cancelled) setTargetPath("/");
        return;
      }

      try {
        const profile = await apiRequest("/auth/me");
        const role = String(profile?.role || "").toLowerCase();
        if (!cancelled) {
          setTargetPath(role === "admin" || role === "superadmin" ? "/admin/modeller" : "/");
        }
      } catch (_err) {
        if (!cancelled) {
          setTargetPath("/");
        }
      }
    };

    resolveTarget();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!targetPath) {
    return <DashboardLoadingPage title="Yönlendiriliyor" description="Doğru sayfaya aktarılıyorsunuz." />;
  }

  return <Navigate to={targetPath} replace />;
}
