import React, { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AdminLayout from "./layouts/AdminLayout";
import SiteLayout from "./components/layout/SiteLayout";
import GlobalSeoManager from "./components/seo/GlobalSeoManager";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import RequireAuth from "./routes/guards/RequireAuth";
import RequireRole from "./routes/guards/RequireRole";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import { ChatProvider } from "./contexts/ChatContext";

const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const SavedPredictionsPage = lazy(() => import("./pages/SavedPredictionsPage"));
const TokenPurchasePage = lazy(() => import("./pages/TokenPurchasePage"));
const SuperAdminOddsBannerPage = lazy(() => import("./pages/SuperAdminOddsBannerPage"));
const AdminHomePage = lazy(() => import("./pages/admin/AdminHomePage"));
const ChatPage = lazy(() => import("./pages/ChatPage"));
const SonucTahminlerimPage = lazy(() => import("./pages/SonucTahminlerimPage"));
const KuponlarimPage = lazy(() => import("./pages/KuponlarimPage"));
const LegacyModelsRedirect = lazy(() => import("./pages/routing/LegacyModelsRedirect"));
const LegacyFixtureRedirect = lazy(() => import("./pages/routing/LegacyFixtureRedirect"));
const DefaultLocaleRedirect = lazy(() => import("./pages/routing/DefaultLocaleRedirect"));
const ProfileSettingsPage = lazy(() => import("./pages/ProfileSettingsPage"));
const UserModelsPage = lazy(() => import("./pages/UserModelsPage"));
const LocaleGate = lazy(() => import("./routes/guards/LocaleGate"));
const PublicFixturesPage = lazy(() => import("./pages/fixtures/PublicFixturesPage"));
const PublicPredictionsPage = lazy(() => import("./pages/predictions/PublicPredictionsPage"));
const PublicPredictionDetailPage = lazy(() => import("./pages/predictions/PublicPredictionDetailPage"));
const BlogIndexPage = lazy(() => import("./pages/blog/BlogIndexPage"));
const BlogCategoryPage = lazy(() => import("./pages/blog/BlogCategoryPage"));
const BlogPostPage = lazy(() => import("./pages/blog/BlogPostPage"));
const BlogTagPage = lazy(() => import("./pages/blog/BlogTagPage"));
const LocaleHomePage = lazy(() => import("./pages/LocaleHomePage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));
const FixtureDetailPage = lazy(() => import("./pages/FixtureDetailPage"));

function PageLoader() {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "60vh",
      color: "var(--text-muted)",
    }}>
      Loading...
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <ChatProvider>
          <BrowserRouter>
          <GlobalSeoManager />
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Navigate to="/tr" replace />} />
              <Route path="/fixture/:fixtureId" element={<LegacyFixtureRedirect />} />
              <Route path="/fixtures/*" element={<DefaultLocaleRedirect />} />
              <Route path="/predictions/*" element={<DefaultLocaleRedirect />} />
              <Route path="/blog/*" element={<DefaultLocaleRedirect />} />

              <Route path="/:locale" element={<LocaleGate />}>
                <Route element={<SiteLayout />}>
                  <Route index element={<LocaleHomePage />} />
                  <Route path="fixtures" element={<PublicFixturesPage />} />
                  <Route path="fixtures/:fixtureId" element={<FixtureDetailPage />} />
                  <Route path="fixtures/:fixtureId/:slug" element={<FixtureDetailPage />} />
                  <Route path="predictions" element={<PublicPredictionsPage />} />
                  <Route path="predictions/:fixtureId" element={<PublicPredictionDetailPage />} />
                  <Route path="predictions/:fixtureId/:slug" element={<PublicPredictionDetailPage />} />
                  <Route path="blog" element={<BlogIndexPage />} />
                  <Route path="blog/category/:categorySlug" element={<BlogCategoryPage />} />
                  <Route path="blog/tags/:tagSlug" element={<BlogTagPage />} />
                  <Route path="blog/:slug" element={<BlogPostPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
              </Route>

              <Route element={<SiteLayout />}>
                <Route path="/modeller" element={<LegacyModelsRedirect />} />
                <Route path="/token-purchase" element={<TokenPurchasePage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/ai-tahminlerim" element={<SavedPredictionsPage />} />

                <Route element={<RequireAuth />}>
                  <Route path="/profile-settings" element={<ProfileSettingsPage />} />
                <Route path="/pro/models" element={<UserModelsPage />} />
                  <Route path="/chat" element={<ChatPage />} />
                  <Route path="/sonuc-tahminlerim" element={<SonucTahminlerimPage />} />
                  <Route path="/kuponlarim" element={<KuponlarimPage />} />
                  <Route element={<RequireRole roles={["admin", "superadmin"]} />}>
                    <Route path="/admin" element={<AdminLayout />}>
                      <Route index element={<AdminHomePage />} />
                      <Route path="modeller" element={<DashboardPage mode="models" />} />
                    </Route>
                  </Route>
                  <Route element={<RequireRole roles={["superadmin"]} />}>
                    <Route path="/admin/vitrin" element={<SuperAdminOddsBannerPage />} />
                  </Route>
                </Route>

                <Route path="/superadmin/iddia-oranlar" element={<Navigate to="/admin/vitrin" replace />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </Suspense>
          </BrowserRouter>
        </ChatProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
