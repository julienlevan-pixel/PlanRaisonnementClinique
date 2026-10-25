import { expect, test, type Page } from '@playwright/test';

const id = '10000000-0000-4000-8000-000000000001';
const diagnostics = [{ id: '20000000-0000-4000-8000-000000000001', label: 'Hypothèse A' }, { id: '20000000-0000-4000-8000-000000000002', label: 'Hypothèse B' }];
const observations = Array.from({ length: 5 }, (_, index) => ({ id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, text: `Observation initiale ${index + 1}`, category: 'Autre', position: index }));
const fixture = () => ({ id, name: 'Cas clinique de test', scenario: 'Scénario de test', instructions: 'Choisir deux diagnostics distincts.', diagnostics, observations: structuredClone(observations), status: 'ready', version: 1, updatedAt: '2026-01-01T00:00:00Z', launchCount: 0, launches: [], archived: false, isDemo: false, workflow: { step: 'panel', missing: [], panelLaunchId: null, referenceStatus: null } });
const user = { id: 'teacher', username: 'test-teacher', role: 'teacher', active: true, mustChangePassword: false, createdAt: '2026-01-01T00:00:00Z' };
async function authenticate(page: Page) {
  await page.route('**/api/auth/me', route => route.fulfill({ json: { user } }));
  await page.route('**/api/workspace/summary', route => route.fulfill({ json: { prcCount: 1, activeLaunchCount: 0, participantCount: 0, submissionCount: 0, recentLaunches: [] } }));
}

