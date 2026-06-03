/** Spin-coating thin-film physics (Euler solver + analytical helpers) */

export const DT = 0.01;
/** Safety cap only — integration stops at gelation before this */
export const MAX_TIME_SAFETY = 7200;
/** Chart / validation window for E = 0 comparison (no gelation required) */
export const VALIDATION_MAX_TIME = 25;
export const NM_PER_M = 1e9;
export const MAX_STORED_POINTS = 5000;

/** Fixed material & edge-bead parameters (not user-adjustable) */
export const FIXED_RHO = 1050;
export const FIXED_C0 = 0.2;
export const FIXED_BEAD_SIGMA_FRAC = 0.04;
/** Edge bead Gaussian starts at this fraction of wafer radius */
export const EDGE_BEAD_START_RADIUS_FRAC = 0.9;
/** ±2% uniformity spec evaluated for r < this fraction of R */
export const SPEC_FIELD_RADIUS_FRAC = 0.95;

/** UI evaporation rate (µm/s) → SI (m/s) for Euler loop */
export const UM_PER_S_TO_M_PER_S = 1e-6;

export interface UserInputs {
  rpm: number;
  eta0: number;
  /** Initial coat thickness [nm] (UI) */
  h0Nm: number;
  /** Solvent evaporation rate [µm/s] (UI) */
  EumPerS: number;
  radiusMm: number;
}

export interface SimulationParams {
  rpm: number;
  eta0: number;
  h0: number;
  E: number;
  rho: number;
  C0: number;
}

export function toSimulationParams(inputs: UserInputs): SimulationParams {
  return {
    rpm: inputs.rpm,
    eta0: inputs.eta0,
    h0: inputs.h0Nm / NM_PER_M,
    E: inputs.EumPerS * UM_PER_S_TO_M_PER_S,
    rho: FIXED_RHO,
    C0: FIXED_C0,
  };
}

/** RPM-inverse edge bead: ~6% at 1000 RPM, ~3% at 5000 RPM */
export function edgeBeadRatioFromRpm(rpm: number): number {
  return 0.02 + 80 / (rpm + 1000);
}

export function edgeBeadPeakPercent(rpm: number): string {
  return (edgeBeadRatioFromRpm(rpm) * 100).toFixed(1);
}

export function edgeBeadAmplitudeNm(hFinalM: number, rpm: number): number {
  const hFinalNm = hFinalM * NM_PER_M;
  const ratio = edgeBeadRatioFromRpm(rpm);
  return hFinalNm * ratio;
}

export interface SimulationPoint {
  t: number;
  h: number;
  C: number;
  eta: number;
}

export type GelReason =
  | "concentration"
  | "flow_cessation_gelation"
  | "max_time";

export interface SimulationResult {
  points: SimulationPoint[];
  /** Total time to full gelation (Stage 1 + Stage 2 when applicable) */
  tGel: number;
  /** Fully dried thickness after all stages */
  hFinal: number;
  hFAnalytic: number;
  omega: number;
  gelReason: GelReason;
  /** Time at Meyerhofer flow cessation (Stage 1 → 2 handoff), if any */
  tFlowCessation?: number;
  hFlowCessation?: number;
}

export function rpmToOmega(rpm: number): number {
  return (2 * Math.PI * rpm) / 60;
}

export function viscosity(h: number, h0: number, eta0: number): number {
  const ratio = h0 / Math.max(h, 1e-15);
  return eta0 * Math.pow(ratio, 2.33);
}

/** EBP (E=0): η = η₀ constant. Core sim uses Flack η(h). */
export function filmViscosity(
  h: number,
  h0: number,
  eta0: number,
  constantViscosity: boolean,
): number {
  return constantViscosity ? eta0 : viscosity(h, h0, eta0);
}

/**
 * Flack–Meyerhofer analytic final thickness (Fab UI units).
 * E: µm/s → m/s, h₀: nm → m inside the power term, output in nm.
 */
