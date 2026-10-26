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
  await page.getByLabel('Impression clinique', { exact: true }).selectOption({ label: 'Hypothèse navigateur A' });
  await page.getByLabel('Impression clinique alternative', { exact: true }).selectOption({ label: 'Hypothèse navigateur B' });
  for (let index = 1; index <= 5; index++) {
    await page.getByRole('button', { name: `Impression clinique : En faveur — Observation clinique fictive ${index}`, exact: true }).click();
    await page.getByRole('button', { name: `Impression clinique alternative : En défaveur — Observation clinique fictive ${index}`, exact: true }).click();
  }
  await expect(page.locator('#participant-main-counter')).toContainText('5/5');
  await expect(page.locator('#participant-alternative-counter')).toContainText('5/5');
  for (const selector of await page.getByRole('combobox', { name: /^Points impression clinique/ }).all()) await selector.selectOption('3');
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
      await teacher.getByRole('button', { name: 'Nouveau PRC', exact: true }).first().click();
      await teacher.getByLabel('Nom du PRC', { exact: true }).fill('Circuit navigateur — données fictives');
      await teacher.getByRole('button', { name: 'Créer le brouillon', exact: true }).click();
      await expect(teacher).toHaveURL(/\/prc\/[0-9a-f-]+$/);
      prcPath = new URL(teacher.url()).pathname;
      await teacher.getByRole('textbox', { name: 'Scénario clinique', exact: true }).fill('Cas technique fictif utilisé uniquement pour vérifier le parcours complet dans une base jetable.');
      await teacher.getByRole('button', { name: 'Ajouter un diagnostic', exact: true }).click();
      await teacher.getByRole('textbox', { name: 'Diagnostic 1', exact: true }).fill('Hypothèse navigateur A');
      await teacher.getByRole('button', { name: 'Ajouter un diagnostic', exact: true }).click();
      await teacher.getByRole('textbox', { name: 'Diagnostic 2', exact: true }).fill('Hypothèse navigateur B');
      await teacher.getByText('Importer plusieurs données (facultatif)', { exact: true }).click();
      await teacher.getByRole('textbox', { name: 'Coller les observations, une par ligne', exact: true }).fill(Array.from({ length: 20 }, (_, index) => `Observation clinique fictive ${index + 1} | Examen physique`).join('\n'));
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
      await expect(expert.locator('.expert-diagnostic')).toHaveCount(2);
      for (const table of await expert.locator('.expert-comparison-table').all()) await expect(table.locator('tbody tr')).toHaveCount(20);
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
      await confirmClick(teacher, 'Terminer le temps de réponse');
      await teacher.getByRole('button', { name: 'Afficher la comparaison des impressions cliniques', exact: true }).click();
      await expect(student.getByRole('region', { name: 'Comparaison des impressions cliniques', exact: true })).toBeVisible({ timeout: 12000 });
      for (const label of ['Hypothèse navigateur A', 'Hypothèse navigateur B']) {
        await teacher.getByRole('button', { name: `Afficher le corrigé : ${label}`, exact: true }).click();
        await expect(student.getByRole('article', { name: `Corrigé ${label}`, exact: true })).toBeVisible({ timeout: 12000 });
      }
      await teacher.reload();
      await expect(teacher.getByText('2 / 2 corrigé(s) révélé(s).', { exact: false })).toBeVisible();
      await student.reload();
      await expect(student.getByRole('heading', { name: 'Votre résultat', exact: true })).not.toBeVisible();
      await expect(student.getByRole('region', { name: 'Votre correction guidée', exact: true })).toBeVisible();
      await teacher.getByRole('button', { name: 'Publier les résultats', exact: true }).click();
      await expect(teacher.getByRole('button', { name: 'Résultats publiés', exact: true })).toBeDisabled();
      await expect(teacher.getByRole('region', { name: 'Distribution des notes du groupe', exact: true })).toContainText('1 copie(s) notée(s)');
      await student.reload();
      await expect(student.getByRole('heading', { name: 'Votre résultat', exact: true })).toBeVisible();
      await expect(student.locator('.participant-score')).toContainText('100 %');
      await expect(student.locator('.score-components > div')).toHaveCount(4);
      await expect(student.getByRole('heading', { name: 'Explication du professeur', exact: true })).toBeVisible();
      const own = await (await student.request.get('/api/participant/results')).json();
      expect(own.score).toBe(15);
      expect(own.case.grading.maximum).toBe(15);
      expect(own.response.state).toBe('submitted');
      expect(own.gradeDistribution.gradedCount).toBe(1);
      await expect(student.getByRole('region', { name: 'Distribution des notes du groupe', exact: true })).toBeVisible();
      expect(own).not.toHaveProperty('participants');
      expect(own).not.toHaveProperty('password_hash');
      expect((await student.request.get('/api/teachers')).status()).toBe(401);
    });
    await test.step('asynchronous student sees a private correction immediately while the group stays open', async () => {
      await teacher.goto(prcPath);
      await teacher.getByLabel('Modalité du groupe étudiant', { exact: true }).selectOption('asynchronous');
      await teacher.getByRole('button', { name: 'Lancer avec les étudiants', exact: true }).click();
      await expect(teacher).toHaveURL(/\/activity\/[0-9a-f-]+$/);
      const link = teacher.locator('.access-card a');
      await expect(link).toBeVisible();
      const asyncStudent = await page();
      await asyncStudent.goto((await link.getAttribute('href'))!);
      await answerAndSubmit(asyncStudent, 'Étudiant asynchrone fictif');
      await expect(asyncStudent.getByRole('heading', { name: 'Votre résultat', exact: true })).toBeVisible();
      await expect(asyncStudent.locator('.diagnostic-correction')).toHaveCount(2);
      await expect(asyncStudent.getByRole('region', { name: 'Comparaison des impressions cliniques', exact: true })).toHaveCount(0);
      const result = await (await asyncStudent.request.get('/api/participant/results')).json();
      expect(result.status).toBe('open');
      expect(result.score).toBe(15);
      expect(result.case.grading.maximum).toBe(15);
      expect(result.class).toEqual({});
      expect(result.gradeDistribution).toBeUndefined();
      await confirmClick(teacher, 'Fermer les accès aux réponses');
      await teacher.getByRole('button', { name: 'Publier les résultats', exact: true }).click();
      await expect(asyncStudent.getByRole('region', { name: 'Distribution des notes du groupe', exact: true })).toBeVisible({ timeout: 12000 });
    });
    await test.step('two teachers edit the same shared PRC and the owner can revoke access', async () => {
      const colleagueName = `browser_colleague_${Date.now()}`;
      const colleagueInitial = 'Colleague-browser-initial-2026';
      await admin.getByLabel('Identifiant', { exact: true }).fill(colleagueName);
      await admin.getByLabel('Mot de passe provisoire (12 caractères minimum)', { exact: true }).fill(colleagueInitial);
      await admin.getByRole('button', { name: 'Créer le compte', exact: true }).click();
      await expect(admin.locator('.teacher-list')).toContainText(colleagueName);
      await teacher.goto(prcPath);
      await teacher.getByRole('button', { name: 'Partager', exact: true }).click();
      await teacher.getByLabel('Identifiant PRC du professeur', { exact: true }).fill(colleagueName);
      await teacher.getByRole('button', { name: 'Partager ce PRC', exact: true }).click();
      await expect(teacher.getByRole('button', { name: `Retirer l’accès de ${colleagueName}`, exact: true })).toBeVisible();
      const colleague = await page();
      await login(colleague, colleagueName, colleagueInitial);
      await changeInitialPassword(colleague, colleagueInitial, 'Colleague-browser-updated-2026');
      await colleague.getByRole('link', { name: 'Mes PRC', exact: true }).click();
      await colleague.getByRole('heading', { name: 'Circuit navigateur — données fictives', exact: true }).click();
      await expect(colleague).toHaveURL(prcPath);
      await expect(colleague.getByRole('button', { name: 'Tester comme participant', exact: true })).toHaveCount(0);
      const updatedScenario = 'Contenu clinique complété par le professeur collaborateur.';
      await colleague.getByRole('textbox', { name: 'Scénario clinique', exact: true }).fill(updatedScenario);
      await colleague.getByRole('button', { name: 'Enregistrer', exact: true }).click();
      await expect(colleague.getByRole('status').filter({ hasText: 'Enregistré en base' })).toBeVisible();
      await teacher.reload();
      await expect(teacher.getByRole('textbox', { name: 'Scénario clinique', exact: true })).toHaveValue(updatedScenario);
      const ownerDocument = await (await teacher.request.get(`/api${prcPath.replace('/prc/', '/prcs/')}`)).json();
      const colleagueDocument = await (await colleague.request.get(`/api${prcPath.replace('/prc/', '/prcs/')}`)).json();
      expect(ownerDocument.id).toBe(colleagueDocument.id);
      expect(ownerDocument.version).toBe(colleagueDocument.version);
      await teacher.getByRole('button', { name: 'Partager', exact: true }).click();
      await confirmClick(teacher, `Retirer l’accès de ${colleagueName}`);
      await expect(teacher.getByText('Accès retiré.', { exact: true })).toBeVisible();
      expect((await colleague.request.get(`/api${prcPath.replace('/prc/', '/prcs/')}`)).status()).toBe(404);
    });
    await test.step('Toux is ready with ten fictitious experts and students can try both teacher-controlled modes', async () => {
      await teacher.goto('/prcs');
      await teacher.getByRole('button', { name: 'Ouvrir ma démonstration Toux', exact: true }).click();
      const demo = teacher.getByRole('region', { name: 'Essayer Toux avec des étudiants', exact: true });
      await expect(demo).toBeVisible({ timeout: 30000 });
      const casePath = new URL(teacher.url()).pathname.replace('/prc/', '/prcs/');
      const demoDocument = await (await teacher.request.get(`/api${casePath}`)).json();
      const panel = demoDocument.launches.find((launch: any) => launch.role === 'panel');
      const panelResults = await (await teacher.request.get(`/api/launches/${panel.id}/panel-results`)).json();
      expect(panelResults.totalSubmissions).toBe(10);
      expect(demoDocument.launches.some((launch: any) => launch.deliveryMode === 'asynchronous')).toBe(false);
      await demo.getByRole('button', { name: 'Ouvrir la séance synchrone', exact: true }).click();
      const syncCard = demo.locator('.demo-session-card').filter({ has: teacher.getByRole('heading', { name: 'En séance synchrone', exact: true }) });
      const syncJoin = syncCard.getByRole('link', { name: 'Ouvrir le questionnaire étudiant', exact: true });
      await expect(syncJoin).toBeVisible();
      await demo.getByRole('button', { name: 'Autoriser la séance asynchrone', exact: true }).click();
      const asyncCard = demo.locator('.demo-session-card').filter({ has: teacher.getByRole('heading', { name: 'En autonomie asynchrone', exact: true }) });
      const asyncJoin = asyncCard.getByRole('link', { name: 'Ouvrir le questionnaire étudiant', exact: true });
      await expect(asyncJoin).toBeVisible();
      expect(await syncJoin.getAttribute('href')).not.toBe(await asyncJoin.getAttribute('href'));
      const syncStudent = await page(), asyncStudent = await page();
      for (const [participant, joinLink, name] of [[syncStudent, syncJoin, 'Toux synchrone'], [asyncStudent, asyncJoin, 'Toux asynchrone']] as const) {
        await participant.goto((await joinLink.getAttribute('href'))!);
        await participant.getByLabel('Votre nom ou pseudonyme', { exact: true }).fill(name);
        await participant.getByRole('button', { name: 'Rejoindre l’activité', exact: true }).click();
        await expect(participant).toHaveURL(/\/participant$/);
        await participant.getByLabel('Impression clinique', { exact: true }).selectOption(demoDocument.diagnostics[0].id);
        await participant.getByLabel('Impression clinique alternative', { exact: true }).selectOption(demoDocument.diagnostics[1].id);
        for (let index = 0; index < 5; index++) {
          await participant.getByRole('button', { name: /^Impression clinique : En faveur —/ }).nth(index).click();
          await participant.getByRole('button', { name: /^Impression clinique alternative : En défaveur —/ }).nth(index).click();
        }
        await expect(participant.getByRole('combobox', { name: /^Points impression clinique/ })).toHaveCount(0);
        await confirmClick(participant, 'Vérifier et transmettre');
        await expect(participant).toHaveURL(/\/participant\/results$/);
      }
      await expect(syncStudent.getByRole('heading', { name: 'Votre résultat', exact: true })).toHaveCount(0);
      await expect(asyncStudent.getByRole('heading', { name: 'Votre résultat', exact: true })).toBeVisible();
      await expect(asyncStudent.locator('.diagnostic-correction')).toHaveCount(2);
      expect((await asyncStudent.request.post(`/api${casePath}/demo-session`, { headers: { origin: baseURL }, data: { deliveryMode: 'asynchronous' } })).status()).toBe(401);
      const syncManage = (await syncCard.getByRole('link', { name: 'Gérer la séance et afficher le QR code', exact: true }).getAttribute('href'))!;
      await teacher.goto(syncManage);
      await confirmClick(teacher, 'Terminer le temps de réponse');
      await teacher.getByRole('button', { name: 'Afficher la comparaison des impressions cliniques', exact: true }).click();
      await expect(syncStudent.getByRole('region', { name: 'Comparaison des impressions cliniques', exact: true })).toBeVisible({ timeout: 12000 });
      await teacher.getByRole('button', { name: `Afficher le corrigé : ${demoDocument.diagnostics[0].label}`, exact: true }).click();
      await expect(syncStudent.getByRole('article', { name: `Corrigé ${demoDocument.diagnostics[0].label}`, exact: true })).toBeVisible({ timeout: 12000 });
      await teacher.goto(`/activity/${panel.id}`);
      const rubric=teacher.getByRole('region',{name:'Barème personnalisable du professeur',exact:true});
      await expect(rubric).toContainText('Note maximale : 15 points');
      await rubric.locator('.rubric-diagnostic').first().locator('summary').click();
      await rubric.getByRole('spinbutton',{name:`Impression clinique — ${demoDocument.diagnostics[0].label}`,exact:true}).fill('4');
      await rubric.getByRole('button',{name:'Enregistrer le barème',exact:true}).click();
      await expect(rubric.getByRole('status')).toContainText('version 2');
      await teacher.goto(casePath.replace('/prcs/','/prc/'));
      await demo.getByRole('button',{name:'Autoriser la séance asynchrone',exact:true}).click();
      const refreshed=await(await teacher.request.get(`/api${casePath}`)).json();
      expect(refreshed.launches.some((launch:any)=>launch.grading?.maximum===16&&launch.grading?.rubricRevision===2)).toBe(true);
      expect((await(await asyncStudent.request.get('/api/participant/results')).json()).case.grading.maximum).toBe(15);
    });
  } finally { await Promise.all(contexts.map(context => context.close())); }
});
