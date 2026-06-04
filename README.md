# Pitaya OS

정육·식자재 매장 운영 플랫폼 — **AI 매입·일마감·공개 주문·POS 연동·인사·위생** 등을 하나의 Next.js 앱으로 제공합니다.

| | |
|--|--|
| **프로덕션** | https://pitaya-osv1.vercel.app |
| **스택** | Next.js 16 · Firebase (Auth, Firestore, Storage) · Vercel |
| **POS 연동** | `pos_bridge/bridge.js` (매장 PC) |

## 문서 (구조·이해용)

| 문서 | 설명 |
|------|------|
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | 전체 구조도·모듈 맵·다이어그램 |
| **[docs/README.md](docs/README.md)** | 문서 목차·모듈별 가이드 |
| [docs/data/firestore-collections.md](docs/data/firestore-collections.md) | DB 컬렉션 표 |
| [docs/ops/deploy.md](docs/ops/deploy.md) | 배포 |
| [docs/ops/cron.md](docs/ops/cron.md) | 크론 스케줄 |
| [AGENTS.md](AGENTS.md) | AI 코딩 에이전트 규칙 (KST, POS, 카카오) |

### 모듈 가이드

- [AI 매입](docs/modules/purchases.md)
- [공개 주문](docs/modules/public-orders.md)
- [POS 브릿지](docs/modules/pos-bridge.md)
- [매출·일마감](docs/modules/sales-and-reports.md)
- [유통기한 알림](docs/modules/expiry-reminder.md)

## 로컬 실행

```bash
npm install
# .env.local — Firebase·AI·카카오 키 (팀 내부 설정 참고)
npm run dev
```

http://localhost:3000 — Google 로그인 후 매장 선택.

## 배포

```bash
git push origin main    # GitHub Actions → Vercel production
# 또는
npx vercel deploy --prod --yes
```

## 디렉터리 요약

```
src/app/dashboard/   관리 UI
src/app/api/         REST + cron
src/lib/             비즈니스 로직
pos_bridge/          POS PC 동기화 스크립트
docs/                프로젝트 문서
```

## 기타

- [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md)
- [SECURITY.md](SECURITY.md)
- `PITAYA_평가요약.txt` — 기능 평가 메모
