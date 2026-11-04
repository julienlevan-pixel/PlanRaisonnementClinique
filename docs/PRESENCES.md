# Présences des étudiants en séance synchrone

La liste est automatique et concerne uniquement les étudiants qui rejoignent une séance synchrone pendant qu’elle accepte les inscriptions. Le même QR ou code est utilisé ; aucun compte supplémentaire, matricule ou confirmation de présence n’est demandé.

Le formulaire d’entrée demande **Votre nom et prénom** et explique que l’entrée pendant la séance enregistre la présence. Le nom de participation est utilisé pour la liste. Pour une séance déjà commencée avec des pseudonymes, les anciens noms saisis restent ceux affichés ; l’application ne peut pas deviner les noms réels.

## Pour le professeur

Choisir **Voir les présences** dans la séance ou la collecte étudiante synchrone. La liste présente les noms et l’heure de **première inscription**, avec recherche par nom. Elle se met à jour pendant son ouverture. Une séance multi-cas garde une seule ligne par identité de participation pour toute la séance.

**Exporter en Excel (.xls)** télécharge la liste complète, même si la recherche filtre l’écran. Le fichier est un véritable classeur binaire BIFF8, avec les colonnes séance, nom et prénom, date, heure d’inscription et fuseau horaire. Les noms restent des cellules texte et ne sont jamais interprétés comme des formules. L’heure affichée et exportée utilise le fuseau du navigateur du professeur, explicitement indiqué dans le fichier.

Il n’y a plus d’activation, de liste attendue, de statut de retard, de motif d’absence ou de correction manuelle. Les experts et les groupes asynchrones n’ont pas de feuille de présence.

## Limites temporelles

- Une séance multi-cas accepte des inscriptions tant que la séance est ouverte ; la fin d’un cas ne termine pas la séance entière.
- Pour une collecte individuelle, la fermeture des accès aux réponses termine aussi les nouvelles inscriptions.
- Une nouvelle inscription après la fin est refusée côté serveur, y compris si le formulaire était déjà ouvert avant la fermeture.
- Les personnes déjà inscrites peuvent revenir à leur copie ou au bilan. Cette reprise ne crée aucune ligne et ne modifie pas l’heure initiale.
- Un simple chargement de la page de code ne suffit pas : la présence apparaît après une entrée réussie dans la séance.

## Confidentialité et notes

La liste nominative est réservée aux professeurs autorisés à gérer la séance. Un étudiant reçoit uniquement sa propre présence ; aucun nom d’autrui n’est ajouté à la projection ou au corrigé collectif. Une inscription ne prouve pas une connexion continue et ne signifie pas qu’une réponse a été transmise. Les notes et les réponses restent indépendantes des présences.

La reprise avec le même navigateur ou la même clé évite les doublons. Comme pour le questionnaire, une inscription dans un autre navigateur crée une autre identité de participation : le nom seul n’est pas une preuve d’identité et deux étudiants peuvent porter le même nom.

## Installation

**Aucune nouvelle migration Supabase n’est nécessaire.** L’heure d’inscription provient des données de participation déjà enregistrées par le serveur. Les anciennes tables de la migration 007 sont conservées sans suppression de leur historique, mais ne servent plus à cette liste automatique. L’ancien script UPGRADE_ATTENDANCE.sql n’est plus requis pour les présences automatiques.

L’export Excel est chargé uniquement lorsqu’on le demande. Les tests couvrent les inscriptions et reconnexions, les limites de fermeture, les arrivées simultanées, la confidentialité et les droits révoqués, les séances multi-cas, la conservation des notes, les formats horaires, l’export XLS et l’affichage mobile.
