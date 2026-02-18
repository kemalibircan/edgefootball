import React from "react";
import MarkdownContent from "../dashboard/MarkdownContent";

function asPercent(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return `%${(parsed * 100).toFixed(1)}`;
}

function asNumber(value, digits = 2) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return parsed.toFixed(digits);
}

export default function CouponInsightModal({
  open,
  title,
  loading = false,
  error = "",
  data = null,
  onClose,
}) {
  if (!open) return null;

  const simulation = data?.simulation_summary || {};
  const outcomes = simulation?.outcomes || {};
  const topScorelines = Array.isArray(simulation?.top_scorelines) ? simulation.top_scorelines : [];
  const analysisTable = Array.isArray(data?.analysis_table) ? data.analysis_table : [];
  const oddsSummary = data?.odds_summary || null;

  return (
    <div className="coupon-modal-overlay" role="dialog" aria-modal="true">
      <div className="coupon-modal-card">
        <div className="coupon-modal-head">
          <h3>{title || "AI Mac Analizi"}</h3>
          <button type="button" className="coupon-modal-close" onClick={onClose}>
            Kapat
          </button>
        </div>

        {loading ? <p className="small-text">Analiz yukleniyor...</p> : null}
        {error ? <div className="error">{error}</div> : null}

        {!loading && !error && data ? (
          <div className="coupon-modal-body">
            <div className="coupon-insight-grid">
              <div className="coupon-insight-item">
                <span>Secim</span>
                <strong>{data.selection || "-"}</strong>
              </div>
              <div className="coupon-insight-item">
                <span>Lambda</span>
                <strong>
                  {asNumber(simulation?.lambda_home)} / {asNumber(simulation?.lambda_away)}
                </strong>
              </div>
              <div className="coupon-insight-item">
                <span>Model 1X2</span>
                <strong>
                  {asPercent(outcomes.home_win)} | {asPercent(outcomes.draw)} | {asPercent(outcomes.away_win)}
                </strong>
              </div>
              <div className="coupon-insight-item">
                <span>Piyasa 1X2</span>
                <strong>
                  {asPercent(oddsSummary?.home?.implied_probability)} | {asPercent(oddsSummary?.draw?.implied_probability)} |{" "}
                  {asPercent(oddsSummary?.away?.implied_probability)}
                </strong>
              </div>
            </div>

            {topScorelines.length ? (
              <div className="coupon-top-scorelines">
                <h4>Top Skorlar</h4>
                {topScorelines.slice(0, 5).map((item, idx) => (
                  <div key={`score-${idx}-${item?.score || ""}`} className="row spread">
                    <span>{item?.score || "-"}</span>
                    <span>{asPercent(item?.probability)}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {analysisTable.length ? (
              <table className="analysis-table">
                <thead>
                  <tr>
                    <th>Metrik</th>
                    <th>Ev</th>
                    <th>Ber.</th>
                    <th>Dep.</th>
                    <th>Not</th>
                  </tr>
                </thead>
                <tbody>
                  {analysisTable.map((row, idx) => (
                    <tr key={`analysis-${idx}`}>
                      <td>{row?.metric || "-"}</td>
                      <td>{row?.home || "-"}</td>
                      <td>{row?.draw || "-"}</td>
                      <td>{row?.away || "-"}</td>
                      <td>{row?.note || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}

            {data?.commentary ? (
              <div className="coupon-commentary-box">
                <MarkdownContent content={data.commentary} />
              </div>
            ) : null}

            <div className="small-text">
              Saglayici: {data?.provider || "-"}
              {data?.provider_error ? ` | Not: ${data.provider_error}` : ""}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

