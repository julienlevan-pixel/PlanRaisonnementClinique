/** Public, fictitious clinical case. It contains no expert answers or scores. */
export const DEMO_LABEL = "Démonstration — données fictives";
export const DEMO_FIXTURE_VERSION = "toux-v1";

const observation = (number: number, text: string, category: string) => ({
  id: `20000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
  text,
  category,
  position: number - 1,
});

export const demoCase = {
  name: "Toux",
  demonstrationLabel: DEMO_LABEL,
  scenario:
    "Démonstration — données fictives. Une femme de 55 ans consulte à la pharmacie pour une toux sèche persistante depuis huit semaines. Elle souhaite savoir si un médicament peut en être responsable et quels éléments justifient les différentes hypothèses. Les observations ci-dessous décrivent un seul cas fictif ; cet exercice ne remplace pas une évaluation clinique.",
  instructions:
    "Choisissez deux diagnostics distincts : une hypothèse principale et une alternative. Pour chacune, retenez les observations qui la favorisent (+) ou la rendent moins probable (−). Le panel sélectionne exactement cinq données par hypothèse ; les étudiants en sélectionnent de une à cinq. Les réponses de cet exemple et les participants sont fictifs.",
  diagnostics: [
    { id: "10000000-0000-4000-8000-000000000001", label: "Toux associée à un inhibiteur de l’enzyme de conversion" },
    { id: "10000000-0000-4000-8000-000000000002", label: "Syndrome de toux des voies aériennes supérieures (rhinite)" },
    { id: "10000000-0000-4000-8000-000000000003", label: "Reflux gastro-œsophagien" },
    { id: "10000000-0000-4000-8000-000000000004", label: "Asthme à prédominance de toux" },
    { id: "10000000-0000-4000-8000-000000000005", label: "Pneumonie infectieuse" },
  ],
  observations: [
    observation(1, "Toux sèche persistante depuis huit semaines.", "Symptômes"),
    observation(2, "Ramipril commencé trois mois auparavant pour une hypertension.", "Médicaments"),
    observation(3, "La toux a débuté environ trois semaines après le début du ramipril.", "Chronologie"),
    observation(4, "Aucune fièvre ni frissons rapportés.", "Symptômes"),
    observation(5, "Auscultation pulmonaire sans râles ni sibilances lors de la consultation médicale.", "Examen"),
    observation(6, "Radiographie pulmonaire récente sans anomalie aiguë.", "Examens"),
    observation(7, "Patiente non fumeuse, sans exposition professionnelle respiratoire connue.", "Antécédents"),
    observation(8, "Rhinorrhée claire et éternuements plus marqués au printemps.", "Symptômes"),
    observation(9, "Sensation occasionnelle d’écoulement dans l’arrière-gorge.", "Symptômes"),
    observation(10, "Raclements de gorge fréquents pendant la journée.", "Symptômes"),
    observation(11, "Pyrosis après certains repas, environ deux fois par semaine.", "Symptômes"),
    observation(12, "Toux parfois majorée après un repas et en position couchée.", "Déclencheurs"),
    observation(13, "Épisodes de toux nocturne, sans réveil par suffocation.", "Chronologie"),
    observation(14, "Pas de dyspnée à l’effort habituel ni de limitation nouvelle des activités.", "Symptômes"),
    observation(15, "Aucun sifflement respiratoire perçu par la patiente.", "Symptômes"),
    observation(16, "Antécédent de rhinite allergique, sans diagnostic antérieur d’asthme.", "Antécédents"),
    observation(17, "Température mesurée à 36,7 °C et saturation à 98 % à l’air ambiant.", "Examen"),
    observation(18, "Absence d’hémoptysie et de perte de poids involontaire.", "Signes associés"),
    observation(19, "Pas de toux chronique avant l’introduction du ramipril.", "Chronologie"),
    observation(20, "Un bref essai de bronchodilatateur prescrit n’a pas apporté d’amélioration nette.", "Réponse au traitement"),
  ],
};

export type DemoCase = typeof demoCase;