test('imports twenty observations, preserves IDs and allows undo before saving', async ({ page }) => {
  await authenticate(page);
  let data = fixture();
  let saved: typeof observations = [];
  await page.route(`**/api/prcs/${id}`, async route => {
    if (route.request().method() === 'PUT') {
      const input = route.request().postDataJSON();
      saved = input.observations;
      data = { ...data, ...input, diagnostics: input.diagnostics.map((label: string, index: number) => ({ id: diagnostics[index]?.id, label })), version: 2 };
    }
    await route.fulfill({ json: data });
  });
  await page.goto(`/prc/${id}`);
  await page.getByLabel('Coller les observations, une par ligne').fill(Array.from({ length: 20 }, (_, index) => `Observation importée ${index + 1} | Symptômes`).join('\n'));
  await page.getByRole('button', { name: 'Importer les lignes', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Texte de l’observation 25', exact: true })).toHaveValue('Observation importée 20');
  await page.getByRole('button', { name: 'Supprimer l’observation 1', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Texte de l’observation 1', exact: true })).toHaveValue('Observation initiale 2');
  await page.getByRole('button', { name: 'Annuler la suppression de l’observation', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Texte de l’observation 1', exact: true })).toHaveValue('Observation initiale 1');
  await page.getByRole('button', { name: 'Descendre l’observation 1', exact: true }).click();
  await page.getByRole('button', { name: 'Annuler le déplacement', exact: true }).click();
  await page.getByRole('textbox', { name: 'Texte de l’observation 1', exact: true }).fill('Observation mise à jour');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Enregistré en base' })).toBeVisible();
  expect(saved).toHaveLength(25);
  expect(saved.slice(0, 5).map(observation => observation.id)).toEqual(observations.map(observation => observation.id));
  expect(new Set(saved.map(observation => observation.id)).size).toBe(25);
  for (const observation of saved) expect(observation.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  await page.getByRole('button', { name: 'Prévisualiser le questionnaire' }).click();
  await expect(page.getByRole('region', { name: 'Prévisualisation du questionnaire' })).toContainText('Observation importée 20');
});

test('archives and restores a PRC while retaining its history', async ({ page }) => {
  await authenticate(page);
  let data = fixture();
  await page.route('**/api/prcs?*', async route => {
    const query = new URL(route.request().url()).searchParams;
    const match = query.get('archived') === 'true' ? data.archived : !data.archived;
    const nameMatch = data.name.toLowerCase().includes((query.get('q') || '').toLowerCase());
    await route.fulfill({ json: match && nameMatch ? [data] : [] });
  });
  await page.route(`**/api/prcs/${id}`, async route => {
    if (route.request().method() === 'PATCH') data = { ...data, archived: route.request().postDataJSON().archived };
    await route.fulfill({ json: data });
  });
  await page.goto('/');
  await page.getByLabel('Rechercher un PRC', { exact: true }).fill('Cas clinique');
  await expect(page.getByRole('heading', { name: data.name })).toBeVisible();
  await page.getByText('Autres actions', { exact: true }).click();
  await page.getByRole('button', { name: 'Archiver', exact: true }).click();
  await expect(page.getByRole('heading', { name: data.name })).not.toBeVisible();
  await page.getByRole('button', { name: 'Archives', exact: true }).click();
  await expect(page.getByRole('heading', { name: data.name })).toBeVisible();
  await page.getByRole('button', { name: 'Restaurer le PRC', exact: true }).click();
  await page.getByRole('button', { name: 'Actifs', exact: true }).click();
  await expect(page.getByRole('heading', { name: data.name })).toBeVisible();
});

test('resumes the bounded demonstration initialization before opening it', async ({ page }) => {
  await authenticate(page);
  await page.route('**/api/prcs?*', route => route.fulfill({ json: [] }));
  await page.route(`**/api/prcs/${id}`, route => route.fulfill({ json: fixture() }));
  let requests = 0;
  await page.route('**/api/demo', route => {
    requests++;
    return route.fulfill({ json: { prcId: id, pending: requests < 3, progress: { expertsSubmitted: Math.min(10, requests * 4), totalExperts: 10, studentsSubmitted: requests < 3 ? 0 : 4, totalStudents: 4 } } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Ouvrir ma démonstration Toux', exact: true }).click();
  await expect(page).toHaveURL(`/prc/${id}`);
  expect(requests).toBe(3);
});

test('public Toux preview shows twenty observations and never creates a copy', async ({ page }) => {
  await page.route('**/api/auth/me', route => route.fulfill({ status: 401, json: { error: 'Connexion requise.' } }));
  const demo = { ...fixture(), name: 'Toux', demonstrationLabel: 'Démonstration — données fictives', observations: Array.from({ length: 20 }, (_, index) => ({ ...observations[0], id: `preview-${index}`, text: `Observation fictive ${index + 1}`, position: index })) };
  await page.route('**/api/demo-case', route => route.fulfill({ json: demo }));
  let posts = 0;
  page.on('request', request => { if (request.method() === 'POST') posts++; });
  await page.goto('/');
  const preview = page.getByRole('region', { name: 'Toux — essai du tableau' });
  await expect(preview).toContainText('Observation fictive 20');
  await preview.getByLabel('Diagnostic principal', { exact: true }).selectOption(diagnostics[0].id);
  await preview.getByLabel('Diagnostic alternatif', { exact: true }).selectOption(diagnostics[1].id);
  const choice = preview.getByRole('button', { name: 'Hypothèse principale : En faveur — Observation fictive 1', exact: true });
  await choice.click();
  await expect(choice).toHaveAttribute('aria-pressed', 'true');
  expect(posts).toBe(0);
});

test('saves an incomplete new draft without requiring a name or clinical content', async ({ page }) => {
  await authenticate(page);
  let draft: Record<string, any> | undefined;
  await page.route('**/api/prcs', async route => {
    draft = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { ...fixture(), ...draft, id, diagnostics: [] } });
  });
  await page.route(`**/api/prcs/${id}`, route => route.fulfill({ json: { ...fixture(), ...draft, id, diagnostics: [], workflow: { step: 'prepare', missing: ['Nom du PRC', 'Scénario', 'Deux diagnostics', 'Cinq observations'], panelLaunchId: null, referenceStatus: null } } }));
  await page.goto('/prc/new');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page).toHaveURL(`/prc/${id}`);
  expect(draft?.name).toBe('');
  expect(draft?.diagnostics).toEqual([]);
  expect(draft?.observations).toEqual([]);
  await expect(page.getByRole('status').filter({ hasText: 'Enregistré en base' })).toBeVisible();
});

test('creates an isolated trial and exposes its real participant invitation', async ({ page }) => {
  await authenticate(page);
  await page.route(`**/api/prcs/${id}`, route => route.fulfill({ json: fixture() }));
  await page.route(`**/api/prcs/${id}/trial`, route => route.fulfill({ status: 201, json: { launch: { id: 'trial-launch', isTrial: true }, invitationUrl: 'http://127.0.0.1:4174/join/TRIAL?invite=test-token', code: 'TRIAL' } }));
  await page.goto(`/prc/${id}`);
  await page.getByRole('button', { name: 'Tester comme participant', exact: true }).click();
  await expect(page.getByText('Votre lancement d’essai est prêt', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ouvrir le questionnaire d’essai', exact: true })).toHaveAttribute('href', /\/join\/TRIAL\?invite=test-token$/);
  await expect(page.getByRole('link', { name: 'Ouvrir le questionnaire d’essai', exact: true })).toHaveAttribute('target', '_blank');
  await expect(page.getByTestId('button-logout')).toBeVisible();
});
