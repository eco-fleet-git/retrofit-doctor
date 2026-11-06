// Static explanatory copy for baseline outputs. `rule` paraphrases the vendor B1 diagnose() branch
// (vendor/benchmark/src/retrofit_sim/baselines.py). `alternatives`, `discriminators` and `check` are
// engineering prompts for review; the detector does not evaluate them.

export const CHANNEL_LABELS = {
  suction_pressure_kpa: 'Suction pressure', discharge_pressure_kpa: 'Discharge pressure', flow_m3_h: 'Flow',
  fluid_temp_c: 'Fluid temperature', ambient_temp_c: 'Ambient temperature', motor_current_a: 'Motor current',
  motor_power_kw: 'Motor power', motor_speed_rpm: 'Motor speed', motor_winding_temp_c: 'Winding temperature',
  bearing_temp_c: 'Bearing temperature', vibration_rms_mm_s: 'Vibration velocity RMS',
  vibration_accel_rms_g: 'Vibration acceleration RMS', vibration_crest_factor: 'Vibration crest factor',
  valve_position_pct: 'Valve position',
};

export const CHANNEL_PLACEMENT = {
  suction_pressure_kpa: 'Pump inlet', discharge_pressure_kpa: 'Pump outlet', flow_m3_h: 'Line (location not specified)',
  fluid_temp_c: 'Near pump (exact tap not specified)', ambient_temp_c: 'Room / ambient', motor_current_a: 'Drive / MCC',
  motor_power_kw: 'Drive / power meter', motor_speed_rpm: 'VFD', motor_winding_temp_c: 'Motor winding',
  bearing_temp_c: 'Pump bearing housing', vibration_rms_mm_s: 'Pump bearing housing',
  vibration_accel_rms_g: 'Pump bearing housing', vibration_crest_factor: 'Pump bearing housing',
  valve_position_pct: 'Control valve feedback',
};

// Full T2 channel set plus VFD channels: the benchmark's largest per-asset instrumentation.
export const ALL_CHANNELS = Object.keys(CHANNEL_LABELS);