export function meyerhoferFinalThicknessNm(
  EumPerS: number,
  eta0: number,
  h0Nm: number,
  rho: number,
  rpm: number,
): number {
  if (EumPerS <= 0 || h0Nm <= 0 || rpm <= 0) return 0;
  const omega = rpmToOmega(rpm);
  const E_m_s = EumPerS * UM_PER_S_TO_M_PER_S;
  const h0_m = h0Nm * 1e-9;
  const h_f_m = Math.pow(
    (3 * E_m_s * eta0 * Math.pow(h0_m, 2.33)) / (2 * rho * Math.pow(omega, 2)),
    1 / 5.33,
  );
  return h_f_m * NM_PER_M;
}

/** SI (m) wrapper for the Euler loop */
export function meyerhoferFinalThickness(
  E: number,
  eta0: number,
  h0: number,
  rho: number,
  omega: number,
): number {
  if (omega <= 0 || E <= 0) return 0;
  const rpm = (omega * 60) / (2 * Math.PI);
  const h0Nm = h0 * NM_PER_M;
  const EumPerS = E / UM_PER_S_TO_M_PER_S;
  return meyerhoferFinalThicknessNm(EumPerS, eta0, h0Nm, rho, rpm) / NM_PER_M;
}

/**
 * Core View card: Meyerhofer h_f when it lies below h₀; otherwise Flack
 * concentration limit h₀·C₀ (matches solver when gelation is C ≥ 1).
 */
export function coreViewMeyerhoferCardNm(
  EumPerS: number,
  eta0: number,
  h0Nm: number,
  rho: number,
  rpm: number,
  C0: number,
  hFinalNm: number,
  gelReason: GelReason,
): number {
  const hfMeyerNm = meyerhoferFinalThicknessNm(EumPerS, eta0, h0Nm, rho, rpm);
  const concLimitNm = h0Nm * C0;

  if (
    gelReason === "concentration" ||
    gelReason === "flow_cessation_gelation" ||
    hfMeyerNm >= h0Nm
  ) {
    return hFinalNm;
  }
  return Math.min(hfMeyerNm, concLimitNm, hFinalNm);
}

export function dhdt(
  h: number,
  rho: number,
  omega: number,
  eta: number,
  E: number,
): number {
  const spinTerm = (2 * rho * omega * omega * h * h * h) / (3 * eta);
  return -spinTerm - E;
}

function downsamplePoints(points: SimulationPoint[]): SimulationPoint[] {
  if (points.length <= MAX_STORED_POINTS) return points;
  const stride = Math.ceil(points.length / MAX_STORED_POINTS);
  const out: SimulationPoint[] = [];
  for (let i = 0; i < points.length; i += stride) {
    out.push(points[i]);
  }
  const last = points[points.length - 1];
  if (out[out.length - 1]?.t !== last.t) out.push(last);
  return out;
}

function solidConcentration(h: number, h0: number, C0: number): number {
  return (h0 * C0) / Math.max(h, 1e-15);
}

function isConcentrationGelation(h: number, h0: number, C0: number): boolean {
  return solidConcentration(h, h0, C0) >= 1;
}

function isFlowCessation(
  h: number,
  h0: number,
  hFAnalytic: number,
  useMeyerhofer: boolean,
): boolean {
  return (
    useMeyerhofer &&
    hFAnalytic > 0 &&
    hFAnalytic < h0 &&
    h <= hFAnalytic
  );
}

function appendPoint(
  rawPoints: SimulationPoint[],
  t: number,
  h: number,
  h0: number,
  C0: number,
  eta: number,
) {
  rawPoints.push({
    t,
    h,
    C: solidConcentration(h, h0, C0),
    eta,
  });
}

/** Stage 2: static evaporation only, dh/dt = −E */
function runStaticEvaporationStage(
  h0: number,
  C0: number,
  E: number,
  hStart: number,
  tStart: number,
  maxTime: number,
  recordEvery: number,
  etaAt: (hVal: number) => number,
  rawPoints: SimulationPoint[],
): { h: number; t: number; gelReason: GelReason } {
  let h = hStart;
  let t = tStart;
  let stepIndex = 0;
  let gelReason: GelReason = "max_time";

  while (t < maxTime) {
    if (isConcentrationGelation(h, h0, C0)) {
      gelReason = "flow_cessation_gelation";
      appendPoint(rawPoints, t, h, h0, C0, etaAt(h));
      break;
    }

    const hNext = Math.max(h - E * DT, 0);
    const CNext = solidConcentration(hNext, h0, C0);
    t += DT;
    stepIndex += 1;
    h = hNext;

    if (CNext >= 1) {
      gelReason = "flow_cessation_gelation";
      appendPoint(rawPoints, t, h, h0, C0, etaAt(h));
      break;
    }

    if (stepIndex % recordEvery === 0) {
      appendPoint(rawPoints, t, h, h0, C0, etaAt(h));
    }
  }

  if (gelReason === "max_time") {
    appendPoint(rawPoints, t, h, h0, C0, etaAt(h));
  }

  return { h, t, gelReason };
}

