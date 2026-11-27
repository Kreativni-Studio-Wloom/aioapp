/**
 * Motion definitions for the exercise library. Built-in exercises are matched by name; anything else (custom
 * exercises) falls back to a template picked by movement pattern + equipment, so every exercise gets an animation.
 */
import type { Equipment } from "@/db/schema";
import { G, add, at, dir, type Joints, type Limb, type Pose, type Prop, type Shape, type Spec, type V } from "./engine";

/* ── props ────────────────────────────────────────────── */

type JK = "hand" | "hand2" | "grip" | "ankle" | "knee" | "hip" | "sh";

const ring = (c: V, r: number, z = 2): Shape[] => [
  { k: "c", c, r, tone: "eq", fill: "card", w: 2.5, z },
  { k: "c", c, r: 1.8, tone: "eq", fill: "eq", z },
];
/** Barbell seen from the side: a plate at the grip. */
const plate =
  (key: JK = "hand", r = 10): Prop =>
  (j) =>
    ring(j[key], r);
/** Plate at a point derived from the joints (bar on the back, across the hips…). */
const plateFn =
  (fn: (j: Joints) => V, r = 10): Prop =>
  (j) =>
    ring(fn(j), r);
const db =
  (key: JK = "hand"): Prop =>
  (j) => [{ k: "c", c: j[key], r: 4.6, tone: "eq", fill: "eq", z: 4 }];
const dbs: Prop = (j) => [...db("hand2")(j).map((s) => ({ ...s, z: 0.9 })), ...db("hand")(j)];
/** Dumbbell seen from the front (horizontal). */
const dbH =
  (key: JK = "hand"): Prop =>
  (j) => [{ k: "l", a: add(j[key], [-7, 0]), b: add(j[key], [7, 0]), w: 5, tone: "eq", z: 4 }];
const dbsH: Prop = (j) => [...dbH("hand")(j), ...dbH("hand2")(j)];
const kb: Prop = (j) => {
  const c = add(j.hand, [0, 7.5]);
  return [
    { k: "c", c: add(j.hand, [0, 2.5]), r: 3, tone: "eq", w: 2, z: 4 },
    { k: "c", c, r: 5.5, tone: "eq", fill: "eq", z: 4 },
  ];
};
const cable =
  (anchor: V, key: JK = "hand"): Prop =>
  (j) => [
    { k: "l", a: anchor, b: j[key], w: 1.2, tone: "eq", z: 0.5 },
    { k: "c", c: anchor, r: 3, tone: "eq", fill: "card", w: 2, z: 0.6 },
  ];
const cables =
  (a1: V, a2: V): Prop =>
  (j) => [...cable(a1, "hand")(j), ...cable(a2, "hand2")(j)];
/** Short handle/bar through the hand. */
const handle =
  (key: JK = "hand", w = 8): Prop =>
  (j) => [{ k: "l", a: add(j[key], [0, -w / 2]), b: add(j[key], [0, w / 2]), w: 2.5, tone: "eq", z: 4 }];
/** Bar seen from the front: line between the hands with plates at the ends. */
const frontBar =
  (half = 40): Prop =>
  (j) => {
    const y = (j.hand[1] + j.hand2[1]) / 2;
    const cx = (j.hand[0] + j.hand2[0]) / 2;
    return [
      { k: "l", a: [cx - half - 4, y], b: [cx + half + 4, y], w: 2.5, tone: "eq", z: 4 },
      { k: "l", a: [cx - half, y - 10], b: [cx - half, y + 10], w: 5, tone: "eq", z: 4 },
      { k: "l", a: [cx + half, y - 10], b: [cx + half, y + 10], w: 5, tone: "eq", z: 4 },
    ];
  };
const pad =
  (fn: (j: Joints) => [V, V]): Prop =>
  (j) => {
    const [a, b] = fn(j);
    return [{ k: "l", a, b, w: 5, tone: "eq", z: 2.5 }];
  };
const roller =
  (fn: (j: Joints) => V, r = 3.5): Prop =>
  (j) => [{ k: "c", c: fn(j), r, tone: "eq", fill: "eq", z: 4 }];

/* ── environment ──────────────────────────────────────── */

const env = (a: V, b: V, w = 5): Shape => ({ k: "l", a, b, w, tone: "env", z: 0 });
/** Flat bench: pad from x1 to x2 with its top at y. */
const bench = (x1: number, x2: number, y: number): Shape[] => [
  env([x1, y + 2.5], [x2, y + 2.5]),
  env([x1 + 6, y + 5], [x1 + 6, G], 2.5),
  env([x2 - 6, y + 5], [x2 - 6, G], 2.5),
];
const post = (x: number, y1: number, y2 = G, w = 3): Shape => env([x, y1], [x, y2], w);
const bar = (c: V): Shape[] => [{ k: "c", c, r: 2.2, tone: "env", fill: "env", z: 0 }, env([c[0] - 10, c[1]], [c[0] + 10, c[1]], 2)];
const box = (x1: number, x2: number, y: number): Shape => ({ k: "p", d: `M${x1} ${y}L${x2} ${y}L${x2} ${G}L${x1} ${G}Z`, tone: "env", fill: "card", w: 2.5, z: 0 });

/* ── pose helpers ─────────────────────────────────────── */

