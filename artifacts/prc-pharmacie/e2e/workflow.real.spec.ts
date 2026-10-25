import { expect, test, type BrowserContext, type Page } from '@playwright/test';

test.skip(process.env.PRC_E2E_REAL_DATABASE !== '1', 'Requires the disposable local PostgreSQL browser runner.');

async function login(page: Page, username: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Identifiant', { exact: true }).fill(username);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByRole('heading', { name: `Bonjour, ${username}` })).toBeVisible();
}
async function changeInitialPassword(page: Page, previous: string, next: string) {
  await page.getByLabel('Mot de passe actuel', { exact: true }).fill(previous);
  await page.getByLabel('Nouveau mot de passe (12 caractères minimum)', { exact: true }).fill(next);
  await page.getByRole('button', { name: 'Mettre à jour', exact: true }).click();
  await expect(page.getByText('Modification du mot de passe requise', { exact: true })).not.toBeVisible();
}
async function confirmClick(page: Page, name: string) {
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name, exact: true }).click();
}
async function answerAndSubmit(page: Page, pseudonym: string) {
  await page.getByLabel('Votre nom ou pseudonyme', { exact: true }).fill(pseudonym);
  await page.getByRole('button', { name: 'Rejoindre l’activité', exact: true }).click();
  await expect(page).toHaveURL(/\/participant$/);
  await page.getByLabel('Diagnostic principal', { exact: true }).selectOption({ label: 'Hypothèse navigateur A' });
  await page.getByLabel('Diagnostic alternatif', { exact: true }).selectOption({ label: 'Hypothèse navigateur B' });
  for (let index = 1; index <= 5; index++) {
    await page.getByRole('button', { name: `Hypothèse principale : En faveur — Observation clinique fictive ${index}`, exact: true }).click();
    await page.getByRole('button', { name: `Hypothèse alternative : En défaveur — Observation clinique fictive ${index}`, exact: true }).click();
  }
  await expect(page.locator('#participant-main-counter')).toContainText('5/5');
  await expect(page.locator('#participant-alternative-counter')).toContainText('5/5');
  await confirmClick(page, 'Vérifier et transmettre');
  await expect(page).toHaveURL(/\/participant\/results$/);
  await expect(page.getByText('Votre soumission définitive est enregistrée et verrouillée.', { exact: false })).toBeVisible();
}

