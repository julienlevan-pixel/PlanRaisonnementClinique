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
  await page.getByText('Importer plusieurs données (facultatif)', { exact: true }).click();
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

test('builds the final clinical grid one row at a time and saves categories, text and order', async ({ page }, testInfo) => {
  await authenticate(page);
  let data: any = { ...fixture(), observations: [] };
  let saved: typeof observations = [];
  await page.route(`**/api/prcs/${id}`, async route => {
    if (route.request().method() === 'PUT') {
      const input = route.request().postDataJSON();
      saved = input.observations;
      data = { ...data, ...input, diagnostics, version: 2 };
    }
    await route.fulfill({ json: data });
  });
  await page.goto(`/prc/${id}`);
  const table = page.getByRole('region', { name: 'Création du tableau clinique', exact: true });
  await expect(table.getByRole('columnheader', { name: 'Hypothèse principale', exact: true })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Hypothèse alternative', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ajouter une ligne', exact: true }).click();
  await expect(page.getByLabel('Texte de l’observation 1', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Catégorie de l’observation 1', { exact: true }).locator('option')).toHaveText([
    'Démographie', 'Description de la plainte', 'Examen physique', 'Laboratoires', 'Médicaments', 'Antécédents', 'Autre',
  ]);
  await page.getByLabel('Catégorie de l’observation 1', { exact: true }).selectOption('Démographie');
  await page.getByLabel('Texte de l’observation 1', { exact: true }).fill('Femme de 54 ans');
  await page.getByRole('button', { name: 'Ajouter la ligne suivante', exact: true }).click();
  await page.getByLabel('Catégorie de l’observation 2', { exact: true }).selectOption('Laboratoires');
  await page.getByLabel('Texte de l’observation 2', { exact: true }).fill('Créatinine à 135 µmol/L');
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await expect(table.getByRole('button', { name: /En faveur — Femme de 54 ans/ }).first()).toBeDisabled();
  await page.getByRole('button', { name: 'Descendre l’observation 1', exact: true }).click();
  await expect(page.getByLabel('Catégorie de l’observation 1', { exact: true })).toHaveValue('Laboratoires');
  await page.getByRole('button', { name: 'Annuler le déplacement', exact: true }).click();
  await expect(page.getByLabel('Texte de l’observation 1', { exact: true })).toHaveValue('Femme de 54 ans');
  expect(await table.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('editor-desktop.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Enregistré en base' })).toBeVisible();
  expect(saved.map(row => [row.text, row.category, row.position])).toEqual([
    ['Femme de 54 ans', 'Démographie', 0], ['Créatinine à 135 µmol/L', 'Laboratoires', 1],
  ]);
  await page.reload();
  await expect(page.getByLabel('Catégorie de l’observation 2', { exact: true })).toHaveValue('Laboratoires');
  await page.getByRole('button', { name: 'Prévisualiser le questionnaire', exact: true }).click();
  const preview = page.getByRole('region', { name: 'Prévisualisation du questionnaire', exact: true });
  await expect(preview).toContainText('Femme de 54 ans');
  await expect(preview).toContainText('Créatinine à 135 µmol/L');
  await page.getByRole('button', { name: 'Fermer l’aperçu', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await table.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('editor-mobile.png'), animations: 'disabled' });
});

