import { useState } from 'react';
import type { Choice } from '@workspace/api-client-react';
import { ObservationMatrix } from './Participant';
import type { CasePreviewData } from './library-model';

export function CasePreview({ data, title = 'Aperçu du questionnaire' }: { data: CasePreviewData; title?: string }) {
  const [main, setMain] = useState<string | null>(null);
  const [alternative, setAlternative] = useState<string | null>(null);
  const [mainChoices, setMainChoices] = useState<Choice[]>([]);
  const [alternativeChoices, setAlternativeChoices] = useState<Choice[]>([]);
  const [error, setError] = useState('');
  const selectSign = (id: string, sign: '+' | '-', choices: Choice[], set: (choices: Choice[]) => void) => {
    const selected = choices.find(choice => choice.observationId === id);
    if (selected?.sign === sign) set(choices.filter(choice => choice.observationId !== id));
    else if (selected) set(choices.map(choice => choice.observationId === id ? { observationId: id, sign } : choice));
    else if (choices.length < 5) set([...choices, { observationId: id, sign }]);
    else { setError('Cinq données au maximum par impression clinique. Retirez un choix pour en sélectionner un autre.'); return; }
    setError('');
  };
  return <section className="case-preview" aria-label={title}>
    <header><div className="eyebrow">{data.demonstrationLabel || 'APERÇU LOCAL'}</div><h2>{title}</h2><p>{data.name || 'PRC sans nom'}</p></header>
    <p className="preview-scenario">{data.scenario || 'Le scénario du cas apparaîtra ici.'}</p>
    <p className="body-copy">{data.instructions}</p>
    <p className="preview-local-note">Vous pouvez essayer le tableau. Ces choix restent dans cette page : aucune copie et aucun score ne sont créés.</p>
    <ObservationMatrix observations={data.observations.filter(o => o.text.trim())} diagnostics={data.diagnostics}
      mainDiagnosticId={main} alternativeDiagnosticId={alternative}
      onDiagnosisChange={(role, value) => {
        if (role === 'main') { setMain(value); setMainChoices([]); }
        else { setAlternative(value); setAlternativeChoices([]); }
      }}
      mainChoices={mainChoices} alternativeChoices={alternativeChoices}
      setMainChoices={setMainChoices} setAlternativeChoices={setAlternativeChoices}
      selectSign={selectSign} disabled={false} hasAlternative={true} />
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