const STAND: Pose = { hip: [78, 64.5], t: 0, arm: { a: [180, 180] }, leg: { to: [80, 109] } };
const stand = (o: Partial<Pose> = {}): Pose => ({ ...STAND, ...o });
const spec = (keys: Pose[], props: Prop[] = [], envShapes: Shape[] = [], extra: Partial<Spec> = {}): Spec => ({ keys, props, env: envShapes, ...extra });

type Imp = "barbell" | "dumbbell" | "kettlebell";
const imp = (i: Imp, both = true): Prop[] => (i === "barbell" ? [plate()] : i === "kettlebell" ? [kb] : both ? [dbs] : [db()]);

/* ── templates ────────────────────────────────────────── */

// lying on a flat bench, head to the left
const LIE: Pose = { hip: [96, 80], t: -90, arm: { a: [0, 0] }, leg: { to: [120, 109] } };
const lie = (o: Partial<Pose>): Pose => ({ ...LIE, ...o });
const flatBench = bench(46, 108, 85);

const benchPress = (i: Imp, smith = false): Spec =>
  spec(
    [lie({ arm: { to: [70, 48] } }), lie({ arm: { to: smith ? [71, 70] : [82, 70] } })],
    i === "barbell" ? [plate()] : [dbs],
    [...flatBench, ...(smith ? [post(58, 14), post(84, 14)] : [])],
  );

// incline bench (back ~35° from vertical-ish)
const INC: Pose = { hip: [92, 82], t: -55, arm: { a: [0, 0] }, leg: { to: [118, 109] } };
const inc = (o: Partial<Pose>): Pose => ({ ...INC, ...o });
const inclineBench: Shape[] = [env([84, 87.5], [104, 87.5]), env(add([92, 82], dir(-55 + 180 + 90, -6)), add(at([92, 82], -55, 34), dir(-55 - 90, 6))), post(96, 90, G, 2.5), post(72, 74, G, 2.5)];
const inclinePress = (i: Imp): Spec => spec([inc({ arm: { to: [67, 34] } }), inc({ arm: { to: [80, 60] } })], i === "barbell" ? [plate()] : [dbs], inclineBench);

// seated upright on a machine seat, facing right
const SEAT: Pose = { hip: [68, 84], t: -4, arm: { a: [180, 180] }, leg: { to: [94, 109] } };
const seat = (o: Partial<Pose>): Pose => ({ ...SEAT, ...o });
const machineSeat: Shape[] = [env([56, 89], [84, 89]), env([58, 82], [56, 46]), post(70, 92, G, 3)];

const pushUp = spec(
  [
    { hip: [66, 83], t: 75, arm: { to: [94, 109] }, leg: { to: [24, 104] }, foot: 175 },
    { hip: [68, 96], t: 83, arm: { to: [94, 109] }, leg: { to: [24, 104] }, foot: 175 },
  ],
  [],
  [],
);

const dips = spec(
  [
    { hip: [75, 54], t: 10, arm: { to: [82, 60] }, leg: { a: [178, 230] } },
    { hip: [69, 70], t: 22, arm: { to: [82, 60] }, leg: { a: [175, 235] } },
  ],
  [],
  [env([56, 61], [112, 61], 3), post(60, 61), post(108, 61)],
);

// front view, standing
const FSTAND: Pose = { hip: [80, 64.5], t: 0, arm: { a: [172, 178] }, leg: { a: [178, 180] } };
const fstand = (o: Partial<Pose>): Pose => ({ ...FSTAND, ...o });
// front view, seated
const FSEAT: Pose = { hip: [80, 84], t: 0, arm: { a: [172, 178] }, leg: { a: [140, 180], k: [0.3, 1] } };
const fseat = (o: Partial<Pose>): Pose => ({ ...FSEAT, ...o });
const fBench: Shape[] = [env([64, 89], [96, 89]), { k: "p", d: "M71 86L71 46L89 46L89 86", tone: "env", w: 3, z: 0 }];
const front = (keys: Pose[], props: Prop[] = [], envShapes: Shape[] = [], extra: Partial<Spec> = {}): Spec => ({ view: "front", keys, props, env: envShapes, ...extra });

const flyLying = spec([lie({ arm: { a: [2, 2] } }), lie({ arm: { a: [2, 2], k: -0.05 } })], [dbs], flatBench);
const pecDeck = front([fseat({ arm: { a: [92, 92] } }), fseat({ arm: { a: [92, 92], k: 0.28 } })], [handle(), handle("hand2")], [...fBench, post(130, 20), post(30, 20)]);
const reversePecDeck = front([fseat({ arm: { a: [92, 92], k: 0.28 } }), fseat({ arm: { a: [92, 92] } })], [handle(), handle("hand2")], [...fBench, post(130, 20), post(30, 20)]);
const crossover = front([fstand({ arm: { a: [108, 108] } }), fstand({ arm: { a: [202, 202], k: 0.75 } })], [cables([150, 18], [10, 18])], [post(150, 18), post(10, 18)]);