test('real PostgreSQL workflow: administrator, teacher, expert and student in separate browser sessions', async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  if (!baseURL || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(baseURL).hostname)) throw new Error('The real workflow may run only against a local test site.');
  const adminName = process.env.PRC_E2E_ADMIN_USERNAME;
  const adminPassword = process.env.PRC_E2E_ADMIN_PASSWORD;
  if (!adminName || !adminPassword) throw new Error('The local runner must supply synthetic administrator credentials.');
  const teacherName = `browser_teacher_${Date.now()}`;
  const teacherInitial = 'Teacher-browser-initial-2026';
  const teacherPassword = 'Teacher-browser-updated-2026';
  const contexts: BrowserContext[] = [];
  async function page() { const context = await browser.newContext({ baseURL }); contexts.push(context); return context.newPage(); }
  const admin = await page(), teacher = await page(), expert = await page(), student = await page();
  let prcPath = '', panelPath = '', invitationUrl = '', studentUrl = '';
  try {
    await test.step('administrator changes the initial password and creates a teacher', async () => {
      await login(admin, adminName, adminPassword);
      await changeInitialPassword(admin, adminPassword, 'Admin-browser-updated-2026');
      await admin.getByRole('link', { name: 'Administration', exact: true }).click();
      await admin.getByLabel('Identifiant', { exact: true }).fill(teacherName);
      await admin.getByLabel('Mot de passe provisoire (12 caractères minimum)', { exact: true }).fill(teacherInitial);
      await admin.getByRole('button', { name: 'Créer le compte', exact: true }).click();
      await expect(admin.getByRole('status')).toContainText('Compte enseignant créé');
      await expect(admin.locator('.teacher-list')).toContainText(teacherName);
    });
    await test.step('teacher changes the initial password and creates a real twenty-observation PRC', async () => {
      await login(teacher, teacherName, teacherInitial);
      await changeInitialPassword(teacher, teacherInitial, teacherPassword);
      await teacher.getByRole('button', { name: 'Nouveau PRC', exact: true }).click();
      await teacher.getByLabel('Nom du PRC', { exact: true }).fill('Circuit navigateur — données fictives');
      await teacher.getByRole('button', { name: 'Créer le brouillon', exact: true }).click();
      await expect(teacher).toHaveURL(/\/prc\/[0-9a-f-]+$/);
      prcPath = new URL(teacher.url()).pathname;
      await teacher.getByRole('textbox', { name: 'Scénario clinique', exact: true }).fill('Cas technique fictif utilisé uniquement pour vérifier le parcours complet dans une base jetable.');
      await teacher.getByRole('button', { name: 'Ajouter un diagnostic', exact: true }).click();
      await teacher.getByRole('textbox', { name: 'Diagnostic 1', exact: true }).fill('Hypothèse navigateur A');
      await teacher.getByRole('button', { name: 'Ajouter un diagnostic', exact: true }).click();
      await teacher.getByRole('textbox', { name: 'Diagnostic 2', exact: true }).fill('Hypothèse navigateur B');
      await teacher.getByRole('textbox', { name: 'Coller les observations, une par ligne', exact: true }).fill(Array.from({ length: 20 }, (_, index) => `Observation clinique fictive ${index + 1} | Examen`).join('\n'));
      await teacher.getByRole('button', { name: 'Importer les lignes', exact: true }).click();
      await expect(teacher.getByRole('textbox', { name: 'Texte de l’observation 20', exact: true })).toBeVisible();
      await teacher.getByRole('button', { name: 'Enregistrer', exact: true }).click();
      await expect(teacher.getByRole('status').filter({ hasText: 'Enregistré en base' })).toBeVisible();
      await teacher.reload();
      await expect(teacher.getByRole('textbox', { name: 'Texte de l’observation 20', exact: true })).toHaveValue('Observation clinique fictive 20');
    });
    await test.step('teacher launches the panel and the invited expert submits five signed choices per role', async () => {
      await teacher.getByRole('button', { name: 'Faire répondre le panel', exact: true }).click();
      await expect(teacher).toHaveURL(/\/activity\/[0-9a-f-]+$/);
      panelPath = new URL(teacher.url()).pathname;
      await teacher.getByLabel('Nom de l’invitation', { exact: true }).fill('Expert fictif navigateur');
      await teacher.getByRole('button', { name: 'Créer une invitation', exact: true }).click();
      const link = teacher.locator('.invitation-banner a');
      await expect(link).toBeVisible();
      invitationUrl = (await link.getAttribute('href'))!;
      expect(new URL(invitationUrl, baseURL).origin).toBe(new URL(baseURL).origin);
      await expert.goto(invitationUrl);
      await answerAndSubmit(expert, 'Expert navigateur fictif');
      await expert.reload();
      await expect(expert.getByRole('heading', { name: 'Votre réponse définitive', exact: true })).toBeVisible();
      await expect(expert.getByRole('heading', { name: 'Votre résultat', exact: true })).not.toBeVisible();
      expect((await expert.request.get('/api/teachers')).status()).toBe(401);
    });
    await test.step('teacher closes the panel, generates its actual reference and validates it', async () => {
      await teacher.reload();
      await confirmClick(teacher, 'Fermer la collecte');
      await teacher.getByLabel('Minimum de copies expertes définitives', { exact: true }).fill('1');
      await teacher.getByRole('button', { name: 'Générer le corrigé', exact: true }).click();
      await expect(teacher.getByRole('button', { name: 'Valider le corrigé', exact: true })).toBeEnabled();
      await teacher.getByRole('textbox', { name: 'Explication du professeur (facultative)', exact: true }).fill('Explication fictive issue du panel de test.');
      await confirmClick(teacher, 'Valider le corrigé');
      await expect(teacher.locator('.reference-locked')).toContainText('validé et immuable');
      await teacher.reload();
      await expect(teacher.locator('.reference-locked')).toContainText('validé et immuable');
      expect(new URL(teacher.url()).pathname).toBe(panelPath);
    });
    await test.step('teacher starts an independent student group and the student submits a real copy', async () => {
      await teacher.getByRole('link', { name: 'Lancer avec les étudiants', exact: true }).click();
      await expect(teacher).toHaveURL(prcPath);
      await teacher.getByRole('button', { name: 'Lancer avec les étudiants', exact: true }).click();
      await expect(teacher).toHaveURL(/\/activity\/[0-9a-f-]+$/);
      expect(new URL(teacher.url()).pathname).not.toBe(panelPath);
      const access = teacher.locator('.access-card a');
      await expect(access).toBeVisible();
      studentUrl = (await access.getAttribute('href'))!;
      await student.goto(studentUrl);
      await answerAndSubmit(student, 'Étudiant navigateur fictif');
      await expect(student.getByRole('heading', { name: 'Votre résultat', exact: true })).not.toBeVisible();
      await expect(student.getByText('Votre note reste privée et masquée', { exact: false })).toBeVisible();
    });
    await test.step('teacher closes, reveals each saved stage, and publishes the private score', async () => {
      await teacher.reload();
      await confirmClick(teacher, 'Fermer la collecte');
      for (const stage of ['mainDiagnostic', 'mainArguments', 'alternativeDiagnostic', 'alternativeArguments', 'reference']) {
        await teacher.getByTestId(`toggle-reveal-${stage}`).check();
        await expect(teacher.getByTestId(`toggle-reveal-${stage}`)).toBeChecked();
      }
      await teacher.reload();
      for (const stage of ['mainDiagnostic', 'mainArguments', 'alternativeDiagnostic', 'alternativeArguments', 'reference']) await expect(teacher.getByTestId(`toggle-reveal-${stage}`)).toBeChecked();
      await student.reload();
      await expect(student.getByRole('heading', { name: 'Votre résultat', exact: true })).not.toBeVisible();
      await expect(student.getByRole('heading', { name: 'Référence du panel révélée', exact: true })).toBeVisible();
      await teacher.getByRole('button', { name: 'Publier les résultats', exact: true }).click();
      await expect(teacher.getByRole('button', { name: 'Résultats publiés', exact: true })).toBeDisabled();
      await student.reload();
      await expect(student.getByRole('heading', { name: 'Votre résultat', exact: true })).toBeVisible();
      await expect(student.locator('.participant-score')).toContainText('100 %');
      await expect(student.locator('.score-components > div')).toHaveCount(4);
      await expect(student.getByRole('heading', { name: 'Explication du professeur', exact: true })).toBeVisible();
      const own = await (await student.request.get('/api/participant/results')).json();
      expect(own.score).toBe(20);
      expect(own.response.state).toBe('submitted');
      expect(own).not.toHaveProperty('participants');
      expect(own).not.toHaveProperty('password_hash');
      expect((await student.request.get('/api/teachers')).status()).toBe(401);
    });
  } finally { await Promise.all(contexts.map(context => context.close())); }
});
