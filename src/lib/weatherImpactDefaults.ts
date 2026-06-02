/** AI 예측 변수 기본 템플릿 */
export const DEFAULT_WEATHER_VARIABLES = [
  { id: 'temp_high', name: '고온 (30°↑)', category: 'temperature', active: true, condition: { metric: 'tempMax', operator: '>=', value: 30 }, itemEffects: {}, description: '폭염일 — 품목별 매출 비교 자동 반영', dataSource: 'Open-Meteo·POS', sampleCount: 0 },
  { id: 'temp_mild', name: '쾌적 (18~25°)', category: 'temperature', active: true, condition: { metric: 'tempMax', operator: 'between', value: [18, 25] }, itemEffects: {}, description: '쾌적 기온 — 품목별 매출 비교', dataSource: 'Open-Meteo·POS', sampleCount: 0 },
  { id: 'temp_cold', name: '한파 (5°↓)', category: 'temperature', active: true, condition: { metric: 'tempMin', operator: '<=', value: 5 }, itemEffects: {}, description: '한파 — 품목별 매출 비교', dataSource: 'Open-Meteo·POS', sampleCount: 0 },
  { id: 'rain_heavy', name: '강우 (일 5mm↑)', category: 'precipitation', active: true, condition: { metric: 'precipMm', operator: '>=', value: 5 }, itemEffects: {}, description: '강한 비 — 품목별 매출 비교', dataSource: 'Open-Meteo·POS', sampleCount: 0 },
  { id: 'rain_light', name: '비 (1~5mm)', category: 'precipitation', active: true, condition: { metric: 'precipMm', operator: 'between', value: [1, 5] }, itemEffects: {}, description: '약한 비 — 품목별 매출 비교', dataSource: 'Open-Meteo·POS', sampleCount: 0 },
  { id: 'clear_sky', name: '맑음 (강수 1mm↓)', category: 'precipitation', active: true, condition: { metric: 'precipMm', operator: '<=', value: 1 }, itemEffects: {}, description: '맑음 — 품목별 매출 비교', dataSource: 'Open-Meteo·POS', sampleCount: 0 },
  { id: 'holiday_today', name: '공휴일·기념일', category: 'event', active: true, condition: { metric: 'isHoliday', operator: '==', value: true }, itemEffects: {}, description: '공휴일·기념일 당일 매출 비교', dataSource: '캘린더·POS', sampleCount: 0 },
  { id: 'holiday_eve', name: '연휴 전날', category: 'event', active: true, condition: { metric: 'holidayEve', operator: '==', value: true }, itemEffects: {}, description: '연휴 전날 매출 비교', dataSource: '캘린더·POS', sampleCount: 0 },
  { id: 'weekend', name: '주말', category: 'dayofweek', active: true, condition: { metric: 'dayOfWeek', operator: 'in', value: [0, 6] }, itemEffects: {}, description: '주말 매출 비교', dataSource: 'POS', sampleCount: 0 },
  { id: 'payDay', name: '급여일 전후 (22~28일)', category: 'event', active: true, condition: { metric: 'dayOfMonth', operator: 'between', value: [22, 28] }, itemEffects: {}, description: '급여일 인근 매출 비교', dataSource: 'POS', sampleCount: 0 },
];