const ohp = spec([stand({ t: -3, arm: { to: [87, 36] } }), stand({ arm: { to: [79, 4] } })], [plate()]);
const dbPressSeated = front([fseat({ arm: { a: [100, 0] } }), fseat({ arm: { a: [8, -4] } })], [dbsH], fBench);
const arnold = front([fseat({ arm: { a: [172, 2], k: [0.45, 1] } }), fseat({ arm: { a: [8, -4] } })], [dbsH], fBench);
const machineShoulder = spec([seat({ arm: { to: [80, 50] } }), seat({ arm: { to: [76, 25] } })], [handle()], [...machineSeat, post(46, 14, G, 4)]);
const landmine = spec(
  [stand({ t: 8, arm: { to: [88, 40] }, leg: { to: [64, 109] }, leg2: { to: [94, 109] } }), stand({ t: 12, arm: { to: [108, 16] }, leg: { to: [64, 109] }, leg2: { to: [94, 109] } })],
  [(j) => [{ k: "l", a: [16, G - 2], b: at(j.hand, 54, 8), w: 3, tone: "eq", z: 2 }], plateFn((j) => at(j.hand, 54, 6), 8)],
);

const lateral = front([fstand({}), fstand({ arm: { a: [96, 98] } })], [db(), db("hand2")]);
const cableLateral = front(
  [fstand({ arm: { a: [196, 190], k: 0.9 }, arm2: { a: [168, 172] } }), fstand({ arm: { a: [96, 98] }, arm2: { a: [168, 172] } })],
  [cable([18, 106])],
  [post(18, 20)],
);
const machineLateral = front([fseat({ arm: { a: [176, 178] } }), fseat({ arm: { a: [96, 98] } })], [roller((j) => j.elbow, 3.5), roller((j) => j.elbow2, 3.5)], fBench);
const frontRaise = spec([stand({ arm: { a: [178, 176] } }), stand({ arm: { a: [92, 90] } })], [dbs]);

const HINGE: Pose = { hip: [70, 67], t: 70, arm: { a: [180, 180] }, leg: { to: [82, 109] } };
const hinge = (o: Partial<Pose>): Pose => ({ ...HINGE, ...o });
const rearDelt = spec([hinge({}), hinge({ arm: { a: [176, 178], k: 0.18 } })], [dbs]);
const facePull = spec(
  [stand({ t: -6, arm: { a: [82, 82] }, leg: { to: [70, 109] }, leg2: { to: [90, 109] } }), stand({ t: -8, arm: { to: [86, 27], bend: -1 }, leg: { to: [70, 109] }, leg2: { to: [90, 109] } })],
  [cable([134, 28]), handle()],
  [post(134, 10)],
);
const uprightRow = spec([stand({ arm: { to: [84, 68] } }), stand({ arm: { to: [87, 32], bend: -1 } })], [plate()]);

const pullUpFront = front(
  [fstand({ hip: [80, 72], arm: { to: [97, 14] }, leg: { a: [178, 180], k: [0.9, 0.7] } }), fstand({ hip: [80, 47], arm: { to: [97, 14] }, leg: { a: [178, 180], k: [0.9, 0.7] } })],
  [],
  [env([52, 13], [108, 13], 3), post(52, 13, 4, 3), post(108, 13, 4, 3)],
  { ground: false },
);
const HANG = (hip: V, shoulderT = 2): Pose => ({ hip, t: shoulderT, arm: { to: [83, 14] }, leg: { a: [182, 222] } });
const chinUp = spec([HANG([79, 74]), HANG([75, 50], 6)], [], bar([83, 14]), { ground: false });
const assistedPull = spec(
  [{ ...HANG([79, 74]), leg: { a: [180, 270] } }, { ...HANG([75, 50], 6), leg: { a: [180, 270] } }],
  [pad((j) => [add(j.knee, [-18, 5]), add(j.knee, [4, 5])])],
  bar([83, 14]),
  { ground: false },
);
const pulldownFront = (cableBar: boolean): Spec =>
  front(
    [fseat({ arm: { to: [100, 24] } }), fseat({ arm: { to: [104, 54] } })],
    cableBar ? [frontBar(24), (j) => [{ k: "l", a: [80, 4], b: [80, (j.hand[1] + j.hand2[1]) / 2], w: 1.2, tone: "eq", z: 0.5 }]] : [handle(), handle("hand2")],
    [...fBench.slice(0, 1), env([64, 80], [96, 80], 4)],
  );
const pulldownClose = spec([seat({ arm: { to: [90, 22] } }), seat({ arm: { to: [86, 54] } })], [cable([90, 4]), handle()], [...machineSeat.slice(0, 1), env([84, 76], [96, 76], 4)]);

