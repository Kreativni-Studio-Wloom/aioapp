// Built-in program templates. Exercises reference built-in exercise names (see exercise-data.ts).

export type TemplateExercise = { name: string; sets: number; repMin: number; repMax: number; restSeconds?: number; incrementKg?: number };
export type ProgramTemplate = {
  key: string;
  name: string;
  description: string;
  days: { name: string; weekday?: number; exercises: TemplateExercise[] }[];
};

const x = (name: string, sets: number, repMin: number, repMax: number, restSeconds?: number, incrementKg?: number): TemplateExercise => ({
  name,
  sets,
  repMin,
  repMax,
  restSeconds,
  incrementKg,
});

export const PROGRAM_TEMPLATES: ProgramTemplate[] = [
  {
    key: "ppl",
    name: "Push / Pull / Legs",
    description: "6 dní v týdnu (nebo 3× rotace). Klasický split na objem a sílu.",
    days: [
      {
        name: "Push",
        weekday: 1,
        exercises: [
          x("Bench press", 4, 5, 8, 180),
          x("Tlak s jednoručkami vsedě", 3, 8, 12, 120, 2),
          x("Šikmý tlak s jednoručkami", 3, 8, 12, 120, 2),
          x("Upažování s jednoručkami", 3, 12, 20, 60, 1),
          x("Stahování kladky lanem", 3, 10, 15, 60, 2.5),
        ],
      },
      {
        name: "Pull",
        weekday: 2,
        exercises: [
          x("Shyby", 4, 6, 10, 150),
          x("Přítahy velké činky v předklonu", 3, 6, 10, 150),
          x("Přítahy spodní kladky vsedě", 3, 10, 12, 90),
          x("Face pull", 3, 12, 20, 60),
          x("Bicepsový zdvih s jednoručkami", 3, 8, 12, 60, 1),
        ],
      },
      {
        name: "Legs",
        weekday: 3,
        exercises: [
          x("Dřep s činkou", 4, 5, 8, 180, 5),
          x("Rumunský mrtvý tah", 3, 8, 10, 150, 5),
          x("Leg press", 3, 10, 15, 120, 10),
          x("Zakopávání vleže", 3, 10, 15, 60),
          x("Výpony vestoje", 4, 10, 15, 60, 5),
        ],
      },
    ],
  },
  {
    key: "upper-lower",
    name: "Upper / Lower",
    description: "4 dny v týdnu: dvakrát horní a dvakrát dolní polovina těla.",
    days: [
      {
        name: "Horní A",
        weekday: 1,
        exercises: [
          x("Bench press", 4, 5, 8, 180),
          x("Přítahy velké činky v předklonu", 4, 6, 10, 150),
          x("Tlak s jednoručkami vsedě", 3, 8, 12, 120, 2),
          x("Stahování horní kladky", 3, 10, 12, 90),
          x("Bicepsový zdvih s EZ činkou", 2, 10, 12, 60),
          x("Stahování kladky na triceps", 2, 10, 15, 60),
        ],
      },
      {
        name: "Dolní A",
        weekday: 2,
        exercises: [
          x("Dřep s činkou", 4, 5, 8, 180, 5),
          x("Rumunský mrtvý tah", 3, 8, 10, 150, 5),
          x("Bulharský dřep", 3, 8, 12, 90, 2),
          x("Zakopávání vsedě", 3, 10, 15, 60),
          x("Výpony vsedě", 3, 12, 20, 60),
        ],
      },
      {
        name: "Horní B",
        weekday: 4,
        exercises: [
          x("Tlak nad hlavu (OHP)", 4, 5, 8, 180),
          x("Shyby", 4, 6, 10, 150),
          x("Šikmý tlak s jednoručkami", 3, 8, 12, 120, 2),
          x("Přítah jednoručky v předklonu", 3, 8, 12, 90, 2),
          x("Upažování s jednoručkami", 3, 12, 20, 60, 1),
          x("Kladiva", 2, 10, 12, 60, 1),
        ],
      },
      {
        name: "Dolní B",
        weekday: 5,
        exercises: [
          x("Mrtvý tah", 3, 3, 6, 210, 5),
          x("Leg press", 3, 10, 15, 120, 10),
          x("Hip thrust", 3, 8, 12, 90, 5),
          x("Předkopávání", 3, 12, 15, 60),
          x("Zvedání nohou ve visu", 3, 10, 15, 60),
        ],
      },
    ],
  },
  {
    key: "fullbody",
    name: "Full body 3×",
    description: "3 dny v týdnu, celé tělo. Ideální pro začátečníky a málo času.",
    days: [
      {
        name: "Full body A",
        weekday: 1,
        exercises: [
          x("Dřep s činkou", 3, 5, 8, 180, 5),
          x("Bench press", 3, 5, 8, 180),
          x("Přítahy velké činky v předklonu", 3, 8, 10, 120),
          x("Upažování s jednoručkami", 2, 12, 20, 60, 1),
          x("Plank", 2, 30, 60, 60, 0),
        ],
      },
      {
        name: "Full body B",
        weekday: 3,
        exercises: [
          x("Mrtvý tah", 3, 3, 6, 210, 5),
          x("Tlak nad hlavu (OHP)", 3, 5, 8, 150),
          x("Shyby", 3, 6, 10, 120),
          x("Výpady s jednoručkami", 2, 10, 12, 90, 2),
          x("Bicepsový zdvih s jednoručkami", 2, 10, 12, 60, 1),
        ],
      },
      {
        name: "Full body C",
        weekday: 5,
        exercises: [
          x("Přední dřep", 3, 6, 8, 150, 5),
          x("Šikmý tlak s jednoručkami", 3, 8, 12, 120, 2),
          x("Přítahy spodní kladky vsedě", 3, 10, 12, 90),
          x("Hip thrust", 3, 8, 12, 90, 5),
          x("Stahování kladky lanem", 2, 10, 15, 60),
        ],
      },
    ],
  },
];
