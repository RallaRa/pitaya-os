# KT 통화매니저 → Pitaya 전화 알림 (POS PC)

## 파일 (C:\pitaya-os)
- `kt-caller.js` — 메인 (3초 폴링, Firebase, 토스트, 카카오)
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
# SSH 키 등록 후
./pos_pc/deploy-kt-caller.sh
```

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

## SSH 키 등록 (한 번만, POS 관리자 PowerShell)
```powershell
mkdir C:\Users\User\.ssh -Force
# Mac의 pitaya_pos.pub 내용을 authorized_keys에 추가
```