const ROW: Pose = { hip: [66, 67], t: 68, arm: { to: [90, 84] }, leg: { to: [82, 109] } };
const barbellRow = spec([ROW, { ...ROW, arm: { to: [79, 66] } }], [plate()]);
const dbRowOne = spec(
  [
    { hip: [62, 64], t: 80, arm: { to: [91, 92] }, arm2: { to: [112, 86] }, leg: { to: [56, 109] }, leg2: { to: [80, 109] } },
    { hip: [62, 64], t: 80, arm: { to: [78, 70] }, arm2: { to: [112, 86] }, leg: { to: [56, 109] }, leg2: { to: [80, 109] } },
  ],
  [db()],
  bench(100, 140, 86),
);
const cableRowSeated = spec(
  [
    { hip: [50, 92], t: 22, arm: { to: [92, 76] }, leg: { to: [96, 99] }, foot: 20 },
    { hip: [50, 92], t: -2, arm: { to: [64, 76] }, leg: { to: [96, 99] }, foot: 20 },
  ],
  [cable([116, 94]), handle()],
  [env([36, 97], [64, 97]), post(104, 88, 106, 4), post(116, 30)],
);
const tbarRow = spec([ROW, { ...ROW, arm: { to: [79, 66] } }], [(j) => [{ k: "l", a: [16, G - 2], b: add(j.hand, [8, 0]), w: 3, tone: "eq", z: 2 }], plateFn((j) => add(j.hand, [6, 2]), 9)]);
const machineRow = spec([seat({ hip: [58, 84], arm: { a: [88, 88] } }), seat({ hip: [58, 84], arm: { to: [70, 60] } })], [handle()], [env([46, 89], [74, 89]), env([82, 50], [82, 74], 4), post(112, 20)]);
const chestSupported = spec(
  [
    { hip: [58, 78], t: 52, arm: { to: [83, 94] }, leg: { to: [40, 109] } },
    { hip: [58, 78], t: 52, arm: { to: [72, 74] }, leg: { to: [40, 109] } },
  ],
  [dbs],
  [env(at([58, 78], 142, 7), at(at([58, 78], 142, 7), 52, 26)), post(66, 86, G, 2.5)],
);
const invertedRow = spec(
  [
    { hip: [96, 96], aim: [70, 90], arm: { to: [70, 58] }, leg: { to: [138, 106] }, foot: 20 },
    { hip: [95, 82], aim: [71, 68], arm: { to: [70, 58] }, leg: { to: [138, 106] }, foot: 20 },
  ],
  [],
  [...bar([70, 58]), post(70, 60, G, 2)],
);
const pendlay = spec(
  [
    { hip: [64, 70], t: 86, arm: { to: [92, 100] }, leg: { to: [82, 109] } },
    { hip: [64, 70], t: 84, arm: { to: [80, 75] }, leg: { to: [82, 109] } },
  ],
  [plate()],
);

const cablePullover = spec(
  [
    { hip: [70, 62], t: 28, arm: { a: [52, 56] }, leg: { to: [82, 109] } },
    { hip: [70, 62], t: 28, arm: { a: [166, 162] }, leg: { to: [82, 109] } },
  ],
  [cable([142, 10]), handle()],
  [post(142, 10)],
);
const dbPullover = spec([lie({ arm: { a: [-98, -100] } }), lie({ arm: { a: [-2, -2] } })], [db()], flatBench);
const shrug = front([fstand({ arm: { a: [176, 180] } }), fstand({ arm: { a: [176, 180] }, shrug: 6 })], [db(), db("hand2")]);
const hyperext = spec(
  [
    { hip: [78, 66], t: 165, arm: { a: [150, 20], rel: true }, leg: { to: [40, 92] } },
    { hip: [78, 66], t: 72, arm: { a: [150, 20], rel: true }, leg: { to: [40, 92] } },
  ],
  [],
  [env([70, 74], [90, 70], 5), env([38, 98], [44, 98], 5), env([80, 76], [64, G], 3), env([44, 100], [52, G], 3)],
);

const curl = (props: Prop[], envShapes: Shape[] = []): Spec => spec([stand({ arm: { a: [180, 172] } }), stand({ arm: { a: [176, 28] } })], props, envShapes);
const preacher = spec(
  [seat({ hip: [64, 86], t: 12, arm: { a: [138, 134] } }), seat({ hip: [64, 86], t: 12, arm: { a: [138, 14] } })],
  [plate()],
  [env([52, 91], [80, 91]), env([76, 66], [92, 82], 5), post(88, 84, G, 3)],
);
const inclineCurl = spec([inc({ arm: { a: [188, 182] } }), inc({ arm: { a: [188, 30] } })], [dbs], inclineBench);

const skull = spec([lie({ arm: { a: [-14, -112] } }), lie({ arm: { a: [-14, -12] } })], [plate()], flatBench);
const pushdown = (rope: boolean): Spec =>
  spec(
    [stand({ t: 8, arm: { a: [174, 40] } }), stand({ t: 8, arm: { a: [172, 176] } })],
    [cable([100, 6]), rope ? (j) => [{ k: "l", a: j.hand, b: add(j.hand, [-2, 6]), w: 2.5, tone: "eq", z: 4 }] : handle("hand", 6)],
    [post(100, 6)],
  );
const overheadCable = spec(
  [
    stand({ t: 25, arm: { a: [32, 206] }, leg: { to: [62, 109] }, leg2: { to: [92, 109] } }),
    stand({ t: 25, arm: { a: [36, 40] }, leg: { to: [62, 109] }, leg2: { to: [92, 109] } }),
  ],
  [cable([22, 30]), handle()],
  [post(22, 20)],
);
const dbOverhead = spec([seat({ arm: { a: [-4, 196] } }), seat({ arm: { a: [-2, 2] } })], [db()], [env([56, 89], [84, 89]), post(70, 92, G, 3)]);
const benchDips = spec(
  [
    { hip: [72, 77], t: -6, arm: { to: [63, 82] }, leg: { to: [118, 108] }, foot: 30 },
    { hip: [73, 96], t: -4, arm: { to: [63, 82] }, leg: { to: [118, 108] }, foot: 30 },
  ],
  [],
  bench(32, 66, 82),
);

