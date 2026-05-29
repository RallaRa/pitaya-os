import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { verifyToken } from '@/lib/authVerify';

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!geminiKey) return NextResponse.json({ error: 'GEMINI_API_KEY 미설정' }, { status: 500 });

  try {
    const { date, todayData, compareData } = await req.json();

    const prompt = `너는 정육점 매출 분석 전문가야. 아래 데이터를 보고 200자 이내로 오늘 매출 핵심 인사이트를 한국어로 작성해. 숫자 나열보다 패턴/트렌드/주의사항 중심.

기준일: ${date}
금일 총매출: ${todayData?.totalSales?.toLocaleString?.() ?? todayData?.totalSales ?? 0}원
금일 순매출: ${todayData?.netSales?.toLocaleString?.() ?? todayData?.netSales ?? 0}원
객수: ${todayData?.customerCount ?? 0}명
전일: ${compareData?.yesterday?.netSales?.toLocaleString?.() ?? compareData?.yesterday?.netSales ?? '-'}원
전월동일: ${compareData?.lastMonthSame?.netSales?.toLocaleString?.() ?? compareData?.lastMonthSame?.netSales ?? '-'}원
전주동요일: ${compareData?.lastWeekDow?.netSales?.toLocaleString?.() ?? compareData?.lastWeekDow?.netSales ?? '-'}원

200자 이내. 다른 설명 없이 본문만.`;

    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    const review = result.response.text().trim().slice(0, 220);

    return NextResponse.json({ review });
  } catch (e: any) {
    console.error('[sales-review]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
