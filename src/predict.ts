import type { Database } from 'sql.js'
import matchSql from './db/match.sql?raw'
import { AGE_BANDS, SIDO_BY } from './codes'
import { INFLOW, INSTITUTIONS, MAX_MONTHS, POOL_MONTHS, PROXIMITY, SCORE_WEIGHT, type Institution } from './config'

export type Status = '환자' | '건강인'

export interface Condition {
  age: string // AGE_BANDS id
  sex: 'M' | 'F' | 'A' // A = 성별무관
  status: Status
  disease: string
  etc: string // '기타' 직접입력
  regions: string[] // 시·도 코드
  target: number
}

export interface RegionCount { code: string; n: number }
export interface Params { rr: number; pass: number }
export interface ScoredInstitution extends Institution { rate: number; acc: number; inSido: number; score: number }
export type Reach = 'none' | 'pool' | 'inflow' | 'over'

export interface Prediction {
  N: number // 매칭 대상자 수
  key: string // 파라미터 키 (질환 또는 '건강인')
  p: Params
  E: number // 예상 등록 인원
  months: number | null
  reach: Reach
  byRegion: RegionCount[] // 인원 내림차순
  insts: ScoredInstitution[] // 상위 5
}

// match.sql 실행 → 시·도별 매칭 인원
export function matchByRegion(db: Database, c: Condition): RegionCount[] {
  const band = AGE_BANDS.find((b) => b.id === c.age)!
  const res = db.exec(matchSql, {
    ':age_min': band.min,
    ':age_max': band.max,
    ':sex': c.sex,
    ':health_status': c.status,
    ':disease': c.disease,
    ':disease_detail': c.etc.trim(),
    ':regions': JSON.stringify(c.regions),
  })
  return (res[0]?.values ?? []).map(([code, n]) => ({ code: code as string, n: n as number }))
}

function loadParams(db: Database, key: string): Params {
  const res = db.exec('SELECT response_rate, screening_pass_rate FROM params WHERE key = ?', [key])
  const [rr, pass] = res[0].values[0] as number[]
  return { rr, pass }
}

// 점수가 수학적으로 같은데 부동소수점 끝자리만 다르면 동점으로 보고, 매칭 인원 → 기관 목록 순으로 정렬한다.
function scoreDiff(a: ScoredInstitution, b: ScoredInstitution): number {
  const d = b.score - a.score
  return Math.abs(d) < 1e-9 ? 0 : d
}

export function predict(db: Database, c: Condition): Prediction {
  const byRegion = matchByRegion(db, c)
  const N = byRegion.reduce((s, r) => s + r.n, 0)
  const key = c.status === '건강인' ? '건강인' : c.disease
  const p = loadParams(db, key)
  const E = N * p.rr * p.pass

  let months: number | null = null
  let reach: Reach = 'none'
  if (E > 0) {
    if (E >= c.target) {
      months = POOL_MONTHS * c.target / E
      reach = 'pool'
    } else {
      const perMonth = E * INFLOW
      months = POOL_MONTHS + (c.target - E) / perMonth
      reach = months > MAX_MONTHS ? 'over' : 'inflow'
    }
  }

  // 기관 점수: 매칭률(기관 소재 시·도 거주 비율) + 접근성(근접도 평균)
  const insts = INSTITUTIONS.filter((it) => it.d.includes(key)).map((it) => {
    const home = SIDO_BY[it.c]
    const inSido = byRegion.find((r) => r.code === it.c)?.n ?? 0
    const rate = N ? inSido / N : 0
    const acc = N
      ? byRegion.reduce((s, r) => s + r.n * (r.code === it.c ? PROXIMITY.sameSido : SIDO_BY[r.code].g === home.g ? PROXIMITY.sameRegion : PROXIMITY.other), 0) / N
      : 0
    return { ...it, rate, acc, inSido, score: SCORE_WEIGHT.rate * rate + SCORE_WEIGHT.access * acc }
  }).sort((a, b) => scoreDiff(a, b) || b.inSido - a.inSido).slice(0, 5)

  return { N, key, p, E, months, reach, byRegion, insts }
}
