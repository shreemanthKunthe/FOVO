import type {
  AuditoriumArchShape,
  AuditoriumConfig,
  RowDef,
  SeatStatus,
  SectionDef,
  SectionId,
} from '../domain/types';
import { validateAuditoriumGeometry } from '../domain/layout/generateSeats';

/**
 * Vista Cinema Connect API — `GetSessionSeatPlan` / OCAPI SeatPlan schema.
 *
 * Hierarchy:
 *   SeatLayoutData -> Areas[] -> Rows[] -> Seats[] -> Position { AreaNumber, RowIndex, ColumnIndex }
 *
 * IMPORTANT GEOMETRY NOTE:
 * Vista's `GetSessionSeatPlan` returns a 2D logical/pixel grid (`RowIndex`, `ColumnIndex`,
 * `BoundaryLeft`, `BoundaryRight`, `ScreenWidth`) plus per-seat transactional status
 * (`0` = Available, `1` = Sold, `2` = Reserved/Held, `4` = Broken/Blocked).
 * It does NOT natively return 3D physical elevation (`riser` in metres) or row-to-row depth
 * in metres unless augmented by an operator's `PhysicalCalibration` block.
 */
export interface VistaSeatPosition {
  AreaNumber: number;
  RowIndex: number;
  ColumnIndex: number;
}

export interface VistaSeatNode {
  Id: string;
  Status: number | 'Available' | 'Sold' | 'Reserved' | 'Unavailable';
  SeatStyle?: number | string;
  Position: VistaSeatPosition;
  PriceInCents?: number;
}

export interface VistaRowNode {
  RowIndex: number;
  PhysicalName: string;
  Seats: VistaSeatNode[];
}

export interface VistaAreaNode {
  Number: number;
  AreaCategoryCode?: string;
  Description: string;
  RowCount?: number;
  ColumnCount?: number;
  DefaultPriceInr?: number;
  Rows: VistaRowNode[];
}

export interface VistaPhysicalCalibration {
  screenWidthM: number;
  screenHeightM: number;
  screenBottomYM: number;
  firstRowDistanceM: number;
  rowPitchM?: number;
  seatPitchM?: number;
  archShape?: AuditoriumArchShape;
  verifiedLaserSurvey?: boolean;
}

export interface VistaSeatPlanPayload {
  ResponseCode?: number;
  CinemaId?: string;
  SessionId?: string;
  ScreenName?: string;
  ScreenNumber?: number;
  SeatLayoutData: {
    BoundaryLeft?: number;
    BoundaryRight?: number;
    ScreenWidth?: number;
    ScreenStart?: number;
    Areas: VistaAreaNode[];
  };
  /** Optional FOVO physical calibration block for exact 3D metres conversion. */
  PhysicalCalibration?: VistaPhysicalCalibration;
}

export interface VistaConversionOutput {
  ok: boolean;
  config: AuditoriumConfig | null;
  availability: Record<string, SeatStatus>;
  errors: string[];
  warnings: string[];
  hasPhysical3DCalibration: boolean;
}

function classifyVistaAreaToSection(description: string, areaIdx: number, totalAreas: number): SectionId {
  const d = description.toLowerCase();
  if (d.includes('recliner') || d.includes('vip') || d.includes('gold') || d.includes('prime') || d.includes('insignia') || d.includes('director')) {
    return 'prime';
  }
  if (d.includes('lounger') || d.includes('front') || d.includes('bean')) {
    return 'lounger';
  }
  if (d.includes('plus') || d.includes('executive') || d.includes('club') || d.includes('royal') || d.includes('premier')) {
    return 'classicPlus';
  }
  if (d.includes('classic') || d.includes('normal') || d.includes('silver') || d.includes('stalls')) {
    return 'classic';
  }
  // Positional fallback if area description is generic ("Area 1", "Area 2")
  if (areaIdx === 0 && totalAreas >= 3) return 'classic';
  if (areaIdx === totalAreas - 1 && totalAreas >= 2) return 'prime';
  return 'classicPlus';
}

function mapVistaSeatStatus(status: VistaSeatNode['Status']): SeatStatus {
  if (status === 0 || status === 'Available') return 'available';
  if (status === 1 || status === 2 || status === 'Sold' || status === 'Reserved') return 'occupied';
  return 'unavailable';
}

