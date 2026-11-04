# Finition visuelle de l’application

La palette bleu marine et vert, les messages d’accueil et les règles des séances sont conservés. Cette passe porte sur la présentation commune aux professeurs, experts et étudiants.

1. **Actions** : boutons principaux plus affirmés, actions secondaires avec contour. Les listes de séances et de PRC utilisent des actions secondaires ; la création reste mise en avant. La génération et la validation du corrigé sont mises en avant selon l’étape disponible. Les boutons, liens, permissions et confirmations conservent leurs actions.
2. **Sections** : bordures plus légères, espacement plus régulier, moins de cadres imbriqués. Les alertes de validation et de conflit restent identifiables. L’accueil, la reprise et la prochaine étape conservent leurs repères visuels.
3. **Tableaux** : catégories secondaires lisibles, lignes alternées discrètes, repère latéral sur les données retenues et signe sélectionné accompagné d’une coche. La sélection ne représente pas une validation clinique. Le questionnaire, les aperçus et les tableaux de correction partagent ces styles.
4. **Typographie** : textes courants de l’application autour de 16 px, libellés de formulaires à 14 px, champs et listes de choix à 16 px. Les titres gardent leur identité éditoriale ; les titres opérationnels sont plus sobres. Les contrôles tactiles conservent une hauteur confortable.
5. **Statuts** : badge commun avec icône, texte français et couleur. Une collecte en salle d’attente affiche « En attente », puis « Présentation » et « Réponses ouvertes » selon sa phase. Une copie transmise affiche « Transmis » ; un résultat publié affiche « Terminé ». Ces badges affichent les états existants sans les modifier.
6. **Bilans** : la note publiée et son maximum apparaissent en tête du résultat du cas. Deux sections distinguent les impressions cliniques, leurs points et leurs justifications. Le bilan cumulé reprend le même contraste bleu marine. Les résultats partiels gardent leur dénominateur propre ; les copies non transmises ne deviennent pas des zéros.

Le composant de bilan utilise la note, le pourcentage et les plafonds déjà fournis. Le barème, les calculs serveur, les modalités synchrone et asynchrone et les conditions de publication restent identiques. Les anciennes notes sur 20 et les maxima personnalisés sont conservés.

Aucune migration, variable d’environnement ni dépendance supplémentaire. Les vérifications navigateur couvrent les parcours existants, les petits écrans de 320 et 390 pixels, les notes nulles et les maxima décimaux, ainsi que la conservation des sélections et importances expertes.
