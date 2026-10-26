import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from 'node:fs/promises';
import { testServices } from "./test-support.js";

test("complete private PRC workflow on disposable PostgreSQL", { skip: !process.env.PRC_TEST_DATABASE_URL }, async t => {
  const { pool, Session, newUser, completeCase, answer, save, createReference } = await testServices();
  t.after(() => pool.end());
  const admin = await newUser("admin");
  const owner = await newUser();
  const other = await newUser();
  const anonymous = new Session();
  let prc: any;
  let panel: any;
  let expert: InstanceType<typeof Session>;
  let student: InstanceType<typeof Session>;
  let draft: InstanceType<typeof Session>;
  let students: any;
  let initialReference: any;
  let studentJoinKey: string;
  let studentParticipantId: string;

  await t.test("closed administration, initial password, ownership and private SQL permissions", async () => {
    await anonymous.call("/teachers", "POST", {}, 401);
    await owner.session.call("/teachers", "GET", undefined, 403);
    const password = "test-initial-password-only";
    const teacher = await admin.session.call("/teachers", "POST", { username: "new-test-teacher", password }, 201);
    const session = new Session();
    const login = await session.call("/auth/login", "POST", { username: teacher.username, password });
    assert.equal(login.user.mustChangePassword, true);
    await session.call("/prcs", "POST", completeCase(), 403);
    await session.call("/auth/change-password", "POST", { currentPassword: password, newPassword: "new-test-password-only" });
    assert.equal((await session.call("/auth/me")).user.mustChangePassword, false);
    const permissions = await pool.query("SELECT has_schema_privilege('anon','prc_private','USAGE') AS anon, has_schema_privilege('authenticated','prc_private','USAGE') AS authenticated");
    assert.equal(permissions.rows[0].anon, false);
    assert.equal(permissions.rows[0].authenticated, false);
    const publicTables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='prc_private' AND (has_table_privilege('anon',quote_ident(table_schema)||'.'||quote_ident(table_name),'SELECT') OR has_table_privilege('authenticated',quote_ident(table_schema)||'.'||quote_ident(table_name),'SELECT'))");
    assert.equal(publicTables.rowCount, 0);
    const teachers = await admin.session.call("/teachers");
    assert.equal(JSON.stringify(teachers).includes("password_hash"), false);
    prc = await owner.session.call("/prcs", "POST", completeCase(), 201);
    await other.session.call(`/prcs/${prc.id}`, "GET", undefined, 404);
    await anonymous.call(`/prcs/${prc.id}`, "GET", undefined, 401);
    const response = await pool.query("SELECT password_hash FROM prc_private.users WHERE id=$1", [owner.id]);
    assert.match(response.rows[0].password_hash, /^scrypt\$/);
    assert.notEqual(response.rows[0].password_hash, owner.password);
  });

  await t.test('shared cases keep one identity, protect concurrent edits and revoke all delegated session rights', async () => {
    const colleague = await newUser();
    const stranger = await newUser();
    const input = completeCase();
    const item = await owner.session.call('/prcs','POST',input,201);
    const oldPanel = await owner.session.call(`/prcs/${item.id}/launches`,'POST',{role:'panel'},201);
    const count = (await pool.query('SELECT count(*)::int AS n FROM prc_private.prcs')).rows[0].n;
    await colleague.session.call(`/prcs/${item.id}`,'GET',undefined,404);
    await stranger.session.call(`/prcs/${item.id}/collaborators`,'POST',{username:colleague.username},404);
    await owner.session.call(`/prcs/${item.id}/collaborators`,'POST',{username:'unknown-teacher'},404);
    await owner.session.call(`/prcs/${item.id}/collaborators`,'POST',{username:owner.username},400);
    await owner.session.call(`/prcs/${item.id}/collaborators`,'POST',{username:colleague.username,manageSessions:'yes'},400);
    await owner.session.call(`/prcs/${item.id}/collaborators`,'POST',{username:colleague.username.toUpperCase()});
    await owner.session.call(`/prcs/${item.id}/collaborators`,'POST',{username:colleague.username});
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM prc_private.prcs')).rows[0].n,count);
    const upgrade = await readFile(new URL('../../../docs/UPGRADE_SHARED_PRCS.sql',import.meta.url),'utf8');
    await pool.query(upgrade); await pool.query(upgrade);
    const members = await colleague.session.call(`/prcs/${item.id}/collaborators`);
    assert.equal(members.collaborators.length,1);
    assert.equal(members.canShare,false);
    assert.equal(JSON.stringify(members).includes('password'),false);
    const document = await colleague.session.call(`/prcs/${item.id}`);
    assert.equal(document.id,item.id);
    assert.equal(document.permissions.manageSessions,false);
    assert.equal(document.permissions.share,false);
    assert.deepEqual(document.launches,[]);
    assert.equal(document.workflow.panelLaunchId,null);
    assert.equal((await colleague.session.call('/prcs')).some((row:any)=>row.id===item.id),true);
    for (const suffix of ['', '/results','/projection','/panel-results']) await colleague.session.call(`/launches/${oldPanel.id}${suffix}`,'GET',undefined,404);
    await colleague.session.call(`/prcs/${item.id}/launches`,'POST',{role:'panel'},404);
    await colleague.session.call(`/prcs/${item.id}/collaborators`,'POST',{username:stranger.username},403);
    await colleague.session.call(`/prcs/${item.id}`,'PATCH',{archived:true},404);
    await colleague.session.call(`/prcs/${item.id}`,'PUT',{...input,scenario:'Collaborative edit'},409);
    const edited = await colleague.session.call(`/prcs/${item.id}`,'PUT',{...input,scenario:'Collaborative edit',version:1});
    assert.equal(edited.version,2);
    assert.equal((await owner.session.call(`/prcs/${item.id}`)).scenario,'Collaborative edit');
    assert.equal((await pool.query('SELECT case_snapshot FROM prc_private.launches WHERE id=$1',[oldPanel.id])).rows[0].case_snapshot.scenario,input.scenario);
    const attempts = await Promise.all([
      owner.session.call(`/prcs/${item.id}`,'PUT',{...input,scenario:'Collaborative edit',name:'Owner proposal',version:2},[200,409]),
      colleague.session.call(`/prcs/${item.id}`,'PUT',{...input,scenario:'Collaborative edit',name:'Colleague proposal',version:2},[200,409]),
    ]);
    assert.equal(attempts.filter(row=>row.id===item.id).length,1);
    assert.equal((await owner.session.call(`/prcs/${item.id}`)).version,3);
    await owner.session.call(`/prcs/${item.id}/collaborators`,'POST',{username:colleague.username,manageSessions:true});
    const current = await colleague.session.call(`/prcs/${item.id}`);
    assert.equal(current.permissions.manageSessions,true);
    const panel = await colleague.session.call(`/prcs/${item.id}/launches`,'POST',{role:'panel'},201);
    assert.equal((await pool.query('SELECT owner_id FROM prc_private.launches WHERE id=$1',[panel.id])).rows[0].owner_id,owner.id);
    const invitation = await colleague.session.call(`/launches/${panel.id}/invitations`,'POST',{name:'Shared expert'},201);
    const expert = new Session();
    await expert.call(`/launches/${panel.id}/join`,'POST',{pseudonym:'Shared expert',invitationToken:new URL(invitation.url).searchParams.get('invite')});
    await save(expert,answer(current)); await expert.call('/participant/submit','POST',{});
    await colleague.session.call(`/launches/${panel.id}/close`,'POST',{});
    await colleague.session.call(`/launches/${panel.id}/panel-results`);
    await colleague.session.call(`/launches/${panel.id}/reference/generate`,'POST',{minimumPanelSize:1});
    await colleague.session.call(`/launches/${panel.id}/reference/validate`,'POST',{});
    const group = await colleague.session.call(`/prcs/${item.id}/launches`,'POST',{role:'students',deliveryMode:'synchronous'},201);
    assert.equal((await colleague.session.call('/workspace/summary')).activeLaunches.some((row:any)=>row.id===group.id),true);
    await owner.session.call(`/prcs/${item.id}/collaborators`,'POST',{username:colleague.username,manageSessions:false});
    for (const suffix of ['', '/results','/projection']) await colleague.session.call(`/launches/${group.id}${suffix}`,'GET',undefined,404);
    for (const suffix of ['/close','/reveal','/publish','/discussion']) await colleague.session.call(`/launches/${group.id}${suffix}`,'POST',{action:'comparison'},404);
    assert.equal((await colleague.session.call('/workspace/summary')).activeLaunches.some((row:any)=>row.id===group.id),false);
    await owner.session.call(`/prcs/${item.id}/collaborators/${colleague.id}`,'DELETE');
    await colleague.session.call(`/prcs/${item.id}`,'GET',undefined,404);
    await colleague.session.call(`/prcs/${item.id}`,'PUT',{...input,version:3},404);
    assert.equal((await colleague.session.call('/prcs')).some((row:any)=>row.id===item.id),false);
    assert.equal((await owner.session.call(`/launches/${group.id}`)).id,group.id);
    assert.equal((await pool.query("SELECT has_table_privilege('anon','prc_private.prc_collaborators','SELECT') AS readable, has_function_privilege('anon','prc_private.can_access_prc(uuid,uuid,boolean)','EXECUTE') AS executable")).rows[0].readable,false);
    assert.equal((await pool.query("SELECT has_function_privilege('anon','prc_private.can_access_prc(uuid,uuid,boolean)','EXECUTE') AS executable")).rows[0].executable,false);
  });

  await t.test("individual panel invitations allow account-free participation without leaking references", async () => {
    await owner.session.call(`/prcs/${prc.id}/launches`, "POST", { role: "students" }, 409);
    panel = await owner.session.call(`/prcs/${prc.id}/launches`, "POST", { role: "panel" }, 201);
    await anonymous.call(`/launches/${panel.id}/join`, "POST", { pseudonym: "Uninvited", role: "panel" }, [400, 403]);
    const invitation = await owner.session.call(`/launches/${panel.id}/invitations`, "POST", { name: "Expert test" }, 201);
    expert = new Session();
    const token = new URL(invitation.url).searchParams.get("invite");
    const joined = await expert.call(`/launches/${panel.id}/join`, "POST", { pseudonym: "Expert test", invitationToken: token });
    const resumedExpert = await new Session().call(`/launches/${panel.id}/join`, "POST", { pseudonym: "Replay", invitationToken: token });
    assert.equal(resumedExpert.participantId, joined.participantId);
    assert.equal(joined.joinInfo.role, "panel");
    assert.equal(JSON.stringify(joined).includes('"distributions"'), false);
    assert.equal(JSON.stringify(joined).includes('"score"'), false);
    await expert.call("/teachers", "GET", undefined, 401);
    await expert.call(`/launches/${panel.id}/panel-results`, "GET", undefined, 409);
    await owner.session.call(`/launches/${panel.id}/reference/generate`, "POST", { minimumPanelSize: 1 }, 409);
    const valid = answer(prc);
    await save(expert, { ...valid, alternativeDiagnosticId: valid.mainDiagnosticId }).then(() => assert.fail("Duplicate diagnoses accepted"), error => assert.match(error.message, /HTTP 400/));
    await save(expert, { ...valid, mainChoices: prc.observations.slice(0, 6).map((o: any) => ({ observationId: o.id, sign: "+" })) }).then(() => assert.fail("Six choices accepted"), error => assert.match(error.message, /HTTP 400/));
    await save(expert, { ...valid, mainChoices: [{ observationId: prc.observations[0].id }] }).then(() => assert.fail("Unsigned choice accepted"), error => assert.match(error.message, /HTTP 400/));
    await save(expert, valid);
    await expert.call("/participant/submit", "POST", {});
    await expert.call("/participant/submit", "POST", {});
    await expert.call("/participant/response", "PUT", valid, 409);
  });

  await t.test("shared panel code admits distinct experts, retries safely and stops admission on close", async () => {
    const launch = await owner.session.call(`/prcs/${prc.id}/launches`, "POST", { role: "panel" }, 201);
    const info = await anonymous.call(`/join/${launch.code.toLowerCase()}`);
    assert.equal(info.launchId, launch.id);
    await new Session().call(`/launches/${launch.id}/join`, "POST", { pseudonym: "Expert", code: "WRONG" }, 403);
    await new Session().call(`/launches/${launch.id}/join`, "POST", { pseudonym: "Expert", code: launch.code, invitationToken: "invalid-invitation" }, 403);
    const expertSession = new Session();
    const input = { pseudonym: "Même nom", code: launch.code.toLowerCase(), joinKey: randomUUID(), role: "teacher" };
    const [joined, retry] = await Promise.all([
      expertSession.call(`/launches/${launch.id}/join`, "POST", input),
      new Session().call(`/launches/${launch.id}/join`, "POST", input),
    ]);
    assert.equal(joined.participantId, retry.participantId);
    assert.equal(joined.joinInfo.role, "panel");
    const second = await new Session().call(`/launches/${launch.id}/join`, "POST", { pseudonym: input.pseudonym, code: launch.code, joinKey: randomUUID() });
    assert.notEqual(second.participantId, joined.participantId);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM prc_private.participants WHERE launch_id=$1", [launch.id])).rows[0].n, 2);
    await expertSession.call("/teachers", "GET", undefined, 401);
    await expertSession.call(`/launches/${launch.id}/close`, "POST", {}, 401);
    await expertSession.call(`/launches/${launch.id}/panel-results`, "GET", undefined, 409);
    assert.deepEqual((await expertSession.call("/participant/results")).panel, {});
    await save(expertSession, answer(prc));
    await expertSession.call("/participant/submit", "POST", {});
    await owner.session.call(`/launches/${launch.id}/close`, "POST", {});
    await new Session().call(`/launches/${launch.id}/join`, "POST", { pseudonym: "Late", code: launch.code, joinKey: randomUUID() }, 409);
    const resumed = await new Session().call(`/launches/${launch.id}/join`, "POST", input);
    assert.equal(resumed.participantId, joined.participantId);
    assert.equal(resumed.response.state, "submitted");
  });

  await t.test("expert points survive revision changes and submitted experts see live anonymous totals only", async () => {
    const launch = await owner.session.call(`/prcs/${prc.id}/launches`, "POST", { role: "panel" }, 201);
    const first = new Session(), second = new Session();
    await first.call(`/launches/${launch.id}/join`, "POST", { pseudonym: "Private expert A", code: launch.code });
    await second.call(`/launches/${launch.id}/join`, "POST", { pseudonym: "Private expert B", code: launch.code });
    const initial = answer(prc);
    await first.call("/participant/response", "PUT", { ...initial, revision: 0 });
    await first.call("/participant/submit", "POST", {}, 400);
    for (const points of [0, 4, 1.5, "3"]) {
      await first.call("/participant/response", "PUT", { ...initial, mainChoices: [{ ...initial.mainChoices[0], points }], revision: 1 }, 400);
    }
    const weighted = { ...initial,
      mainChoices: initial.mainChoices.map((choice: any) => ({ ...choice, points: 2 })),
      alternativeChoices: initial.alternativeChoices.map((choice: any) => ({ ...choice, points: 1 })),
    };
    await save(first, weighted);
    const revision = (await first.call("/participant/response")).response.revision;
    weighted.mainChoices[0].points = 3;
    await save(first, weighted);
    const saved = (await first.call("/participant/response")).response;
    assert.equal(saved.revision, revision + 1);
    assert.equal(saved.mainChoices[0].points, 3);
    await first.call("/participant/response", "PUT", { ...weighted, mainChoices: weighted.mainChoices.map((choice: any) => ({ ...choice, points: 1 })), revision }, 409);
    assert.equal((await second.call("/participant/results")).expertPanel, undefined);
    await first.call("/participant/submit", "POST", { expectedRevision: saved.revision });
    const one = await first.call("/participant/results");
    assert.equal(one.expertPanel.totalSubmissions, 1);
    assert.deepEqual(one.panel, {});
    assert.equal(one.score, null);
    const other = { ...weighted, mainChoices: weighted.mainChoices.map((choice: any, i: number) => ({ ...choice, sign: i === 0 ? "-" : "+", points: 2 })) };
    await save(second, other);
    assert.equal((await second.call("/participant/results")).expertPanel, undefined);
    await second.call("/participant/submit", "POST", {});
    const two = await first.call("/participant/results");
    assert.equal(two.expertPanel.totalSubmissions, 2);
    assert.equal(JSON.stringify(two.expertPanel).includes("Private expert"), false);
    assert.equal(JSON.stringify(two.expertPanel).includes("participantId"), false);
    const distribution = two.expertPanel.distributions.find((row: any) => row.role === "main" && row.diagnosticId === weighted.mainDiagnosticId);
    const observation = distribution.observations.find((row: any) => row.observationId === weighted.mainChoices[0].observationId);
    assert.equal(observation.positive, 1);
    assert.equal(observation.negative, 1);
    assert.equal(observation.positivePoints, 3);
    assert.equal(observation.negativePoints, 2);
    assert.equal(distribution.ceiling, 19);
    await owner.session.call(`/launches/${launch.id}/close`, "POST", {});
    const closed = await first.call("/participant/results");
    assert.equal(closed.expertPanel.totalSubmissions, 2);
    assert.deepEqual(closed.expertPanel.distributions, two.expertPanel.distributions);
    const reference = await owner.session.call(`/launches/${launch.id}/reference/generate`, "POST", { minimumPanelSize: 2 });
    assert.equal(reference.scoring.version, "V2");
    await owner.session.call(`/launches/${launch.id}/reference/validate`, "POST", {});
    const studentLaunch = await owner.session.call(`/prcs/${prc.id}/launches`, "POST", { role: "students" }, 201);
    const weightedStudent = new Session();
    await weightedStudent.call(`/launches/${studentLaunch.id}/join`, "POST", { pseudonym: "Weighted grade" });
    await save(weightedStudent, answer(prc, false, 1));
    await weightedStudent.call("/participant/submit", "POST", {});
    await owner.session.call(`/launches/${studentLaunch.id}/close`, "POST", {});
    await owner.session.call(`/launches/${studentLaunch.id}/publish`, "POST", {});
    const graded = await weightedStudent.call("/participant/results");
    assert.equal(graded.components.main.raw, 3);
    assert.equal(graded.components.main.ceiling, 19);
    assert.equal(graded.components.alternative.raw, 2);
    assert.equal(graded.components.alternative.ceiling, 10);
    assert.equal(graded.score, Math.round((4 + 8 * 3 / 19 + 8 * 2 / 10) * 100) / 100);
  });

  await t.test("reference retains minorities, excludes drafts and becomes immutable", async () => {
    for (let i = 0; i < 2; i++) {
      const invitation = await owner.session.call(`/launches/${panel.id}/invitations`, "POST", { name: `Other expert ${i}` }, 201);
      const participant = new Session();
      await participant.call(`/launches/${panel.id}/join`, "POST", { pseudonym: `Other expert ${i}`, invitationToken: new URL(invitation.url).searchParams.get("invite") });
      await save(participant, answer(prc, true));
      if (i === 0) await participant.call("/participant/submit", "POST", {});
    }
    await owner.session.call(`/launches/${panel.id}/close`, "POST", {});
    await owner.session.call(`/launches/${panel.id}/reference/generate`, "POST", { minimumPanelSize: 3 }, 409);
    const reference = await owner.session.call(`/launches/${panel.id}/reference/generate`, "POST", { minimumPanelSize: 2 });
    assert.equal(reference.panelSize, 2);
    const minority = reference.distributions.find((row: any) => row.role === "main" && row.diagnosticId === prc.diagnostics[2].id);
    assert.equal(minority.expertCount, 1);
    assert.equal(minority.observations[0].negative, 1);
    await owner.session.call(`/launches/${panel.id}/reference/validate`, "POST", { explanation: "Reference test explanation" });
    initialReference = (await pool.query("SELECT snapshot FROM prc_private.references WHERE launch_id=$1", [panel.id])).rows[0].snapshot;
    await owner.session.call(`/launches/${panel.id}/reference/generate`, "POST", { minimumPanelSize: 1 }, 409);
    await expert.call(`/launches/${panel.id}/panel-results`, "GET", undefined, 403);
    await owner.session.call(`/launches/${panel.id}/reveal`, "POST", { reference: true });
    assert.equal((await expert.call(`/launches/${panel.id}/panel-results`)).totalSubmissions, 2);
    const expertResults = await expert.call("/participant/results");
    assert.equal(expertResults.score, null);
  });

  await t.test("guided synchronous discussion reveals only the chosen stage, compares counts and gives private partial scores", async () => {
    const item = await owner.session.call('/prcs', 'POST', { ...completeCase(), diagnostics: ['A', 'B', 'C', 'D', 'E'] }, 201);
    await createReference(owner.session, item, 2);
    const launch = await owner.session.call(`/prcs/${item.id}/launches`, 'POST', { role: 'students', deliveryMode: 'synchronous' }, 201);
    assert.equal(launch.guidedReview, true);
    const a = new Session(), b = new Session(), unsent = new Session();
    for (const session of [a, b, unsent]) await session.call(`/launches/${launch.id}/join`, 'POST', { pseudonym: 'Private student' });
    const first = { ...answer(item), alternativeDiagnosticId: item.diagnostics[3].id };
    await save(a, first);
    await a.call('/participant/submit', 'POST', {});
    const second = { mainDiagnosticId: item.diagnostics[1].id, alternativeDiagnosticId: item.diagnostics[0].id,
      mainChoices: answer(item).alternativeChoices, alternativeChoices: answer(item).mainChoices };
    await save(b, second);
    await b.call('/participant/submit', 'POST', {});
    assert.equal((await a.call('/participant/results')).studentReview, undefined);
    await owner.session.call(`/launches/${launch.id}/discussion`, 'POST', { action: 'comparison' }, 409);
    await owner.session.call(`/launches/${launch.id}/close`, 'POST', {});
    await other.session.call(`/launches/${launch.id}/discussion`, 'POST', { action: 'comparison' }, 404);
    await a.call(`/launches/${launch.id}/discussion`, 'POST', { action: 'comparison' }, 401);
    const hidden = await a.call('/participant/results');
    assert.equal(hidden.score, null);
    assert.equal(hidden.studentReview.comparisonVisible, false);
    assert.deepEqual(hidden.studentReview.corrections, []);
    await owner.session.call(`/launches/${launch.id}/discussion`, 'POST', { action: 'diagnostic', diagnosticId: item.diagnostics[1].id }, 409);
    await owner.session.call(`/launches/${launch.id}/discussion`, 'POST', { action: 'comparison' });
    await owner.session.call(`/launches/${launch.id}/discussion`, 'POST', { action: 'diagnostic', diagnosticId: 'invalid' }, 400);
    const comparison = (await a.call('/participant/results')).studentReview;
    assert.equal(comparison.comparison.length, 5);
    assert.equal(comparison.comparison[0].diagnosticId, item.diagnostics[1].id);
    assert.equal(comparison.comparison[0].panelPercent, 100);
    assert.equal(comparison.comparison[0].studentPercent, 50);
    assert.equal(comparison.comparison[0].studentTotal, 2);
    assert.deepEqual(comparison.corrections, []);
    await owner.session.call(`/launches/${launch.id}/discussion`, 'POST', { action: 'diagnostic', diagnosticId: item.diagnostics[1].id });
    const notChosen = await a.call('/participant/results');
    assert.equal(notChosen.studentReview.corrections.length, 1);
    assert.equal(notChosen.studentReview.corrections[0].selectedRole, null);
    assert.equal(notChosen.studentReview.corrections[0].score, null);
    const chosen = (await b.call('/participant/results')).studentReview.corrections[0];
    assert.equal(chosen.selectedRole, 'main');
    assert.equal(chosen.score, 10); // Experts chose B as alternative: credit is diagnostic-specific.
    assert.equal(chosen.observations.length, 20);
    const projection = await owner.session.call(`/launches/${launch.id}/projection`);
    assert.equal(projection.discussion.corrections.length, 1);
    assert.equal(projection.discussion.corrections[0].score, undefined);
    assert.equal(projection.discussion.corrections[0].observations[0].studentSign, undefined);
    assert.equal(JSON.stringify(projection).includes('Private student'), false);
    await Promise.all([0, 3].map(i => owner.session.call(`/launches/${launch.id}/discussion`, 'POST', { action: 'diagnostic', diagnosticId: item.diagnostics[i].id })));
    const stages = (await owner.session.call(`/launches/${launch.id}`)).reveals.correctedDiagnosticIds;
    assert.equal(new Set(stages).size, 3);
    const partial = await a.call('/participant/results');
    assert.equal(partial.score, null);
    const zero = partial.studentReview.corrections.find((row: any) => row.diagnosticId === item.diagnostics[3].id);
    assert.equal(zero.diagnosisScore, 0);
    assert.equal(zero.justificationScore, 0);
    assert.equal(zero.score, 0);
    assert.deepEqual(partial.components, {});
    await owner.session.call(`/launches/${launch.id}/publish`, 'POST', {});
    const published = await a.call('/participant/results');
    assert.equal(published.score, 10);
    assert.equal(published.studentReview.corrections.length, 5);
    assert.equal((await unsent.call('/participant/results')).score, null);
  });

  await t.test("asynchronous students get only their own two corrections immediately and drafts stay ungraded", async () => {
    const item = await owner.session.call('/prcs', 'POST', { ...completeCase(), diagnostics: ['A', 'B', 'C', 'D', 'E'] }, 201);
    await createReference(owner.session, item, 2);
    await owner.session.call(`/prcs/${item.id}/launches`, 'POST', { role: 'students', deliveryMode: 'invalid' }, 400);
    const launch = await owner.session.call(`/prcs/${item.id}/launches`, 'POST', { role: 'students', deliveryMode: 'asynchronous' }, 201);
    const a = new Session(), unsent = new Session();
    await a.call(`/launches/${launch.id}/join`, 'POST', { pseudonym: 'Async student' });
    await unsent.call(`/launches/${launch.id}/join`, 'POST', { pseudonym: 'Other student' });
    assert.equal((await a.call('/participant/response')).joinInfo.requiredChoices, 5);
    await save(a, answer(item, false, 4));
    await a.call('/participant/submit', 'POST', {}, 400);
    assert.equal((await a.call('/participant/results')).studentReview, undefined);
    await save(a, { ...answer(item), alternativeDiagnosticId: item.diagnostics[4].id });
    await a.call('/participant/submit', 'POST', {});
    const result = await a.call('/participant/results');
    assert.equal(result.status, 'open');
    assert.equal(result.published, true);
    assert.equal(result.score, 10);
    assert.equal((await a.call('/participant/state')).published, true);
    assert.equal(result.studentReview.corrections.length, 2);
    assert.deepEqual(result.studentReview.comparison, []);
    assert.deepEqual(result.class, {});
    assert.deepEqual(result.panel, {});
    assert.equal(JSON.stringify(result).includes('Other student'), false);
    await owner.session.call(`/launches/${launch.id}/discussion`, 'POST', { action: 'comparison' }, 400);
    await owner.session.call(`/launches/${launch.id}/close`, 'POST', {});
    const draftResult = await unsent.call('/participant/results');
    assert.equal(draftResult.score, null);
    assert.equal(draftResult.studentReview, undefined);
    assert.equal((await a.call('/participant/results')).score, 10);
  });

  await t.test("drafts survive refresh and stale saves cannot overwrite a later revision", async () => {
    students = await owner.session.call(`/prcs/${prc.id}/launches`, "POST", { role: "students" }, 201);
    student = new Session();
    draft = new Session();
    studentJoinKey = randomUUID();
    const joinInput = { pseudonym: "Student submitted", role: "panel", joinKey: studentJoinKey };
    const joins = await Promise.all([
      student.call(`/launches/${students.id}/join`, "POST", joinInput),
      new Session().call(`/launches/${students.id}/join`, "POST", joinInput),
    ]);
    assert.equal(joins[0].participantId, joins[1].participantId);
    studentParticipantId = joins[0].participantId;
    const pseudonymOnly = await new Session().call(`/launches/${students.id}/join`, "POST", { pseudonym: "Student submitted" });
    assert.notEqual(pseudonymOnly.participantId, studentParticipantId);
    await draft.call(`/launches/${students.id}/join`, "POST", { pseudonym: "Student draft" });
    assert.equal((await student.call("/participant/response")).joinInfo.role, "students");
    const first = await student.call("/participant/response", "PUT", { ...answer(prc, false, 1), revision: 0 });
    assert.ok(first.response.revision > 0);
    const resumed = await student.call("/participant/response");
    assert.deepEqual(resumed.response.mainChoices, first.response.mainChoices);
    const lostAck = await student.call("/participant/response", "PUT", { ...answer(prc, false, 1), revision: 0 });
    assert.equal(lostAck.response.revision, first.response.revision);
    await student.call("/participant/response", "PUT", { ...answer(prc, false, 2), revision: 0 }, 409);
    const revised = await student.call("/participant/response", "PUT", { ...answer(prc, true, 1), revision: first.response.revision });
    assert.equal(revised.response.mainDiagnosticId, prc.diagnostics[2].id);
    assert.deepEqual(revised.response.mainChoices, answer(prc, true, 1).mainChoices);
    const state = await student.call("/participant/state");
    assert.equal(JSON.stringify(state).includes("case_snapshot"), false);
    const privateResults = await student.call("/participant/results");
    assert.equal(privateResults.score, null);
    assert.deepEqual(privateResults.panel, {});
    assert.equal(privateResults.expertPanel, undefined);
    await student.call("/participant/response", "PUT", { ...answer(prc), mainChoices: [{ ...answer(prc).mainChoices[0], points: 3 }], revision: revised.response.revision }, 400);
    await student.call(`/launches/${students.id}/results`, "GET", undefined, [401, 403, 404]);
    await student.call("/participant/submit", "POST", {});
    await student.call("/participant/submit", "POST", {});
    const stored = await pool.query("SELECT count(*)::int AS n FROM prc_private.responses WHERE launch_id=$1 AND state='submitted'", [students.id]);
    assert.equal(stored.rows[0].n, 1);
    assert.deepEqual((await pool.query("SELECT snapshot FROM prc_private.references WHERE launch_id=$1", [panel.id])).rows[0].snapshot, initialReference);
  });

  await t.test("revelation precedes scores; projection and student results contain no peer identities", async () => {
    await owner.session.call(`/launches/${students.id}/close`, "POST", {});
    await owner.session.call(`/launches/${students.id}/reveal`, "POST", { mainDiagnostic: true });
    const revealed = await student.call("/participant/results");
    assert.equal(revealed.published, false);
    assert.equal(revealed.score, null);
    assert.ok(revealed.panel.diagnostics?.length > 0);
    const projection = await owner.session.call(`/launches/${students.id}/projection`);
    assert.equal(JSON.stringify(projection).includes("Student submitted"), false);
    assert.equal(JSON.stringify(projection).includes("Student draft"), false);
    assert.equal(JSON.stringify(projection).includes("score_components"), false);
    await owner.session.call(`/launches/${students.id}/reveal`, "POST", { mainDiagnostic: true, mainArguments: true, alternativeDiagnostic: true, alternativeArguments: true, reference: true });
    await owner.session.call(`/launches/${students.id}/publish`, "POST", {});
    const resumedAfterClose = await new Session().call(`/launches/${students.id}/join`, "POST", { pseudonym: "Student submitted", joinKey: studentJoinKey });
    assert.equal(resumedAfterClose.participantId, studentParticipantId);
    const result = await student.call("/participant/results");
    assert.equal(result.published, true);
    assert.ok(result.score > 0 && result.score <= 20);
    assert.equal(result.components.percentage, result.score * 5);
    assert.ok(result.panel.distributions.length > 0);
    assert.equal(JSON.stringify(result).includes("Student draft"), false);
    const notSubmitted = await draft.call("/participant/results");
    assert.equal(notSubmitted.response.state, "draft");
    assert.equal(notSubmitted.score, null);
    assert.deepEqual(notSubmitted.components, {});
  });

  await t.test("close racing with submit commits at most one definitive response", async () => {
    const launch = await owner.session.call(`/prcs/${prc.id}/launches`, "POST", { role: "students" }, 201);
    const participant = new Session();
    await participant.call(`/launches/${launch.id}/join`, "POST", { pseudonym: "Race student" });
    await save(participant, answer(prc));
    await Promise.all([
      owner.session.call(`/launches/${launch.id}/close`, "POST", {}),
      participant.call("/participant/submit", "POST", {}, [200, 409]),
      participant.call("/participant/submit", "POST", {}, [200, 409]),
    ]);
    const counts = await pool.query("SELECT count(*)::int AS total, count(*) FILTER (WHERE state='submitted')::int AS submitted FROM prc_private.responses WHERE launch_id=$1", [launch.id]);
    assert.equal(counts.rows[0].total, 1);
    assert.ok([0, 1].includes(counts.rows[0].submitted));
    await participant.call("/participant/response", "PUT", { ...answer(prc), revision: 1 }, 409);
  });

  await t.test("trial campaigns cannot generate references and library edits preserve history", async () => {
    const trial = await owner.session.call(`/prcs/${prc.id}/trial`, "POST", {}, 201);
    const trialLaunch = trial.launch;
    assert.ok(trialLaunch.id);
    await owner.session.call(`/launches/${trialLaunch.id}/join`, "POST", {
      pseudonym: "Teacher trial",
      invitationToken: new URL(trial.invitationUrl).searchParams.get("invite"),
    });
    assert.ok(owner.session.cookie.includes("prc_session="));
    assert.ok(owner.session.cookie.includes("prc_participant_session="));
    assert.equal((await owner.session.call("/auth/me")).user.id, owner.id);
    assert.equal((await owner.session.call("/participant/response")).joinInfo.role, "panel");
    await owner.session.call(`/launches/${trialLaunch.id}/close`, "POST", {});
    await owner.session.call(`/launches/${trialLaunch.id}/reference/generate`, "POST", { minimumPanelSize: 1 }, [400, 409]);
    const duplicate = await owner.session.call(`/prcs/${prc.id}/duplicate`, "POST", {}, 201);
    assert.notEqual(duplicate.id, prc.id);
    await owner.session.call(`/prcs/${prc.id}`, "PATCH", { archived: true });
    assert.equal((await owner.session.call("/prcs")).some((row: any) => row.id === prc.id), false);
    assert.equal((await owner.session.call("/prcs?archived=true")).some((row: any) => row.id === prc.id), true);
    await owner.session.call(`/prcs/${prc.id}`, "PATCH", { archived: false });
    const original = await owner.session.call(`/prcs/${prc.id}`);
    await owner.session.call(`/prcs/${prc.id}`, "PUT", { ...original, diagnostics: original.diagnostics.map((d: any) => d.label), scenario: "Changed clinical version" });
    const oldLaunch = (await pool.query("SELECT case_snapshot FROM prc_private.launches WHERE id=$1", [panel.id])).rows[0];
    assert.equal(oldLaunch.case_snapshot.scenario, prc.scenario);
    assert.deepEqual((await pool.query("SELECT snapshot FROM prc_private.references WHERE launch_id=$1", [panel.id])).rows[0].snapshot, initialReference);
  });

  await t.test("only the owner can permanently delete draft, active, completed and archived PRCs with all dependent data", async () => {
    const colleague = await newUser();
    const unaffected = await colleague.session.call('/prcs', 'POST', completeCase(), 201);
    const blank = await owner.session.call('/prcs', 'POST', { name: 'Brouillon à supprimer', scenario: '', diagnostics: [], observations: [] }, 201);
    await owner.session.call(`/prcs/${blank.id}`, 'DELETE', {}, 400);
    await owner.session.call(`/prcs/${blank.id}`, 'DELETE', { confirm: 'true' }, 400);
    assert.equal((await owner.session.call(`/prcs/${blank.id}`)).id, blank.id);
    await anonymous.call(`/prcs/${blank.id}`, 'DELETE', { confirm: true }, 401);
    await colleague.session.call(`/prcs/${blank.id}`, 'DELETE', { confirm: true }, 404);
    await admin.session.call(`/prcs/${blank.id}`, 'DELETE', { confirm: true }, 404);
    assert.deepEqual(await owner.session.call(`/prcs/${blank.id}`, 'DELETE', { confirm: true }), { id: blank.id, deleted: true });
    await owner.session.call(`/prcs/${blank.id}`, 'DELETE', { confirm: true }, 404);

    for (const state of ['active', 'completed', 'archived']) {
      const item = await owner.session.call('/prcs', 'POST', completeCase(), 201);
      const referencePanel = await createReference(owner.session, item, 1);
      const group = await owner.session.call(`/prcs/${item.id}/launches`, 'POST', { role: 'students' }, 201);
      const participant = new Session();
      const joined = await participant.call(`/launches/${group.id}/join`, 'POST', { pseudonym: 'Étudiant test', code: group.code, joinKey: randomUUID() });
      await save(participant, answer(item));
      await participant.call('/participant/submit', 'POST', {});
      if (state !== 'active') {
        await owner.session.call(`/launches/${group.id}/close`, 'POST', {});
        await owner.session.call(`/launches/${group.id}/publish`, 'POST', {});
      }
      if (state === 'archived') await owner.session.call(`/prcs/${item.id}`, 'PATCH', { archived: true });
      const copy = await owner.session.call(`/prcs/${item.id}/duplicate`, 'POST', {}, 201);
      await owner.session.call(`/prcs/${item.id}/collaborators`, 'POST', { username: colleague.username, manageSessions: true });
      assert.equal((await colleague.session.call(`/prcs/${item.id}`)).permissions.delete, false);
      await colleague.session.call(`/prcs/${item.id}`, 'DELETE', { confirm: true }, 404);
      const participantIds = (await pool.query('SELECT id FROM prc_private.participants WHERE launch_id=ANY($1::uuid[])', [[referencePanel.id, group.id]])).rows.map(row => row.id);
      const referenceId = (await pool.query('SELECT reference_id FROM prc_private.launches WHERE id=$1', [group.id])).rows[0].reference_id;
      await owner.session.call(`/prcs/${item.id}`, 'DELETE', { confirm: true });
      for (const table of ['prcs', 'prc_versions', 'prc_collaborators', 'launches']) {
        const column = table === 'prcs' ? 'id' : 'prc_id';
        assert.equal((await pool.query(`SELECT count(*)::int AS n FROM prc_private.${table} WHERE ${column}=$1`, [item.id])).rows[0].n, 0);
      }
      for (const table of ['participants', 'responses', 'invitations']) {
        assert.equal((await pool.query(`SELECT count(*)::int AS n FROM prc_private.${table} WHERE launch_id=ANY($1::uuid[])`, [[referencePanel.id, group.id]])).rows[0].n, 0);
      }
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM prc_private.sessions WHERE participant_id=ANY($1::uuid[])', [participantIds])).rows[0].n, 0);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM prc_private.references WHERE id=$1', [referenceId])).rows[0].n, 0);
      await owner.session.call(`/prcs/${item.id}`, 'GET', undefined, 404);
      await colleague.session.call(`/prcs/${item.id}`, 'GET', undefined, 404);
      await participant.call('/participant/response', 'GET', undefined, 401);
      await anonymous.call(`/join/${group.code}`, 'GET', undefined, 404);
      await new Session().call(`/launches/${group.id}/join`, 'POST', { pseudonym: 'Trop tard', code: group.code }, 404);
      assert.equal((await owner.session.call(`/prcs/${copy.id}`)).id, copy.id);
      assert.equal((await owner.session.call('/auth/me')).user.id, owner.id);
      assert.equal((await colleague.session.call(`/prcs/${unaffected.id}`)).id, unaffected.id);
      assert.ok(joined.participantId);
    }
  });

  await t.test("concurrent save and deletion cannot recreate a removed PRC", async () => {
    const input = completeCase();
    const item = await owner.session.call('/prcs', 'POST', input, 201);
    await Promise.all([
      owner.session.call(`/prcs/${item.id}`, 'PUT', { ...input, scenario: 'Dernière modification', version: 1 }, [200, 404]),
      owner.session.call(`/prcs/${item.id}`, 'DELETE', { confirm: true }),
    ]);
    await owner.session.call(`/prcs/${item.id}`, 'GET', undefined, 404);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM prc_private.prc_versions WHERE prc_id=$1', [item.id])).rows[0].n, 0);
  });

  await t.test("deactivation and password reset invalidate existing sessions", async () => {
    await admin.session.call(`/teachers/${other.id}`, "PATCH", { active: false });
    await other.session.call("/auth/me", "GET", undefined, 401);
    await other.session.call("/prcs", "GET", undefined, 401);
    await admin.session.call(`/teachers/${other.id}`, "PATCH", { active: true });
    const active = new Session();
    await active.call("/auth/login", "POST", { username: other.username, password: other.password });
    await admin.session.call(`/teachers/${other.id}`, "PATCH", { password: "reset-test-password-only" });
    await active.call("/auth/me", "GET", undefined, 401);
    await new Session().call("/auth/login", "POST", { username: other.username, password: other.password }, 401);
    const reset = new Session();
    assert.equal((await reset.call("/auth/login", "POST", { username: other.username, password: "reset-test-password-only" })).user.mustChangePassword, true);
  });

  await t.test("Toux demo is complete, idempotent, computed and isolated by teacher", async () => {
    const fixture = await anonymous.call("/demo-case");
    assert.equal(fixture.observations.length, 20);
    const finishDemo = async (session: InstanceType<typeof Session>, fresh = false) => {
      let previous = fresh ? 0 : null;
      for (let attempt = 0; attempt < 20; attempt++) {
        const result = await session.call("/demo", "POST", {}, [200, 201]);
        const progress = result.progress.expertsSubmitted + result.progress.studentsSubmitted;
        if (previous !== null) assert.ok(progress - previous <= 4, "A demo request exceeds its bounded batch");
        previous = progress;
        const marker = await pool.query("SELECT lease_token FROM prc_private.demo_installations WHERE prc_id=$1", [result.prcId]);
        assert.ok(marker.rows[0].lease_token === null, "Demo lease retained across HTTP requests");
        if (!result.pending) return result;
      }
      assert.fail("Demo initialization did not finish within twenty bounded requests.");
    };
    const first = await finishDemo(owner.session, true);
    const again = await finishDemo(owner.session);
    assert.equal(first.prcId, again.prcId);
    assert.equal(first.panelLaunchId, again.panelLaunchId);
    assert.equal(first.studentLaunchId, again.studentLaunchId);
    const expertCounts = await pool.query("SELECT count(*)::int AS n FROM prc_private.responses WHERE launch_id=$1 AND state='submitted'", [first.panelLaunchId]);
    assert.equal(expertCounts.rows[0].n, 10);
    const reference = (await pool.query("SELECT snapshot FROM prc_private.references WHERE launch_id=$1", [first.panelLaunchId])).rows[0].snapshot;
    assert.equal(reference.totalSubmissions, 10);
    assert.ok(reference.distributions.some((row: any) => row.expertCount > 0 && row.expertCount < 5));
    const responses = await pool.query("SELECT * FROM prc_private.responses WHERE launch_id=$1", [first.studentLaunchId]);
    assert.equal(responses.rows.length, 5);
    assert.equal(responses.rows.filter((row: any) => row.state === "submitted").length, 4);
    const { scoreSubmission } = await import("./scoring.js");
    for (const row of responses.rows.filter((entry: any) => entry.state === "submitted")) {
      const result = scoreSubmission({ mainDiagnosticId: row.main_diagnostic_id, alternativeDiagnosticId: row.alternative_diagnostic_id, mainChoices: row.main_choices, alternativeChoices: row.alternative_choices, panel: reference.distributions });
      assert.equal(Number(row.score), Number(result.total.toFixed(2)));
    }
    const independentOwner = await newUser();
    const independent = await finishDemo(independentOwner.session, true);
    assert.notEqual(independent.prcId, first.prcId);
    await independentOwner.session.call(`/prcs/${first.prcId}`, "GET", undefined, 404);
    const document = await owner.session.call(`/prcs/${first.prcId}`);
    const expertRows = (await pool.query("SELECT main_choices, alternative_choices FROM prc_private.responses WHERE launch_id=$1 AND state='submitted'", [first.panelLaunchId])).rows;
    assert.equal(expertRows.length, 10);
    for (const response of expertRows) {
      assert.equal(response.main_choices.length, 5);
      assert.equal(response.alternative_choices.length, 5);
      for (const choice of [...response.main_choices, ...response.alternative_choices]) assert.ok([1, 2, 3].includes(choice.points));
    }
    assert.equal(document.launches.some((launch: any) => launch.deliveryMode === 'asynchronous'), false);
    await anonymous.call(`/prcs/${first.prcId}/demo-session`, 'POST', { deliveryMode: 'asynchronous' }, 401);
    await independentOwner.session.call(`/prcs/${first.prcId}/demo-session`, 'POST', { deliveryMode: 'asynchronous' }, 404);
    await owner.session.call(`/prcs/${first.prcId}/demo-session`, 'POST', {}, 400);
    await owner.session.call(`/prcs/${first.prcId}/demo-session`, 'POST', { deliveryMode: 'invalid' }, 400);
    const [sync, syncRetry] = await Promise.all([0, 1].map(() => owner.session.call(`/prcs/${first.prcId}/demo-session`, 'POST', { deliveryMode: 'synchronous' })));
    assert.equal(sync.id, syncRetry.id);
    assert.equal(sync.status, 'open');
    assert.equal(sync.guidedReview, true);
    const syncStudent = new Session();
    // Student-supplied mode flags cannot override the teacher's frozen choice.
    const joined = await syncStudent.call(`/launches/${sync.id}/join`, 'POST', { pseudonym: 'Étudiant Toux synchrone', code: sync.code, deliveryMode: 'asynchronous', studentWorkflow: { deliveryMode: 'asynchronous' } });
    assert.equal(joined.joinInfo.deliveryMode, 'synchronous');
    assert.equal(joined.joinInfo.requiredChoices, 5);
    await syncStudent.call(`/prcs/${first.prcId}/demo-session`, 'POST', { deliveryMode: 'asynchronous' }, 401);
    await syncStudent.call(`/prcs/${first.prcId}/launches`, 'POST', { role: 'students', deliveryMode: 'asynchronous' }, 401);
    const syncDraft = await syncStudent.call('/participant/response');
    await syncStudent.call('/participant/response', 'PUT', { ...answer(document), revision: syncDraft.response.revision, deliveryMode: 'asynchronous', studentWorkflow: { deliveryMode: 'asynchronous' } });
    await syncStudent.call('/participant/submit', 'POST', { deliveryMode: 'asynchronous' });
    const waiting = await syncStudent.call('/participant/results');
    assert.equal(waiting.deliveryMode, 'synchronous');
    assert.equal(waiting.score, null);
    assert.equal(waiting.studentReview, undefined);
    const async = await owner.session.call(`/prcs/${first.prcId}/demo-session`, 'POST', { deliveryMode: 'asynchronous' });
    assert.notEqual(async.code, sync.code);
    assert.notEqual(async.id, first.studentLaunchId);
    assert.equal((await owner.session.call(`/prcs/${first.prcId}/demo-session`, 'POST', { deliveryMode: 'asynchronous' })).id, async.id);
    const asyncStudent = new Session();
    await asyncStudent.call(`/launches/${async.id}/join`, 'POST', { pseudonym: 'Étudiant Toux asynchrone', code: async.code });
    const draftResult = await asyncStudent.call('/participant/results');
    assert.equal(draftResult.score, null);
    assert.equal(draftResult.studentReview, undefined);
    await save(asyncStudent, answer(document));
    await asyncStudent.call('/participant/submit', 'POST', {});
    const corrected = await asyncStudent.call('/participant/results');
    assert.equal(corrected.deliveryMode, 'asynchronous');
    assert.equal(corrected.status, 'open');
    assert.ok(Number.isFinite(corrected.score));
    assert.equal(corrected.studentReview.corrections.length, 2);
    assert.equal(corrected.studentReview.comparisonVisible, false);
    assert.deepEqual(corrected.class, {});
    assert.equal((await pool.query('SELECT reference_id FROM prc_private.launches WHERE id=$1', [async.id])).rows[0].reference_id,
      (await pool.query('SELECT reference_id FROM prc_private.launches WHERE id=$1', [sync.id])).rows[0].reference_id);
    await owner.session.call(`/launches/${sync.id}/close`, 'POST', {});
    await owner.session.call(`/launches/${sync.id}/discussion`, 'POST', { action: 'comparison' });
    const comparison = (await syncStudent.call('/participant/results')).studentReview;
    assert.equal(comparison.comparisonVisible, true);
    assert.equal(comparison.comparison.length, 5);
    await owner.session.call(`/launches/${sync.id}/discussion`, 'POST', { action: 'diagnostic', diagnosticId: document.diagnostics[0].id });
    assert.equal((await syncStudent.call('/participant/results')).studentReview.corrections.length, 1);
    const replacement = await owner.session.call(`/prcs/${first.prcId}/demo-session`, 'POST', { deliveryMode: 'synchronous' });
    assert.notEqual(replacement.id, sync.id);
    assert.equal((await owner.session.call(`/launches/${sync.id}`)).status, 'revealed');
    const countsAfter = await owner.session.call('/demo', 'POST', {});
    assert.equal(countsAfter.prcId, first.prcId);
    assert.equal(countsAfter.progress.expertsSubmitted, 10);
    assert.equal(countsAfter.progress.studentsSubmitted, 4);
    const colleague = await newUser();
    await owner.session.call(`/prcs/${first.prcId}/collaborators`, 'POST', { username: colleague.username });
    await colleague.session.call(`/prcs/${first.prcId}/demo-session`, 'POST', { deliveryMode: 'asynchronous' }, 404);
    await owner.session.call(`/prcs/${first.prcId}`, 'PATCH', { archived: true });
    await owner.session.call(`/prcs/${first.prcId}/demo-session`, 'POST', { deliveryMode: 'asynchronous' }, 409);
    await owner.session.call(`/prcs/${first.prcId}`, 'PATCH', { archived: false });
    const regular = await owner.session.call('/prcs', 'POST', completeCase(), 201);
    await owner.session.call(`/prcs/${regular.id}/demo-session`, 'POST', { deliveryMode: 'asynchronous' }, 409);
    await owner.session.call(`/prcs/${first.prcId}`, 'PUT', { ...document, diagnostics: document.diagnostics.map((row: any) => row.label), version: document.version, scenario: 'Cas modifié, nouveau panel nécessaire' });
    await owner.session.call(`/prcs/${first.prcId}/demo-session`, 'POST', { deliveryMode: 'asynchronous' }, 409);
    await owner.session.call(`/prcs/${first.prcId}`, 'DELETE', { confirm: true });
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM prc_private.demo_installations WHERE owner_id=$1', [owner.id])).rows[0].n, 0);
    await owner.session.call(`/prcs/${first.prcId}`, 'GET', undefined, 404);
    const recreated = await finishDemo(owner.session, true);
    assert.notEqual(recreated.prcId, first.prcId);
    assert.equal((await independentOwner.session.call(`/prcs/${independent.prcId}`)).id, independent.prcId);
  });
});
