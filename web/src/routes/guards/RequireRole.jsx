import React, { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import DashboardLoadingPage from "../../pages/dashboard/DashboardLoadingPage";
import { apiRequest } from "../../lib/api";
import { clearAuthToken, readAuthToken } from "../../lib/auth";

export default function RequireRole({ roles = [], fallbackPath = "/" }) {
  const [state, setState] = useState({ loading: true, allowed: false, knownUser: false });

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const token = readAuthToken();
      if (!token) {
        if (!cancelled) {
          setState({ loading: false, allowed: false, knownUser: false });
        }
        return;
      }

      try {
        const profile = await apiRequest("/auth/me");
        const currentRole = String(profile?.role || "").toLowerCase();
        const allowedRoles = Array.isArray(roles) ? roles.map((item) => String(item || "").toLowerCase()) : [];
        const allowed = !allowedRoles.length || allowedRoles.includes(currentRole);
        if (!cancelled) {
          setState({ loading: false, allowed, knownUser: true });
        }
      } catch (_err) {
        clearAuthToken();
        if (!cancelled) {
          setState({ loading: false, allowed: false, knownUser: false });
        }
      }
    };

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [roles]);

  if (state.loading) {
    return <DashboardLoadingPage title="Yetki kontrol ediliyor" description="Lütfen kısa bir süre bekleyin." />;
  }

  if (!state.knownUser) {
    return <Navigate to="/login" replace />;
  }

  if (!state.allowed) {
    return <Navigate to={fallbackPath} replace />;
  }

  return <Outlet />;
}
