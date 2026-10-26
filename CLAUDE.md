# STAR-C 파일럿 콘솔

임상시험 의뢰자용 모집 가능성 예측·매칭 콘솔. 외주 과제이며 납품 목표는 2026-11-06.
화면 2종(조건 입력 / 예측 리포트) + 관리 화면(권한·로그·데이터 구조)으로 구성.
`reference/prototype.html`에 동작하는 프로토타입이 있다. **로직과 화면은 이것을 그대로 이식하는 것이 목표이며, 기능을 새로 발명하지 않는다.**

## 기술 결정 (확정, 바꾸지 말 것)

- Vite + TypeScript, `vanilla-ts` 템플릿. 프레임워크 없음(React/Vue 금지).
- `tsconfig`는 `strict: true`. 나머지는 Vite 기본값.
- 서버 없음. 백엔드·API·Node 런타임 코드 작성 금지.
- SQLite는 브라우저용 `sql.js`를 쓰고, 반드시 **`sql-asm.js`(WASM 없는 버전)** 를 쓴다. `file://`로 열렸을 때 `.wasm` 로딩이 막히기 때문.
- `vite-plugin-singlefile`로 빌드해서 `dist/index.html` 한 파일만 나오게 한다. 더블클릭으로 열려야 한다.
- 추가 라이브러리 금지 목록: ORM(Drizzle, Prisma 등), zod, 상태관리, UI 라이브러리, 차트 라이브러리. 막대그래프는 프로토타입처럼 CSS로 그린다.
- 의존성을 하나 추가하려면 먼저 이유를 말하고 승인을 받는다.

## 데이터 3겹 (역할이 다르므로 하나로 합치지 않는다)

| 겹 | 저장 위치 | 용도 | 쓰기 |
|---|---|---|---|
| 원본 파일 | `data/synthetic.csv`, `data/params.csv` | 가상 데이터셋 300건, 반응률·통과율 | 생성 스크립트로만 생성, 앱은 읽기 전용 |
| 실행 중 조회 | sql.js 인메모리 DB | 매칭·집계 쿼리 | 시작 시 CSV 적재 |
| 로그 | `localStorage` | 권한 전환·조회 이력 | 앱이 추가, "CSV 내보내기" 버튼 제공 |

- `data/synthetic.csv`는 `scripts/gen-synthetic.ts`로 한 번 생성해서 커밋한다. 시드 20261022, 분포 가중치는 프로토타입 값 그대로. 앱 실행 시 즉석 생성하지 않는다.
- CSV는 `import x from './file.csv?raw'`로 빌드 시 인라인한다. `fetch` 사용 금지(`file://`에서 실패).
- 로그 행에는 조건과 집계값만 남기고 `subject_id`를 포함하지 않는다.

## 스키마와 로직은 SQL이 원본

- `src/db/schema.sql` — DDL. 이 파일이 "데이터 스키마 정의서"의 원본이다.
  - `subjects(subject_id, age, sex, sido_code, health_status, disease_category, disease_detail, consent_matching)`
  - `params(key, response_rate, screening_pass_rate)`
- `src/db/match.sql` — 하드필터 매칭 쿼리. 이 파일이 "매칭 로직 설명서"에 그대로 들어간다.
  - 5변수 전부 일치(AND)만 사용. 가중치·유사도 없음.
  - `consent_matching = 1` 조건을 반드시 포함 (프로토타입에는 빠져 있음 — 수정 사항).
  - `health_status = '건강인'`이면 질환 조건을 적용하지 않는다.
- JS로 필터링하지 말고 SQL로 집계한다. 지역별 분포도 `GROUP BY sido_code`.

## 디렉토리 구조

```
starc/
  CLAUDE.md
  reference/prototype.html      이식 원본 (수정하지 않음)
  data/synthetic.csv, params.csv
  scripts/gen-synthetic.ts
  src/
    db/schema.sql, match.sql, db.ts
    codes.ts                     시도 17개(행정표준코드), 연령구간, 질환 목록
    predict.ts                   예상 등록 인원 · 소요기간 · 기관 점수
    main.ts                      화면
    style.css
  index.html
```

## 미확정 사항 — 구현은 하되 설정값으로 분리하고 `// TODO(신트리아 확정 대기)` 표시

프로토타입이 임의로 정한 값이며 발주처 확정 전이다. 코드에 하드코딩하지 말고 `params.csv` 또는 `src/config.ts`에 모은다.

- 반응률·스크리닝 통과율 (질환별)
- 소요기간 모델: 현 풀 소진 3개월, 월 신규 유입률 15%, 표시 상한 24개월
- 권장 기관 점수: 매칭률 0.6 + 접근성 0.4, 근접도 같은 시도 1.0 / 같은 권역 0.6 / 그 외 0.2
- 가상 실시기관 10곳 목록

## 화면 요건 (요청서 기준, 프로토타입이 이미 충족)

입력: 연령(10세 구간 6개) / 성별 / 건강인·환자 / 질환 6개(기타 직접입력) / 지역 17개 다중선택(부산·경남 상단) / 목표 인원(1 이상 정수)
리포트: 매칭 대상자 수 / 예상 등록 인원 / 지역별 분포 / 예상 소요기간 / 권장 실시기관 상위 5
관리: 사용 로그 / 고정 파라미터 / 데이터 분리 구조 도식 / 데이터셋 스키마 표 / 5명 미만 셀 마스킹 토글

## 납품 조건

- `npm run build` → `dist/index.html` 단일 파일. 인터넷 없이 더블클릭으로 동작할 것.
- 산출물에 포함: `dist/index.html`, `data/*.csv`, `src/db/*.sql`, 소스 전체.
- 콘솔에 "파일럿 · 검증용 가상 데이터셋 · 실 DB 미연동" 표시 유지.

## 작업 순서

1. Vite 프로젝트 생성, singlefile 플러그인, sql-asm 로딩까지 확인 (빈 DB에 `SELECT 1`)
2. `schema.sql` + `gen-synthetic.ts` → CSV 생성 → 적재 확인
3. `match.sql` + `predict.ts` — 프로토타입과 같은 입력에 같은 숫자가 나오는지 대조
4. 화면 이식 (`main.ts`, `style.css`)
5. 로그 CSV 내보내기
6. 빌드해서 `file://`로 열어 확인

각 단계가 끝나면 멈추고 보고한다. 한 번에 전부 만들지 않는다.

## 하지 말 것

- 프로토타입에 없는 기능 추가 (자연어 입력, 소프트 스코어링, 인증, 차트 라이브러리)
- "나중을 위해" 추상화 레이어 만들기
- 요청서나 CLAUDE.md의 요건을 해석으로 바꾸기 — 애매하면 질문
