/**
 * Tiny 2D kinematics engine for exercise animations.
 *
 * A figure is described by a handful of pose parameters (hip position, torso angle, limbs). Limbs are given either
 * as absolute angles or as a target point solved with two-bone IK, so feet stay planted and bar paths stay straight
 * while the pose is interpolated. Every frame is turned into a flat list of shapes, rendered by React (live
 * animation) or to a string (static previews).
 *
 * Angles are in degrees, 0 = straight up, 90 = forward (to the right, where the figure faces), 180 = down.
 */

export type V = [number, number];

/** Limb as absolute angles [upper, lower], a target point (IK) or a target relative to the torso [forward, up]. */
export type Limb =
  | { a: [number, number]; k?: number | [number, number]; rel?: boolean }
  | { to: V; bend?: 1 | -1; k?: number | [number, number] }
  | { r: V; bend?: 1 | -1; k?: number | [number, number] };

export type Pose = {
  hip: V;
  /** Torso angle (hip → neck). */
  t?: number;
  /** Point the torso aims at (overrides t). */
  aim?: V;
  /** Torso length factor (front view foreshortening when leaning). */
  tk?: number;
  /** Head tilt relative to the torso. */
  head?: number;
  /** Shoulder elevation (shrug). */
  shrug?: number;
  arm: Limb;
  arm2?: Limb;
  leg: Limb;
  leg2?: Limb;
  /** Absolute foot angles; default = perpendicular to the shin. */
  foot?: number;
  foot2?: number;
  /** Absolute wrist (hand segment) angle – only used where the hand itself moves. */
  w?: number;
};

export type Joints = {
  t: number;
  hip: V;
  neck: V;
  head: V;
  sh: V;
  sh2: V;
  hipL: V;
  hipR: V;
  elbow: V;
  hand: V;
  elbow2: V;
  hand2: V;
  knee: V;
  ankle: V;
  toe: V;
  knee2: V;
  ankle2: V;
  toe2: V;
  grip: V;
};

export type Tone = "fg" | "far" | "eq" | "env" | "card";
export type Shape =
  | { k: "l"; a: V; b: V; w: number; tone: Tone; z: number; dash?: string }
  | { k: "c"; c: V; r: number; tone: Tone; fill?: Tone; w?: number; z: number }
  | { k: "p"; d: string; tone: Tone; fill?: Tone; w?: number; z: number };

export type Prop = (j: Joints) => Shape[];

export type Spec = {
  view?: "side" | "front";
  /** Two keys ping-pong (A → B → A); more keys loop in order. */
  keys: Pose[];
  props?: Prop[];
  /** Static environment drawn behind everything. */
  env?: Shape[];
  /** Full cycle length in ms. */
  dur?: number;
  ground?: boolean;
};

export const W = 160;
export const H = 120;
export const G = 112; // ground line (ankle sits at G - 3)

const L = { torso: 30, shoulder: 26.5, ua: 17, fa: 16, th: 23, sh: 22, foot: 7, footFront: 3.5, head: 6.5, hand: 5 };
const SW = 9.5; // half shoulder width (front view)
const HW = 5.5; // half hip width (front view)

/* ── math ─────────────────────────────────────────────── */

const rad = (d: number) => (d * Math.PI) / 180;
export const dir = (deg: number, len = 1): V => [Math.sin(rad(deg)) * len, -Math.cos(rad(deg)) * len];
export const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1]];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1]];
export const ang = (v: V) => (Math.atan2(v[0], -v[1]) * 180) / Math.PI;
const len = (v: V) => Math.hypot(v[0], v[1]);
export const at = (p: V, deg: number, d: number): V => add(p, dir(deg, d));

function lerpAny<T>(a: T, b: T, p: number): T {
  if (typeof a === "number" && typeof b === "number") return (a + (b - a) * p) as T;
  if (Array.isArray(a) && Array.isArray(b)) return a.map((x, i) => lerpAny(x, b[i], p)) as T;
  if (a && b && typeof a === "object" && typeof b === "object") {
    const out: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const av = (a as Record<string, unknown>)[key];
      const bv = (b as Record<string, unknown>)[key];
      out[key] = av === undefined ? bv : bv === undefined ? av : lerpAny(av, bv, p);
    }
    return out as T;
  }
  return p < 0.5 ? a : b;
}

const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * x);

/** Pose at cycle phase u ∈ [0, 1). */
export function poseAt(spec: Spec, u: number): Pose {
  const keys = spec.keys;
  const view = spec.view ?? "side";
  if (keys.length === 1) return keys[0];
  if (keys.length === 2) {
    // A → B → A with a short hold at both ends
    const x = u < 0.5 ? u * 2 : 2 - u * 2;
    const held = Math.min(1, Math.max(0, (x - 0.08) / 0.84));
    return blend(keys[0], keys[1], ease(held), view);
  }
  const n = keys.length;
  const s = u * n;
  const i = Math.floor(s) % n;
  return blend(keys[i], keys[(i + 1) % n], ease(s - Math.floor(s)), view);
}

const LIMBS = ["arm", "arm2", "leg", "leg2"] as const;

