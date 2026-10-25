import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch, Router as WouterRouter } from "wouter";
import { queryClient } from "./app/query";
import { useActions } from "./app/actions";
import { Home } from "./features/Library";
import { Login } from "./features/Auth";
import { PrcEditor } from "./features/Editor";
import { ProtectedActivity, ProjectionPage } from "./features/Activity";
import { Join, Participant, ParticipantResults } from "./features/Participant";
import { Admin } from "./features/Admin";
import NotFound from "@/pages/not-found";
import "./index.css";
import "./participant-matrix.css";
function Router() {
  const actions = useActions();
  return (
    <Switch>
      <Route path="/">
        <Home actions={actions} />
      </Route>
      <Route path="/login">
        <Login actions={actions} />
      </Route>
      <Route path="/prc/:prcId">
        <PrcEditor actions={actions} />
      </Route>
      <Route path="/activity/:launchId">
        <ProtectedActivity actions={actions} />
      </Route>
      <Route path="/projection/:launchId">
        <ProjectionPage />
      </Route>
      <Route path="/join/:code">
        <Join actions={actions} />
      </Route>
      <Route path="/participant">
        <Participant actions={actions} />
      </Route>
      <Route path="/participant/results" component={ParticipantResults} />
      <Route path="/admin">
        <Admin actions={actions} />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
