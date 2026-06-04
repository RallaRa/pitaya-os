# Pitaya OS 문서

프로젝트 구조·모듈·운영을 설명하는 문서 모음입니다.

## 빠른 링크

| 문서 | 내용 |
|------|------|
| [../ARCHITECTURE.md](../ARCHITECTURE.md) | 전체 구조도, 모듈 맵, 기술 스택 |
| [data/firestore-collections.md](data/firestore-collections.md) | Firestore 컬렉션·Storage 경로 |
| [ops/deploy.md](ops/deploy.md) | 배포·환경변수 |
| [ops/cron.md](ops/cron.md) | Vercel·GitHub 크론 |

## 모듈별

| 모듈 | 문서 |
|------|------|
| AI 매입 | [modules/purchases.md](modules/purchases.md) |
| 공개 주문 | [modules/public-orders.md](modules/public-orders.md) |
| POS 브릿지 | [modules/pos-bridge.md](modules/pos-bridge.md) |
| 매출·일마감·대시보드 | [modules/sales-and-reports.md](modules/sales-and-reports.md) |
| 유통기한 알림 | [modules/expiry-reminder.md](modules/expiry-reminder.md) |

## 기타 참고 (저장소 루트)

- `AGENTS.md` — AI 에이전트용 규칙 (KST, POS, 카카오)
- `PITAYA_평가요약.txt` — 기능·평가 메모
- `pos_bridge/작업순서_*.txt` — 포스 PC 작업 체크리스트

## 문서 갱신 규칙

기능을 추가·변경할 때:

1. 해당 `docs/modules/*.md`에 흐름·컬렉션·경로 1~3줄 추가
2. 새 Firestore 컬렉션이면 `data/firestore-collections.md` 표에 한 줄
3. 크론이면 `ops/cron.md`에 스케줄 추가
