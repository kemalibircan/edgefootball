import React from "react";
import { useParams } from "react-router-dom";
import DashboardPage from "./DashboardPage";
import SeoHead from "../components/seo/SeoHead";
import JsonLd from "../components/seo/JsonLd";
import { normalizeLocale } from "../lib/seo";

export default function LocaleHomePage() {
  const { locale: localeParam } = useParams();
  const locale = normalizeLocale(localeParam);

  const title = locale === "en" ? "EdgeFootball | AI Match Predictions" : "EdgeFootball | Yapay Zeka Mac Tahminleri";
  const description =
    locale === "en"
      ? "AI-powered football fixtures, predictions and analysis in one platform."
      : "Yapay zeka destekli futbol fiksturleri, tahminler ve analizler tek platformda.";

  return (
    <>
      <SeoHead
        title={title}
        description={description}
        locale={locale}
        canonicalPath={`/${locale}`}
        trPath="/tr"
        enPath="/en"
        defaultPath="/tr"
        ogType="website"
      />
      <JsonLd
        id="home-website"
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "EdgeFootball",
          url: `/${locale}`,
        }}
      />
      <DashboardPage />
    </>
  );
}
