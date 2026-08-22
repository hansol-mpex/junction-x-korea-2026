# 직결119

119 구급상황관리센터 상황요원이 중증 및 중등증 환자의 필요 치료영역을 확인하고 이송 병원을 비교하는 의사결정 보조 서비스입니다.

`환자 설명 → Gemini 치료영역 초안 → NEMC 실시간 수용정보와 과거 관측 이력 → Kakao 실제 ETA → 상황요원 최종 선택` 순서로 동작합니다.

## 핵심 원칙

- Gemini는 공식 `MKioskTy1~27` 중 치료영역과 환자 설명의 원문 근거만 반환합니다.
- 질환명, 확률, 병원 ID, 병원 순위는 AI가 생성하지 않습니다.
- NEMC 병원, 병상, 치료영역 응답은 병원명이 아니라 `hpid`로 결합합니다.
- 복수 치료영역을 모두 충족해야 `처치 가능`으로 표시합니다.
- 병원 정렬은 `처치 가능 → 확인 필요 → 처치 불가 → 실제 ETA` 순입니다.
- 과거 관측 이력은 비율, 전이, 갱신정보만 제공하며 실시간 판정과 정렬에는 반영하지 않습니다.
- 최종 후보는 자동 배정하지 않고 상황요원이 직접 선택합니다.

## 실행

요구 사항은 Node.js 20.9 이상과 npm 10 이상입니다.

```bash
npm install
copy .env.example .env.local
npm run dev
```

`http://localhost:3000`에서 실행합니다.

### 환경변수

```dotenv
NEMC_API_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
KAKAO_MOBILITY_REST_KEY=
```

| 변수 | 용도 |
| --- | --- |
| `NEMC_API_KEY` | 응급의료기관, 가용병상, `MKioskTy1~28` 조회 |
| `GEMINI_API_KEY` | 환자 설명에서 치료영역과 원문 근거 추출 |
| `GEMINI_MODEL` | 기본값 `gemini-3.5-flash-lite` |
| `KAKAO_MOBILITY_REST_KEY` | 병원별 실제 도로거리와 ETA 계산 |

세 키가 모두 있어야 전체 흐름이 동작합니다. 키가 없거나 외부 API가 실패하면 추정값으로 가장하지 않고 화면에 오류를 표시합니다.

도로명주소 선택은 Daum/Kakao Postcode 레이어에서 수행합니다. 선택한 주소의 좌표는 Kakao Local로 확인하며, 장소검색 권한이 없는 키가 403을 반환하면 OpenStreetMap Nominatim을 사용하고 응답에 제공자와 경고를 표시합니다. 병원 ETA는 계속 Kakao Mobility Directions의 실제 결과만 사용합니다.

`GET /api/health`에서 누락된 키를 확인할 수 있습니다.

## API

| 경로 | 입력 | 결과 |
| --- | --- | --- |
| `POST /api/location` | 주소 또는 장소 문자열 | 정규화 주소와 좌표 |
| `POST /api/analyze` | 환자 상태 서술 | 공식 치료영역 1~5개와 원문 근거 |
| `POST /api/hospitals` | 좌표와 선택 치료영역 | NEMC 상태와 Kakao ETA가 결합된 병원 후보 |

## 과거 관측 이력 갱신

NEMC 원본 XML에서 비식별 집계 파일 `src/data/historical-metrics.json`을 생성합니다.

```bash
npm run history:build -- --source "C:\path\to\data_sujip\data"
```

집계 단위는 `hpid + MKioskTy 코드`이며 Y 관측 횟수, 정보미제공 횟수, 상태 전환 횟수와 병상값 변동만 저장합니다. `.env`, `service.json`, 원본 XML은 앱이나 저장소에 복사하지 않습니다. 화면의 `과거 관측 이력`은 수용 확률이나 예측값이 아니며 정확한 수집 종료시각을 함께 표시합니다.

수집 중 새 XML이 생길 때마다 로컬 집계 파일을 자동 갱신하려면 별도 터미널에서 watcher를 실행합니다.

```bash
npm run history:watch -- --source "C:\path\to\data_sujip\data"
```

수집기는 앱과 동일한 6개 권역을 2개씩 순환합니다. 실행 주기는 10분이지만 권역별 관측 주기는 30분이며, NEMC 개발계정 한도 1,000회/일 중 576회를 사용합니다. 앱과 수집기가 같은 키를 쓰면 캐시되지 않은 병원 검색 1회당 18회가 추가되므로 일일 호출량을 함께 관리해야 합니다. 배포된 앱의 집계 파일을 갱신하려면 watcher 실행 후 다시 배포해야 합니다.

## 공공데이터

| 데이터셋 | 용도 |
| --- | --- |
| [전국 응급의료기관 정보 조회 서비스](https://www.data.go.kr/data/15000563/openapi.do) | 병원 기본정보, 가용병상, 응급실과 중증질환 수용상태 |
| [119구급상황관리센터 운영 현황](https://www.data.go.kr/data/15089564/fileData.do) | 문제 정의 배경 |

실제 응답에서 확인한 주의사항:

- 병원 목록 조회의 지역 파라미터는 `STAGE1`이 아니라 `Q0`입니다.
- 가용병상과 중증질환 수용정보는 시도 단위로 받은 뒤 `hpid`로 결합해야 합니다.
- 실제 수용정보 필드는 문서의 소문자 표기와 달리 `MKioskTy1~28`입니다.
- `Y`는 수용 확약이 아니며, `N`, `N1`, `불가능`, `정보미제공`을 구분해 표시합니다.
- `hvidate`는 KST `YYYYMMDDHHMMSS` 형식입니다.
- 병원 목록은 5분, 실시간 병상과 수용정보는 30초 동안 서버 메모리에서 재사용합니다.
- 동일 좌표의 Kakao 경로 결과는 1분 동안 재사용하며 실패 응답은 캐시하지 않습니다.

## 배포

서버 API와 비밀 환경변수가 필요하므로 GitHub Pages 정적 배포로는 전체 기능이 동작하지 않습니다. Vercel 등의 Next.js 서버 실행 환경에 배포하고 로컬과 동일한 네 개 환경변수를 설정해야 합니다.

```bash
npm run build
```

`src/data/historical-metrics.json`만 배포 산출물에 포함하고 `.env.local`, `data_sujip` 원본 XML, `service.json`은 포함하지 않습니다.

## 테스트

```bash
npm test
npm run lint
npm run build
```

병원명, 병상, 수용상태, 거리, ETA는 화면에 하드코딩하지 않으며 요청 시점의 외부 API 응답으로 계산합니다. 과거 관측 이력은 위 명령으로 공공데이터 원본에서 재생성합니다.

## 한계

- 본 서비스는 의료행위나 병원 배정을 대체하지 않습니다.
- NEMC의 `Y`는 기관이 입력한 시점의 상태이며 실제 수용을 보장하지 않습니다.
- `정보미제공` 병원은 제외하지 않고 `확인 필요`로 구분합니다.
- 외부 API의 지연, 쿼터, 갱신 주기에 영향을 받습니다.
- 실제 이송 전 의료진과 병원에 확인해야 합니다.

## 라이선스

MIT License
