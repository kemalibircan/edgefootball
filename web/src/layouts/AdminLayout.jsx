import React, { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { apiRequest } from "../lib/api";

export default function AdminLayout() {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiRequest("/auth/me")
      .then((profile) => {
        if (cancelled) return;
        setIsSuperAdmin(String(profile?.role || "").toLowerCase() === "superadmin");
      })
      .catch(() => {
        if (cancelled) return;
        setIsSuperAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="admin-shell">
      <div className="container admin-shell-header">
        <div className="card admin-shell-title">
          <h2>Yönetim Alanı</h2>
          <p className="help-text">Yönetim araçları bu alanda toplanır.</p>
          <div className="row wrap">
            <NavLink to="/admin" end className={({ isActive }) => `site-link ${isActive ? "active" : ""}`}>
              Genel
            </NavLink>
            <NavLink to="/admin/modeller" className={({ isActive }) => `site-link ${isActive ? "active" : ""}`}>
              Modeller
            </NavLink>
            {isSuperAdmin ? (
              <NavLink to="/admin/vitrin" className={({ isActive }) => `site-link ${isActive ? "active" : ""}`}>
                Vitrin
              </NavLink>
            ) : null}
          </div>
        </div>
      </div>
      <Outlet />
    </div>
  );
}
