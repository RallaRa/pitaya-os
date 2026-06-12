import { buildCookieHeader, type HometaxCookie } from '@/lib/purchase/hometaxTypes';
import { buildNtsPostfix, jsonMinified } from '@/lib/purchase/hometaxCrypto.server';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';
const PAGE_SIZE = 100;
const LOGIN_SUCCESS = 'S';

export interface HometaxTrader {
  businessNumber: string;
  tin: string;
}

export class HometaxClient {
  private cookieHeader: string;
  private userId = '';
  private pubcUserNo = '';
  tin = '';
  txprClsfCd = '';
  businessNumber = '';
  private subdomain: string | null = null;

  constructor(cookies: HometaxCookie[]) {
    this.cookieHeader = buildCookieHeader(cookies);
  }

  private async post(
    url: string,
    opts: { method?: string; body?: string; contentType?: string } = {},
  ): Promise<string> {
    const res = await fetch(url, {
      method: opts.method || 'POST',
      headers: {
        Cookie: this.cookieHeader,
        'User-Agent': UA,
        Accept: 'application/json, text/plain, */*',
        ...(opts.contentType ? { 'Content-Type': opts.contentType } : {}),
      },
      body: opts.body,
      redirect: 'manual',
    });

    const text = await res.text();
    if (text.includes('반복적인 호출') || text.includes('서비스 중지')) {
      throw new Error('홈택스 요청 제한 — 잠시 후 다시 시도하세요.');
    }
    if (res.status === 400 && text.includes('Request Blocked')) {
      throw new Error('홈택스 접근이 차단되었습니다. Vercel IP 제한 가능성이 있습니다.');
    }

    return text;
  }

