import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { testServices } from "./test-support.js";

test("complete private PRC workflow on disposable PostgreSQL", { skip: !process.env.PRC_TEST_DATABASE_URL }, async t => {
  const { pool, Session, newUser, completeCase, answer, save } = await testServices();
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
  });
});