/**
 * Converts a Vista Cinema Connect `GetSessionSeatPlan` response into FOVO's
 * 3D `AuditoriumConfig` + `Record<string, SeatStatus>` availability map.
 *
 * Never fabricates seat positions if `SeatLayoutData.Areas` or `Position.ColumnIndex`
 * are missing.
 */
export function convertVistaSeatPlanToFovo(
  payload: VistaSeatPlanPayload,
  options?: {
    cinemaId?: string;
    city?: string;
    country?: string;
  },
): VistaConversionOutput {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!payload || !payload.SeatLayoutData || !Array.isArray(payload.SeatLayoutData.Areas)) {
    return {
      ok: false,
      config: null,
      availability: {},
      errors: ['Payload is missing SeatLayoutData.Areas array (expected Vista GetSessionSeatPlan schema).'],
      warnings: [],
      hasPhysical3DCalibration: false,
    };
  }

  const areas = payload.SeatLayoutData.Areas;
  if (areas.length === 0) {
    return {
      ok: false,
      config: null,
      availability: {},
      errors: ['SeatLayoutData.Areas is empty — no auditorium seating data returned by provider.'],
      warnings: [],
      hasPhysical3DCalibration: false,
    };
  }

  const cal = payload.PhysicalCalibration;
  const hasPhysical3DCalibration = Boolean(
    cal && cal.screenWidthM > 2 && cal.screenHeightM > 1 && cal.firstRowDistanceM > 1,
  );

  if (!hasPhysical3DCalibration) {
    warnings.push(
      'Vista GetSessionSeatPlan supplies a 2D seat/column grid without 3D laser elevation (riser height & screen distance in metres). Calibrated standard multiplex pitch and sightline risers have been applied and marked as VISTA_GRID_CALIBRATED.',
    );
  }

  const screenWidth = cal?.screenWidthM ?? 12.4;
  const screenHeight = cal?.screenHeightM ?? 5.2;
  const screenBottomY = cal?.screenBottomYM ?? 1.5;
  const firstRowZ = cal?.firstRowDistanceM ?? 5.4;
  const archShape: AuditoriumArchShape = cal?.archShape ?? 'rectangular';

  const sections: Record<SectionId, SectionDef> = {
    lounger: {
      id: 'lounger',
      label: 'Lounger',
      price: 290,
      color: '#c98aa5',
      seatStyle: 'lounger',
      seatPitch: cal?.seatPitchM ?? 0.92,
      seatHeight: 0.4,
      eyeOffset: 0.7,
    },
    classic: {
      id: 'classic',
      label: 'Classic',
      price: 230,
      color: '#86b79a',
      seatStyle: 'standard',
      seatPitch: cal?.seatPitchM ?? 0.56,
      seatHeight: 0.45,
      eyeOffset: 0.75,
    },
    classicPlus: {
      id: 'classicPlus',
      label: 'Classic Plus',
      price: 280,
      color: '#7aa7d9',
      seatStyle: 'standard',
      seatPitch: cal?.seatPitchM ?? 0.58,
      seatHeight: 0.45,
      eyeOffset: 0.75,
    },
    prime: {
      id: 'prime',
      label: 'Prime Recliner',
      price: 380,
      color: '#d4af6a',
      seatStyle: 'recliner',
      seatPitch: cal?.seatPitchM ? cal.seatPitchM * 1.15 : 0.68,
      seatHeight: 0.45,
      eyeOffset: 0.75,
    },
  };

  // Collect all rows ordered front-to-back by Area & RowIndex
  interface ParsedRow {
    label: string;
    section: SectionId;
    seatCount: number;
    aislesAfter: number[];
    missingSeats: number[];
    rowIndexGlobal: number;
  }

  const parsedRows: ParsedRow[] = [];
  const availability: Record<string, SeatStatus> = {};
  let globalRowCounter = 0;

  areas.forEach((area, areaIdx) => {
    const secId = classifyVistaAreaToSection(area.Description || '', areaIdx, areas.length);
    if (typeof area.DefaultPriceInr === 'number' && area.DefaultPriceInr > 0) {
      sections[secId].price = area.DefaultPriceInr;
    }

    const sortedRows = [...(area.Rows || [])].sort((a, b) => a.RowIndex - b.RowIndex);
    for (const r of sortedRows) {
      if (!r.PhysicalName || !Array.isArray(r.Seats) || r.Seats.length === 0) continue;

      // Sort seats by ColumnIndex so we can detect aisle gaps and seat numbers
      const validSeats = r.Seats.filter(
        (s) => s && s.Position && typeof s.Position.ColumnIndex === 'number',
      ).sort((a, b) => a.Position.ColumnIndex - b.Position.ColumnIndex);

      if (validSeats.length === 0) {
        errors.push(`Row ${r.PhysicalName} has seats without Position.ColumnIndex.`);
        continue;
      }

      const aislesAfter: number[] = [];
      for (let i = 0; i < validSeats.length - 1; i++) {
        const curCol = validSeats[i].Position.ColumnIndex;
        const nextCol = validSeats[i + 1].Position.ColumnIndex;
        // A jump > 1 in Vista ColumnIndex indicates a physical walkway / aisle gap
        if (nextCol - curCol > 1) {
          aislesAfter.push(i + 1);
        }
      }

      validSeats.forEach((s, idx) => {
        const seatNum = idx + 1;
        const fovoSeatId = `${r.PhysicalName}-${seatNum}`;
        availability[fovoSeatId] = mapVistaSeatStatus(s.Status);
      });

      parsedRows.push({
        label: r.PhysicalName,
        section: secId,
        seatCount: validSeats.length,
        aislesAfter,
        missingSeats: [],
        rowIndexGlobal: globalRowCounter++,
      });
    }
  });

  if (parsedRows.length === 0) {
    return {
      ok: false,
      config: null,
      availability: {},
      errors: errors.length > 0 ? errors : ['No valid rows with positioned seats found in Vista payload.'],
      warnings,
      hasPhysical3DCalibration,
    };
  }

  // Convert parsed rows into 3D z and riser elevations (front to back)
  const rows: RowDef[] = [];
  const baseRowPitch = cal?.rowPitchM ?? 1.14;
  let currentZ = firstRowZ;
  let currentRiser = 0;

  parsedRows.forEach((pr, idx) => {
    if (idx > 0) {
      const prev = parsedRows[idx - 1];
      const sectionChanged = prev.section !== pr.section;
      const stepZ = (pr.section === 'prime' || pr.section === 'lounger' ? baseRowPitch * 1.25 : baseRowPitch) +
        (sectionChanged ? 0.45 : 0);
      currentZ = Number((currentZ + stepZ).toFixed(2));
      const stepRiser = pr.section === 'prime' ? 0.34 : 0.26;
      currentRiser = Number((currentRiser + stepRiser).toFixed(2));
    }
    rows.push({
      label: pr.label,
      section: pr.section,
      seatCount: pr.seatCount,
      aislesAfter: pr.aislesAfter.length > 0 ? pr.aislesAfter : undefined,
      missingSeats: pr.missingSeats.length > 0 ? pr.missingSeats : undefined,
      curveRadius: archShape === 'imax' ? 26 : archShape === 'curved' ? 32 : undefined,
      z: currentZ,
      riser: currentRiser,
    });
  });

  const aisleWidth = 0.95;
  const maxRowWidth = Math.max(
    ...rows.map(
      (r) =>
        r.seatCount * sections[r.section].seatPitch +
        (r.aislesAfter?.length ?? 0) * aisleWidth,
    ),
  );
  const lastRow = rows[rows.length - 1];

  const config: AuditoriumConfig = {
    id: `vista-${payload.CinemaId || 'cinema'}-${payload.SessionId || 'session'}`,
    name: payload.ScreenName || `Vista Auditorium ${payload.ScreenNumber ?? 1}`,
    cinemaId: options?.cinemaId ?? payload.CinemaId,
    screenNumber: payload.ScreenNumber ?? 1,
    country: options?.country ?? 'India',
    city: options?.city,
    archShape,
    layoutSource: 'VISTA_CONNECT_API',
    lastVerifiedAt: new Date().toISOString().slice(0, 10),
    verificationStatus:
      hasPhysical3DCalibration && cal?.verifiedLaserSurvey
        ? 'VERIFIED_LAYOUT'
        : 'VISTA_GRID_CALIBRATED',
    verificationNotes:
      hasPhysical3DCalibration && cal?.verifiedLaserSurvey
        ? 'Converted from Vista GetSessionSeatPlan with verified 3D physical screen & riser calibration.'
        : 'Converted from Vista Cinema Connect GetSessionSeatPlan 2D seat/aisle grid with calibrated 3D sightline risers.',
    dims: {
      width: Math.max(14, Math.ceil(maxRowWidth + 3.4), Math.ceil(screenWidth + 2)),
      length: Math.ceil(lastRow.z + 3.2),
      height: Math.max(Math.ceil(lastRow.riser + 5.2), Math.ceil(screenBottomY + screenHeight + 1.5)),
    },
    screen: {
      width: screenWidth,
      height: screenHeight,
      bottomY: screenBottomY,
    },
    aisleWidth,
    sections,
    rows,
  };

  const geoValidation = validateAuditoriumGeometry(config);
  if (!geoValidation.valid) {
    return {
      ok: false,
      config: null,
      availability: {},
      errors: [...errors, ...geoValidation.errors],
      warnings,
      hasPhysical3DCalibration,
    };
  }

  return {
    ok: true,
    config,
    availability,
    errors,
    warnings,
    hasPhysical3DCalibration,
  };
}