  private async postJson(url: string, body: string): Promise<Record<string, unknown>> {
    const text = await this.post(url, { body, contentType: 'application/json' });
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`홈택스 JSON 응답 오류: ${text.slice(0, 200)}`);
    }
  }

  async initialize(businessNumber?: string) {
    await this.deselectTrader();

    const perm = await this.postJson(
      'https://www.hometax.go.kr/permission.do?screenId=index',
      ' false ',
    );
    this.checkAuthenticated(perm);

    const sessionMap = perm.resultMsg as { sessionMap?: Record<string, string> };
    const pubcUserNo = sessionMap.sessionMap?.pubcUserNo || '';
    this.pubcUserNo = pubcUserNo;
    if (sessionMap.sessionMap?.tin) this.tin = sessionMap.sessionMap.tin;

    const userPayload = {
      pubcUserNo,
      userType: 'B',
      cncClCd: '',
      arsPswdAltYn: '',
      jntCnt: '',
    };
    const userRes = await this.requestActionJson('ATXPPAAA001R22', 'UTXPPAAA10', userPayload);
    const userDvo = userRes.pubcUserJnngInfrAdmDVO as Record<string, string> | undefined;
    if (!userDvo) throw new Error('홈택스 사용자 정보를 불러오지 못했습니다.');

    this.userId = userDvo.userId || '';
    this.txprClsfCd = userDvo.userClsfCd || '';

    if (this.txprClsfCd === '01') {
      const traders = await this.fetchTraders();
      const target = businessNumber?.replace(/-/g, '') || traders[0]?.businessNumber;
      if (target) {
        const found = traders.find(t => t.businessNumber.replace(/-/g, '') === target.replace(/-/g, ''));
        if (found) await this.selectTrader(found.tin);
        else if (traders[0]) await this.selectTrader(traders[0].tin);
      }
    } else {
      await this.loadTraderInfo();
    }

    if (!this.tin) throw new Error('사업자 TIN을 확인하지 못했습니다.');
  }

  private checkAuthenticated(data: Record<string, unknown>) {
    const resultMsg = data.resultMsg as Record<string, unknown> | undefined;
    if (!resultMsg?.sessionMap) {
      throw new Error('홈택스에 로그인되지 않은 상태입니다. 세션을 다시 연결하세요.');
    }
  }

  private async deselectTrader() {
    try {
      await this.requestPermission('UTXPPAAA24');
      await this.requestActionJson('ATXPPAAA003A01', 'UTXPPAAA24', {}, 'UTXPPAAA24', false);
    } catch {
      /* 개인사업자/법인은 무시 */
    }
  }

  async fetchTraders(): Promise<HometaxTrader[]> {
    const res = await this.requestActionJson('ATXPPAAA003R01', 'UTXPPAAA24', {}, 'UTXPPAAA24');
    const list = res.bmanBscInfrInqrDVOList as Array<Record<string, string>> | undefined;
    if (!list?.length) return [];
    return list.map(row => ({
      businessNumber: row.txprDscmNoEncCntn || '',
      tin: row.tin || '',
    }));
  }

  async selectTrader(tin: string) {
    await this.requestPermission('UTXPPAAA24');
    await this.requestActionJson('ATXPPAAA003A01', 'UTXPPAAA24', { tin }, 'UTXPPAAA24');
    await this.requestPermission('index');
    if (this.tin !== tin) {
      throw new Error('사업자 선택에 실패했습니다.');
    }
    const traders = await this.fetchTraders();
    const found = traders.find(t => t.tin === tin);
    if (found) this.businessNumber = found.businessNumber.replace(/-/g, '');
  }

  private async loadTraderInfo() {
    await this.requestPermission('teht', 'UTEABGAA21');
    const res = await this.requestActionJson(
      'ATTABZAA001R17',
      'UTEABGAA21',
      {
        tin: this.tin,
        txprClsfCd: '02',
        txprDscmNo: '',
        txprDscmNoClCd: '',
        txprDscmDt: '',
        searchOrder: '02/01',
        outDes: 'bmanBscInfrInqrDVO',
        txprNm: '',
        crpTin: '',
        mntgTxprIcldYn: '',
        resnoAltHstrInqrYn: '',
        resnoAltHstrInqrBaseDtm: '',
        sameBmanInqrYn: 'N',
        rpnBmanRetrYn: 'N',
      },
      'UTEABGAA21',
      false,
      'teht',
    );

    const element = res.bmanBscInfrInqrDVO as Record<string, string> | undefined;
    if (element?.txprDscmNoEncCntn) {
      this.businessNumber = element.txprDscmNoEncCntn.replace(/-/g, '');
    }
    if (element?.tin) this.tin = element.tin;
  }

  async requestPermission(screenId: string, subdomain?: string) {
    if (subdomain && this.subdomain === subdomain && this.tin) return;

    const base = subdomain ? `https://${subdomain}.hometax.go.kr` : 'https://www.hometax.go.kr';
    let root = await this.postJson(`${base}/permission.do?screenId=${screenId}`, jsonMinified({}));

    const resultMsg = root.resultMsg as Record<string, unknown> | undefined;
    if (subdomain && !resultMsg?.sessionMap) {
      const token = await this.postJson(
        `https://hometax.go.kr/token.do?query=_${randomString(20)}`,
        jsonMinified({}),
      );
      root = await this.postJson(
        `${base}/permission.do?screenId=${screenId}&domain=hometax.go.kr`,
        jsonMinified({ ...token, popupYn: false }),
      );
    }

    const sm = (root.resultMsg as { sessionMap?: Record<string, string> })?.sessionMap;
    if (sm) {
      this.tin = sm.tin || this.tin;
      this.pubcUserNo = sm.pubcUserNo || this.pubcUserNo;
      this.txprClsfCd = sm.txprClsfCd || this.txprClsfCd;
    } else if (subdomain) {
      throw new Error('홈택스 권한 획득 실패 — 세션을 다시 연결하세요.');
    }

    this.subdomain = subdomain || null;
  }

  async requestActionJson(
    actionId: string,
    screenId: string,
    json: Record<string, unknown>,
    realScreenId = '',
    useNts = true,
    subdomain?: string,
  ): Promise<Record<string, unknown>> {
    if (subdomain) await this.requestPermission(screenId, subdomain);

    const host = subdomain ? `${subdomain}.hometax.go.kr` : 'hometax.go.kr';
    const body = useNts
      ? await buildNtsPostfix(json, this.userId)
      : jsonMinified(json);

    const data = await this.postJson(
      `https://${host}/wqAction.do?actionId=${actionId}&screenId=${screenId}&popupYn=false&realScreenId=${realScreenId}`,
      body,
    );

    const resultMsg = data.resultMsg as Record<string, unknown> | undefined;
    if (resultMsg?.result === 'F') {
      throw new Error(String(resultMsg.detailMsg || resultMsg.msg || '홈택스 요청 실패'));
    }

    return data;
  }

  async *paginateActionJson(
    actionId: string,
    screenId: string,
    json: Record<string, unknown>,
    subdomain?: string,
  ): AsyncGenerator<Record<string, unknown>> {
    let page = 1;

    while (true) {
      const pageInfoVO = { pageNum: page, pageSize: PAGE_SIZE, totalCount: 0 };
      const data = await this.requestActionJson(
        actionId,
        screenId,
        { ...json, pageInfoVO },
        '',
        true,
        subdomain,
      );

      const listKey = Object.keys(data).find(k => k.endsWith('VOList'));
      if (listKey) {
        const list = data[listKey] as Array<Record<string, unknown>> | undefined;
        if (list?.length) {
          for (const row of list) yield row;
        }
      }

      const pi = data.pageInfoVO as { totalCount?: number } | undefined;
      if (!pi?.totalCount) return;
      if (page * PAGE_SIZE >= pi.totalCount) return;

      page += 1;
      await sleep(350);
    }
  }

  async postForm(url: string, fields: Record<string, string>): Promise<string> {
    const body = new URLSearchParams(fields).toString();
    return this.post(url, { body, contentType: 'application/x-www-form-urlencoded' });
  }

  /** 전자세금계산서 상세 XML 다운로드 */
  async fetchTaxInvoiceDetailXml(etan: string): Promise<string> {
    await this.requestPermission('teet', 'UTEETBDA01');
    const etanClean = String(etan).replace(/-/g, '');
    const downloadParam = JSON.stringify({
      fileDwnYn: 'Y',
      etan: etanClean,
      etxivIsnBrkdTermDVOPrmt: {
        etan: etanClean,
        screenId: 'UTEETBDA01',
        slsPrhClCd: '01',
        etxivClCd: '',
        etxivClsfCd: '',
        etxivMpbNo: '0',
        etxivTin: this.tin,
        pageNum: 1,
        focus: 'resultGrid_cell_0_11',
        layerPopup: 'Y',
        callbackFn: 'mf_txppWframe___close_callback',
        __popupName: '전자세금계산서 상세조회 팝업',
        popupID: 'UTEETBDA38',
      },
    }).replace(/ /g, '');

    return this.postForm('https://teet.hometax.go.kr/wqAction.do', {
      downloadParam,
      actionId: 'ATEETBDA001R02',
      screenId: 'UTEETBDA38',
      downloadView: 'Y',
      noopen: 'false',
    });
  }
}

