import { useState } from 'react';
import { sendReport } from '../lib/api.js';

const IconMail = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
  </svg>
);

const IconClose = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18M6 6l12 12"/>
  </svg>
);

const IconCheck = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5"/>
  </svg>
);

/**
 * Modal d'envoi de rapport par email.
 *
 * Props:
 *   isOpen    — boolean
 *   onClose   — () => void
 *   context   — { adresse, zone, commune, typeZone }
 *   plu       — { analysis, extractedRules, hasDocument } | null
 *   risques   — { risques[], scoreRisqueGlobal, recommandationPrincipale, operationType } | null
 */
export function SendEmailModal({ isOpen, onClose, context, plu, risques }) {
  const [to,      setTo]      = useState(import.meta.env.VITE_EMAIL_DEFAULT_TO || '');
  const [inclPlu, setInclPlu] = useState(true);
  const [inclRis, setInclRis] = useState(true);
  const [status,  setStatus]  = useState('idle'); // idle | loading | ok | error
  const [errMsg,  setErrMsg]  = useState('');

  if (!isOpen) return null;

  const hasPlu     = !!plu?.analysis;
  const hasRisques = !!risques?.risques?.length;

  const handleSend = async () => {
    if (!to.trim()) return;
    setStatus('loading');
    setErrMsg('');
    try {
      await sendReport({
        to: to.trim(),
        context,
        plu:    (hasPlu     && inclPlu) ? plu     : undefined,
        risques:(hasRisques && inclRis) ? risques : undefined,
      });
      setStatus('ok');
    } catch (e) {
      setErrMsg(e.message || 'Erreur lors de l\'envoi');
      setStatus('error');
    }
  };

  const handleClose = () => {
    setStatus('idle');
    setTo('');
    setErrMsg('');
    onClose();
  };

  return (
    // Overlay
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="card w-full max-w-md shadow-2xl space-y-4 fade-in">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-blue/15 text-blue flex items-center justify-center">
              <IconMail />
            </div>
            <p className="text-sm font-semibold text-bright">Envoyer par email</p>
          </div>
          <button onClick={handleClose} className="text-muted hover:text-dim transition-colors p-1">
            <IconClose />
          </button>
        </div>

        {status === 'ok' ? (
          // ── Succès ──
          <div className="text-center py-4 space-y-3">
            <div className="w-12 h-12 rounded-full bg-green/15 text-green flex items-center justify-center mx-auto">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5"/>
              </svg>
            </div>
            <p className="text-sm font-medium text-bright">Email envoyé !</p>
            <p className="text-xs text-muted">Rapport envoyé à <span className="text-text">{to}</span></p>
            <button onClick={handleClose} className="btn-primary text-xs px-6">Fermer</button>
          </div>
        ) : (
          <>
            {/* Contexte */}
            <div className="card-sm space-y-1">
              <p className="text-[10px] text-muted uppercase tracking-wide">Adresse analysée</p>
              <p className="text-xs text-text font-medium">{context.adresse || '—'}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="pill pill-blue text-[10px]">Zone {context.zone}</span>
                {context.commune && <span className="text-[11px] text-muted">{context.commune}</span>}
              </div>
            </div>

            {/* Contenu inclus */}
            {(hasPlu || hasRisques) && (
              <div className="space-y-2">
                <p className="text-[10px] text-muted uppercase tracking-wide">Contenu inclus</p>
                {hasPlu && (
                  <CheckRow
                    checked={inclPlu}
                    onChange={setInclPlu}
                    label={`Analyse PLU · Zone ${context.zone}`}
                    sub={plu.hasDocument ? 'Document officiel extrait' : 'Données typiques'}
                  />
                )}
                {hasRisques && (
                  <CheckRow
                    checked={inclRis}
                    onChange={setInclRis}
                    label="Analyse des risques MdB"
                    sub={`Score ${risques.scoreRisqueGlobal}/100 · ${risques.risques.length} risques`}
                  />
                )}
              </div>
            )}

            {/* Destinataire */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-muted uppercase tracking-wide">Destinataire</label>
              <input
                type="email"
                className="input"
                placeholder="votre@email.fr"
                value={to}
                onChange={e => setTo(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                autoFocus
              />
            </div>

            {/* Expéditeur */}
            <p className="text-[10px] text-muted">
              Expéditeur : <span className="text-blue">pro@mdp.app</span>
            </p>

            {/* Erreur */}
            {status === 'error' && (
              <p className="text-xs text-red">⚠ {errMsg}</p>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button onClick={handleClose} className="btn-ghost flex-1 text-sm">
                Annuler
              </button>
              <button
                onClick={handleSend}
                disabled={!to.trim() || status === 'loading' || (!inclPlu && !inclRis)}
                className="btn-primary flex-1 text-sm disabled:opacity-40"
              >
                {status === 'loading'
                  ? <span className="flex items-center justify-center gap-2"><span className="dot-spin" />Envoi…</span>
                  : <span className="flex items-center justify-center gap-1.5"><IconMail />Envoyer →</span>
                }
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CheckRow({ checked, onChange, label, sub }) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer card-sm hover:border-blue/30 transition-colors">
      <div
        onClick={() => onChange(!checked)}
        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
          checked ? 'bg-blue border-blue text-white' : 'border-border'
        }`}
      >
        {checked && <IconCheck />}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-text">{label}</p>
        {sub && <p className="text-[10px] text-muted mt-0.5">{sub}</p>}
      </div>
    </label>
  );
}
