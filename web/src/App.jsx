import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AdminLayout from "./layouts/AdminLayout";
import SiteLayout from "./components/layout/SiteLayout";
import DashboardPage from "./pages/DashboardPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import LoginPage from "./pages/LoginPage";
import OddsBoardPage from "./pages/OddsBoardPage";
import RegisterPage from "./pages/RegisterPage";
import SavedPredictionsPage from "./pages/SavedPredictionsPage";
import LegacyModelsRedirect from "./pages/routing/LegacyModelsRedirect";
import SuperAdminOddsBannerPage from "./pages/SuperAdminOddsBannerPage";
import TokenPurchasePage from "./pages/TokenPurchasePage";
import RequireAuth from "./routes/guards/RequireAuth";
import RequireRole from "./routes/guards/RequireRole";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<SiteLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/modeller" element={<LegacyModelsRedirect />} />
          <Route path="/token-purchase" element={<TokenPurchasePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/ai-tahminlerim" element={<SavedPredictionsPage />} />
          <Route path="/oran-tahtasi" element={<OddsBoardPage />} />

          <Route element={<RequireAuth />}>
            <Route element={<RequireRole roles={["admin", "superadmin"]} />}>
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<DashboardPage mode="admin" />} />
                <Route path="modeller" element={<DashboardPage mode="models" />} />
              </Route>
            </Route>
            <Route element={<RequireRole roles={["superadmin"]} />}>
              <Route path="/admin/vitrin" element={<SuperAdminOddsBannerPage />} />
            </Route>
          </Route>

          <Route path="/superadmin/iddia-oranlar" element={<Navigate to="/admin/vitrin" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