const SQ_A: Pose = { hip: [78, 64], t: 0, arm: { r: [-4, 1] }, leg: { to: [82, 109] } };
const SQ_B: Pose = { hip: [64, 90], t: 40, arm: { r: [-4, 1] }, leg: { to: [82, 109] } };
const onBack = (j: Joints) => at(j.sh, j.t - 90, 5);
const onFront = (j: Joints) => add(at(j.sh, j.t + 90, 6), dir(j.t, 1));
const squat = spec([SQ_A, SQ_B], [plateFn(onBack)]);
const frontSquat = spec(
  [{ ...SQ_A, arm: { r: [6, 2], bend: -1 } }, { hip: [67, 92], t: 22, arm: { r: [6, 2], bend: -1 }, leg: { to: [82, 109] } }],
  [plateFn(onFront)],
);
const goblet = spec(
  [{ ...SQ_A, arm: { r: [7, -6] } }, { hip: [67, 92], t: 24, arm: { r: [7, -6] }, leg: { to: [82, 109] } }],
  [(j) => db()({ ...j, hand: at(at(j.sh, j.t + 90, 9), j.t, -6) })],
);
const smithSquat = spec(
  [
    { hip: [74, 65], t: 0, arm: { r: [-4, 1] }, leg: { to: [84, 109] } },
    { hip: [62, 88], t: 25, arm: { r: [-4, 1] }, leg: { to: [86, 109] } },
  ],
  [plateFn(onBack)],
  [post(62, 14), post(76, 14)],
);
const hack = spec(
  [
    { hip: [76, 66], t: -32, arm: { r: [4, 0] }, leg: { to: [102, 104] }, foot: 60 },
    { hip: [89, 85], t: -32, arm: { r: [4, 0] }, leg: { to: [102, 104] }, foot: 60 },
  ],
  [pad((j) => [at(j.hip, -32 - 90, 6), at(at(j.hip, -32 - 90, 6), -32, 30)]), roller((j) => at(j.sh, -32 + 90, -1), 3)],
  [env([96, 108], [114, 100], 4), env([50, 34], [100, 110], 2)],
);
const legPress = spec(
  [
    { hip: [58, 92], t: -58, arm: { a: [160, 120] }, leg: { to: [89, 61] }, foot: 30 },
    { hip: [58, 92], t: -58, arm: { a: [160, 120] }, leg: { to: [72, 76] }, foot: 30 },
  ],
  [(j) => [{ k: "l", a: at(j.toe, -45, 12), b: at(j.toe, 135, 12), w: 4, tone: "eq", z: 2.5 }]],
  [env(at([58, 92], -58 + 90, -7), at(at([58, 92], -58 + 90, -7), -58, 32)), env([50, 97], [70, 97]), env([64, 104], [140, 30], 2), post(60, 100, G, 3)],
);
const pendulum = hack;

const bulgarian = (i: Imp): Spec =>
  spec(
    [
      { hip: [70, 62], t: 5, arm: { a: [180, 180] }, leg: { to: [96, 109] }, leg2: { to: [40, 80] }, foot2: 250 },
      { hip: [68, 84], t: 16, arm: { a: [180, 180] }, leg: { to: [96, 109] }, leg2: { to: [40, 80] }, foot2: 250 },
    ],
    i === "barbell" ? [plateFn(onBack)] : [dbs],
    bench(22, 50, 82),
  );
const splitSquat = (i: Imp): Spec => {
  const arm: Limb = i === "barbell" ? { r: [-4, 1] } : { a: [180, 180] };
  return spec(
    [
      { hip: [79, 67], t: 3, arm, leg: { to: [101, 109] }, leg2: { to: [57, 107] }, foot2: 150 },
      { hip: [78, 87], t: 6, arm, leg: { to: [101, 109] }, leg2: { to: [57, 107] }, foot2: 150 },
    ],
    i === "barbell" ? [plateFn(onBack)] : [dbs],
  );
};
const stepUp = spec(
  [
    { hip: [76, 64], t: 10, arm: { a: [180, 180] }, leg: { to: [102, 79] }, leg2: { to: [74, 109] } },
    { hip: [100, 35], t: 2, arm: { a: [180, 180] }, leg: { to: [102, 79] }, leg2: { to: [94, 74] } },
  ],
  [dbs],
  [box(90, 126, 82)],
);
const legExt = spec(
  [seat({ arm: { to: [74, 90] }, leg: { a: [90, 178] } }), seat({ arm: { to: [74, 90] }, leg: { a: [90, 96] } })],
  [roller((j) => at(j.ankle, (j.t ?? 0) + 90, 0), 3.5)],
  machineSeat,
);