test('preserves existing custom clinical categories when editing an old case', async ({ page }) => {
  await authenticate(page);
  const data = fixture();
  data.observations[0].category = 'Symptômes historiques';
  await page.route(`**/api/prcs/${id}`, route => route.fulfill({ json: data }));
  await page.goto(`/prc/${id}`);
  const category = page.getByLabel('Catégorie de l’observation 1', { exact: true });
  await expect(category).toHaveValue('Symptômes historiques');
  await category.selectOption('Description de la plainte');
  await expect(category).toHaveValue('Description de la plainte');
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
  await page.goto('/prcs');
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

for (const archived of [false, true]) {
  test(`confirms permanent deletion of an ${archived ? 'archived' : 'active'} PRC and lets the teacher cancel`, async ({ page }) => {
    await authenticate(page);
    const data = { ...fixture(), archived, launchCount: 2, workflow: { step: 'students', missing: [], panelLaunchId: null, referenceStatus: 'validated' } };
    let deleted = false;
    let deletions = 0;
    await page.route('**/api/prcs?*', route => {
      const matches = (new URL(route.request().url()).searchParams.get('archived') === 'true') === archived;
      return route.fulfill({ json: !deleted && matches ? [data] : [] });
    });
    await page.route(`**/api/prcs/${id}`, route => {
      expect(route.request().method()).toBe('DELETE');
      expect(route.request().postDataJSON()).toEqual({ confirm: true });
      deletions++;
      deleted = true;
      return route.fulfill({ json: { id, deleted: true } });
    });
    await page.goto('/prcs');
    if (archived) await page.getByRole('button', { name: 'Archives', exact: true }).click();
    await page.getByText('Autres actions', { exact: true }).click();
    const remove = page.getByRole('button', { name: 'Supprimer définitivement', exact: true });
    page.once('dialog', async dialog => {
      expect(dialog.type()).toBe('confirm');
      expect(dialog.message()).toContain(data.name);
      expect(dialog.message()).toContain('réponses et leurs corrigés');
      expect(dialog.message()).toContain('irréversible');
      await dialog.dismiss();
    });
    await remove.click();
    await expect(page.getByRole('heading', { name: data.name, exact: true })).toBeVisible();
    expect(deletions).toBe(0);
    page.once('dialog', dialog => dialog.accept());
    await remove.click();
    await expect(page.getByRole('heading', { name: data.name, exact: true })).not.toBeVisible();
    await expect(page.getByRole('status')).toContainText('supprimés définitivement');
    expect(deletions).toBe(1);
  });
}

test('a failed deletion retains the PRC and offers a retry', async ({ page }) => {
  await authenticate(page);
  let deleted = false;
  let attempts = 0;
  await page.route('**/api/prcs?*', route => route.fulfill({ json: deleted ? [] : [fixture()] }));
  await page.route(`**/api/prcs/${id}`, route => {
    attempts++;
    if (attempts === 1) return route.fulfill({ status: 503, json: { error: 'Base temporairement indisponible.' } });
    deleted = true;
    return route.fulfill({ json: { id, deleted: true } });
  });
  await page.goto('/prcs');
  await page.getByText('Autres actions', { exact: true }).click();
  page.on('dialog', dialog => dialog.accept());
  const remove = page.getByRole('button', { name: 'Supprimer définitivement', exact: true });
  await remove.click();
  await expect(page.getByRole('alert')).toContainText('Base temporairement indisponible.');
  await expect(page.getByRole('heading', { name: fixture().name, exact: true })).toBeVisible();
  await remove.click();
  await expect(page.getByRole('status')).toContainText('supprimés définitivement');
  await expect(page.getByRole('alert')).not.toBeVisible();
});

test('collaborators cannot see the permanent delete action', async ({ page }) => {
  await authenticate(page);
  const data = { ...fixture(), shared: true, ownerUsername: 'proprietaire', permissions: { edit: true, share: false, archive: false, delete: false, manageSessions: true } };
  await page.route('**/api/prcs?*', route => route.fulfill({ json: [data] }));
  await page.goto('/prcs');
  await page.getByText('Autres actions', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Dupliquer', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Supprimer définitivement', exact: true })).toHaveCount(0);
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
  await page.goto('/prcs');
  await page.getByRole('button', { name: 'Ouvrir ma démonstration Toux', exact: true }).click();
  await expect(page).toHaveURL(`/prc/${id}`);
  expect(requests).toBe(3);
});

test('public Toux preview unfolds on demand, preserves choices and never creates a copy', async ({ page }, testInfo) => {
  await page.route('**/api/auth/me', route => route.fulfill({ status: 401, json: { error: 'Connexion requise.' } }));
  const demo = { ...fixture(), name: 'Toux', demonstrationLabel: 'Démonstration — données fictives', observations: Array.from({ length: 20 }, (_, index) => ({ ...observations[0], id: `preview-${index}`, text: `Observation fictive ${index + 1}`, position: index })) };
  await page.route('**/api/demo-case', route => route.fulfill({ json: demo }));
  let posts = 0;
  page.on('request', request => { if (request.method() === 'POST') posts++; });
  await page.goto('/');
  const preview = page.getByRole('region', { name: 'Toux — essai du tableau' });
  await expect(preview).not.toBeVisible();
  await expect(page.locator('.reasoning-words em')).toHaveText('Justifier.');
  await page.screenshot({ path: testInfo.outputPath('home-desktop.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('link', { name: 'Découvrir l’exemple « Toux »', exact: true }).click();
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('Observation fictive 20');
  await preview.getByLabel('Diagnostic principal', { exact: true }).selectOption(diagnostics[0].id);
  await preview.getByLabel('Diagnostic alternatif', { exact: true }).selectOption(diagnostics[1].id);
  const choice = preview.getByRole('button', { name: 'Hypothèse principale : En faveur — Observation fictive 1', exact: true });
  await choice.click();
  await expect(choice).toHaveAttribute('aria-pressed', 'true');
  const summary = page.locator('.public-demo-disclosure > summary');
  await summary.focus();
  await summary.press('Enter');
  await expect(preview).not.toBeVisible();
  await summary.press('Enter');
  await expect(choice).toHaveAttribute('aria-pressed', 'true');
  await summary.press('Enter');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const codeField = await page.getByLabel('Rejoindre une activité', { exact: true }).boundingBox();
  expect(codeField!.y + codeField!.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: testInfo.outputPath('home-mobile.png'), fullPage: true, animations: 'disabled' });
  await page.getByText('Voir le questionnaire', { exact: true }).click();
  await expect(choice).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await preview.screenshot({ path: testInfo.outputPath('home-demo-open.png'), animations: 'disabled' });
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
