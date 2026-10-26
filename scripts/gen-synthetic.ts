// 검증용 가상 데이터셋 생성. 한 번 실행해서 data/*.csv를 커밋한다. 앱은 이 CSV를 읽기만 한다.
// 실행: npm run gen:data
// 난수·분포 가중치·소비 순서는 reference/prototype.html과 동일하게 유지할 것 (같은 300건이 나와야 함).
import { writeFileSync } from 'node:fs'
import { AGE_BANDS } from '../src/codes.ts'

function rng(seed: number) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
const R = rng(20261022)
// 주의: SIDOW처럼 키가 정수형 문자열이면 for-in은 숫자 오름차순으로 돈다. 프로토타입도 같으므로 그대로 둔다.
function pick(w: Record<string, number>): string { let s = 0; for (const k in w) s += w[k]; let x = R() * s; for (const k in w) { x -= w[k]; if (x <= 0) return k } return Object.keys(w).pop()! }
const AGEW_P = { '19-29': 4, '30-39': 8, '40-49': 17, '50-59': 29, '60-69': 28, '70+': 14 }
const AGEW_H = { '19-29': 36, '30-39': 30, '40-49': 18, '50-59': 10, '60-69': 5, '70+': 1 }
const AGEW_ATO = { '19-29': 40, '30-39': 30, '40-49': 16, '50-59': 9, '60-69': 4, '70+': 1 }
const SIDOW = { '26': 44, '48': 22, '31': 8, '27': 4, '47': 3, '11': 5, '41': 5, '28': 1.5, '29': 1, '30': 1, '36': .5, '51': 1, '43': 1, '44': 1, '52': 1, '46': 1, '50': 1 }
const DISW = { '고혈압': 30, '이상지질혈증': 22, '당뇨병': 20, '아토피피부염': 11, '건선': 8, '기타': 9 }
const ETC = ['만성콩팥병', '골관절염', '천식', '통풍']

const rows: string[] = ['subject_id,age,sex,sido_code,health_status,disease_category,disease_detail,consent_matching']
for (let i = 1; i <= 300; i++) {
  const status = R() < .74 ? '환자' : '건강인'
  const disease = status === '환자' ? pick(DISW) : null
  const bandId = pick(disease === '아토피피부염' ? AGEW_ATO : status === '환자' ? AGEW_P : AGEW_H)
  const b = AGE_BANDS.find(x => x.id === bandId)!
  const hi = b.id === '70+' ? 84 : b.max
  const sexBias = disease === '고혈압' ? .56 : disease === '아토피피부염' ? .47 : .5
  const subject_id = 'VS-' + String(i).padStart(4, '0')
  const age = b.min + Math.floor(R() * (hi - b.min + 1))
  const sex = R() < sexBias ? 'M' : 'F'
  const sido_code = pick(SIDOW)
  const disease_detail = disease === '기타' ? ETC[Math.floor(R() * ETC.length)] : null
  // NULL은 빈 칸으로 쓴다. 프로토타입 데이터는 전원 매칭 동의(true).
  rows.push([subject_id, age, sex, sido_code, status, disease ?? '', disease_detail ?? '', 1].join(','))
}
writeFileSync(new URL('../data/synthetic.csv', import.meta.url), rows.join('\n') + '\n')

// TODO(신트리아 확정 대기) 반응률·스크리닝 통과율은 프로토타입의 가상 시나리오 값
const PARAMS = {
  '고혈압': { rr: .45, pass: .65 }, '이상지질혈증': { rr: .45, pass: .65 }, '당뇨병': { rr: .40, pass: .55 },
  '아토피피부염': { rr: .50, pass: .60 }, '건선': { rr: .45, pass: .55 }, '기타': { rr: .35, pass: .50 },
  '건강인': { rr: .50, pass: .70 } }
const params = ['key,response_rate,screening_pass_rate', ...Object.entries(PARAMS).map(([k, v]) => `${k},${v.rr},${v.pass}`)]
writeFileSync(new URL('../data/params.csv', import.meta.url), params.join('\n') + '\n')

console.log(`synthetic.csv ${rows.length - 1}건, params.csv ${params.length - 1}건`)
