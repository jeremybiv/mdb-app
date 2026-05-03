import { Router } from 'express';

const router = Router();

const FROM = process.env.EMAIL_FROM || 'MdB Intelligence <jeremy.bivaud+mdb@gmail.com>';

// ── Markdown minimal → HTML (pour le texte d'analyse Claude) ──────────────────
function mdToHtml(text) {
  if (!text) return '';

  const lines = text.split('\n');
  const out   = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trim = line.trim();

    // Séparateur
    if (trim === '---') {
      out.push('<hr style="border:none;border-top:1px solid #e5e7eb;margin:12px 0;">');
      i++; continue;
    }

    // Titre bloc #### BLOC N — TITRE
    if (trim.startsWith('#### ')) {
      out.push(`<p style="font-size:10px;font-weight:700;color:#2563eb;text-transform:uppercase;letter-spacing:.08em;margin:16px 0 6px;padding-bottom:4px;border-bottom:1px solid #dbeafe;">${esc(trim.slice(5))}</p>`);
      i++; continue;
    }

    // Section en gras **N. TITRE** (lignes style "**2. DROITS…**")
    if (/^\*\*\d+\./.test(trim)) {
      out.push(`<p style="font-size:13px;font-weight:600;color:#111827;margin:18px 0 6px;">${applyBold(esc(trim))}</p>`);
      i++; continue;
    }

    // Tableau : collecter toutes les lignes consécutives qui commencent par |
    if (trim.startsWith('|')) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      const rows = tableLines
        .filter(l => !/^\|[\s\-:|]+\|/.test(l.trim()))
        .map(l => l.split('|').slice(1, -1).map(c => c.trim()));
      if (rows.length > 0) {
        const [head, ...body] = rows;
        let t = '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin:8px 0;font-size:12px;">';
        t += '<thead><tr style="background:#f9fafb;">' + head.map(c => `<th style="padding:6px 10px;text-align:left;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">${applyBold(esc(c))}</th>`).join('') + '</tr></thead>';
        t += '<tbody>';
        body.forEach((row, ri) => {
          const bg = ri % 2 === 1 ? 'background:#f9fafb;' : '';
          t += `<tr style="${bg}">` + row.map(c => `<td style="padding:5px 10px;color:#374151;border-bottom:1px solid #f3f4f6;vertical-align:top;">${applyBold(esc(c))}</td>`).join('') + '</tr>';
        });
        t += '</tbody></table>';
        out.push(t);
      }
      continue;
    }

    // Bullet
    if (trim.startsWith('- ')) {
      out.push(`<p style="margin:3px 0 3px 12px;font-size:12px;color:#374151;"><span style="color:#2563eb;margin-right:6px;">·</span>${applyBold(esc(trim.slice(2)))}</p>`);
      i++; continue;
    }

    // Ligne vide → espace
    if (!trim) { out.push('<div style="height:4px;"></div>'); i++; continue; }

    // Paragraphe normal
    out.push(`<p style="margin:3px 0;font-size:12px;color:#374151;line-height:1.6;">${applyBold(esc(trim))}</p>`);
    i++;
  }

  return out.join('\n');
}

