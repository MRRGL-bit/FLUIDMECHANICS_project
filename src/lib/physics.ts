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

export interface SimulationResult {
  points: SimulationPoint[];
  tGel: number;
  hFinal: number;
  hFAnalytic: number;
  omega: number;
  gelReason: "concentration" | "meyerhofer" | "max_time";
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
  gelReason: SimulationResult["gelReason"],
): number {
  const hfMeyerNm = meyerhoferFinalThicknessNm(EumPerS, eta0, h0Nm, rho, rpm);
  const concLimitNm = h0Nm * C0;

  if (gelReason === "concentration" || hfMeyerNm >= h0Nm) {
    return hFinalNm;
  }
  if (gelReason === "meyerhofer") {
    return hfMeyerNm;
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

function crossedGelation(
  h: number,
  h0: number,
  C: number,
  hFAnalytic: number,
  useMeyerhofer: boolean,
): "concentration" | "meyerhofer" | null {
  if (C >= 1) return "concentration";
  if (
    useMeyerhofer &&
    hFAnalytic > 0 &&
    hFAnalytic < h0 &&
    h <= hFAnalytic
  ) {
    return "meyerhofer";
  }
  return null;
}

export function runEulerSimulation(
  params: SimulationParams,
  options?: {
    EOverride?: number;
    maxTime?: number;
    recordEverySteps?: number;
    /** Validation (EBP): hold η = η₀; do not apply Flack η(h₀/h)^2.33 */
    constantViscosity?: boolean;
  },
): SimulationResult {
  const { rpm, eta0, h0, rho, C0 } = params;
  const E = options?.EOverride ?? params.E;
  const maxTime = options?.maxTime ?? MAX_TIME_SAFETY;
  const recordEvery = options?.recordEverySteps ?? 10;
  const constantViscosity = options?.constantViscosity ?? false;
  const etaAt = (hVal: number) =>
    filmViscosity(hVal, h0, eta0, constantViscosity);

  const omega = rpmToOmega(rpm);
  const hFAnalytic = meyerhoferFinalThickness(E, eta0, h0, rho, omega);
  const useMeyerhoferExit = E > 0 && hFAnalytic > 0 && Number.isFinite(hFAnalytic);

  const rawPoints: SimulationPoint[] = [];
  let h = h0;
  let t = 0;
  let gelReason: SimulationResult["gelReason"] = "max_time";
  let stepIndex = 0;

  const record = () => {
    const eta = etaAt(h);
    const C = (h0 * C0) / Math.max(h, 1e-15);
    rawPoints.push({ t, h, C, eta });
  };

  record();

  while (t < maxTime) {
    const eta = etaAt(h);
    const C = (h0 * C0) / Math.max(h, 1e-15);

    const hit = crossedGelation(h, h0, C, hFAnalytic, useMeyerhoferExit);
    if (hit) {
      gelReason = hit;
      break;
    }

    const derivative = dhdt(h, rho, omega, eta, E);
    const hNext = Math.max(h + DT * derivative, 0);
    const CNext = (h0 * C0) / Math.max(hNext, 1e-15);

    const hitAfterStep = crossedGelation(
      hNext,
      h0,
      CNext,
      hFAnalytic,
      useMeyerhoferExit,
    );
    if (hitAfterStep) {
      h = hNext;
      t += DT;
      stepIndex += 1;
      gelReason = hitAfterStep;
      record();
      break;
    }

    h = hNext;
    t += DT;
    stepIndex += 1;

    if (stepIndex % recordEvery === 0) {
      record();
    }
  }

  if (gelReason === "max_time") {
    record();
  } else if (rawPoints[rawPoints.length - 1]?.t !== t) {
    record();
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