/** Fill defaults so both poses have the same shape, then interpolate. */
function blend(a: Pose, b: Pose, p: number, view: "side" | "front"): Pose {
  const na = normalize(a);
  const nb = normalize(b);
  for (const key of LIMBS) {
    const la = na[key] as Limb;
    const lb = nb[key] as Limb;
    const fa = limbForm(la);
    if (fa !== limbForm(lb)) {
      // different limb descriptions: interpolate the solved end points instead
      na[key] = asTarget(na, key, view);
      nb[key] = asTarget(nb, key, view);
    }
  }
  return lerpAny(na, nb, p);
}

const limbForm = (l: Limb) => ("a" in l ? (l.rel ? "rel" : "a") : "r" in l ? "r" : "to");

function normalize(p: Pose): Pose & Required<Pick<Pose, "arm2" | "leg2">> {
  const fix = (l: Limb): Limb => ({ ...l, k: ks(l.k) });
  return {
    ...p,
    t: p.aim ? undefined : (p.t ?? 0),
    tk: p.tk ?? 1,
    head: p.head ?? 0,
    shrug: p.shrug ?? 0,
    arm: fix(p.arm),
    arm2: fix(p.arm2 ?? p.arm),
    leg: fix(p.leg),
    leg2: fix(p.leg2 ?? p.leg),
  };
}

function asTarget(p: Pose, key: (typeof LIMBS)[number], view: "side" | "front"): Limb {
  const j = joints(p, view);
  const l = p[key] as Limb;
  const map = { arm: ["sh", "elbow", "hand"], arm2: ["sh2", "elbow2", "hand2"], leg: ["hipR", "knee", "ankle"], leg2: ["hipL", "knee2", "ankle2"] } as const;
  const [r, m, e] = map[key];
  let to = j[e];
  const root = j[r];
  const mid = j[m];
  // which side of the root→end line the middle joint is on
  const cross = (to[0] - root[0]) * (mid[1] - root[1]) - (to[1] - root[1]) * (mid[0] - root[0]);
  let bend: 1 | -1 = cross > 0 ? 1 : -1;
  if (view === "front" && (key === "arm2" || key === "leg2")) {
    to = [2 * p.hip[0] - to[0], to[1]];
    bend = bend === 1 ? -1 : 1;
  }
  return { to, bend, k: l.k };
}

/* ── kinematics ───────────────────────────────────────── */

const ks = (k: number | [number, number] | undefined): [number, number] => (k === undefined ? [1, 1] : typeof k === "number" ? [k, k] : k);