function esc(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function applyBold(s) {
  return s.replace(/\*\*(.+?)\*\*/g, '<strong style="color:#111827;">$1</strong>');
}

// ── Template email HTML ───────────────────────────────────────────────────────

function buildHtml({ context, plu, risques }) {
  const date = new Date().toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const NIVEAU_COLORS = {
    critique: { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b', badge: '#dc2626' },
    élevé:    { bg: '#fffbeb', border: '#fcd34d', text: '#92400e', badge: '#d97706' },
    modéré:   { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af', badge: '#2563eb' },
    faible:   { bg: '#f9fafb', border: '#d1d5db', text: '#374151', badge: '#6b7280' },
  };
  const CAT_LABELS = {
    juridique: '⚖ Juridique', fiscal: '€ Fiscal', administratif: '🏛 Administratif',
    technique: '⚙ Technique', marché: '↗ Marché',
  };

  // ── Section contexte ──
  const ctxRows = [
    ['Adresse',  context.adresse || '—'],
    ['Zone PLU', context.zone],
    ['Commune',  context.commune || '—'],
    ['Analyse',  date],
  ].map(([k, v]) => `
    <tr>
      <td style="padding:5px 0;color:#6b7280;font-size:12px;width:110px;vertical-align:top;">${esc(k)}</td>
      <td style="padding:5px 0;color:#111827;font-size:12px;font-weight:500;">${
        k === 'Zone PLU'
          ? `<span style="background:#dbeafe;color:#1d4ed8;font-size:12px;font-weight:700;padding:2px 8px;border-radius:4px;font-family:monospace;">${esc(v)}</span>${context.typeZone ? `<span style="color:#6b7280;font-size:11px;margin-left:8px;">${esc(context.typeZone)}</span>` : ''}`
          : esc(v)
      }</td>
    </tr>`).join('');

  // ── Section PLU ──
  let pluSection = '';
  if (plu) {
    // Chiffres clés règlement
    let rulesHtml = '';
    if (plu.extractedRules) {
      const er = plu.extractedRules;
      const numItems = [
        er.empriseSol          && ['Emprise sol (CES)',   `${er.empriseSol.value} %`],
        er.hauteurMax          && ['Hauteur max',          `${er.hauteurMax.value} m`],
        er.hauteurEgout        && ['Hauteur égout',        `${er.hauteurEgout.value} m`],
        er.reculVoirie         && ['Recul voirie',         `${er.reculVoirie.value} m`],
        er.reculLimites        && ['Recul lim. sép.',     `${er.reculLimites.value} m`],
        er.surfacePlancher     && ['Surface plancher max', `${er.surfacePlancher.value} m²`],
        er.surfaceMinLot       && ['Surface min lot',      `${er.surfaceMinLot.value} m²`],
        er.largeurFacade       && ['Largeur façade min',   `${er.largeurFacade.value} m`],
        er.statLogement        && ['Stat./logement',       `${er.statLogement.value} pl.`],
        er.espaceVert          && ['Espaces verts min',    `${er.espaceVert.value} %`],
        er.coeffBiotope        && ['Coeff. biotope',       `${er.coeffBiotope.value}`],
      ].filter(Boolean);

      if (numItems.length > 0) {
        const cells = numItems.map(([label, val]) =>
          `<td style="padding:8px;background:white;border:1px solid #e5e7eb;border-radius:6px;text-align:center;width:${Math.floor(100/Math.min(numItems.length,4))}%;">
            <div style="font-size:10px;color:#9ca3af;margin-bottom:4px;">${esc(label)}</div>
            <div style="font-size:15px;font-weight:600;color:#111827;">${esc(val)}</div>
          </td>`
        ).join('');
        rulesHtml = `
          <p style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin:0 0 8px;">Chiffres clés · extrait règlement</p>
          <table width="100%" cellpadding="4" cellspacing="4" style="border-collapse:separate;border-spacing:6px;"><tr>${cells}</tr></table>`;
      }
    }

    pluSection = `
      <tr><td style="padding:0 28px 4px;">
        <div style="height:1px;background:#e5e7eb;"></div>
      </td></tr>
      <tr><td style="padding:16px 28px 20px;background:white;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
          <div style="width:4px;height:20px;background:#2563eb;border-radius:2px;"></div>
          <p style="font-size:13px;font-weight:700;color:#111827;margin:0;">Analyse PLU · Zone ${esc(context.zone)}</p>
          ${plu.hasDocument ? '<span style="background:#dcfce7;color:#166534;font-size:10px;padding:2px 8px;border-radius:10px;">Document officiel</span>' : '<span style="background:#fef3c7;color:#92400e;font-size:10px;padding:2px 8px;border-radius:10px;">Données typiques</span>'}
        </div>
        ${rulesHtml}
        <div style="margin-top:12px;">${mdToHtml(plu.analysis)}</div>
      </td></tr>`;
  }

  // ── Section risques ──
  let risquesSection = '';
  if (risques) {
    const { scoreRisqueGlobal, recommandationPrincipale, risques: list, operationType } = risques;
    const scoreColor = scoreRisqueGlobal >= 65 ? '#16a34a' : scoreRisqueGlobal >= 40 ? '#d97706' : '#dc2626';
    const scoreLabel = scoreRisqueGlobal >= 65 ? 'Dossier sécurisé' : scoreRisqueGlobal >= 40 ? 'Précautions nécessaires' : 'Risques importants';
    const barFill    = scoreRisqueGlobal >= 65 ? '#16a34a' : scoreRisqueGlobal >= 40 ? '#d97706' : '#dc2626';

    const OP_LABELS = { division: 'Division', valorisation: 'Valorisation', mixte: 'Division + rénov.', surseoir: 'Achat-revente nu' };

    const riskRows = (list || []).map(r => {
      const c = NIVEAU_COLORS[r.niveau] || NIVEAU_COLORS.faible;
      return `
        <tr>
          <td colspan="2" style="padding:10px;background:${c.bg};border-left:3px solid ${c.badge};border-radius:4px;margin-bottom:6px;display:block;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
              <span style="background:${c.badge};color:white;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;text-transform:uppercase;">${esc(r.niveau)}</span>
              <span style="font-size:13px;font-weight:600;color:#111827;">${esc(r.titre)}</span>
            </div>
            <p style="margin:0 0 4px;font-size:11px;color:#6b7280;">${esc(CAT_LABELS[r.categorie] || r.categorie)} · ${esc(r.probabilite)}</p>
            <p style="margin:0 0 6px;font-size:12px;color:#374151;">${esc(r.description)}</p>
            <div style="background:rgba(255,255,255,.6);border-radius:4px;padding:6px 8px;">
              <p style="margin:0 0 2px;font-size:9px;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;">Mitigation</p>
              <p style="margin:0;font-size:11px;color:#374151;">${esc(r.mitigation)}</p>
            </div>
            ${r.referenceJuridique ? `<p style="margin:4px 0 0;font-size:10px;color:#9ca3af;font-family:monospace;">${esc(r.referenceJuridique)}</p>` : ''}
          </td>
        </tr>
        <tr><td colspan="2" style="height:6px;"></td></tr>`;
    }).join('');

    risquesSection = `
      <tr><td style="padding:0 28px 4px;">
        <div style="height:1px;background:#e5e7eb;"></div>
      </td></tr>
      <tr><td style="padding:16px 28px 20px;background:white;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
          <div style="width:4px;height:20px;background:#d97706;border-radius:2px;"></div>
          <p style="font-size:13px;font-weight:700;color:#111827;margin:0;">Analyse des risques MdB</p>
          <span style="background:#fef3c7;color:#92400e;font-size:10px;padding:2px 8px;border-radius:10px;">${esc(OP_LABELS[operationType] || operationType)}</span>
        </div>

        <!-- Score -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;">
          <tr>
            <td>
              <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:6px;">
                <span style="font-size:28px;font-weight:700;color:${scoreColor};font-family:monospace;">${scoreRisqueGlobal}</span>
                <span style="font-size:13px;color:#9ca3af;">/100</span>
                <span style="font-size:12px;color:${scoreColor};font-weight:600;margin-left:4px;">${scoreLabel}</span>
              </div>
              <div style="height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden;">
                <div style="height:6px;width:${scoreRisqueGlobal}%;background:${barFill};border-radius:3px;"></div>
              </div>
            </td>
          </tr>
        </table>

        ${recommandationPrincipale ? `
        <div style="background:#eff6ff;border-left:3px solid #2563eb;border-radius:4px;padding:10px 12px;margin-bottom:14px;">
          <p style="margin:0;font-size:12px;color:#1e40af;line-height:1.6;">${esc(recommandationPrincipale)}</p>
        </div>` : ''}

        <table width="100%" cellpadding="0" cellspacing="0">${riskRows}</table>
      </td></tr>`;
  }

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Analyse MdB Intelligence</title>
</head>
<body style="margin:0;padding:0;background:#f5f6fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6fa;">
  <tr><td align="center" style="padding:24px 16px;">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

      <!-- Header -->
      <tr><td style="background:#111827;border-radius:12px 12px 0 0;padding:22px 28px;">
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="background:#2563eb;width:36px;height:36px;border-radius:8px;text-align:center;vertical-align:middle;font-size:18px;">📊</td>
          <td style="padding-left:12px;vertical-align:middle;">
            <div style="color:#f9fafb;font-size:16px;font-weight:700;margin-bottom:2px;">MdB Intelligence</div>
            <div style="color:#6b7280;font-size:11px;">Analyse foncière · France entière</div>
          </td>
        </tr></table>
      </td></tr>

      <!-- Contexte -->
      <tr><td style="background:white;padding:20px 28px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
        <p style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin:0 0 12px;">Contexte de l'opération</p>
        <table width="100%" cellpadding="0" cellspacing="0">${ctxRows}</table>
      </td></tr>

      ${pluSection}
      ${risquesSection}

      <!-- Footer -->
      <tr><td style="background:#f9fafb;border-radius:0 0 12px 12px;padding:18px 28px;border:1px solid #e5e7eb;border-top:none;">
        <p style="color:#9ca3af;font-size:11px;margin:0;line-height:1.7;">
          Analyse IA indicative — vérifier en mairie et consulter un notaire avant toute opération.<br>
          <a href="mailto:pro@mdp.app" style="color:#2563eb;text-decoration:none;">pro@mdp.app</a> · MdB Intelligence
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ── POST /api/email/send-report ───────────────────────────────────────────────

router.post('/send-report', async (req, res) => {
  try {
    const { to, context, plu, risques } = req.body;

    if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      return res.status(400).json({ error: 'Adresse email destinataire invalide' });
    }
    if (!context?.zone) {
      return res.status(400).json({ error: 'context.zone requis' });
    }
    if (!plu && !risques) {
      return res.status(400).json({ error: 'Au moins plu ou risques requis' });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: 'Service email non configuré (RESEND_API_KEY manquant)' });
    }

    const parts = [plu ? `PLU zone ${context.zone}` : null, risques ? 'Risques MdB' : null].filter(Boolean);
    const subject = `${parts.join(' · ')} — ${context.commune || context.adresse || 'Analyse'} | MdB Intelligence`;

    const html = buildHtml({ context, plu, risques });

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM, to: [to], subject, html }),
    });

    const data = await r.json();

    if (!r.ok) {
      console.error('[email] Resend error:', data);
      return res.status(502).json({ error: data.message || `Resend HTTP ${r.status}` });
    }

    console.log(`[email] Envoyé à ${to} — id=${data.id}`);
    return res.json({ success: true, id: data.id });
  } catch (err) {
    console.error('[email] Erreur:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