const DL_A: Pose = { hip: [64, 80], t: 60, arm: { to: [90, 99] }, leg: { to: [84, 109] } };
const DL_B: Pose = { hip: [78, 64], t: 0, arm: { to: [81, 69] }, leg: { to: [84, 109] } };
const deadlift = spec([DL_A, DL_B], [plate()]);
const RDL_B: Pose = { hip: [68, 67], t: 72, arm: { to: [94, 90] }, leg: { to: [84, 109] } };
const rdl = (i: Imp): Spec => spec([DL_B, RDL_B], imp(i));
const sumo = front(
  [
    { hip: [80, 84], tk: 0.78, t: 0, arm: { to: [86, 96] }, leg: { to: [106, 109] } },
    { hip: [80, 66], t: 0, arm: { to: [86, 72] }, leg: { to: [106, 109] } },
  ],
  [frontBar(42)],
);
const trapBar = spec([{ hip: [66, 84], t: 40, arm: { to: [84, 96] }, leg: { to: [84, 109] } }, DL_B], [plate()]);
const goodMorning = spec([SQ_A, { hip: [66, 66], t: 76, arm: { r: [-4, 1] }, leg: { to: [82, 109] } }], [plateFn(onBack)]);
const hipThrust = (machine: boolean): Spec =>
  spec(
    [
      { hip: [72, 98], aim: [48, 80], arm: { r: [7, -24] }, leg: { to: [100, 109] } },
      { hip: [76, 76], aim: [48, 78], arm: { r: [7, -24] }, leg: { to: [100, 109] } },
    ],
    machine ? [pad((j) => [at(j.hip, j.t + 90, 6), at(at(j.hip, j.t + 90, 6), j.t, -6)])] : [plateFn((j) => at(j.hip, j.t + 90, 8))],
    bench(16, 50, 82),
  );
const swing = spec(
  [
    { hip: [64, 64], t: 62, arm: { a: [200, 200] }, leg: { to: [82, 109] } },
    { hip: [78, 64], t: 0, arm: { a: [92, 92] }, leg: { to: [82, 109] } },
  ],
  [kb],
);

const legCurlLying = spec(
  [
    { hip: [62, 79], t: 90, arm: { a: [170, 170] }, leg: { a: [270, 270] } },
    { hip: [62, 79], t: 90, arm: { a: [170, 170] }, leg: { a: [270, 375] } },
  ],
  [roller((j) => at(j.ankle, 0, 0), 3.5)],
  [env([30, 85], [118, 85]), post(40, 88), post(110, 88)],
);
const legCurlSeated = spec(
  [seat({ arm: { to: [74, 88] }, leg: { a: [92, 108] } }), seat({ arm: { to: [74, 88] }, leg: { a: [92, 200] } })],
  [roller((j) => at(j.ankle, 0, 0), 3.5), pad((j) => [at(j.knee, 0, 5), at(at(j.knee, 0, 5), 270, 12)])],
  machineSeat,
);
const nordic = spec(
  [
    { hip: [70, 81], t: 0, arm: { a: [160, 120] }, leg: { to: [47, 106] } },
    { hip: [89.9, 92.5], t: 60, arm: { a: [140, 110] }, leg: { to: [47, 106] } },
  ],
  [],
  [env([42, 102], [50, 102], 4), env([58, 109], [80, 109], 4)],
);
const abduction = front(
  [fseat({ leg: { a: [160, 178], k: [0.3, 1] } }), fseat({ leg: { a: [108, 168], k: [0.55, 1] } })],
  [pad((j) => [add(j.knee, [4, -5]), add(j.knee, [4, 5])]), pad((j) => [add(j.knee2, [-4, -5]), add(j.knee2, [-4, 5])])],
  fBench,
);
const kickback = spec(
  [stand({ t: 14, arm: { a: [120, 120] }, leg: { a: [184, 182] }, leg2: { to: [82, 109] } }), stand({ t: 14, arm: { a: [120, 120] }, leg: { a: [222, 200] }, leg2: { to: [82, 109] } })],
  [cable([118, 106], "ankle")],
  [post(118, 30)],
);

const calfStand = spec(
  [stand({ hip: [78, 60.2], arm: { r: [-2, 2] }, leg: { to: [80, 105] }, foot: 92 }), stand({ hip: [78, 54.2], arm: { r: [-2, 2] }, leg: { to: [80, 99] }, foot: 125 })],
  [pad((j) => [at(j.sh, j.t - 90, 6), at(j.sh, j.t + 90, 6)])],
  [env([82, 109], [100, 109], 4), post(60, 30)],
);
const calfSeated = spec(
  [seat({ arm: { to: [88, 78] }, leg: { to: [92, 106] }, foot: 92 }), seat({ arm: { to: [88, 78] }, leg: { to: [92, 100] }, foot: 125 })],
  [pad((j) => [add(j.knee, [-6, -5]), add(j.knee, [6, -5])])],
  [env([56, 89], [84, 89]), post(70, 92, G, 3), env([94, 109], [110, 109], 4)],
);
const calfLegPress = spec(
  [
    { hip: [58, 92], t: -58, arm: { a: [160, 120] }, leg: { to: [88, 62] }, foot: 30 },
    { hip: [58, 92], t: -58, arm: { a: [160, 120] }, leg: { to: [91, 59] }, foot: 70 },
  ],
  [(j) => [{ k: "l", a: at(j.toe, -45, 12), b: at(j.toe, 135, 12), w: 4, tone: "eq", z: 2.5 }]],
  legPress.env,
);