/**
 * Sample authentic Vista Cinema Connect `GetSessionSeatPlan` payload for
 * testing and demonstrating the automated Vista -> FOVO 3D geometry pipeline.
 */
export const SAMPLE_VISTA_SEAT_PLAN_PAYLOAD: VistaSeatPlanPayload = {
  ResponseCode: 0,
  CinemaId: 'VISTA-IN-BLR-01',
  SessionId: 'SES-90482',
  ScreenName: 'Audi 01 · Dolby Atmos (Vista Connect SeatPlan)',
  ScreenNumber: 1,
  SeatLayoutData: {
    BoundaryLeft: 0,
    BoundaryRight: 960,
    ScreenWidth: 780,
    ScreenStart: 90,
    Areas: [
      {
        Number: 1,
        AreaCategoryCode: 'FRNT',
        Description: 'Front Lounger',
        DefaultPriceInr: 260,
        Rows: [
          {
            RowIndex: 1,
            PhysicalName: 'J',
            Seats: [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16].map((col, idx) => ({
              Id: `J-${idx + 1}`,
              Status: col === 7 || col === 8 ? 1 : 0,
              Position: { AreaNumber: 1, RowIndex: 1, ColumnIndex: col },
            })),
          },
        ],
      },
      {
        Number: 2,
        AreaCategoryCode: 'EXEC',
        Description: 'Classic Executive',
        DefaultPriceInr: 290,
        Rows: ['H', 'G', 'F'].map((label, rIdx) => ({
          RowIndex: rIdx + 2,
          PhysicalName: label,
          Seats: [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18].map((col, idx) => ({
            Id: `${label}-${idx + 1}`,
            Status: (rIdx + col) % 7 === 0 ? 1 : 0,
            Position: { AreaNumber: 2, RowIndex: rIdx + 2, ColumnIndex: col },
          })),
        })),
      },
      {
        Number: 3,
        AreaCategoryCode: 'CLUB',
        Description: 'Royal Club Plus',
        DefaultPriceInr: 350,
        Rows: ['E', 'D', 'C'].map((label, rIdx) => ({
          RowIndex: rIdx + 5,
          PhysicalName: label,
          Seats: [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 18, 19, 20].map((col, idx) => ({
            Id: `${label}-${idx + 1}`,
            Status: (rIdx + col) % 5 === 0 ? 1 : 0,
            Position: { AreaNumber: 3, RowIndex: rIdx + 5, ColumnIndex: col },
          })),
        })),
      },
      {
        Number: 4,
        AreaCategoryCode: 'VIP',
        Description: 'Prime VIP Recliner',
        DefaultPriceInr: 520,
        Rows: ['B', 'A'].map((label, rIdx) => ({
          RowIndex: rIdx + 8,
          PhysicalName: label,
          Seats: [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14].map((col, idx) => ({
            Id: `${label}-${idx + 1}`,
            Status: col === 6 || col === 7 ? 1 : 0,
            Position: { AreaNumber: 4, RowIndex: rIdx + 8, ColumnIndex: col },
          })),
        })),
      },
    ],
  },
  PhysicalCalibration: {
    screenWidthM: 14.2,
    screenHeightM: 6.0,
    screenBottomYM: 1.45,
    firstRowDistanceM: 5.8,
    rowPitchM: 1.18,
    seatPitchM: 0.6,
    archShape: 'curved',
    verifiedLaserSurvey: false,
  },
};
