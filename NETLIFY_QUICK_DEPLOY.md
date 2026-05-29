# Netlify 빠른 배포

이 프로젝트는 Netlify + Google Sheets API 방식으로 동작합니다. 사용자가 직접 수정해야 하는 파일은 없습니다.

## 가장 쉬운 방법

1. Google Cloud에서 Service Account JSON 키를 내려받습니다.
2. JSON 키 파일을 이 프로젝트 폴더에 두면 스크립트가 자동으로 찾습니다.
3. Google Sheet를 만들고 Service Account의 `client_email`을 편집자로 공유합니다.
4. PowerShell에서 프로젝트 폴더로 이동합니다.
5. 아래 명령을 실행합니다.

```powershell
.\deploy_netlify.ps1
```

스크립트가 묻는 값:

- Service Account JSON 파일 경로
- Google Sheet ID
- 관리자 키 `ADMIN_KEY`

스크립트가 자동 처리하는 것:

- `npm install`
- Function 문법 검사
- `npm run build`
- Netlify 로그인
- Netlify 사이트 연결
- Netlify 환경변수 등록
- Production 배포

테스트 배포만 하려면:

```powershell
.\deploy_netlify.ps1 -Draft
```

## 시트 ID 위치

Google Sheet 주소가 아래와 같다면:

```text
https://docs.google.com/spreadsheets/d/1abcDEFghiJKLmnopQRsTuVwxyz/edit
```

`GOOGLE_SHEET_ID`는 `1abcDEFghiJKLmnopQRsTuVwxyz`입니다.

## 배포 후 확인

- 학생 조회: `/result.html`
- 관리자 관리: `/admin.html`
- 데모 조회: `/result.html?demo=1`

관리자 페이지의 API 경로는 기본값 `/.netlify/functions/api`를 그대로 쓰면 됩니다.