function solve(root: V, limb: Limb, l1: number, l2: number, defBend: 1 | -1, torsoT: number, shoulder: V, mirrorCx?: number): [V, V] {
  const [k1, k2] = ks(limb.k);
  const a1 = l1 * k1;
  const a2 = l2 * k2;
  const m = mirrorCx !== undefined;
  if ("a" in limb) {
    let [u, l] = limb.a;
    if (limb.rel) {
      u += torsoT;
      l += torsoT;
    }
    if (m) {
      u = -u;
      l = -l;
    }
    const j = at(root, u, a1);
    return [j, at(j, l, a2)];
  }
  let target: V;
  if ("r" in limb) {
    const [f, up] = limb.r;
    target = add(add(shoulder, dir(torsoT + 90, f)), dir(torsoT, up));
  } else target = limb.to;
  if (m) target = [2 * mirrorCx - target[0], target[1]];
  const v = sub(target, root);
  const d = Math.min(Math.max(len(v), Math.abs(a1 - a2) + 0.01), a1 + a2 - 0.01);
  const base = ang(v);
  const cos = (a1 * a1 + d * d - a2 * a2) / (2 * a1 * d);
  const off = (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
  const bend = (limb.bend ?? defBend) * (m ? -1 : 1);
  const j = at(root, base + bend * off, a1);
  return [j, at(root, base, d)];
}

export function joints(pose: Pose, view: "side" | "front"): Joints {
  const hip = pose.hip;
  const t = pose.aim ? ang(sub(pose.aim, hip)) : (pose.t ?? 0);
  const tk = pose.tk ?? 1;
  const shrug = pose.shrug ?? 0;
  const neck = at(hip, t, L.torso * tk);
  const head = at(neck, t + (pose.head ?? 0), 3 + L.head);
  const shC = add(at(hip, t, L.shoulder * tk), [0, -shrug]);
  const front = view === "front";
  const perp = t + 90;
  const sh = front ? at(shC, perp, SW) : shC;
  const sh2 = front ? at(shC, perp, -SW) : shC;
  const hipR = front ? at(hip, perp, HW) : hip;
  const hipL = front ? at(hip, perp, -HW) : hip;
  const cx = hip[0];

  const mc = front ? cx : undefined;
  const [elbow, hand] = solve(sh, pose.arm, L.ua, L.fa, 1, t, shC);
  const [elbow2, hand2] = solve(sh2, pose.arm2 ?? pose.arm, L.ua, L.fa, 1, t, shC, mc);
  const [knee, ankle] = solve(hipR, pose.leg, L.th, L.sh, -1, t, hipR);
  const [knee2, ankle2] = solve(hipL, pose.leg2 ?? pose.leg, L.th, L.sh, -1, t, hipL, mc);

  const shinA = ang(sub(ankle, knee));
  const shinA2 = ang(sub(ankle2, knee2));
  const toe = front ? at(ankle, 100, L.footFront) : at(ankle, pose.foot ?? shinA - 90, L.foot);
  const toe2 = front ? at(ankle2, -100, L.footFront) : at(ankle2, pose.foot2 ?? pose.foot ?? shinA2 - 90, L.foot);
  const grip = pose.w === undefined ? hand : at(hand, pose.w, L.hand);

  return { t, hip, neck, head, sh, sh2, hipL, hipR, elbow, hand, elbow2, hand2, knee, ankle, toe, knee2, ankle2, toe2, grip };
}

/* ── shapes ───────────────────────────────────────────── */

const line = (a: V, b: V, w: number, tone: Tone, z: number): Shape => ({ k: "l", a, b, w, tone, z });
const poly = (pts: V[], tone: Tone, z: number, w: number, fill?: Tone): Shape => ({
  k: "p",
  d: `M${pts.map((p) => `${r1(p[0])} ${r1(p[1])}`).join("L")}${fill ? "Z" : ""}`,
  tone,
  fill,
  w,
  z,
});
export const r1 = (n: number) => Math.round(n * 10) / 10;

const LIMB = 6.5;

function figure(j: Joints, view: "side" | "front", pose: Pose): Shape[] {
  const out: Shape[] = [];
  const far: Tone = view === "front" ? "fg" : "far";
  const zf = view === "front" ? 3 : 1;
  // far limbs
  out.push(poly([j.hipL, j.knee2, j.ankle2, j.toe2], far, zf, LIMB));
  out.push(poly([j.sh2, j.elbow2, j.hand2], far, zf, LIMB));
  if (view === "front") {
    const shL = j.sh2;
    const shR = j.sh;
    out.push(poly([j.hipL, j.hipR, shR, shL], "fg", 3, 5, "fg"));
    out.push(line(j.neck, at(j.neck, j.t, -4), 5, "fg", 3));
  } else {
    out.push(line(j.hip, j.neck, 10, "fg", 3));
  }
  out.push({ k: "c", c: j.head, r: L.head, tone: "fg", fill: "fg", z: 3 });
  out.push(poly([j.hipR, j.knee, j.ankle, j.toe], "fg", 3, LIMB));
  const arm: V[] = [j.sh, j.elbow, j.hand];
  if (pose.w !== undefined) arm.push(j.grip);
  out.push(poly(arm, "fg", 3, LIMB));
  return out;
}

export function frame(spec: Spec, u: number): Shape[] {
  const view = spec.view ?? "side";
  const pose = poseAt(spec, u);
  const j = joints(pose, view);
  const shapes: Shape[] = [];
  if (spec.ground !== false) shapes.push(line([8, G], [W - 8, G], 1.5, "env", 0));
  if (spec.env) shapes.push(...spec.env);
  shapes.push(...figure(j, view, pose));
  for (const p of spec.props ?? []) shapes.push(...p(j));
  return shapes.sort((a, b) => a.z - b.z);
}

/* ── string renderer (static previews / tests) ───────── */

const TONE: Record<Tone, string> = { fg: "var(--fg)", far: "var(--fg)", eq: "var(--muted)", env: "var(--subtle)", card: "var(--card)" };
const OPACITY: Partial<Record<Tone, number>> = { far: 0.32, env: 0.55 };

export function shapeAttrs(s: Shape): Record<string, string | number> {
  const o: Record<string, string | number> = {};
  const op = OPACITY[s.tone];
  if (op !== undefined && !("fill" in s && s.fill && s.fill !== s.tone)) o.opacity = op;
  if (s.k === "l") Object.assign(o, { x1: r1(s.a[0]), y1: r1(s.a[1]), x2: r1(s.b[0]), y2: r1(s.b[1]), stroke: TONE[s.tone], "stroke-width": s.w });
  if (s.k === "c") Object.assign(o, { cx: r1(s.c[0]), cy: r1(s.c[1]), r: s.r, fill: s.fill ? TONE[s.fill] : "none", stroke: TONE[s.tone], "stroke-width": s.w ?? 0 });
  if (s.k === "p") Object.assign(o, { d: s.d, fill: s.fill ? TONE[s.fill] : "none", stroke: TONE[s.tone], "stroke-width": s.w ?? 0 });
  if (s.k === "l" && s.dash) o["stroke-dasharray"] = s.dash;
  return o;
}

export function toSvgString(spec: Spec, u: number) {
  const body = frame(spec, u)
    .map((s) => {
      const tag = s.k === "l" ? "line" : s.k === "c" ? "circle" : "path";
      const attrs = Object.entries(shapeAttrs(s))
        .map(([k, v]) => `${k}="${v}"`)
        .join(" ");
      return `<${tag} ${attrs}/>`;
    })
    .join("");
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
