const STEPS = [
  { key: 'geocode', label: 'Géocodage adresse', api: 'api-adresse.data.gouv.fr' },
  { key: 'zone',    label: 'Zone PLUiH',         api: 'apicarto.ign.fr/gpu/zone-urba' },
  { key: 'doc',     label: 'Document urbanisme', api: 'apicarto.ign.fr/gpu/document' },
];

function Dot({ status }) {
  if (status === 'loading') return <span className="dot-spin flex-shrink-0 mt-1" />;
  if (status === 'done')    return <span className="dot-ok flex-shrink-0 mt-1" />;
  if (status === 'error')   return <span className="dot-err flex-shrink-0 mt-1" />;
  return <span className="dot-idle flex-shrink-0 mt-1" />;
}

export function ApiSteps({ steps }) {
  return (
    <div className="card space-y-3">
      <p className="label">Interrogation APIs publiques</p>
      {STEPS.map((s) => (
        <div key={s.key} className="flex items-start gap-3">
          <Dot status={steps[s.key]} />
          <div className="min-w-0">
            <span className="text-sm text-text">{s.label}</span>
            <span className="font-mono text-xs text-muted ml-2">→ {s.api}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
