# KT 통화매니저 → Pitaya 전화 알림 (POS PC)

## 파일 (C:\pitaya-os)
- `kt-caller.js` — 메인 (3초 폴링, Firebase, 토스트, 웹 알림, 카카오)
- `kt-caller-poll.py` — KPD.dat SQLite 읽기 (Python)
- `install-kt-caller.ps1` — npm + schtasks 설치
- `bootstrap-kt-caller.ps1` — 위 3개 파일 일괄 생성 (SSH 키 없을 때)

## .env 필수
```
STORE_ID=STR-1779194754785
FIREBASE_SERVICE_ACCOUNT_KEY={...JSON...}
ENCRYPTION_KEY=64자리hex
KAKAO_REST_API_KEY=...
KAKAO_CLIENT_SECRET=...   # 토큰 갱신용 (앱 연동과 동일)

카카오 토큰은 `.env`가 아니라 Firestore `users` 문서의 `kakaoAccessToken`(Pitaya 앱 카카오 연동)을 사용합니다.
KT_STORE_PHONE=0226629592
```

## 배포 (Mac)
```bash
# SSH 2222 + 비밀번호 (expect)
expect pos_pc/deploy-kt-caller-auto-2222.exp

# 또는 kt-caller 전체
expect pos_pc/deploy-kt-caller-2222.exp
```

## 상시 실행 (자동)
| 작업 | 동작 |
|------|------|
| `PitayaKTCallerBoot` | PC 부팅 2분 후 기동 |
| `PitayaKTCallerLogon` | 로그인 시 기동 |
| `PitayaKTCallerWatchdog` | 5분마다 프로세스 확인 → 죽었으면 재기동 |
| `Startup\PitayaKTCallerSupervisor.vbs` | 로그인 시 5분마다 생존 확인 (워치독 폴백) |
| `HKCU\...\Run\PitayaKTCaller` | 위 VBS 자동 실행 |

`kt-caller-run.cmd` — 크래시 시 5초 후 자동 재시작 루프  
로그: `C:\pitaya-os\kt-caller-supervisor.log`

## 배포 (POS PowerShell — SSH 접속 중)
```powershell
# Mac에서 bootstrap만 복사 (비밀번호 입력)
# scp -P 2223 -i ~/.ssh/pitaya_pos pos_pc/bootstrap-kt-caller.ps1 User@pitayaos.iptime.org:C:/pitaya-os/

cd C:\pitaya-os
powershell -ExecutionPolicy Bypass -File .\bootstrap-kt-caller.ps1
node kt-caller.js
```

## Firebase
- 컬렉션: `pos_customers` (storeId + phoneEncrypted/nameEncrypted 복호화)
- `customers` 평문 phone도 문서에 있으면 함께 매칭
- **웹/모바일 알림**: `notifications` 컬렉션 (`type: phone_call`) → Pitaya 앱 🔔 알림 허브

## 문제 해결
- 전화 와도 알림 없음 → POS에서 `node kt-caller.js --test` 실행
- watermark 초기화(테스트용): `node kt-caller.js --reset-watermark` 후 재시작
- schtasks는 **SYSTEM 계정 금지** (토스트 안 뜸) — `install-kt-caller.ps1` 재실행

## SSH 키 등록 (한 번만, POS 관리자 PowerShell)
```powershell
mkdir C:\Users\User\.ssh -Force
# Mac의 pitaya_pos.pub 내용을 authorized_keys에 추가
```
