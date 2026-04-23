export type OtdrPointType = 'CABIN' | 'LIVE' | 'BEP' | 'BCP' | 'BMO' | 'FLOOR_BOX';

export interface ExpectedMeasurement {
  point_type: OtdrPointType;
  floor_number?: number;
  fb_index?: number;
  label: string;
  required: boolean;
}

export interface GisContextForOTDR {
  floors?: number;
  has_bcp?: boolean;
  floor_details?: any[];
  optical_paths?: any[];
}

/**
 * Υπολογίζει ποιες μετρήσεις OTDR αναμένονται για αυτό το SR.
 */
export function computeExpectedOTDR(gis: GisContextForOTDR): ExpectedMeasurement[] {
  const expected: ExpectedMeasurement[] = [];

  // 1. Καμπίνα (πάντα)
  expected.push({
    point_type: 'CABIN',
    label: 'Καμπίνα',
    required: true,
  });

  // 2. Live (πάντα)
  expected.push({
    point_type: 'LIVE',
    label: 'Καμπίνα Live (1625nm)',
    required: true,
  });

  // 3. BEP (πάντα)
  expected.push({
    point_type: 'BEP',
    label: 'BEP',
    required: true,
  });

  // 4. BCP (μόνο αν υπάρχει)
  if (gis.has_bcp) {
    expected.push({
      point_type: 'BCP',
      label: 'BCP',
      required: true,
    });
  }

  // 5. BMO — 1 ανά όροφο
  const floors = gis.floors || 0;
  for (let f = 1; f <= floors; f++) {
    expected.push({
      point_type: 'BMO',
      floor_number: f,
      label: `BMO Όροφος ${f}`,
      required: true,
    });
  }

  // 6. Floor Boxes — από floor_details
  const fbCount = countFloorBoxes(gis.floor_details || []);
  for (let i = 1; i <= fbCount; i++) {
    expected.push({
      point_type: 'FLOOR_BOX',
      fb_index: i,
      label: `Floor Box ${String(i).padStart(2, '0')}`,
      required: true,
    });
  }

  return expected;
}

function countFloorBoxes(floorDetails: any[]): number {
  let total = 0;
  for (const fd of floorDetails) {
    const row = fd?.raw && typeof fd.raw === 'object' ? fd.raw : fd;
    if (!row || typeof row !== 'object') continue;
    const keys = Object.keys(row);
    for (const key of keys) {
      const upperKey = key.toUpperCase().trim();
      if (
        (/^FB\s?\d+$/i.test(upperKey) || upperKey === 'FB' || upperKey === 'FLOOR BOX') &&
        !upperKey.includes('TYPE')
      ) {
        const val = parseInt(String(row[key])) || 0;
        total += val;
      }
    }
  }
  return total;
}

export interface MeasurementStatus {
  expected: ExpectedMeasurement;
  uploaded?: {
    id: string;
    sor_file_url: string;
    sor_file_name: string;
    uploaded_at: string;
  };
  status: 'done' | 'missing';
}

/**
 * Κάνει match υπάρχουσες μετρήσεις με αναμενόμενες.
 */
export function matchMeasurements(
  expected: ExpectedMeasurement[],
  uploaded: any[]
): MeasurementStatus[] {
  return expected.map((exp) => {
    const match = uploaded.find(
      (u) =>
        u.point_type === exp.point_type &&
        (u.floor_number ?? null) === (exp.floor_number ?? null) &&
        (u.fb_index ?? null) === (exp.fb_index ?? null)
    );

    return {
      expected: exp,
      uploaded: match
        ? {
            id: match.id,
            sor_file_url: match.sor_file_url,
            sor_file_name: match.sor_file_name,
            uploaded_at: match.uploaded_at,
          }
        : undefined,
      status: match ? 'done' : 'missing',
    };
  });
}
