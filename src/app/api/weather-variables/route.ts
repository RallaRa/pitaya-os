import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';

const DEFAULT_VARIABLES = [
  { id:'temp_high',   name:'고온 (30°↑)',      category:'temperature',    active:true,  condition:{metric:'tempMax',operator:'>=',value:30},  itemEffects:{}, description:'폭염일 냉삼겹·아이스크림 등 수요↑', dataSource:'기상청', sampleCount:0 },
  { id:'temp_mild',   name:'쾌적 (18~25°)',     category:'temperature',    active:true,  condition:{metric:'tempMax',operator:'between',value:[18,25]}, itemEffects:{}, description:'쾌적한 날씨, 전반적 판매 안정', dataSource:'기상청', sampleCount:0 },
  { id:'temp_cold',   name:'한파 (5°↓)',        category:'temperature',    active:true,  condition:{metric:'tempMin',operator:'<=',value:5},   itemEffects:{}, description:'한파 시 탕·국거리 수요↑', dataSource:'기상청', sampleCount:0 },
  { id:'rain_heavy',  name:'강우 높음 (70%↑)',  category:'precipitation',  active:true,  condition:{metric:'precipProb',operator:'>=',value:70}, itemEffects:{}, description:'외출 감소 → 배달/간편식 수요↑', dataSource:'기상청', sampleCount:0 },
  { id:'rain_light',  name:'강우 보통 (30~69%)',category:'precipitation',  active:true,  condition:{metric:'precipProb',operator:'between',value:[30,69]}, itemEffects:{}, description:'야외 활동 감소', dataSource:'기상청', sampleCount:0 },
  { id:'clear_sky',   name:'맑음 (20%↓)',       category:'precipitation',  active:true,  condition:{metric:'precipProb',operator:'<=',value:20}, itemEffects:{}, description:'맑은 날 야외 소비 ↑', dataSource:'기상청', sampleCount:0 },
  { id:'holiday_eve', name:'연휴 전날',          category:'event',          active:true,  condition:{metric:'holidayEve',operator:'==',value:true}, itemEffects:{}, description:'연휴 전날 대량 구매 증가', dataSource:'공공데이터', sampleCount:0 },
  { id:'weekend',     name:'주말',               category:'dayofweek',      active:true,  condition:{metric:'dayOfWeek',operator:'in',value:[0,6]}, itemEffects:{}, description:'주말 외식·구매 증가', dataSource:'시스템', sampleCount:0 },
  { id:'monday',      name:'월요일',             category:'dayofweek',      active:true,  condition:{metric:'dayOfWeek',operator:'==',value:1}, itemEffects:{}, description:'월요일 특성 분석', dataSource:'시스템', sampleCount:0 },
  { id:'payDay',      name:'급여일 전후 (22~28일)',category:'event',         active:true,  condition:{metric:'dayOfMonth',operator:'between',value:[22,28]}, itemEffects:{}, description:'급여일 인근 소비 증가', dataSource:'시스템', sampleCount:0 },
];

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || 'global';
  try {
    const doc = await adminDb.collection('weather_impact_variables').doc(storeId).get();
    if (!doc.exists) {
      // 기본 변수 초기화
      await adminDb.collection('weather_impact_variables').doc(storeId).set({
        storeId, variables: DEFAULT_VARIABLES,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ variables: DEFAULT_VARIABLES, seeded: true });
    }
    return NextResponse.json({ variables: doc.data()?.variables || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { storeId = 'global', variables } = await req.json();
    await adminDb.collection('weather_impact_variables').doc(storeId).set({
      storeId, variables, updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
