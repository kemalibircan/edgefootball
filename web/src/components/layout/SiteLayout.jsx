import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";
import ChatSidebar from "../chat/ChatSidebar";
import ChatNotification from "../chat/ChatNotification";
import ModernCouponDock from "../coupon/ModernCouponDock";
import ErrorBoundary from "../common/ErrorBoundary";
import { CouponSlipProvider } from "../../state/coupon/CouponSlipContext";

const pageTransition = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] },
};

export default function SiteLayout() {
  const location = useLocation();
  const routeErrorFallback = (
    <div className="container" style={{ paddingTop: 24, paddingBottom: 24 }}>
      <div className="card" role="alert" style={{ display: "grid", gap: 10 }}>
        <h2 style={{ margin: 0 }}>Sayfa yuklenirken bir hata olustu.</h2>
        <p className="small-text">
          Lutfen sayfayi yenileyin. Sorun devam ederse tekrar giris yapmayi deneyin.
        </p>
        <div className="row wrap">
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.location.reload();
              }
            }}
          >
            Sayfayi Yenile
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <CouponSlipProvider>
      <ErrorBoundary resetKey={location.pathname} fallback={routeErrorFallback}>
        <div className="site-shell">
          <SiteHeader />
          <main className="route-stage">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={pageTransition.initial}
                animate={pageTransition.animate}
                exit={pageTransition.exit}
                transition={pageTransition.transition}
                style={{ minHeight: "100%" }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </main>
          <SiteFooter />
          <ChatSidebar />
          <ChatNotification />
          <ModernCouponDock />
        </div>
      </ErrorBoundary>
    </CouponSlipProvider>
  );
}
