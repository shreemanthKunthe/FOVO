import { useState } from 'react';
import type { Cinema } from '../../data/cinemas';
import {
  AUDITORIUM_TEMPLATES,
  boutiqueReclinerAuditorium,
  grandAuditorium,
  imaxCurvedAuditorium,
  referenceAuditorium,
} from '../../domain/layout/presets';
import type { AuditoriumConfig, SeatMapProviderType, SeatStatus } from '../../domain/types';
import { PROVIDER_FEASIBILITY_REPORT } from '../../services/cinemaProviders';
import { savePersistedAuditorium } from '../../services/locationService';
import {
  convertVistaSeatPlanToFovo,
  SAMPLE_VISTA_SEAT_PLAN_PAYLOAD,
  type VistaSeatPlanPayload,
} from '../../services/vistaSeatPlanConverter';

interface ImportModalProps {
  cinema: Cinema;
  onClose: () => void;
  onAttached: (config: AuditoriumConfig) => void;
}

export function AuditoriumImportModal({ cinema, onClose, onAttached }: ImportModalProps) {
  const [mode, setMode] = useState<'vista' | 'template'>('vista');
  const [vistaJson, setVistaJson] = useState<string>(() =>
    JSON.stringify(
      {
        ...SAMPLE_VISTA_SEAT_PLAN_PAYLOAD,
        CinemaId: cinema.id,
        ScreenName: `${cinema.name} · Audi 1 (Vista Connect SeatPlan)`,
      },
      null,
      2,
    ),
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(referenceAuditorium.id);
  const [customScreenName, setCustomScreenName] = useState<string>(
    `${cinema.name} · Screen 1 (Estimated Layout)`,
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const handleImportVista = () => {
    setErrorMsg(null);
    setWarnings([]);
    try {
      const parsed = JSON.parse(vistaJson) as VistaSeatPlanPayload;
      const result = convertVistaSeatPlanToFovo(parsed, {
        cinemaId: cinema.id,
        city: cinema.city,
        country: cinema.country,
      });
      if (!result.ok || !result.config) {
        setErrorMsg(result.errors.join(' '));
        return;
      }
      setWarnings(result.warnings);
      const providerType: SeatMapProviderType = 'VISTA_CONNECT';
      savePersistedAuditorium(cinema.id, result.config, providerType, result.availability);
      onAttached(result.config);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? `Invalid JSON: ${err.message}`
          : 'Could not parse Vista GetSessionSeatPlan JSON payload.',
      );
    }
  };

  const handleAttachTemplate = () => {
    setErrorMsg(null);
    const tpl = AUDITORIUM_TEMPLATES[selectedTemplateId] ?? referenceAuditorium;
    const customConfig: AuditoriumConfig = {
      ...tpl,
      id: `${cinema.id}-${tpl.id}`,
      name: customScreenName.trim() || `${cinema.name} · ${tpl.name}`,
      cinemaId: cinema.id,
      city: cinema.city,
      country: cinema.country,
      layoutSource: 'CALIBRATED_TEMPLATE',
      verificationStatus: 'ESTIMATED_PROTOTYPE_LAYOUT',
      verificationNotes: `Calibrated prototype layout (${tpl.name}) attached to ${cinema.name} (${cinema.city}) for 3D sightline evaluation. Labelled as Estimated Prototype Layout.`,
    };
    const emptyAvail: Record<string, SeatStatus> | undefined = undefined;
    savePersistedAuditorium(cinema.id, customConfig, 'CALIBRATED_MODEL', emptyAvail);
    onAttached(customConfig);
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Import or configure auditorium layout">
      <div className="card modal-card">
        <div className="modal-head">
          <div>
            <span className="eyebrow-pill">UNIVERSAL AUDITORIUM INGESTION</span>
            <h2>Attach Auditorium Layout — {cinema.name}</h2>
            <p className="muted">
              {cinema.address} · Source: <strong>{cinema.dataSource}</strong>
            </p>
          </div>
          <button type="button" className="ghost" onClick={onClose}>
            ✕ Close
          </button>
        </div>

        <div className="category-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'vista'}
            className={'category-tab' + (mode === 'vista' ? ' on' : '')}
            onClick={() => {
              setMode('vista');
              setErrorMsg(null);
            }}
          >
            <strong>1. Vista Cinema Connect (GetSessionSeatPlan JSON)</strong>
            <small>Convert a Vista SeatLayoutData.Areas.Rows.Seats response into 3D coordinates</small>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'template'}
            className={'category-tab' + (mode === 'template' ? ' on' : '')}
            onClick={() => {
              setMode('template');
              setErrorMsg(null);
            }}
          >
            <strong>2. Calibrated 3D Auditorium Architecture</strong>
            <small>Attach a clearly labelled IMAX, Stadium, or Recliner prototype layout</small>
          </button>
        </div>

        {mode === 'vista' ? (
          <div className="modal-body">
            <div className="notice">
              <strong>Vista GetSessionSeatPlan → FOVO 3D Coordinate Converter:</strong> Parses{' '}
              <code>SeatLayoutData.Areas[].Rows[].Seats[].Position</code> (<code>AreaNumber</code>,{' '}
              <code>RowIndex</code>, <code>ColumnIndex</code>), detects physical aisle gaps from column
              index jumps, maps real-time seat status (<code>0=Available</code>, <code>1=Sold</code>),
              and validates 3D screen &amp; riser geometry before enabling the first-person preview.
            </div>

            <div className="modal-toolbar">
              <span className="muted">Paste Vista Connect JSON payload or test with the sample response:</span>
              <button
                type="button"
                className="ghost"
                onClick={() =>
                  setVistaJson(
                    JSON.stringify(
                      {
                        ...SAMPLE_VISTA_SEAT_PLAN_PAYLOAD,
                        CinemaId: cinema.id,
                        ScreenName: `${cinema.name} · Audi 1 (Vista Connect SeatPlan)`,
                      },
                      null,
                      2,
                    ),
                  )
                }
              >
                Load Sample Vista GetSessionSeatPlan
              </button>
            </div>

            <textarea
              className="code-textarea"
              rows={11}
              value={vistaJson}
              onChange={(e) => setVistaJson(e.target.value)}
              aria-label="Vista GetSessionSeatPlan JSON payload"
            />

            {errorMsg && (
              <div className="stale-banner" role="alert">
                <strong>Geometry Validation Failed:</strong> <span>{errorMsg}</span>
              </div>
            )}
            {warnings.length > 0 && (
              <div className="layout-verify-note">
                {warnings.map((w, i) => (
                  <div key={i}>{w}</div>
                ))}
              </div>
            )}

            <div className="modal-actions">
              <button type="button" className="ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={handleImportVista}>
                Convert Vista SeatPlan &amp; Enable 3D Preview
              </button>
            </div>
          </div>
        ) : (
          <div className="modal-body">
            <div className="notice">
              <strong>Honest Verification Policy:</strong> Attaching a calibrated template allows you
              to evaluate viewing distances, horizontal off-axis angles, and screen coverage for{' '}
              <strong>{cinema.name}</strong> while clearly labelling the auditorium as{' '}
              <code>ESTIMATED PROTOTYPE LAYOUT</code> (never claimed as an exact physical survey).
            </div>

            <label className="field-label">
              <span>Auditorium / Screen Label</span>
              <input
                type="text"
                className="field-input"
                value={customScreenName}
                onChange={(e) => setCustomScreenName(e.target.value)}
              />
            </label>

            <div className="template-grid">
              {[
                {
                  tpl: imaxCurvedAuditorium,
                  tag: 'CURVED IMAX · 286 SEATS',
                  desc: '19.0m × 9.6m tall screen, 26m curved row radius, inward-angled seats.',
                },
                {
                  tpl: grandAuditorium,
                  tag: 'STADIUM MULTIPLEX · 212 SEATS',
                  desc: '12.0m × 5.0m scope screen, centre walkway aisle, 4 pricing tiers.',
                },
                {
                  tpl: referenceAuditorium,
                  tag: 'DOLBY 7.1 REFERENCE · 183 SEATS',
                  desc: '11.0m × 4.6m screen, Lounger + Classic + Classic Plus + Prime Recliner.',
                },
                {
                  tpl: boutiqueReclinerAuditorium,
                  tag: 'LUXE RECLINER SUITE · 64 SEATS',
                  desc: '9.2m × 4.1m screen, wide 1.05m twin-recliner pods.',
                },
              ].map(({ tpl, tag, desc }) => (
                <button
                  key={tpl.id}
                  type="button"
                  className={'category-tab' + (selectedTemplateId === tpl.id ? ' on' : '')}
                  onClick={() => setSelectedTemplateId(tpl.id)}
                >
                  <span className="eyebrow-pill">{tag}</span>
                  <strong>{tpl.name}</strong>
                  <small>{desc}</small>
                </button>
              ))}
            </div>

            <div className="modal-actions">
              <button type="button" className="ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={handleAttachTemplate}>
                Attach Calibrated Layout (Marked Estimated)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ProviderStatusModal({
  googlePlacesConfigured,
  vistaConfigured,
  onClose,
}: {
  googlePlacesConfigured: boolean;
  vistaConfigured: boolean;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Cinema & Seat-Map Provider Feasibility Report">
      <div className="card modal-card wide">
        <div className="modal-head">
          <div>
            <span className="eyebrow-pill">PROVIDER ARCHITECTURE &amp; FEASIBILITY REPORT</span>
            <h2>Automated Cinema, Showtime &amp; Seat-Map Providers</h2>
            <p className="muted">
              Evaluation of external cinema discovery, showtime, and auditorium seat-map APIs for India &amp; global markets.
            </p>
          </div>
          <button type="button" className="ghost" onClick={onClose}>
            ✕ Close
          </button>
        </div>

        <div className="provider-report-list">
          {PROVIDER_FEASIBILITY_REPORT.map((p) => {
            const isLive =
              p.statusInFovo === 'ACTIVE_LIVE' ||
              (p.id === 'google_places_new' && googlePlacesConfigured) ||
              (p.id === 'vista_cinema_connect' && vistaConfigured);
            return (
              <div key={p.id} className="directory-card provider-report-card">
                <div className="directory-card-top">
                  <div>
                    <strong>{p.name}</strong>
                    <div className="muted">
                      Access: {p.accessType} · India Supported: {p.indiaSupported ? 'Yes' : 'No'} · Operator Auth Required:{' '}
                      {p.operatorAuthRequired ? 'Yes (Per-Chain Contract)' : 'No'}
                    </div>
                  </div>
                  <span className={'verify-badge ' + (isLive ? 'verified' : 'estimated')}>
                    {isLive
                      ? 'ACTIVE IN PIPELINE'
                      : p.statusInFovo === 'ADAPTER_READY_PARTNER_GATE'
                        ? 'ADAPTER READY · PARTNER GATE'
                        : 'ADAPTER READY · OPTIONAL ENV KEY'}
                  </span>
                </div>

                <div className="provider-cap-chips">
                  <span className={'verify-badge ' + (p.capabilities.cinemaDirectory ? 'verified' : 'demo')}>
                    Cinemas: {p.capabilities.cinemaDirectory ? 'Yes' : 'No'}
                  </span>
                  <span className={'verify-badge ' + (p.capabilities.sessionsAndShowtimes ? 'verified' : 'demo')}>
                    Sessions: {p.capabilities.sessionsAndShowtimes ? 'Yes' : 'No'}
                  </span>
                  <span className={'verify-badge ' + (p.capabilities.seatLayoutGrid2D ? 'verified' : 'demo')}>
                    2D Seat Plan: {p.capabilities.seatLayoutGrid2D ? 'Yes' : 'No'}
                  </span>
                  <span className={'verify-badge ' + (p.capabilities.physical3DCoordinates ? 'verified' : 'demo')}>
                    3D Room Elevations: {p.capabilities.physical3DCoordinates ? 'Yes' : 'No (Requires Calibration)'}
                  </span>
                  <span className={'verify-badge ' + (p.capabilities.liveSeatAvailability ? 'verified' : 'demo')}>
                    Seat Availability: {p.capabilities.liveSeatAvailability ? 'Yes' : 'No'}
                  </span>
                </div>

                <p className="muted">
                  <strong>Auth:</strong> {p.authRequirements}
                </p>
                <p className="muted">
                  <strong>Fields Returned:</strong> {p.actualFieldsReturned.join(' · ')}
                </p>
                <p className="muted">
                  <strong>Commercial &amp; Technical Notes:</strong> {p.commercialRestrictions}
                </p>
                <a
                  href={p.officialDocsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="provider-chip"
                  style={{ alignSelf: 'flex-start' }}
                >
                  Official API Documentation ↗
                </a>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
