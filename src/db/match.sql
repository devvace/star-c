-- STAR-C 파일럿 · 매칭 로직 (하드필터)
-- 5개 매칭 변수가 모두 일치(AND)하는 대상자만 센다. 가중치·유사도는 쓰지 않는다.
-- 결과는 시·도별 인원 수만 반환한다. 대상자 행(subject_id)은 밖으로 내보내지 않는다.
--
-- 바인딩 값
--   :age_min, :age_max   연령 구간 (예: 50, 59 / 70세 이상은 70, 200)
--   :sex                 'M' | 'F' | 'A' (A = 성별무관, 성별 조건을 적용하지 않음)
--   :health_status       '환자' | '건강인'
--   :disease             질환 카테고리 6종 중 하나 (건강인이면 무시)
--   :disease_detail      '기타' 직접입력 문자열, 없으면 '' (질환이 '기타'일 때만 사용)
--   :regions             선택한 시·도 코드의 JSON 배열 (예: '["26","48","31"]')
SELECT sido_code, COUNT(*) AS n
FROM subjects
WHERE consent_matching = 1                                          -- 전처리: 매칭 활용 동의자만
  AND age BETWEEN :age_min AND :age_max                             -- ① 연령
  AND (:sex = 'A' OR sex = :sex)                                    -- ② 성별 (성별무관이면 적용하지 않음)
  AND sido_code IN (SELECT value FROM json_each(:regions))          -- ③ 거주지역
  AND health_status = :health_status                                -- ④ 건강상태
  AND (                                                             -- ⑤ 질환 (건강인이면 적용하지 않음)
    :health_status = '건강인'
    OR (
      disease_category = :disease
      AND (:disease <> '기타' OR :disease_detail = '' OR instr(disease_detail, :disease_detail) > 0)
    )
  )
GROUP BY sido_code
ORDER BY n DESC, sido_code;