export function runEulerSimulation(
  params: SimulationParams,
  options?: {
    EOverride?: number;
    maxTime?: number;
    recordEverySteps?: number;
    /** Validation (EBP): hold η = η₀; do not apply Flack η(h₀/h)^2.33 */
    constantViscosity?: boolean;
    /** Validation uses single-stage EBP; core sim uses dual-stage */
    dualStage?: boolean;
  },
): SimulationResult {
  const { rpm, eta0, h0, rho, C0 } = params;
  const E = options?.EOverride ?? params.E;
  const maxTime = options?.maxTime ?? MAX_TIME_SAFETY;
  const recordEvery = options?.recordEverySteps ?? 10;
  const constantViscosity = options?.constantViscosity ?? false;
  const dualStage = options?.dualStage ?? !constantViscosity;
  const etaAt = (hVal: number) =>
    filmViscosity(hVal, h0, eta0, constantViscosity);

  const omega = rpmToOmega(rpm);
  const hFAnalytic = meyerhoferFinalThickness(E, eta0, h0, rho, omega);
  const useMeyerhoferHandoff =
    dualStage && E > 0 && hFAnalytic > 0 && Number.isFinite(hFAnalytic);

  const rawPoints: SimulationPoint[] = [];
  let h = h0;
  let t = 0;
  let gelReason: GelReason = "max_time";
  let stepIndex = 0;
  let tFlowCessation: number | undefined;
  let hFlowCessation: number | undefined;
  let enterStage2 = false;

  appendPoint(rawPoints, t, h, h0, C0, etaAt(h));

  // —— Stage 1: centrifugal spin-off + evaporation ——
  while (t < maxTime) {
    if (isConcentrationGelation(h, h0, C0)) {
      gelReason = "concentration";
      appendPoint(rawPoints, t, h, h0, C0, etaAt(h));
      break;
    }

    if (isFlowCessation(h, h0, hFAnalytic, useMeyerhoferHandoff)) {
      tFlowCessation = t;
      hFlowCessation = h;
      enterStage2 = true;
      appendPoint(rawPoints, t, h, h0, C0, etaAt(h));
      break;
    }

    const eta = etaAt(h);
    const derivative = dhdt(h, rho, omega, eta, E);
    const hNext = Math.max(h + DT * derivative, 0);

    if (isConcentrationGelation(hNext, h0, C0)) {
      h = hNext;
      t += DT;
      stepIndex += 1;
      gelReason = "concentration";
      appendPoint(rawPoints, t, h, h0, C0, etaAt(h));
      break;
    }

    if (isFlowCessation(hNext, h0, hFAnalytic, useMeyerhoferHandoff)) {
      h = hNext;
      t += DT;
      stepIndex += 1;
      tFlowCessation = t;
      hFlowCessation = h;
      enterStage2 = true;
      appendPoint(rawPoints, t, h, h0, C0, etaAt(h));
      break;
    }

    h = hNext;
    t += DT;
    stepIndex += 1;

    if (stepIndex % recordEvery === 0) {
      appendPoint(rawPoints, t, h, h0, C0, etaAt(h));
    }
  }

  // —— Stage 2: pure static evaporation (dh/dt = −E) ——
  if (enterStage2 && gelReason !== "concentration") {
    const stage2 = runStaticEvaporationStage(
      h0,
      C0,
      E,
      hFlowCessation ?? h,
      tFlowCessation ?? t,
      maxTime,
      recordEvery,
      etaAt,
      rawPoints,
    );
    h = stage2.h;
    t = stage2.t;
    gelReason = stage2.gelReason;
  } else if (gelReason === "max_time") {
    appendPoint(rawPoints, t, h, h0, C0, etaAt(h));
  } else if (
    gelReason === "concentration" &&
    rawPoints[rawPoints.length - 1]?.t !== t
  ) {
    appendPoint(rawPoints, t, h, h0, C0, etaAt(h));
  }

  const points = downsamplePoints(rawPoints);
  const last = rawPoints[rawPoints.length - 1];

  return {
    points,
    tGel: last.t,
    hFinal: last.h,
    hFAnalytic,
    omega,
    gelReason,
    tFlowCessation,
    hFlowCessation,
  };
}