const plank = spec(
  [
    { hip: [62, 96], t: 81, arm: { a: [180, 90] }, leg: { to: [20, 104] }, foot: 175 },
    { hip: [62, 94], t: 80, arm: { a: [180, 90] }, leg: { to: [20, 104] }, foot: 175 },
  ],
  [],
  [],
  { dur: 4200 },
);
const legRaise = spec(
  [
    { hip: [80, 66], t: 0, arm: { to: [81, 7] }, leg: { a: [178, 182] } },
    { hip: [80, 66], t: -6, arm: { to: [81, 7] }, leg: { a: [92, 94] } },
  ],
  [],
  bar([81, 7]),
  { ground: false },
);
const cableCrunch = spec(
  [
    { hip: [70, 82], t: 15, arm: { r: [5, 7] }, leg: { to: [44, 107] }, foot: 260 },
    { hip: [68, 82], t: 108, arm: { r: [5, 7] }, leg: { to: [44, 107] }, foot: 260 },
  ],
  [cable([96, 4]), handle()],
  [post(96, 4)],
);
const abWheel = spec(
  [
    { hip: [58, 82], t: 58, arm: { to: [84, 104] }, leg: { to: [36, 107] }, foot: 260 },
    { hip: [76, 92], t: 86, arm: { to: [124, 104] }, leg: { to: [36, 107] }, foot: 260 },
  ],
  [(j) => [{ k: "c", c: add(j.hand, [0, 2]), r: 5.5, tone: "eq", fill: "card", w: 2.5, z: 4 }]],
);
const pallof = spec([stand({ arm: { r: [8, -6] } }), stand({ arm: { a: [92, 90] } })], [cable([20, 50]), handle()], [post(20, 20)]);
const crunch = spec(
  [
    { hip: [88, 104], t: -90, arm: { r: [5, -8] }, leg: { to: [114, 108] } },
    { hip: [88, 104], t: -48, arm: { r: [5, -8] }, leg: { to: [114, 108] } },
  ],
  [],
  [],
);

const walkArm = { a: [172, 176] as [number, number] };
const farmer = spec(
  [
    { hip: [78, 66], t: 2, arm: walkArm, leg: { to: [96, 109] }, leg2: { to: [62, 108] } },
    { hip: [78, 64], t: 2, arm: walkArm, leg: { to: [80, 109] }, leg2: { to: [82, 100] } },
    { hip: [78, 66], t: 2, arm: walkArm, leg: { to: [62, 108] }, leg2: { to: [96, 109] } },
    { hip: [78, 64], t: 2, arm: walkArm, leg: { to: [82, 100] }, leg2: { to: [80, 109] } },
  ],
  [dbs],
  [],
  { dur: 2000 },
);
const wristCurl = spec(
  [
    { hip: [62, 84], t: 20, arm: { to: [104, 84] }, leg: { to: [90, 109] }, w: 150 },
    { hip: [62, 84], t: 20, arm: { to: [104, 84] }, leg: { to: [90, 109] }, w: 40 },
  ],
  [plate("grip", 7)],
  [env([48, 89], [76, 89]), post(62, 92, G, 3)],
);

/* ── library ──────────────────────────────────────────── */

export const ANIMATIONS: Record<string, Spec> = {
  "Bench press": benchPress("barbell"),
  "Bench press s jednoručkami": benchPress("dumbbell"),
  "Šikmý bench press": inclinePress("barbell"),
  "Šikmý tlak s jednoručkami": inclinePress("dumbbell"),
  "Bench press na multipressu": benchPress("barbell", true),
  "Tlak na hrudník na stroji": spec([seat({ arm: { to: [78, 58] } }), seat({ arm: { a: [88, 88] } })], [handle()], [...machineSeat, post(120, 30)]),
  Kliky: pushUp,
  "Kliky na bradlech": dips,
  "Úzký bench press": benchPress("barbell"),
  "Rozpažky s jednoručkami": flyLying,
  "Peck deck": pecDeck,
  "Křížení kladek": crossover,
  "Tlak nad hlavu (OHP)": ohp,
  "Tlak s jednoručkami vsedě": dbPressSeated,
  "Arnoldův tlak": arnold,
  "Tlak na ramena na stroji": machineShoulder,
  "Landmine tlak": landmine,
  "Upažování s jednoručkami": lateral,
  "Upažování na kladce": cableLateral,
  "Upažování na stroji": machineLateral,
  "Předpažování s jednoručkami": frontRaise,
  "Zapažování v předklonu": rearDelt,
  "Reverse peck deck": reversePecDeck,
  "Face pull": facePull,
  "Přitahování velké činky k bradě": uprightRow,
  Shyby: pullUpFront,
  "Shyby podhmatem": chinUp,
  "Shyby s asistencí": assistedPull,
  "Stahování horní kladky": pulldownFront(true),
  "Stahování horní kladky úzkým úchopem": pulldownClose,
  "Stahování na stroji": pulldownFront(false),
  "Přítahy velké činky v předklonu": barbellRow,
  "Přítah jednoručky v předklonu": dbRowOne,
  "Přítahy spodní kladky vsedě": cableRowSeated,
  "T-bar přítahy": tbarRow,
  "Přítahy na stroji": machineRow,
  "Přítahy na hrudníkové opoře": chestSupported,
  "Australské shyby": invertedRow,
  "Pendlay row": pendlay,
  "Pullover na kladce": cablePullover,
  "Pullover s jednoručkou": dbPullover,
  "Krčení ramen": shrug,
  Hyperextenze: hyperext,
  "Bicepsový zdvih s velkou činkou": curl([plate()]),
  "Bicepsový zdvih s EZ činkou": curl([plate("hand", 8)]),
  "Bicepsový zdvih s jednoručkami": curl([dbs]),
  Kladiva: curl([dbs]),
  "Bicepsový zdvih na kladce": curl([cable([112, 106]), handle()], [post(112, 70)]),
  "Scottův zdvih": preacher,
  "Zdvih na šikmé lavici": inclineCurl,
  "Francouzský tlak": skull,
  "Stahování kladky na triceps": pushdown(false),
  "Stahování kladky lanem": pushdown(true),
  "Tricepsové extenze nad hlavou": overheadCable,
  "Extenze s jednoručkou nad hlavou": dbOverhead,
  "Tricepsové kliky na lavici": benchDips,
  "Dřep s činkou": squat,
  "Přední dřep": frontSquat,
  "Goblet dřep": goblet,
  "Hack dřep": hack,
  "Leg press": legPress,
  "Dřep na multipressu": smithSquat,
  "Pendulum dřep": pendulum,
  "Bulharský dřep": bulgarian("dumbbell"),
  "Výpady s jednoručkami": splitSquat("dumbbell"),
  "Výpady s velkou činkou": splitSquat("barbell"),
  "Výstupy na bednu": stepUp,
  Předkopávání: legExt,
  "Mrtvý tah": deadlift,
  "Rumunský mrtvý tah": rdl("barbell"),
  "Rumunský mrtvý tah s jednoručkami": rdl("dumbbell"),
  "Sumo mrtvý tah": sumo,
  "Mrtvý tah s trap bar činkou": trapBar,
  "Good morning": goodMorning,
  "Hip thrust": hipThrust(false),
  "Hip thrust na stroji": hipThrust(true),
  "Kettlebell swing": swing,
  "Zakopávání vleže": legCurlLying,
  "Zakopávání vsedě": legCurlSeated,
  "Nordic curl": nordic,
  "Unožování na stroji": abduction,
  "Zanožování na kladce": kickback,
  "Výpony vestoje": calfStand,
  "Výpony vsedě": calfSeated,
  "Výpony na leg pressu": calfLegPress,
  Plank: plank,
  "Zvedání nohou ve visu": legRaise,
  "Kladkové zkracovačky": cableCrunch,
  "Ab wheel": abWheel,
  "Pallof press": pallof,
  Zkracovačky: crunch,
  "Farmářská chůze": farmer,
  "Zápěstní zdvihy": wristCurl,
};