const k = 'k = 6';
export const FAULT_KNOWLEDGE = {
  SUCTION_STRAINER_CLOGGING: {
    rule: `Steady-running minutes with max |z| > ${k} for 15 consecutive minutes; suction pressure z < −6 without acceleration z > 6 (that combination is labelled cavitation). Also emitted when speed or power z > 6 and no earlier branch matched.`,
    alternatives: ['Low sump / sea-chest level or partially closed suction valve', 'Suction pressure transmitter drift or calibration step', 'Operating-point change outside the 24 h reference regimes'],
    discriminators: ['flow_m3_h', 'discharge_pressure_kpa', 'motor_power_kw', 'vibration_accel_rms_g'],
    notInBenchmark: ['Differential pressure across the strainer'],
    check: 'Compare with a local suction gauge and the strainer differential gauge if fitted; check suction valve position and tank level before opening the strainer.',
  },
  CAVITATION: {
    rule: `Suction pressure z < −6 and vibration acceleration z > 6 in the same minute (${k}).`,
    alternatives: ['Suction strainer clogging with unrelated bearing noise', 'Air entrainment', 'Accelerometer mounting or sensor fault'],
    discriminators: ['flow_m3_h', 'vibration_crest_factor', 'suction_pressure_kpa'],
    notInBenchmark: ['Acoustic / high-frequency spectrum'],
    check: 'Verify suction head against NPSH requirement; listen for cavitation noise; check strainer and suction level.',
  },
  BEARING_WEAR: {
    rule: `Acceleration z > 6 together with crest factor z > 3 or bearing temperature z > 3, or acceleration z > 12 (${k}).`,
    alternatives: ['Lubrication issue', 'Misalignment or looseness', 'Sensor mounting change'],
    discriminators: ['vibration_crest_factor', 'bearing_temp_c', 'vibration_rms_mm_s'],
    notInBenchmark: ['Envelope spectrum at bearing defect orders (BPFO/BPFI)'],
    check: 'Take a portable vibration spectrum at the bearing housing; check lubrication and bearing temperature by hand-held gauge.',
  },
  MISALIGNMENT: {
    rule: `Vibration velocity z > 6 with bearing or winding temperature z > 3 (${k}).`,
    alternatives: ['Imbalance with thermal side effect', 'Soft foot / looseness', 'Bearing degradation'],
    discriminators: ['bearing_temp_c', 'motor_winding_temp_c', 'vibration_accel_rms_g'],
    notInBenchmark: ['Axial vibration and 2× running-speed spectral component'],
    check: 'Check coupling alignment and soft foot; compare radial and axial vibration with a portable analyser.',
  },
  IMBALANCE: {
    rule: `Vibration velocity z > 6 without bearing/winding temperature z > 3 (${k}).`,
    alternatives: ['Impeller fouling or damage', 'Misalignment', 'Vibration sensor fault or mounting change'],
    discriminators: ['vibration_accel_rms_g', 'vibration_crest_factor', 'bearing_temp_c'],
    notInBenchmark: ['1× running-speed spectral component and phase'],
    check: 'Confirm with a portable vibration spectrum (1× component) before scheduling impeller inspection.',
  },
  DISCHARGE_RESTRICTION: {
    rule: `Discharge pressure z > 6 with flow, current or power z < −3; or flow z < −6 with speed z ≤ 3 (${k}).`,
    alternatives: ['Throttled or failing discharge / control valve', 'Heat-exchanger fouling downstream', 'Suction-side restriction affecting flow', 'Flow meter fault'],
    discriminators: ['flow_m3_h', 'discharge_pressure_kpa', 'suction_pressure_kpa', 'valve_position_pct'],
    notInBenchmark: ['Heat-exchanger differential pressure and temperatures'],
    check: 'Check discharge valve lineup and heat-exchanger differential pressure locally before cleaning.',
  },
  IMPELLER_WEAR: {
    rule: `Discharge pressure z < −6 with current z < 0 (${k}).`,
    alternatives: ['Suction restriction', 'Pressure transmitter drift', 'Speed / operating-point change'],
    discriminators: ['flow_m3_h', 'suction_pressure_kpa', 'motor_power_kw'],
    notInBenchmark: ['Performance test against the pump curve'],
    check: 'Run a performance test (head vs flow) against the rated curve.',
  },
  SENSOR_STUCK: {
    rule: 'A channel reported zero within-minute variation over ≥ 30 samples while running steady (vendor flatline rule; known limitations for sparse T1 cadence).',
    alternatives: ['Transmitter or gateway holding last value', 'Genuinely constant process value'],
    discriminators: [],
    notInBenchmark: ['Transmitter diagnostics / quality bits from the device'],
    check: 'Verify the transmitter with a local reading; check gateway hold-last-value configuration.',
  },
  SENSOR_CALIBRATION_SHIFT: {
    rule: 'One channel |z| > 6 while its physically coupled channels stay below |z| = 2; within-minute spread not elevated.',
    alternatives: ['Gradual sensor drift (not distinguished from a step by this rule)', 'Genuine local machine change not reflected in coupled channels'],
    discriminators: [],
    notInBenchmark: ['Redundant reference measurement'],
    check: 'Verify the named channel against a reference gauge.',
  },
  SENSOR_NOISE_SPIKES: {
    rule: 'One channel |z| > 6 while coupled channels stay below |z| = 2, and its within-minute spread z > 6.',
    alternatives: ['Calibration shift or drift with incidental noise', 'Electrical interference or loose wiring'],
    discriminators: [],
    notInBenchmark: ['Raw high-rate signal'],
    check: 'Inspect cabling and grounding; compare with a reference gauge.',
  },
  COMMUNICATION_LOSS: {
    rule: 'Fewer than 30 telemetry rows in the minute (gap rule), persisting 15 minutes. Evaluated even during reference collection.',
    alternatives: ['Gateway or network outage', 'Pump stopped with logging disabled'],
    discriminators: [],
    notInBenchmark: ['Gateway heartbeat / link diagnostics'],
    check: 'Check gateway and network link; confirm pump state locally.',
  },
  UNKNOWN: {
    rule: 'Persistent deviation (max |z| > 6) that matched no specific B1 rule pattern.',
    alternatives: ['Unmodelled machine fault', 'Process / operating-point change', 'Sensor issue on the deviating channel', 'Reference period already contained degradation'],
    discriminators: [],
    notInBenchmark: [],
    check: 'Treat as unresolved: review the deviating channels listed below and take local readings.',
  },
};

export function knowledgeFor(faultType) {
  return FAULT_KNOWLEDGE[faultType] ?? FAULT_KNOWLEDGE.UNKNOWN;
}