function randomString(length: number): string {
  const seed = 'qwertyuiopasdfghjklzxxcvbnm0123456789QWERTYUIOPASDDFGHJKLZXCVBNBM';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += seed[Math.floor(Math.random() * seed.length)];
  }
  return out;
}

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}

export function splitDateRange(start: string, end: string, months = 3): Array<{ begin: string; end: string }> {
  const ranges: Array<{ begin: string; end: string }> = [];
  let cur = parseYmd(start);
  const endDate = parseYmd(end);

  while (cur <= endDate) {
    const periodEnd = new Date(cur.getFullYear(), cur.getMonth() + months, cur.getDate());
    periodEnd.setDate(periodEnd.getDate() - 1);
    const actualEnd = periodEnd > endDate ? endDate : periodEnd;

    ranges.push({
      begin: formatYmd(cur),
      end: formatYmd(actualEnd),
    });

    cur = new Date(actualEnd.getFullYear(), actualEnd.getMonth(), actualEnd.getDate() + 1);
  }

  return ranges;
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/** YYYYMMDD 또는 YYYYMMDDHHmmss → YYYY-MM-DD */
export function parseHometaxDate(raw: unknown): string {
  const s = String(raw ?? '').replace(/\D/g, '');
  if (s.length >= 8) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  return '';
}

export function parseHometaxAmount(raw: unknown): number {
  const n = Number(String(raw ?? '').replace(/[,₩원\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
}
