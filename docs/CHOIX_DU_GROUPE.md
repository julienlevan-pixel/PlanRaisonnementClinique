# Histogrammes des choix du groupe

Dans une collecte étudiante ou une séance, ouvrir **Impressions et données cliniques**. Le sélecteur de cas reste disponible pour les séances multi-cas, en synchrone ou en asynchrone, y compris après leur fin.

La synthèse contient uniquement quatre histogrammes :

1. **Impression clinique** : les choix principaux des étudiants et des experts.
2. **Impression clinique alternative** : les choix alternatifs des deux groupes.
3. **Données cliniques de l’impression** : les données choisies pour l’impression principale sélectionnée.
4. **Données cliniques de l’alternative** : les données choisies pour l’impression alternative sélectionnée.

Les deux derniers histogrammes ont chacun leur propre liste d’impressions. Ils utilisent le même rôle pour les étudiants et les experts. Par défaut, l’impression la plus choisie du groupe est sélectionnée, sans imposer la sélection de l’autre graphique.

Les barres comparent les fréquences sur une échelle commune de 0 à 100 %. Les étudiants sont toujours en bleu et les experts en vert. Les effectifs figurent dans la légende et les valeurs sont écrites à côté des barres. Les impressions et les données restent dans l’ordre du cas.

Seules les réponses soumises sont utilisées. La synthèse ne présente pas le nombre de participants inscrits, les copies non soumises, les réponses individuelles ou les noms. Pour une donnée clinique, les choix + et − comptent chacun comme une sélection, sans pondération par les points experts. Un étudiant ne compte qu’une fois par donnée.

Pour les impressions, la base est l’ensemble des soumissions du groupe. Pour les données, la base est l’effectif ayant choisi le diagnostic dans le rôle considéré. Une base nulle est affichée par un tiret, plutôt qu’un pourcentage inventé ou une fraction 0/0. Il n’y a pas de tri par écart, de recherche ou de détail des signes dans cette vue.

Le cas et le panel sont ceux enregistrés pour la collecte. Le barème, les choix originaux et les notes restent conservés. Aucune migration Supabase, dépendance supplémentaire ou variable d’environnement n’est nécessaire.

L’accès reste réservé au professeur autorisé. Le bilan ne renvoie aucun nom ni identifiant participant et n’est pas ajouté aux parcours étudiants ou à la projection. Les histogrammes ouverts s’actualisent pendant la collecte ; les cas sont toujours chargés séparément.

## Une présentation commune en séance et dans le rapport

Les graphiques de l’écran étudiant, de la projection et du rapport utilisent les mêmes composants, couleurs, effectifs et échelles. La comparaison conserve les barres **Étudiants** et **Experts**.

Pendant la séance, chaque graphique d’impressions affiche uniquement les diagnostics retenus par au moins un expert dans le rôle correspondant. Le professeur ouvre les données cliniques une impression à la fois ; les fréquences de ces données restent absentes des réponses publiques tant que le corrigé correspondant n’a pas été révélé. Une impression sans aucun expert, dans les deux rôles, ne peut pas être ouverte comme corrigé. Les anciennes révélations ne peuvent pas contourner ce filtre.

Le tableau personnel de correction reste disponible pour expliquer à l’étudiant ses points. Les graphiques collectifs ne transmettent aucun nom, aucune copie individuelle et aucune note personnelle. En asynchrone, les protections existantes restent conservées : le corrigé personnel n’ouvre pas l’accès aux choix des autres étudiants.

Dans le rapport privé, le filtre expert est appliqué par défaut. Lorsque des étudiants ont retenu d’autres impressions, **Afficher tous les choix des étudiants** permet de les ajouter aux mêmes histogrammes. Les choix absents du panel restent conservés dans les réponses et le rapport ; ils ne créent pas un corrigé expert. Les diagnostics non choisis par les deux groupes ne sont pas ajoutés pour remplir le graphique.
