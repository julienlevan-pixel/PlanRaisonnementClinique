import { useEffect, useState, type FormEvent, type ReactNode, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { QueryClient, QueryClientProvider, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity, ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, CircleHelp, ClipboardList,
  FlaskConical, KeyRound, LogOut, Menu, Plus, Save, Settings2,
  ShieldCheck, Stethoscope, Users, X,
} from 'lucide-react';
import { Link, Route, Switch, useLocation, useParams, Router as WouterRouter } from 'wouter';
import {
  getChangePasswordMutationOptions, getCloseLaunchMutationOptions, getCreateInvitationMutationOptions,
  getCreateLaunchMutationOptions, getCreatePrcMutationOptions, getCreateTeacherMutationOptions,
  getGenerateReferenceMutationOptions, getJoinLaunchMutationOptions, getLoginMutationOptions,
  getLogoutMutationOptions, getPublishResultsMutationOptions, getRevealLaunchMutationOptions,
  getSaveParticipantResponseMutationOptions, getSubmitParticipantResponseMutationOptions,
  getUpdatePrcMutationOptions, getUpdateTeacherMutationOptions, getValidateReferenceMutationOptions,
  getGetCurrentUserQueryKey, getGetJoinInfoQueryKey, getGetLaunchQueryKey, getGetLaunchResultsQueryKey, getGetPanelResultsQueryKey,
  getGetParticipantResponseQueryKey,
  getGetParticipantResultsQueryKey, getGetPrcQueryKey, getGetWorkspaceSummaryQueryKey,
  getListPrcsQueryKey, getListTeachersQueryKey, useGetCurrentUser, useGetJoinInfo, useGetLaunch,
  useGetLaunchResults, useGetPanelResults, useGetParticipantResponse, useGetParticipantResults,
  useGetPrc, useGetWorkspaceSummary, useHealthCheck, useListPrcs, useListTeachers,
} from '@workspace/api-client-react';
import type { Choice, ParticipantResponseInput, PrcInput, RevealInput } from '@workspace/api-client-react';
import NotFound from '@/pages/not-found';
import './index.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

type AppActions = ReturnType<typeof useActions>;
function useActions() {
  const qc = useQueryClient();
  const refresh = (key: readonly unknown[]) => qc.invalidateQueries({ queryKey: key });
  return {
    login: useMutation(getLoginMutationOptions({ mutation: { onSuccess: () => refresh(getGetCurrentUserQueryKey()) } })),
    logout: useMutation(getLogoutMutationOptions({ mutation: { onSuccess: () => refresh(getGetCurrentUserQueryKey()) } })),
    password: useMutation(getChangePasswordMutationOptions()),
    createTeacher: useMutation(getCreateTeacherMutationOptions({ mutation: { onSuccess: () => refresh(getListTeachersQueryKey()) } })),
    updateTeacher: useMutation(getUpdateTeacherMutationOptions({ mutation: { onSuccess: () => refresh(getListTeachersQueryKey()) } })),
    createPrc: useMutation(getCreatePrcMutationOptions({ mutation: { onSuccess: () => { refresh(getListPrcsQueryKey()); refresh(getGetWorkspaceSummaryQueryKey()); } } })),
    updatePrc: useMutation(getUpdatePrcMutationOptions({ mutation: { onSuccess: (_res, vars) => { refresh(getGetPrcQueryKey(vars.prcId)); refresh(getListPrcsQueryKey()); } } })),
    createLaunch: useMutation(getCreateLaunchMutationOptions({ mutation: { onSuccess: () => { refresh(getListPrcsQueryKey()); refresh(getGetWorkspaceSummaryQueryKey()); } } })),
    invitation: useMutation(getCreateInvitationMutationOptions()),
    join: useMutation(getJoinLaunchMutationOptions()),
    saveResponse: useMutation(getSaveParticipantResponseMutationOptions()),
    submitResponse: useMutation(getSubmitParticipantResponseMutationOptions()),
    closeLaunch: useMutation(getCloseLaunchMutationOptions({ mutation: { onSuccess: (_res, vars) => refresh(getGetLaunchQueryKey(vars.launchId)) } })),
    reveal: useMutation(getRevealLaunchMutationOptions({ mutation: { onSuccess: (_res, vars) => refresh(getGetLaunchQueryKey(vars.launchId)) } })),
    generateReference: useMutation(getGenerateReferenceMutationOptions()),
    validateReference: useMutation(getValidateReferenceMutationOptions()),
    publishResults: useMutation(getPublishResultsMutationOptions({ mutation: { onSuccess: (_res, vars) => refresh(getGetLaunchQueryKey(vars.launchId)) } })),
  };
}

function Btn({ children, onClick, kind = 'primary', disabled, type = 'button', className = '' }: {
  children: ReactNode; onClick?: () => void; kind?: 'primary' | 'outline' | 'quiet' | 'danger'; disabled?: boolean; type?: 'button' | 'submit'; className?: string;
}) {
  return <button type={type} onClick={onClick} disabled={disabled} data-testid={`button-${String(children).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} className={`btn btn-${kind} ${className}`}>{children}</button>;
}
function Input({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return <label className="field"><span>{label}</span><input {...props} data-testid={props['data-testid'] || `input-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} /></label>;
}
function Area({ label, ...props }: { label: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <label className="field"><span>{label}</span><textarea {...props} data-testid={props['data-testid'] || `textarea-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} /></label>;
}
function SectionTitle({ eyebrow, title, aside }: { eyebrow?: string; title: string; aside?: ReactNode }) {
  return <div className="section-title"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1></div>{aside}</div>;
}
function Status({ value }: { value?: string | null }) {
  const val = value || 'brouillon';
  return <span className={`status status-${val.toLowerCase().replace(/[^a-z]+/g, '-')}`}>{val.replaceAll('_', ' ')}</span>;
}
function Loading({ label = 'Chargement des données…' }: { label?: string }) {
  return <div className="loading-box" role="status"><span className="skeleton-line" /><span className="skeleton-line short" /><span>{label}</span></div>;
}
function ErrorBox({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="error-box"><strong>Impossible de charger cette page.</strong><p>{message}</p>{retry && <Btn kind="outline" onClick={retry}>Réessayer</Btn>}</div>;
}
function Shell({ children, user, actions }: { children: ReactNode; user?: { username: string; role: string }; actions: AppActions }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location] = useLocation();
  const active = (href: string) => location === href || (href !== '/' && location.startsWith(href));
  return <div className="app-shell">
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
      <Link href="/" className="brand"><span className="brand-mark"><Stethoscope size={20} /></span><span><b>PRC</b><small>PHARMACIE</small></span></Link>
      <div className="side-label">ESPACE PÉDAGOGIQUE</div>
      <nav className="side-nav">
        <Link href="/" className={active('/') ? 'nav-item selected' : 'nav-item'} onClick={() => setMobileOpen(false)}><ClipboardList size={17} />Vue d’ensemble</Link>
        <Link href="/" className="nav-item" onClick={() => setMobileOpen(false)}><BookOpen size={17} />Cas cliniques</Link>
        {user?.role === 'admin' && <Link href="/admin" className={active('/admin') ? 'nav-item selected' : 'nav-item'}><Settings2 size={17} />Administration</Link>}
      </nav>
      <div className="sidebar-bottom">
        <div className="side-note"><ShieldCheck size={16} /><span>Données pédagogiques<br />à accès contrôlé</span></div>
        {user && <button className="account-row" onClick={() => actions.logout.mutate()} data-testid="button-logout"><span className="avatar">{user.username.slice(0, 1).toUpperCase()}</span><span className="account-copy"><b>{user.username}</b><small>{user.role === 'admin' ? 'Administration' : 'Enseignant·e'}</small></span><LogOut size={16} /></button>}
      </div>
    </aside>
    <main className="main-area">
      <header className="topbar"><button className="mobile-menu" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Ouvrir le menu"><Menu size={20} /></button><div className="crumb"><span>PRC Pharmacie</span><span className="crumb-sep">/</span><span>{location === '/' ? 'Espace enseignant' : location.startsWith('/admin') ? 'Administration' : 'Activité pédagogique'}</span></div><div className="top-meta"><span className="live-dot" /> Environnement sécurisé</div></header>
      <div className="content page-enter">{children}</div>
      <footer className="footer"><span>PRC Pharmacie</span><span>Outil pédagogique de raisonnement clinique</span><span>© Faculté de pharmacie</span></footer>
    </main>
  </div>;
}

function Home({ actions }: { actions: AppActions }) {
  const current = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), retry: false } });
  const summary = useGetWorkspaceSummary({ query: { queryKey: getGetWorkspaceSummaryQueryKey(), enabled: !!current.data?.user } });
  const prcs = useListPrcs({ query: { queryKey: getListPrcsQueryKey(), enabled: !!current.data?.user } });
  const [, setLocation] = useLocation();
  const [code, setCode] = useState('');
  const [showPrcForm, setShowPrcForm] = useState(false);
  const [name, setName] = useState('');
  const login = () => setLocation('/login');
  if (current.isLoading) return <div className="auth-page"><Loading label="Vérification de la session…" /></div>;
  if (current.data?.user) {
    const user = current.data.user;
    const create = (e: FormEvent) => {
      e.preventDefault();
      actions.createPrc.mutate({ data: { name, scenario: '', instructions: '', diagnostics: [], observations: [] } }, {
        onSuccess: (p) => { setShowPrcForm(false); setLocation(`/prc/${p.id}`); },
      });
    };
    return <Shell user={user} actions={actions}>
      {user.mustChangePassword && <PasswordNotice actions={actions} />}
      <SectionTitle eyebrow="TABLEAU DE BORD" title={`Bonjour, ${user.username}`} aside={<Btn onClick={() => setShowPrcForm(!showPrcForm)}><Plus size={16} /> Nouveau cas</Btn>} />
      <p className="intro-copy">Préparez vos cas, lancez une activité et suivez le raisonnement de vos groupes.</p>
      {showPrcForm && <form className="inline-create" onSubmit={create}><Input label="Nom du cas clinique" value={name} onChange={e => setName(e.target.value)} required placeholder="Ex. Douleur thoracique aiguë" /><Btn type="submit" disabled={actions.createPrc.isPending}>Créer le cas</Btn><Btn kind="quiet" onClick={() => setShowPrcForm(false)}>Annuler</Btn></form>}
      <div className="metric-strip">
        <Metric label="Cas cliniques" value={summary.data?.prcCount} icon={<BookOpen size={18} />} />
        <Metric label="Activités en cours" value={summary.data?.activeLaunchCount} icon={<Activity size={18} />} />
        <Metric label="Participants" value={summary.data?.participantCount} icon={<Users size={18} />} />
        <Metric label="Réponses reçues" value={summary.data?.submissionCount} icon={<Check size={18} />} />
      </div>
      <div className="dashboard-grid">
        <section className="panel-card cas-panel"><div className="panel-heading"><div><div className="eyebrow">BIBLIOTHÈQUE</div><h2>Vos cas cliniques</h2></div><span className="count">{prcs.data?.length ?? '—'} cas</span></div>
          {prcs.isLoading ? <Loading label="Chargement des cas…" /> : prcs.isError ? <ErrorBox message="La bibliothèque n’est pas disponible." retry={() => prcs.refetch()} /> : prcs.data?.length ? <div className="case-list">{prcs.data.map((p, i) => <Link href={`/prc/${p.id}`} className="case-row" key={p.id} data-testid={`link-prc-${p.id}`}><span className="case-index">{String(i + 1).padStart(2, '0')}</span><span className="case-title"><b>{p.name}</b><small>Modifié le {dateLabel(p.updatedAt)} · {p.launchCount} lancement{p.launchCount === 1 ? '' : 's'}</small></span><Status value={p.status} /><ArrowRight size={17} /></Link>)}</div> : <Empty title="La bibliothèque est vide" copy="Créez votre premier cas pour commencer à structurer une activité de raisonnement clinique." action={<Btn onClick={() => setShowPrcForm(true)}><Plus size={15} /> Créer un cas</Btn>} />}</section>
        <section className="panel-card recent-panel"><div className="panel-heading"><div><div className="eyebrow">SUIVI</div><h2>Activités récentes</h2></div></div>
          {summary.isLoading ? <Loading /> : summary.isError ? <ErrorBox message="Le suivi est indisponible." retry={() => summary.refetch()} /> : summary.data?.recentLaunches?.length ? <div className="launch-list">{summary.data.recentLaunches.map(l => <Link href={`/activity/${l.id}`} className="launch-row" key={l.id}><span className="launch-glyph"><Activity size={17} /></span><span><b>{l.name}</b><small>{l.role === 'panel' ? 'Panel de référence' : 'Étudiants'} · {dateLabel(l.createdAt)}</small></span><span className="launch-count">{l.submissionCount}/{l.participantCount}</span></Link>)}</div> : <Empty title="Aucune activité récente" copy="Les lancements créés depuis vos cas apparaîtront ici." />}</section>
      </div>
      <section className="join-band"><div className="join-icon"><KeyRound size={20} /></div><div><b>Rejoindre une activité</b><p>Entrez le code communiqué par votre enseignant.</p></div><form onSubmit={e => { e.preventDefault(); if (code.trim()) setLocation(`/join/${encodeURIComponent(code.trim())}`); }}><input value={code} onChange={e => setCode(e.target.value)} placeholder="Code d’accès" aria-label="Code d’accès" data-testid="input-join-code" /><button type="submit" aria-label="Continuer" data-testid="button-join-code"><ArrowRight size={18} /></button></form></section>
    </Shell>;
  }
  return <div className="entry-layout">
    <div className="entry-brand"><Link href="/" className="brand"><span className="brand-mark"><Stethoscope size={20} /></span><span><b>PRC</b><small>PHARMACIE</small></span></Link><div className="entry-visual"><div className="visual-kicker">RAISONNEMENT CLINIQUE</div><div className="visual-line" /><p>Observer.<br />Interpréter.<br /><em>Décider.</em></p><small>Un espace de travail pour enseigner<br />la démarche clinique en pharmacie.</small><div className="visual-foot">FACULTÉ DE PHARMACIE <span>•</span> OUTIL PÉDAGOGIQUE</div></div></div>
    <div className="entry-main"><div className="entry-top"><span>Plateforme pédagogique</span><span className="secure-label"><ShieldCheck size={14} /> Accès sécurisé</span></div><div className="entry-box">
      <div className="eyebrow">ESPACE ENSEIGNANT</div><h1>Bienvenue sur<br /><span>PRC Pharmacie.</span></h1><p className="entry-desc">Concevez des cas, animez des panels et accompagnez le raisonnement de vos étudiants.</p>
      <Btn onClick={login} className="entry-login">Se connecter <ArrowRight size={17} /></Btn>
      <div className="entry-separator"><span>ou</span></div>
      <form className="join-entry" onSubmit={e => { e.preventDefault(); if (code.trim()) setLocation(`/join/${encodeURIComponent(code.trim())}`); }}><label htmlFor="join-input">Vous participez à une activité&nbsp;?</label><div><input id="join-input" value={code} onChange={e => setCode(e.target.value)} placeholder="Saisir le code d’accès" data-testid="input-entry-code" /><button type="submit" data-testid="button-entry-join">Rejoindre</button></div></form>
      <div className="entry-help"><CircleHelp size={15} /> Besoin d’un accès enseignant&nbsp;? Contactez l’administrateur de votre faculté.</div>
    </div><footer className="entry-footer">PRC Pharmacie <span>·</span> Environnement universitaire</footer></div>
  </div>;
}
function Metric({ label, value, icon }: { label: string; value?: number; icon: ReactNode }) {
  return <div className="metric"><span className="metric-icon">{icon}</span><span className="metric-val">{value ?? '—'}</span><span className="metric-label">{label}</span></div>;
}
function Empty({ title, copy, action }: { title: string; copy: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-mark"><FlaskConical size={20} /></span><b>{title}</b><p>{copy}</p>{action}</div>;
}
function PasswordNotice({ actions }: { actions: AppActions }) {
  const [expanded, setExpanded] = useState(true);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  return <div className="password-notice"><div><b>Modification du mot de passe requise</b><p>Choisissez un nouveau mot de passe pour sécuriser votre compte.</p></div>{expanded && <form onSubmit={e => { e.preventDefault(); actions.password.mutate({ data: { currentPassword: current, newPassword: next } }, { onSuccess: () => setExpanded(false) }); }}><Input label="Mot de passe actuel" type="password" value={current} onChange={e => setCurrent(e.target.value)} required /><Input label="Nouveau mot de passe (12 caractères minimum)" type="password" minLength={12} value={next} onChange={e => setNext(e.target.value)} required /><Btn type="submit" disabled={actions.password.isPending}>Mettre à jour</Btn></form>}</div>;
}

function Login({ actions }: { actions: AppActions }) {
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const health = useHealthCheck();
  const submit = (e: FormEvent) => {
    e.preventDefault(); setError('');
    actions.login.mutate({ data: { username, password } }, { onSuccess: () => setLocation('/'), onError: err => setError(getError(err)) });
  };
  return <div className="auth-page"><Link href="/" className="brand auth-brand"><span className="brand-mark"><Stethoscope size={20} /></span><span><b>PRC</b><small>PHARMACIE</small></span></Link><div className="auth-card"><div className="eyebrow">ACCÈS ENSEIGNANT</div><h1>Connexion</h1><p>Connectez-vous à votre espace pédagogique.</p>{error && <div className="form-error">{error}</div>}<form onSubmit={submit}><Input label="Identifiant" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required /><Input label="Mot de passe" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /><Btn type="submit" className="full" disabled={actions.login.isPending}>{actions.login.isPending ? 'Connexion…' : 'Se connecter'} <ArrowRight size={16} /></Btn></form><div className="auth-secure"><ShieldCheck size={15} /> Session protégée <span className={health.data?.status === 'ok' ? 'health-ok' : ''}>{health.data?.status === 'ok' ? 'Service opérationnel' : ''}</span></div></div><Link className="back-link" href="/"><ArrowLeft size={15} /> Retour à l’accueil</Link></div>;
}

function PrcEditor({ actions }: { actions: AppActions }) {
  const { prcId } = useParams<{ prcId: string }>();
  const [, setLocation] = useLocation();
  const isNew = !prcId || prcId === 'new';
  const query = useGetPrc(prcId || '', { query: { queryKey: getGetPrcQueryKey(prcId || ''), enabled: !isNew } });
  const [form, setForm] = useState<PrcInput>({ name: '', scenario: '', instructions: '', diagnostics: [], observations: [] });
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (query.data && !initialized) {
      setForm({ name: query.data.name, scenario: query.data.scenario, instructions: query.data.instructions, diagnostics: query.data.diagnostics.map(d => d.label), observations: query.data.observations });
      setInitialized(true);
    }
  }, [query.data, initialized]);
  const update = <K extends keyof PrcInput>(key: K, value: PrcInput[K]) => setForm(prev => ({ ...prev, [key]: value }));
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (isNew) actions.createPrc.mutate({ data: form }, { onSuccess: p => setLocation(`/prc/${p.id}`) });
    else actions.updatePrc.mutate({ prcId: prcId!, data: form });
  };
  const launch = (role: 'panel' | 'students') => {
    if (isNew) return;
    const name = window.prompt(role === 'panel' ? 'Nom du panel de référence' : 'Nom de l’activité étudiante', role === 'panel' ? 'Panel de référence' : 'Activité de raisonnement');
    if (name?.trim()) actions.createLaunch.mutate({ prcId: prcId!, data: { role, name: name.trim() } }, { onSuccess: l => setLocation(`/activity/${l.id}`) });
  };
  if (!isNew && query.isLoading) return <AuthenticatedPage actions={actions}><Loading /></AuthenticatedPage>;
  if (!isNew && query.isError) return <AuthenticatedPage actions={actions}><ErrorBox message="Ce cas clinique est introuvable ou inaccessible." retry={() => query.refetch()} /></AuthenticatedPage>;
  const addObservation = () => update('observations', [...form.observations, { id: `obs-${Date.now()}`, text: '', category: '', position: form.observations.length }]);
  return <AuthenticatedPage actions={actions}><div className="back-heading"><Link href="/" className="back-link"><ArrowLeft size={15} /> Bibliothèque</Link><div className="editor-actions">{!isNew && <><Btn kind="outline" onClick={() => launch('panel')}><Users size={15} /> Lancer un panel</Btn><Btn kind="outline" onClick={() => launch('students')}><Activity size={15} /> Lancer aux étudiants</Btn></>}<Btn onClick={() => document.getElementById('prc-form')?.requestSubmit()} disabled={actions.createPrc.isPending || actions.updatePrc.isPending}><Save size={15} /> Enregistrer</Btn></div></div>
    <SectionTitle eyebrow={isNew ? 'NOUVEAU CAS' : `CAS CLINIQUE · VERSION ${query.data?.version ?? ''}`} title={isNew ? 'Créer un cas clinique' : 'Édition du cas'} aside={!isNew && <Status value={query.data?.status} />} />
    <form id="prc-form" onSubmit={save} className="editor-layout"><div className="editor-main">
      <section className="panel-card editor-card"><div className="editor-section-head"><span className="step-number">01</span><div><h2>Présentation du cas</h2><p>Le contexte et les données cliniques visibles par les participants.</p></div></div><Input label="Titre du cas" maxLength={160} value={form.name} onChange={e => update('name', e.target.value)} required placeholder="Ex. Un essoufflement inhabituel" /><Area label="Scénario clinique" maxLength={20000} rows={9} value={form.scenario} onChange={e => update('scenario', e.target.value)} placeholder="Présentez la situation du patient, son contexte et les éléments initiaux…" /><Area label="Consignes aux participants" maxLength={5000} rows={4} value={form.instructions} onChange={e => update('instructions', e.target.value)} placeholder="Précisez les attendus et le déroulé de l’activité." /></section>
      <section className="panel-card editor-card"><div className="editor-section-head"><span className="step-number">02</span><div><h2>Diagnostics envisagés</h2><p>Les hypothèses proposées à la sélection.</p></div></div><div className="editable-list">{form.diagnostics.map((diag, i) => <div className="editable-row" key={i}><span className="list-number">{String(i + 1).padStart(2, '0')}</span><input value={diag} maxLength={240} onChange={e => update('diagnostics', form.diagnostics.map((d, j) => j === i ? e.target.value : d))} aria-label={`Diagnostic ${i + 1}`} data-testid={`input-diagnostic-${i}`} /><button type="button" aria-label="Supprimer le diagnostic" onClick={() => update('diagnostics', form.diagnostics.filter((_, j) => j !== i))}><X size={16} /></button></div>)}</div><button type="button" className="add-row" onClick={() => update('diagnostics', [...form.diagnostics, ''])}><Plus size={15} /> Ajouter un diagnostic</button></section>
      <section className="panel-card editor-card"><div className="editor-section-head"><span className="step-number">03</span><div><h2>Observations cliniques</h2><p>Informations à mettre en relation avec les hypothèses.</p></div></div>{form.observations.length ? <div className="observations-editor">{form.observations.map((o, i) => <div className="observation-edit" key={o.id}><div className="obs-topline"><span>Observation {String(i + 1).padStart(2, '0')}</span><button type="button" onClick={() => update('observations', form.observations.filter((_, j) => j !== i))} aria-label="Supprimer l’observation"><X size={15} /></button></div><Area label="Élément clinique" value={o.text} onChange={e => update('observations', form.observations.map((x, j) => j === i ? { ...x, text: e.target.value } : x))} rows={2} placeholder="Ex. Antécédent d’hypertension artérielle" /><Input label="Catégorie" value={o.category} onChange={e => update('observations', form.observations.map((x, j) => j === i ? { ...x, category: e.target.value } : x))} placeholder="Ex. Antécédents" /></div>)}</div> : <div className="inline-empty">Aucune observation ajoutée pour le moment.</div>}<button type="button" className="add-row" onClick={addObservation}><Plus size={15} /> Ajouter une observation</button></section>
    </div><aside className="editor-rail"><div className="rail-card"><div className="eyebrow">AVANT DE LANCER</div><h3>Vérifiez votre cas</h3><p>Un scénario lisible, des hypothèses distinctes et des observations suffisamment discriminantes facilitent la discussion clinique.</p><div className="checklist"><CheckLine ok={!!form.name} text="Titre renseigné" /><CheckLine ok={!!form.scenario} text="Scénario rédigé" /><CheckLine ok={form.diagnostics.length > 0} text="Au moins un diagnostic" /><CheckLine ok={form.observations.length > 0} text="Observations disponibles" /></div></div><div className="rail-card muted-rail"><BookOpen size={18} /><b>Structure du cas</b><span>Les versions sont enregistrées à chaque modification du contenu.</span></div></aside></form>
  </AuthenticatedPage>;
}
function CheckLine({ ok, text }: { ok: boolean; text: string }) { return <div className={ok ? 'checkline done' : 'checkline'}><span>{ok ? <Check size={12} /> : '·'}</span>{text}</div>; }

function ActivityPage({ actions }: { actions: AppActions }) {
  const { launchId = '' } = useParams<{ launchId: string }>();
  const launch = useGetLaunch(launchId, { query: { queryKey: getGetLaunchQueryKey(launchId), enabled: !!launchId } });
  const panel = useGetPanelResults(launchId, { query: { queryKey: getGetPanelResultsQueryKey(launchId), enabled: !!launch.data && launch.data.role === 'panel' } });
  const results = useGetLaunchResults(launchId, { query: { queryKey: getGetLaunchResultsQueryKey(launchId), enabled: !!launch.data } });
  const [invitation, setInvitation] = useState<{ url: string; code: string } | null>(null);
  const [explanation, setExplanation] = useState('');
  const [minimum, setMinimum] = useState('5');
  const [reveal, setReveal] = useState<RevealInput>({ mainDiagnostic: false, mainArguments: false, alternativeDiagnostic: false, alternativeArguments: false, reference: false });
  if (launch.isLoading) return <AuthenticatedPage actions={actions}><Loading label="Ouverture de l’activité…" /></AuthenticatedPage>;
  if (launch.isError || !launch.data) return <AuthenticatedPage actions={actions}><ErrorBox message="L’activité n’est pas accessible." retry={() => launch.refetch()} /></AuthenticatedPage>;
  const l = launch.data;
  const invite = () => { const name = window.prompt('Nom du lien d’invitation', 'Groupe invité'); if (name?.trim()) actions.invitation.mutate({ launchId, data: { name: name.trim() } }, { onSuccess: setInvitation }); };
  const revealUpdate = (key: keyof RevealInput, value: boolean) => { const next = { ...reveal, [key]: value }; setReveal(next); actions.reveal.mutate({ launchId, data: next }); };
  const data = l.role === 'panel' ? panel.data : results.data;
  const participants = l.role === 'panel' ? panel.data?.totalSubmissions : results.data?.submittedCount;
  return <AuthenticatedPage actions={actions}>
    <div className="back-heading"><Link href="/" className="back-link"><ArrowLeft size={15} /> Tableau de bord</Link><div className="editor-actions">{l.status !== 'closed' && <Btn kind="outline" onClick={invite}><Users size={15} /> Créer une invitation</Btn>}{l.status !== 'closed' && <Btn kind="danger" onClick={() => { if (window.confirm('Clore cette activité ? Les participants ne pourront plus modifier leur réponse.')) actions.closeLaunch.mutate({ launchId }); }}>Clore l’activité</Btn>}</div></div>
    <SectionTitle eyebrow={l.role === 'panel' ? 'PANEL DE RÉFÉRENCE' : 'ACTIVITÉ ÉTUDIANTE'} title={l.name} aside={<Status value={l.status} />} />
    <div className="activity-info"><div><span>CODE D’ACCÈS</span><b className="mono">{l.code}</b></div><div><span>PARTICIPANTS</span><b>{l.participantCount}</b></div><div><span>RÉPONSES</span><b>{l.submissionCount}</b></div><div><span>CRÉÉE LE</span><b>{dateLabel(l.createdAt)}</b></div></div>
    {invitation && <div className="invitation-banner"><div><b>Invitation créée · {invitation.code}</b><p>Partagez ce lien avec les participants concernés.</p><a href={invitation.url}>{invitation.url}</a></div><Btn kind="quiet" onClick={() => setInvitation(null)}><X size={16} /></Btn></div>}
    <div className="activity-grid"><section className="panel-card"><div className="panel-heading"><div><div className="eyebrow">SYNTHÈSE DES RÉPONSES</div><h2>{l.role === 'panel' ? 'Résultats du panel' : 'Participation'}</h2></div><span className="count">{participants ?? '—'} réponse{participants === 1 ? '' : 's'}</span></div>{!data ? <Loading label="Actualisation des réponses…" /> : <ResultsSummary data={data} />}</section>
      <section className="panel-card"><div className="panel-heading"><div><div className="eyebrow">ANIMATION</div><h2>Déroulé de la restitution</h2></div></div><p className="body-copy">Choisissez les éléments à afficher progressivement aux participants. La restitution collective préserve la confidentialité des réponses individuelles.</p><div className="reveal-list">{([['mainDiagnostic', 'Diagnostic principal'], ['mainArguments', 'Arguments du diagnostic principal'], ['alternativeDiagnostic', 'Diagnostic alternatif'], ['alternativeArguments', 'Arguments du diagnostic alternatif'], ['reference', 'Référence pédagogique']] as [keyof RevealInput,string][]).map(([key,label]) => <label className="toggle-line" key={key}><span><b>{label}</b><small>Rendre visible pendant la restitution</small></span><input type="checkbox" checked={reveal[key] || l.reveals[key as keyof typeof l.reveals]} onChange={e => revealUpdate(key, e.target.checked)} data-testid={`toggle-reveal-${key}`} /></label>)}</div></section></div>
    {l.role === 'panel' && <section className="panel-card reference-card"><div className="panel-heading"><div><div className="eyebrow">RÉFÉRENCE PÉDAGOGIQUE</div><h2>Construire le référentiel du panel</h2></div><Status value={l.referenceStatus} /></div><p className="body-copy">Une référence ne peut être établie qu’à partir d’un panel de taille minimale. Les résultats restent agrégés.</p><div className="reference-controls"><Input label="Taille minimale du panel" type="number" min={1} max={100} value={minimum} onChange={e => setMinimum(e.target.value)} /><Btn kind="outline" disabled={actions.generateReference.isPending} onClick={() => actions.generateReference.mutate({ launchId, data: { minimumPanelSize: Number(minimum) } })}>Générer la référence</Btn><Area label="Justification pédagogique" rows={3} value={explanation} onChange={e => setExplanation(e.target.value)} placeholder="Expliquez les choix retenus et les points de discussion…" /><Btn kind="outline" disabled={!explanation || actions.validateReference.isPending} onClick={() => actions.validateReference.mutate({ launchId, data: { explanation } })}>Valider la référence</Btn></div></section>}
    <div className="publish-row"><div><b>Publication des résultats</b><p>Les scores individuels sont transmis dans l’espace privé des participants.</p></div><Btn disabled={l.status === 'closed' || actions.publishResults.isPending} onClick={() => actions.publishResults.mutate({ launchId })}><ShieldCheck size={15} /> Publier les résultats</Btn></div>
  </AuthenticatedPage>;
}
function ResultsSummary({ data }: { data: any }) {
  const d = data.diagnostics || data.participants || [];
  return <div className="results-summary">{data.totalSubmissions !== undefined && <div className="result-callout"><span>Réponses exploitées</span><b>{data.totalSubmissions}</b><small>Seuil de confidentialité : {data.minimumPanelSize} participants</small></div>}{d.length ? <div className="aggregate-list">{d.map((item: Record<string, unknown>, i: number) => <div className="aggregate-row" key={i}><span>{String(item.label || item.name || item.diagnostic || `Élément ${i + 1}`)}</span><b>{String(item.count ?? item.percentage ?? item.value ?? '')}</b></div>)}</div> : <div className="inline-empty">Les résultats agrégés apparaîtront lorsque les réponses seront reçues.</div>}</div>;
}

function Join({ actions }: { actions: AppActions }) {
  const { code = '' } = useParams<{ code: string }>();
  const info = useGetJoinInfo(code, { query: { queryKey: getGetJoinInfoQueryKey(code), enabled: !!code } });
  const [, setLocation] = useLocation();
  const [pseudonym, setPseudonym] = useState('');
  const [error, setError] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault(); setError('');
    actions.join.mutate({ launchId: info.data?.launchId || code, data: { pseudonym } }, { onSuccess: () => setLocation('/participant'), onError: err => setError(getError(err)) });
  };
  if (info.isLoading) return <div className="participant-layout"><Loading label="Vérification du code d’accès…" /></div>;
  if (info.isError || !info.data) return <div className="participant-layout"><ErrorBox message="Ce code est invalide ou l’activité n’accepte plus de participants." retry={() => info.refetch()} /><Link href="/" className="back-link"><ArrowLeft size={15} /> Accueil</Link></div>;
  return <div className="participant-layout"><div className="participant-top"><Link href="/" className="brand"><span className="brand-mark"><Stethoscope size={20} /></span><span><b>PRC</b><small>PHARMACIE</small></span></Link><span className="secure-label"><ShieldCheck size={14} /> Activité sécurisée</span></div><div className="join-card"><div className="eyebrow">ACTIVITÉ PÉDAGOGIQUE · {info.data.role === 'panel' ? 'PANEL' : 'ÉTUDIANTS'}</div><h1>{info.data.name}</h1><p className="body-copy">Pour rejoindre cette activité, indiquez le nom sous lequel vous souhaitez apparaître.</p>{error && <div className="form-error">{error}</div>}<form onSubmit={submit}><Input label="Votre nom ou pseudonyme" maxLength={100} autoComplete="nickname" value={pseudonym} onChange={e => setPseudonym(e.target.value)} required placeholder="Ex. Groupe 3" /><Btn type="submit" className="full" disabled={actions.join.isPending}>Rejoindre l’activité <ArrowRight size={16} /></Btn></form><div className="activity-note"><span className="live-dot" /> {info.data.status === 'open' ? 'Activité ouverte' : `Statut : ${info.data.status}`}</div></div><footer className="entry-footer">Vos réponses sont associées à ce pseudonyme dans le cadre de l’activité.</footer></div>;
}

function Participant({ actions }: { actions: AppActions }) {
  const responseQuery = useGetParticipantResponse({ query: { queryKey: getGetParticipantResponseQueryKey() } });
  const [mainId, setMainId] = useState<string | null>(null);
  const [altId, setAltId] = useState<string | null>(null);
  const [mainChoices, setMainChoices] = useState<Choice[]>([]);
  const [altChoices, setAltChoices] = useState<Choice[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [, setLocation] = useLocation();
  const joinInfo = responseQuery.data?.joinInfo;
  useEffect(() => {
    if (responseQuery.data && !loaded) {
      setLoaded(true);
      setMainId(responseQuery.data.response.mainDiagnosticId);
      setAltId(responseQuery.data.response.alternativeDiagnosticId);
      setMainChoices(responseQuery.data.response.mainChoices || []);
      setAltChoices(responseQuery.data.response.alternativeChoices || []);
    }
  }, [responseQuery.data, loaded]);
  if (responseQuery.isLoading) return <div className="participant-layout"><Loading label="Ouverture de votre activité…" /></div>;
  if (responseQuery.isError || !joinInfo) return <div className="participant-layout"><ErrorBox message="Aucune activité participante n’est associée à cette session. Rejoignez d’abord une activité avec son code." /><Link href="/" className="back-link"><ArrowLeft size={15} /> Retour à l’accueil</Link></div>;
  const draft: ParticipantResponseInput = { mainDiagnosticId: mainId, alternativeDiagnosticId: altId, mainChoices, alternativeChoices: altChoices };
  const selectSign = (id: string, sign: '+' | '-', choices: Choice[], set: (v: Choice[]) => void) => {
    const found = choices.some(c => c.observationId === id);
    set(found ? choices.map(c => c.observationId === id ? { observationId: id, sign } : c) : [...choices, { observationId: id, sign }]);
  };
  return <div className="participant-layout"><div className="participant-top"><Link href="/" className="brand"><span className="brand-mark"><Stethoscope size={20} /></span><span><b>PRC</b><small>PHARMACIE</small></span></Link><span className="secure-label"><ShieldCheck size={14} /> Réponse privée</span></div><div className="participant-content"><div className="participant-kicker"><span>CAS CLINIQUE</span><span className="step-pill">01 / 02</span></div><h1>{joinInfo.name}</h1><section className="scenario-card"><div className="eyebrow">SITUATION CLINIQUE</div><p>{joinInfo.scenario}</p>{joinInfo.instructions && <div className="instructions"><b>Consignes</b><p>{joinInfo.instructions}</p></div>}</section>
      <div className="participant-step-head"><span className="step-number">01</span><div><h2>Formuler vos hypothèses</h2><p>Sélectionnez un diagnostic principal et, si pertinent, une alternative.</p></div></div>
      <div className="diagnostic-grid"><DiagnosticSelect label="Diagnostic principal" options={joinInfo.diagnostics} value={mainId} onChange={setMainId} /><DiagnosticSelect label="Diagnostic alternatif" options={joinInfo.diagnostics} value={altId} onChange={setAltId} /></div>
      <div className="participant-step-head"><span className="step-number">02</span><div><h2>Mettre en relation les observations</h2><p>Pour chaque élément, indiquez s’il soutient ou affaiblit votre hypothèse.</p></div></div>
      <ObservationChoices title="Pour le diagnostic principal" observations={joinInfo.observations} choices={mainChoices} setChoices={setMainChoices} selectSign={selectSign} />
      {altId && <ObservationChoices title="Pour le diagnostic alternatif" observations={joinInfo.observations} choices={altChoices} setChoices={setAltChoices} selectSign={selectSign} />}
      <div className="participant-actions"><span>{responseQuery.data.response.state === 'submitted' ? 'Réponse transmise' : 'Votre réponse est enregistrée à la demande.'}</span><Btn kind="outline" disabled={actions.saveResponse.isPending} onClick={() => actions.saveResponse.mutate({ data: draft })}><Save size={15} /> Enregistrer</Btn><Btn disabled={actions.submitResponse.isPending} onClick={() => { if (!mainId) return; actions.submitResponse.mutate({ data: draft }, { onSuccess: () => setLocation('/participant/results') }); }}>Transmettre ma réponse <ArrowRight size={15} /></Btn></div>
    </div><footer className="entry-footer">PRC Pharmacie · Activité pédagogique privée</footer></div>;
}
function DiagnosticSelect({ label, options, value, onChange }: { label: string; options: { id: string; label: string }[]; value: string | null; onChange: (v: string | null) => void }) {
  return <label className="diagnostic-select"><span>{label}</span><select value={value || ''} onChange={e => onChange(e.target.value || null)}><option value="">Choisir une hypothèse</option>{options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select><ChevronDown size={16} /></label>;
}
function ObservationChoices({ title, observations, choices, setChoices, selectSign }: { title: string; observations: { id: string; text: string; category: string }[]; choices: Choice[]; setChoices: (v: Choice[]) => void; selectSign: (id: string, sign: '+' | '-', choices: Choice[], set: (v: Choice[]) => void) => void }) {
  return <section className="observation-choices"><div className="obs-choice-title">{title}</div>{observations.map(o => { const val = choices.find(c => c.observationId === o.id)?.sign; return <div className="observation-choice" key={o.id}><div><small>{o.category}</small><b>{o.text}</b></div><button type="button" aria-label="Observation favorable" className={val === '+' ? 'sign-choice active positive' : 'sign-choice'} onClick={() => selectSign(o.id, '+', choices, setChoices)} data-testid={`choice-positive-${o.id}`}>+</button><button type="button" aria-label="Observation défavorable" className={val === '-' ? 'sign-choice active negative' : 'sign-choice'} onClick={() => selectSign(o.id, '-', choices, setChoices)} data-testid={`choice-negative-${o.id}`}>−</button></div>; })}{observations.length === 0 && <div className="inline-empty">Aucune observation clinique n’a été associée à ce cas.</div>}</section>;
}
function ParticipantResults() {
  const results = useGetParticipantResults({ query: { queryKey: getGetParticipantResultsQueryKey() } });
  if (results.isLoading) return <div className="participant-layout"><Loading label="Chargement de vos résultats…" /></div>;
  if (results.isError || !results.data) return <div className="participant-layout"><ErrorBox message="Vos résultats ne sont pas disponibles pour le moment." retry={() => results.refetch()} /></div>;
  return <div className="participant-layout"><div className="participant-top"><Link href="/" className="brand"><span className="brand-mark"><Stethoscope size={20} /></span><span><b>PRC</b><small>PHARMACIE</small></span></Link><span className="secure-label"><ShieldCheck size={14} /> Résultats privés</span></div><div className="join-card results-card">{results.data.published ? <><div className="eyebrow">RETOUR PÉDAGOGIQUE</div><h1>Votre résultat</h1><div className="score-block"><span>Score obtenu</span><b>{results.data.score ?? '—'}{results.data.score !== null ? ' %' : ''}</b></div><p className="body-copy">Votre résultat est individuel et n’est visible que dans cet espace. La synthèse du panel permet de situer votre raisonnement sans exposer les réponses des autres participants.</p><div className="panel-private"><ShieldCheck size={17} /> Les résultats des autres participants restent confidentiels.</div><ResultsSummary data={results.data.panel} /></> : <><div className="eyebrow">RÉSULTATS NON PUBLIÉS</div><h1>Merci pour votre réponse.</h1><p className="body-copy">Votre enseignant n’a pas encore publié les résultats de l’activité. Vous pourrez consulter votre score ici lorsqu’il sera disponible.</p><div className="panel-private"><ShieldCheck size={17} /> Votre réponse a bien été transmise et reste privée.</div></>}</div><footer className="entry-footer">PRC Pharmacie · Espace participant privé</footer></div>;
}

function Admin({ actions }: { actions: AppActions }) {
  const current = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey() } });
  const teachers = useListTeachers({ query: { queryKey: getListTeachersQueryKey(), enabled: current.data?.user.role === 'admin' } });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  if (current.data?.user.role !== 'admin') return <AuthenticatedPage actions={actions}><ErrorBox message="Cette page est réservée aux comptes administrateurs." /></AuthenticatedPage>;
  const create = (e: FormEvent) => { e.preventDefault(); actions.createTeacher.mutate({ data: { username, password } }, { onSuccess: () => { setUsername(''); setPassword(''); } }); };
  return <AuthenticatedPage actions={actions}><SectionTitle eyebrow="GESTION DES ACCÈS" title="Administration des comptes" /><p className="intro-copy">Gérez les comptes enseignants de votre espace facultaire.</p><div className="admin-grid"><section className="panel-card"><div className="panel-heading"><div><div className="eyebrow">NOUVEL ACCÈS</div><h2>Créer un compte enseignant</h2></div></div><form onSubmit={create}><Input label="Identifiant" minLength={3} maxLength={80} value={username} onChange={e => setUsername(e.target.value)} required /><Input label="Mot de passe provisoire (12 caractères minimum)" type="password" minLength={12} maxLength={200} value={password} onChange={e => setPassword(e.target.value)} required /><Btn type="submit" disabled={actions.createTeacher.isPending}><Plus size={15} /> Créer le compte</Btn></form></section>
      <section className="panel-card"><div className="panel-heading"><div><div className="eyebrow">COMPTES EXISTANTS</div><h2>Enseignants</h2></div></div>{teachers.isLoading ? <Loading /> : teachers.isError ? <ErrorBox message="La liste des comptes est indisponible." retry={() => teachers.refetch()} /> : <div className="teacher-list">{teachers.data?.map(t => <div className="teacher-row" key={t.id}><span className="avatar">{t.username.slice(0,1).toUpperCase()}</span><span className="teacher-name"><b>{t.username}</b><small>{t.role === 'admin' ? 'Administrateur' : 'Enseignant'}</small></span><Status value={t.active ? 'actif' : 'suspendu'} /><button type="button" className={`switch ${t.active ? 'on' : ''}`} aria-label={t.active ? 'Désactiver le compte' : 'Activer le compte'} onClick={() => actions.updateTeacher.mutate({ teacherId: t.id, data: { active: !t.active } })}><span /></button></div>)}</div>}</section></div></AuthenticatedPage>;
}

function AuthenticatedPage({ children, actions }: { children: ReactNode; actions: AppActions }) {
  const current = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), retry: false } });
  const [, setLocation] = useLocation();
  useEffect(() => { if (!current.isLoading && !current.data?.user) setLocation('/login'); }, [current.isLoading, current.data, setLocation]);
  if (current.isLoading) return <div className="auth-page"><Loading label="Vérification de la session…" /></div>;
  if (!current.data?.user) return null;
  return <Shell user={current.data.user} actions={actions}>{children}</Shell>;
}
function ProtectedActivity({ actions }: { actions: AppActions }) {
  const current = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), retry: false } });
  const [, setLocation] = useLocation();
  useEffect(() => { if (!current.isLoading && !current.data?.user) setLocation('/login'); }, [current.isLoading, current.data, setLocation]);
  if (current.isLoading || !current.data?.user) return <div className="auth-page"><Loading label="Vérification de la session…" /></div>;
  return <ActivityPage actions={actions} />;
}
function Router() {
  const actions = useActions();
  return <Switch>
    <Route path="/" component={() => <Home actions={actions} />} />
    <Route path="/login" component={() => <Login actions={actions} />} />
    <Route path="/prc/:prcId" component={() => <PrcEditor actions={actions} />} />
    <Route path="/activity/:launchId" component={() => <ProtectedActivity actions={actions} />} />
    <Route path="/join/:code" component={() => <Join actions={actions} />} />
    <Route path="/participant" component={() => <Participant actions={actions} />} />
    <Route path="/participant/results" component={ParticipantResults} />
    <Route path="/admin" component={() => <Admin actions={actions} />} />
    <Route component={NotFound} />
  </Switch>;
}
function App() {
  return <QueryClientProvider client={queryClient}><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter></QueryClientProvider>;
}

function dateLabel(value: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}
function getError(error: unknown) {
  if (error instanceof Error) return error.message || 'Une erreur est survenue. Veuillez réessayer.';
  return 'Une erreur est survenue. Veuillez réessayer.';
}
export default App;