/** EBP analytical solution (E = 0): h(t) = h0 / sqrt(1 + (4*rho*omega^2*h0^2*t)/(3*eta0)) */
export function ebpAnalyticalThickness(
  t: number,
  h0: number,
  rho: number,
  omega: number,
  eta0: number,
): number {
  const inner = 1 + (4 * rho * omega * omega * h0 * h0 * t) / (3 * eta0);
  return h0 / Math.sqrt(inner);
}

export function buildEbpValidationSeries(
  params: SimulationParams,
  numericalPoints: SimulationPoint[],
): { t: number; hNumerical: number; hAnalytical: number }[] {
  const { h0, rho } = params;
  const omega = rpmToOmega(params.rpm);
  return numericalPoints.map((p) => ({
    t: p.t,
    hNumerical: p.h * NM_PER_M,
    hAnalytical:
      ebpAnalyticalThickness(p.t, h0, rho, omega, params.eta0) * NM_PER_M,
  }));
}

export interface WaferProfilePoint {
  r: number;
  rMm: number;
  hNm: number;
}

export interface WaferProfileResult {
  profile: WaferProfilePoint[];
  targetNm: number;
  lowerBoundNm: number;
  upperBoundNm: number;
  specSatisfied: boolean;
  maxDeviationPercent: number;
  beadAmplitudeNm: number;
  edgeBeadRatio: number;
  edgeBeadPeakPercent: string;
}

/** Gaussian edge bead from 90% R; peak amplitude A = h_final × edge_bead_ratio(RPM) */
export function buildWaferCrossSection(
  hUniformM: number,
  radiusM: number,
  rpm: number,
  beadSigmaFraction: number = FIXED_BEAD_SIGMA_FRAC,
  sampleCount = 200,
): WaferProfileResult {
  const targetNm = hUniformM * NM_PER_M;
  const lowerBoundNm = targetNm * 0.98;
  const upperBoundNm = targetNm * 1.02;
  const beadStart = EDGE_BEAD_START_RADIUS_FRAC * radiusM;
  const specFieldLimit = SPEC_FIELD_RADIUS_FRAC * radiusM;
  const sigma = beadSigmaFraction * radiusM;
  const edgeBeadRatio = edgeBeadRatioFromRpm(rpm);
  const beadAmplitudeNm = hUniformM * NM_PER_M * edgeBeadRatio;
  const beadAmpM = beadAmplitudeNm / NM_PER_M;

  const profile: WaferProfilePoint[] = [];
  let specSatisfied = true;
  let maxDeviationPercent = 0;

  for (let i = 0; i <= sampleCount; i++) {
    const r = (radiusM * i) / sampleCount;
    let h = hUniformM;

    if (r >= beadStart) {
      const gaussian =
        beadAmpM * Math.exp(-Math.pow(r - radiusM, 2) / (2 * sigma * sigma));
      h += gaussian;
    }

    const hNm = h * NM_PER_M;
    const inUniformityZone = r < specFieldLimit;
    const deviation =
      targetNm > 0 ? (Math.abs(hNm - targetNm) / targetNm) * 100 : 0;

    if (inUniformityZone) {
      maxDeviationPercent = Math.max(maxDeviationPercent, deviation);
      if (hNm < lowerBoundNm || hNm > upperBoundNm) {
        specSatisfied = false;
      }
    }

    profile.push({
      r,
      rMm: r * 1000,
      hNm,
    });
  }

  return {
    profile,
    targetNm,
    lowerBoundNm,
    upperBoundNm,
    specSatisfied,
    maxDeviationPercent,
    beadAmplitudeNm,
    edgeBeadRatio,
    edgeBeadPeakPercent: edgeBeadPeakPercent(rpm),
  };
}
