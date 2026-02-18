import React from "react";
import ballImage from "../../images/ball.png";
import pitchImage from "../../images/pitch.png";

export default function DashboardLoadingPage({
  title = "",
  description = "",
}) {
  return (
    <div className="container football-loader-shell">
      <div className="card football-loader-card" aria-live="polite" aria-busy="true">
        <div className="football-loader-stage" role="status" aria-label="Yukleniyor">
          <img className="football-loader-pitch" src={pitchImage} alt="" aria-hidden="true" />
          <div className="football-loader-stage-glow" />
          <div className="football-loader-ball-wrap">
            <img className="football-loader-ball" src={ballImage} alt="" aria-hidden="true" />
          </div>
        </div>
        {title || description ? (
          <div className="football-loader-copy">
            {title ? <h2>{title}</h2> : null}
            {description ? <p className="small-text">{description}</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
