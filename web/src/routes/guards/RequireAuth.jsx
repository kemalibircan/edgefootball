import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { readAuthToken } from "../../lib/auth";

export default function RequireAuth() {
  const location = useLocation();
  const token = readAuthToken();

  if (!token) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search || ""}` }} />;
  }

  return <Outlet />;
}
