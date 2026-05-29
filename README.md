# ㈜화신 AX Ambassador 현장실습 결과조회 포털

## 파일 구성

| 파일 | 용도 |
|---|---|
| `index.html` | 기존 랜딩 페이지 개편본. 직접 지원/협약교 조회 섹션 제거, 합격자 조회 링크 추가 |
| `result.html` | 학생용 합격자 조회 페이지. 이름+생년월일 입력 후 Google Sheets 조회 |
| `admin.html` | 담당자용 관리 페이지. 대학별 지원자 등록, 전형 단계 처리, 안내문 제어 |
| `netlify/functions/api.js` | Netlify Function에서 Google Sheets API를 호출하는 백엔드 API |
| `google_apps_script.gs` | 이전 Apps Script 방식 샘플. Netlify 운영에서는 사용하지 않음 |
| `netlify.toml` | Netlify 배포 및 보안 헤더 설정 |
| `package.json` | Netlify Function 의존성 설정 |

## 운영 흐름

1. 학생은 소속 대학 절차에 따라 이력서를 접수합니다.
2. 담당자는 대학별 접수자료를 확인한 뒤 `admin.html`에서 지원자 정보를 등록합니다.
3. 데이터는 Google Sheets의 `applicants` 시트에 저장됩니다.
4. 학생은 `result.html`에서 이름+생년월일로 결과를 조회합니다.
5. 전형 단계에 따라 안내문이 다르게 표시됩니다.
   - `DOCUMENT_PASS`: 서류합격, 면접 참석 여부 회신
   - `FINAL_PASS`: 최종합격, 입사 준비서류 및 요청사항 안내
   - `DOCUMENT_FAIL` / `FINAL_FAIL`: 불합격 안내
   - `REVIEWING`: 검토 중

## Netlify + Google Sheets 연동 방법

가장 간단한 배포는 `NETLIFY_QUICK_DEPLOY.md`의 `deploy_netlify.ps1` 방식을 사용하세요.

1. Google Cloud Console에서 프로젝트를 만들고 Google Sheets API를 활성화합니다.
2. Service Account를 생성하고 JSON 키를 발급합니다.
3. Google Sheets 파일을 만들고, Service Account의 `client_email`을 시트 편집자로 공유합니다.
4. 시트 URL에서 `GOOGLE_SHEET_ID`를 확인합니다.
5. Netlify 사이트의 Environment Variables에 아래 값을 등록합니다.
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`: 서비스 계정 `client_email`
   - `GOOGLE_PRIVATE_KEY`: 서비스 계정 `private_key`
   - `GOOGLE_SHEET_ID`: 스프레드시트 ID
   - `ADMIN_KEY`: 담당자 관리 화면에서 사용할 관리자 키
   - `GOOGLE_SHEET_NAME`: 선택사항. 기본값은 `applicants`
6. Netlify에 배포합니다. 기본 API 경로는 `/.netlify/functions/api`입니다.

로컬 파일로 직접 열거나 `?demo=1`을 붙이면 데모 조회가 동작합니다. Netlify 운영 환경에서는 Google Sheets API를 통해 실제 데이터를 조회합니다.

## GitHub 저장소를 통한 Netlify 연동

GitHub 저장소에 이 프로젝트를 올린 뒤 Netlify에서 `Add new site > Import an existing project`를 선택하면 됩니다.

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`
- 설정 파일: `netlify.toml`

Netlify 환경변수에는 `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEET_ID`, `ADMIN_KEY`를 등록해야 합니다. 서비스 계정 JSON 파일 자체는 GitHub에 올리지 않습니다.

## 보안 유의사항

- `admin.html`은 공개 배포보다 사내망, 제한된 링크, 또는 별도 인증 환경에서 사용하는 것이 안전합니다.
- 현재 샘플은 관리자 키 기반의 경량 통제 방식입니다.
- 관리자 키를 브라우저 `localStorage`에 저장하는 구조이므로 공용 PC에서 사용 후 반드시 초기화하거나 브라우저 데이터를 삭제해야 합니다.
- 실제 운영에서는 Netlify Identity, Google Workspace SSO, 또는 별도 관리자 인증을 추가하는 것을 권장합니다.
