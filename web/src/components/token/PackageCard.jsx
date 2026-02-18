import React from "react";

export default function PackageCard({ pack }) {
  const benefitLabel = String(pack?.benefit_label || "").trim();
  const predictions = Number(pack?.predictions);

  return (
    <article className="package-card">
      <h3>{pack.title}</h3>
      <p className="small-text">{pack.summary}</p>
      <div className="package-price">{pack.price_tl} TL</div>
      {benefitLabel ? (
        <div className="small-text">{benefitLabel}</div>
      ) : Number.isFinite(predictions) && predictions > 0 ? (
        <div className="small-text">{predictions} AI yorum hakki</div>
      ) : null}
      <ul className="list">
        {pack.features.map((feature) => (
          <li key={`${pack.key}-${feature}`}>{feature}</li>
        ))}
      </ul>
    </article>
  );
}
