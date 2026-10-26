export interface Workflow {
  step: 'prepare' | 'panel' | 'reference' | 'students';
  missing: string[];
  panelLaunchId: string | null;
  referenceStatus: 'draft' | 'validated' | null;
}

export interface PrcSummary {
  ownerUsername?: string;
  shared?: boolean;
  permissions?: { edit: boolean; share: boolean; archive: boolean; delete?: boolean; manageSessions: boolean };
  id: string;
  name: string;
  scenario: string;
  status: string;
  updatedAt: string;
  launchCount: number;
  archived: boolean;
  isDemo: boolean;
  workflow?: Workflow;
}

export interface Observation {
  id: string;
  text: string;
  category: string;
  position: number;
}

export const clinicalDataCategories = [
  'Démographie',
  'Description de la plainte',
  'Examen physique',
  'Laboratoires',
  'Médicaments',
  'Antécédents',
  'Autre',
] as const;

export interface CasePreviewData {
  name: string;
  scenario: string;
  instructions: string;
  diagnostics: Array<{ id: string; label: string }>;
  observations: Observation[];
  demonstrationLabel?: string;
}

export interface PrcDetail extends PrcSummary, CasePreviewData {
  version: number;
  launches?: Array<{
    id: string;
    name: string;
    role: 'panel' | 'students';
    status: string;
    createdAt: string;
    submissionCount: number;
    participantCount: number;
    isTrial?: boolean;
    caseVersion?: number;
    code?: string;
    deliveryMode?: 'synchronous' | 'asynchronous';
    guidedReview?: boolean;
  }>;
}

export const workflowLabel = (step: Workflow['step']) => ({
  prepare: 'Compléter le cas',
  panel: 'Faire répondre le panel',
  reference: 'Établir le corrigé',
  students: 'Lancer avec les étudiants',
})[step];
