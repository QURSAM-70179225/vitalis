/**
 * Official NASA Space Apps Challenge 2026 resources for this challenge, and how
 * each one shaped VITALIS. Shown on the About & Sources page and in the README.
 */
export interface Resource {
  id: 'hrp-hazards' | 'hrp-risks' | 'hrp-research' | 'csa-radiation' | 'csa-science';
  org: 'NASA' | 'CSA';
  title: string;
  url: string;
  summary: string;
  usedFor: string[];
  /** Where to see it in the app (hash route). */
  route?: string;
}

export const RESOURCES: Resource[] = [
  {
    id: 'hrp-hazards',
    org: 'NASA',
    title: '5 Hazards of Human Spaceflight',
    url: 'https://www.nasa.gov/hrp/hazards/',
    summary: "NASA Human Research Program's five hazards: radiation, isolation & confinement, distance from Earth, gravity fields, hostile/closed environments.",
    usedFor: [
      'Every measurement, alert, guidance card and body system is tagged with its hazard(s) and icon',
      'Hazard status strip on the dashboard; hazard overview on the start page',
      '"Distance from Earth" drives the core idea: comm-delay-aware escalation (act now, don\'t wait for the ground)',
    ],
    route: 'dashboard',
  },
  {
    id: 'hrp-risks',
    org: 'NASA',
    title: 'Risks of Human Spaceflight',
    url: 'https://www.nasa.gov/hrp/risks/',
    summary: 'The specific health and performance risks NASA studies for long missions.',
    usedFor: [
      'Each body system is mapped to its HRP risk: SANS, cardiovascular adaptation, early-onset osteoporosis, muscle loss, behavioral health, altered immune response, nutrition, renal stones, celestial dust',
      'Combination rules target these risks (SANS cluster, bone-loss proxy, behavioral pattern, kidney-stone risk)',
    ],
    route: 'system/sans',
  },
  {
    id: 'hrp-research',
    org: 'NASA',
    title: 'Ongoing HRP Research in Space',
    url: 'https://www.nasa.gov/hrp/ongoing-hrp-research/',
    summary: 'Current NASA research on keeping crews healthy and performing in space.',
    usedFor: [
      'Countermeasure guides follow this research area: resistive + aerobic exercise for bone and muscle, lighting for sleep, CO₂ and headaches, SANS eye checks',
      'Reaction-time (PVT) testing and personal baselines mirror how in-flight studies track crew health over time',
    ],
    route: 'guidance',
  },
  {
    id: 'csa-radiation',
    org: 'CSA',
    title: 'Monitoring Radiation for Astronaut Health',
    url: 'https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp',
    summary: 'How the Canadian Space Agency helps measure space radiation to protect astronauts on long-duration missions.',
    usedFor: [
      'Daily personal-dosimeter reading in every check-in, with limits scaled to the mission location (ISS vs Moon vs Mars)',
      'Live dose-rate channel from sensors with instant alarms',
      'Solar particle event detection → storm-shelter checklist',
      'Radiation exposure panel: today\'s dose and mission total vs the NASA 600 mSv career limit',
    ],
    route: 'guidance/radiation-shelter',
  },
  {
    id: 'csa-science',
    org: 'CSA',
    title: 'Why Do We Conduct Science Experiments in Space?',
    url: 'https://www.asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp',
    summary: 'Research in space advances human health and technology, and its discoveries improve life on Earth.',
    usedFor: [
      '"Benefits on Earth": the same offline, explainable self-triage serves people far from a doctor (see below)',
    ],
  },
];

/** Earth applications of the same design: offline-first, explainable, delay-aware self-monitoring. */
export const EARTH_BENEFITS: { title: string; body: string }[] = [
  { title: 'Remote & rural healthcare', body: 'Patients far from a clinic get clear status, a plain-language "why" and next steps, even without a connection.' },
  { title: 'Polar & research stations', body: 'Antarctic winter-over crews face isolation and delayed evacuation, the same problem as a Mars crew.' },
  { title: 'Ships, submarines & offshore', body: 'Small crews with no doctor on board and intermittent satellite links.' },
  { title: 'Disaster response', body: 'Works offline when networks are down; syncs to coordinators when a link returns.' },
  { title: 'Home monitoring', body: 'Personal baselines catch "normal on paper, abnormal for you" changes in chronic conditions.' },
];

export const DISCLAIMER_ENDORSEMENT =
  'VITALIS was built for the NASA Space Apps Challenge 2026 using publicly available NASA and CSA resources. It is not endorsed by NASA, the CSA or any space agency, and neither is responsible for its content.';

export const resourceById = (id: Resource['id']): Resource => RESOURCES.find((r) => r.id === id)!;
