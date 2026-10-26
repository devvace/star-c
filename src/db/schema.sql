-- STAR-C 파일럿 · 데이터 스키마 정의서 (원본)
-- 매칭용 분리 DB 자리에 두는 검증용 가상 데이터셋. 원본 개인정보는 없고 가명 ID + 매칭 변수만 둔다.

-- 대상자 (data/synthetic.csv)
CREATE TABLE subjects (
  subject_id       TEXT    PRIMARY KEY,                                  -- 가명 식별자 (VS-0001 형식)
  age              INTEGER NOT NULL,                                     -- 만 나이 → 10세 구간으로 비교 [매칭: 연령]
  sex              TEXT    NOT NULL CHECK (sex IN ('M', 'F')),           -- [매칭: 성별]
  sido_code        TEXT    NOT NULL,                                     -- 행정표준코드 시·도 2자리 [매칭: 거주지역]
  health_status    TEXT    NOT NULL CHECK (health_status IN ('건강인', '환자')), -- [매칭: 건강상태]
  disease_category TEXT,                                                 -- 6개 카테고리, 건강인은 NULL [매칭: 질환카테고리]
  disease_detail   TEXT,                                                 -- 기타 카테고리의 세부 질환명 (기타 입력 시 보조)
  consent_matching INTEGER NOT NULL CHECK (consent_matching IN (0, 1))   -- 매칭 활용 동의 여부 (전처리 조건, 가상 데이터는 모두 1)
);

-- 질환별 고정 파라미터 (data/params.csv). key는 질환 카테고리 6종 + '건강인'.
CREATE TABLE params (
  key                 TEXT PRIMARY KEY,
  response_rate       REAL NOT NULL,   -- 예상 반응률
  screening_pass_rate REAL NOT NULL    -- 스크리닝 통과율
);
