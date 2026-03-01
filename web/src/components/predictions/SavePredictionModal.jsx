import React, { useState } from "react";
import ActionButton from "../dashboard/ActionButton";
import { useLanguage } from "../../contexts/LanguageContext";
import "./SavePredictionModal.css";

/**
 * Modal for saving a prediction with optional note and AI commentary
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether modal is open
 * @param {Function} props.onClose - Close handler
 * @param {Function} props.onSave - Save handler (note, includeAI) => Promise
 * @param {string} props.matchLabel - Match description
 * @param {Object} props.simulation - Simulation result (optional)
 */
export default function SavePredictionModal({
  isOpen,
  onClose,
  onSave,
  matchLabel = "",
  simulation = null,
}) {
  const { t } = useLanguage();
  const [note, setNote] = useState("");
  const [includeAI, setIncludeAI] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setSaving(true);
    setError("");
    
    try {
      await onSave({ note: note.trim() || null, includeAI });
      // Reset and close on success
      setNote("");
      setIncludeAI(false);
      onClose();
    } catch (err) {
      setError(err.message || t.savedPredictions.saveError);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (!saving) {
      setNote("");
      setIncludeAI(false);
      setError("");
      onClose();
    }
  };

  if (!isOpen) return null;

  const outcomes = simulation?.outcomes || {};
  const homeWin = outcomes.home_win || 0;
  const draw = outcomes.draw || 0;
  const awayWin = outcomes.away_win || 0;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content save-prediction-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{t.savedPredictions.modal.title}</h3>
          <button className="modal-close" onClick={handleClose} disabled={saving}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {matchLabel && (
            <div className="match-info">
              <strong>{matchLabel}</strong>
            </div>
          )}

          {simulation && (
            <div className="prediction-summary">
              <div className="prediction-row">
                <span>{t.savedPredictions.modal.homeWin}:</span>
                <strong>{(homeWin * 100).toFixed(1)}%</strong>
              </div>
              <div className="prediction-row">
                <span>{t.savedPredictions.modal.draw}:</span>
                <strong>{(draw * 100).toFixed(1)}%</strong>
              </div>
              <div className="prediction-row">
                <span>{t.savedPredictions.modal.awayWin}:</span>
                <strong>{(awayWin * 100).toFixed(1)}%</strong>
              </div>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="prediction-note">{t.savedPredictions.modal.noteLabel}</label>
            <textarea
              id="prediction-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.savedPredictions.modal.notePlaceholder}
              maxLength={500}
              rows={3}
              disabled={saving}
            />
            <small className="char-count">
              {note.length}/500
            </small>
          </div>

          <div className="form-group checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={includeAI}
                onChange={(e) => setIncludeAI(e.target.checked)}
                disabled={saving}
              />
              <span>{t.savedPredictions.modal.includeAI}</span>
            </label>
            <small className="help-text">
              {t.savedPredictions.modal.includeAIHelp}
            </small>
          </div>

          {error && <div className="error">{error}</div>}
        </div>

        <div className="modal-footer">
          <ActionButton
            className="secondary"
            onClick={handleClose}
            disabled={saving}
          >
            {t.savedPredictions.modal.cancel}
          </ActionButton>
          <ActionButton
            onClick={handleSave}
            loading={saving}
            loadingText={t.savedPredictions.modal.saving}
          >
            {t.savedPredictions.modal.save}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}