/** Template for exercises without their own animation (custom ones), by pattern + equipment. */
function fallback(pattern: string, equipment: Equipment): Spec {
  const i: Imp = equipment === "dumbbell" ? "dumbbell" : equipment === "kettlebell" ? "kettlebell" : "barbell";
  const machine = equipment === "machine" || equipment === "cable";
  switch (pattern) {
    case "horizontal_push":
      return equipment === "bodyweight" ? pushUp : machine ? ANIMATIONS["Tlak na hrudník na stroji"] : benchPress(i === "kettlebell" ? "dumbbell" : i);
    case "vertical_push":
      return equipment === "dumbbell" ? dbPressSeated : machine ? machineShoulder : ohp;
    case "horizontal_pull":
      return equipment === "cable" ? cableRowSeated : equipment === "machine" ? machineRow : equipment === "bodyweight" ? invertedRow : equipment === "dumbbell" ? dbRowOne : barbellRow;
    case "vertical_pull":
      return equipment === "bodyweight" ? pullUpFront : pulldownFront(equipment === "cable");
    case "squat":
      return equipment === "machine" ? legPress : equipment === "dumbbell" || equipment === "kettlebell" ? goblet : squat;
    case "lunge":
      return splitSquat(i === "barbell" ? "barbell" : "dumbbell");
    case "hinge":
      return equipment === "kettlebell" ? swing : equipment === "machine" ? hipThrust(true) : rdl(i);
    case "isolation_chest":
      return equipment === "cable" ? crossover : machine ? pecDeck : flyLying;
    case "isolation_shoulders":
      return equipment === "cable" ? cableLateral : equipment === "machine" ? machineLateral : lateral;
    case "isolation_back":
      return equipment === "cable" ? cablePullover : shrug;
    case "isolation_biceps":
      return equipment === "cable" ? ANIMATIONS["Bicepsový zdvih na kladce"] : equipment === "machine" ? preacher : curl(i === "barbell" ? [plate()] : [dbs]);
    case "isolation_triceps":
      return equipment === "cable" || equipment === "machine" ? pushdown(false) : equipment === "bodyweight" ? benchDips : equipment === "dumbbell" ? dbOverhead : skull;
    case "isolation_quads":
      return legExt;
    case "isolation_hamstrings":
      return equipment === "bodyweight" ? nordic : legCurlLying;
    case "isolation_glutes":
      return equipment === "cable" ? kickback : equipment === "machine" ? abduction : hipThrust(false);
    case "isolation_calves":
      return calfStand;
    case "isolation_forearms":
      return wristCurl;
    case "core":
      return equipment === "cable" ? cableCrunch : crunch;
    case "carry":
      return farmer;
    default:
      return equipment === "dumbbell" ? curl([dbs]) : spec([stand(), stand({ arm: { a: [90, 90] } })]);
  }
}

export function getAnimation(ex: { name: string; pattern: string; equipment: Equipment }): Spec {
  return ANIMATIONS[ex.name] ?? fallback(ex.pattern, ex.equipment);
}
