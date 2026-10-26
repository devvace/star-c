import './style.css'
import type { Database } from 'sql.js'
import { openDb } from './db/db'
import { AGE_BANDS, DISEASES, SIDO, SIDO_BY } from './codes'
import { INFLOW, MAX_MONTHS, POOL_MONTHS } from './config'
import { matchByRegion, predict, type Condition, type Prediction } from './predict'

interface LogRow { t: string; role: string; action: string; detail: string }
interface Report extends Prediction { c: Condition; at: Date }

/* ---------- 상태 ---------- */
const DEFAULT: Condition = { age: '50-59', sex: 'M', status: '환자', disease: '고혈압', etc: '', regions: ['26', '48', '31'], target: 3 }
let state: Condition = structuredClone(DEFAULT)
let role: 'sponsor' | 'admin' = 'sponsor'
let mask = false
let logs: LogRow[] = []
let last: Report | null = null
let db: Database
let total = 0 // 가상 데이터셋 전체 건수

const store = {
  get(k: string): string | null { try { return localStorage.getItem(k) } catch { return null } },
  set(k: string, v: string): void { try { localStorage.setItem(k, v) } catch { /* 저장 불가 환경 무시 */ } },
}
try { const saved: unknown = JSON.parse(store.get('starc.logs') || '[]'); if (Array.isArray(saved)) logs = saved.slice(-200) } catch { /* 손상된 로그 무시 */ }

/* ---------- 유틸 ---------- */
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T
const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]!)
const pct = (x: number) => Math.round(x * 100) + '%'
const f1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1)
function ts(d: Date): string { const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` }
let toastTimer: number | undefined
function toast(msg: string): void { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2200) }
function scalar(sql: string): number { return db.exec(sql)[0].values[0][0] as number }

function condText(c: Omit<Condition, 'target'> & { target: number | string }): string[] {
  const parts = [AGE_BANDS.find((b) => b.id === c.age)!.label, c.sex === 'M' ? '남성' : '여성', c.status]
  if (c.status === '환자') parts.push(c.disease === '기타' ? ('기타' + (c.etc.trim() ? `(${c.etc.trim()})` : '')) : c.disease)
  const rg = c.regions.length === 17 ? '전국' : c.regions.map((x) => SIDO_BY[x].s).join('·')
  parts.push(rg, `목표 ${c.target}명`); return parts
}
// 로그에는 조건과 집계값만 남긴다 (subject_id 없음)
function addLog(action: string, detail: string): void {
  logs.push({ t: ts(new Date()), role: role === 'admin' ? '관리자' : '의뢰자', action, detail })
  logs = logs.slice(-200); store.set('starc.logs', JSON.stringify(logs))
  if (role === 'admin') renderAdmin()
}

/* ---------- 입력 화면 ---------- */
function buildForm(): void {
  $('age').innerHTML = AGE_BANDS.map((b) => `<option value="${b.id}">${b.label}</option>`).join('')
  $('disease').innerHTML = DISEASES.map((d) => `<option value="${d}">${d === '기타' ? '기타(직접입력)' : d}</option>`).join('')
  $('regions').innerHTML = SIDO.map((s, i) => `<label class="chip${i < 2 ? ' pri' : ''}"><input type="checkbox" id="rg-${s.c}" value="${s.c}">${s.s}<span class="code">${s.c}</span></label>`).join('')
}
function writeForm(): void {
  $<HTMLSelectElement>('age').value = state.age
  $<HTMLInputElement>(state.sex === 'M' ? 'sex-m' : 'sex-f').checked = true
  $<HTMLInputElement>(state.status === '환자' ? 'st-p' : 'st-h').checked = true
  $<HTMLSelectElement>('disease').value = state.disease; $<HTMLInputElement>('diseaseEtc').value = state.etc
  SIDO.forEach((s) => ($<HTMLInputElement>('rg-' + s.c).checked = state.regions.includes(s.c)))
  $<HTMLInputElement>('target').value = String(state.target)
  syncForm()
}
function readForm(): void {
  state.age = $<HTMLSelectElement>('age').value
  state.sex = document.querySelector<HTMLInputElement>('input[name="sex"]:checked')!.value as Condition['sex']
  state.status = document.querySelector<HTMLInputElement>('input[name="status"]:checked')!.value as Condition['status']
  state.disease = $<HTMLSelectElement>('disease').value; state.etc = $<HTMLInputElement>('diseaseEtc').value
  state.regions = SIDO.map((s) => s.c).filter((c) => $<HTMLInputElement>('rg-' + c).checked)
  const t = $<HTMLInputElement>('target').value.trim(); state.target = /^\d+$/.test(t) ? parseInt(t, 10) : NaN
}
function syncForm(): boolean {
  const healthy = state.status === '건강인'
  $<HTMLSelectElement>('disease').disabled = healthy; $('diseaseEtc').hidden = healthy || state.disease !== '기타'
  $('healthyNote').hidden = !healthy
  $('diseaseWhy').textContent = healthy ? '건강인은 질환 조건을 보지 않습니다.' : "부산·경남 실시기관에서 3상·4상 시험이 자주 진행되는 만성 질환 6종입니다. 목록에 없으면 '기타'를 고르고 질환명을 입력하세요."
  const okR = state.regions.length > 0, okT = Number.isInteger(state.target) && state.target >= 1
  $('rgErr').hidden = okR; $('tgErr').hidden = okT; $('target').setAttribute('aria-invalid', okT ? 'false' : 'true')
  // 미리보기
  if (okR) {
    const N = matchByRegion(db, state).reduce((s, r) => s + r.n, 0)
    $('pvN').textContent = N + '명'; $('pvOf').textContent = `가상 데이터 ${total}명 중`
  } else { $('pvN').textContent = '–'; $('pvOf').textContent = '지역을 선택하세요' }
  const parts = condText({ ...state, target: okT ? state.target : '?' })
  const labels = state.status === '환자' ? ['연령', '성별', '구분', '질환', '지역', '목표'] : ['연령', '성별', '구분', '지역', '목표']
  $('pvKv').innerHTML = parts.map((p, i) => `<dt>${labels[i]}</dt><dd>${esc(p.replace(/^목표 /, ''))}</dd>`).join('')
  return okR && okT
}

/* ---------- 결과 화면 ---------- */
function renderReport(): void {
  if (!last) return
  const { c, N, key, p, E, months, reach, byRegion, insts, at } = last
  $('condChips').innerHTML = condText(c).map((x) => `<span>${esc(x)}</span>`).join('')
  $('stamp').textContent = '생성 ' + ts(at) + ' · 가상 데이터셋 n=' + total
  const ach = Math.min(1, E / c.target)
  let durV: string, durS: string, durPill: string
  if (reach === 'none') { durV = '—'; durS = '매칭 대상자가 없어 계산할 수 없습니다'; durPill = '<span class="pill bad">산출 불가</span>' }
  else if (reach === 'pool') { durV = months! < 1 ? `${Math.max(1, Math.round(months! * 4.3))}<small>주</small>` : `${f1(months!)}<small>개월</small>`; durS = '현재 매칭 풀만으로 목표 달성'; durPill = '<span class="pill ok">현 풀로 달성</span>' }
  else if (reach === 'inflow') { durV = `${f1(months!)}<small>개월</small>`; durS = `현재 풀 ${POOL_MONTHS}개월 + 신규 유입분 모집`; durPill = '<span class="pill warn">신규 유입 필요</span>' }
  else { durV = `${MAX_MONTHS}+<small>개월</small>`; durS = `신규 유입을 반영해도 ${MAX_MONTHS}개월 안에 달성하기 어렵습니다`; durPill = '<span class="pill bad">달성 곤란</span>' }
  $('kpis').innerHTML = `
    <div class="kpi"><span class="l">매칭 대상자 수</span><span class="v">${N}<small>명</small></span><span class="s">하드필터 1차 매칭</span></div>
    <div class="kpi"><span class="l">예상 등록 인원</span><span class="v">${f1(E)}<small>명</small></span><span class="s">반응률·통과율 적용</span></div>
    <div class="kpi"><span class="l">예상 소요기간</span><span class="v">${durV}</span>${durPill}<span class="s">${durS}</span></div>
    <div class="kpi"><span class="l">현재 풀 기준 목표 달성률</span><span class="v">${pct(ach)}</span><span class="s">목표 ${c.target}명 대비</span></div>`
  $('formula').innerHTML = `
    <span class="t"><b>${N}</b><i>매칭 대상자 수</i></span><span class="op">×</span>
    <span class="t"><b>${pct(p.rr)}</b><i>예상 반응률</i></span><span class="op">×</span>
    <span class="t"><b>${pct(p.pass)}</b><i>예상 스크리닝 통과율</i></span><span class="op">=</span>
    <span class="t"><b>${f1(E)}</b><i>예상 등록 인원</i></span>
    <span class="src">반응률·통과율은 <b>${esc(key)}</b> 기준 가상 값입니다(확정 전). 소요기간은 현재 대상자를 ${POOL_MONTHS}개월 안에 모두 접촉하고, 그 뒤 매월 현재 인원의 ${pct(INFLOW)}가 새로 들어온다고 가정해 계산합니다.</span>`
  let ban = ''
  if (c.status === '건강인') ban += '<div class="banner warn">건강인 대상 시험은 주요 서비스 범위 밖입니다. 결과는 참고용입니다.</div>'
  if (N > 0 && N < 10) ban += `<div class="banner warn">매칭 대상자가 10명 미만입니다. 가상 데이터가 ${total}명뿐이라 숫자 변동이 큽니다. 지역이나 연령을 넓혀 비교해 보세요.</div>`
  if (N === 0) ban += '<div class="banner bad">조건에 맞는 대상자가 없습니다. 지역을 늘리거나 연령 구간을 바꿔 보세요.</div>'
  $('banners').innerHTML = ban
  // 지역 분포 (match.sql에서 이미 인원 내림차순)
  const max = byRegion.length ? byRegion[0].n : 1
  const hit = new Set(byRegion.map((r) => r.code))
  $('bars').innerHTML = byRegion.length ? byRegion.map(({ code, n }) => {
    const hide = mask && n < 5
    return `<div class="barrow"><span>${SIDO_BY[code].s}</span><span class="track"><span class="fill" style="width:${hide ? 0 : (n / max * 100)}%"></span></span><span class="n">${hide ? '&lt;5' : n + '명'}</span></div>`
  }).join('')
    + (c.regions.length > byRegion.length ? `<div class="fine">선택했지만 매칭 대상자가 없는 지역: ${c.regions.filter((x) => !hit.has(x)).map((x) => SIDO_BY[x].s).join(', ')}</div>` : '')
    : '<div class="empty">표시할 분포가 없습니다.</div>'
  // 기관
  $('inst').innerHTML = insts.length && N ? `<thead><tr><th>#</th><th>기관 (가상)</th><th>소재</th><th class="r">매칭률</th><th class="r">접근성</th><th class="r">점수</th></tr></thead><tbody>${
    insts.map((it, i) => `<tr><td class="rank">${i + 1}</td><td>${esc(it.n)}</td><td>${SIDO_BY[it.c].s}</td>
      <td class="r num"><span class="meter"><i style="width:${it.rate * 100}%"></i></span>${pct(it.rate)}</td>
      <td class="r num">${it.acc.toFixed(2)}</td><td class="r num">${it.score.toFixed(2)}</td></tr>`).join('')}</tbody>`
    : '<tbody><tr><td class="empty">조건에 맞는 권장 기관이 없습니다.</td></tr></tbody>'
}

/* ---------- 관리 화면 ---------- */
function renderAdmin(): void {
  const locked = role !== 'admin'
  $('adminLocked').hidden = !locked; $('adminBody').hidden = locked
  if (locked) return
  const rows = logs.slice().reverse().slice(0, 40)
  $('log').innerHTML = `<thead><tr><th>시각</th><th>권한</th><th>동작</th><th>내용</th></tr></thead><tbody>${
    rows.length ? rows.map((l) => `<tr><td class="num">${esc(l.t)}</td><td>${esc(l.role)}</td><td>${esc(l.action)}</td><td>${esc(l.detail)}</td></tr>`).join('') : '<tr><td colspan="4" class="empty">아직 기록이 없습니다.</td></tr>'}</tbody>`
  $('logCsvNote').textContent = `저장된 ${logs.length}건 (최근 200건까지 보관, 화면에는 40건 표시)`
  const params = db.exec('SELECT key, response_rate, screening_pass_rate FROM params ORDER BY rowid')[0].values as [string, number, number][]
  $('params').innerHTML = `<thead><tr><th>구분</th><th class="r">예상 반응률</th><th class="r">스크리닝 통과율</th><th class="r">곱</th></tr></thead><tbody>${
    params.map(([k, rr, pass]) => `<tr><td>${esc(k)}</td><td class="r num">${pct(rr)}</td><td class="r num">${pct(pass)}</td><td class="r num">${(rr * pass).toFixed(3)}</td></tr>`).join('')}</tbody>`
  $('paramsFoot').textContent = `소요기간 가정: 현재 풀 소진 ${POOL_MONTHS}개월, 월 신규 유입률 ${pct(INFLOW)}, 표시 상한 ${MAX_MONTHS}개월.`
  const pat = scalar("SELECT COUNT(*) FROM subjects WHERE health_status = '환자'")
  const bs = scalar("SELECT COUNT(*) FROM subjects WHERE sido_code = '26'"), gn = scalar("SELECT COUNT(*) FROM subjects WHERE sido_code = '48'")
  $('dsSub').textContent = `총 ${total}명 · 환자 ${pat} / 건강인 ${total - pat} · 부산 ${bs}, 경남 ${gn} · 시드 20261022로 생성한 고정 데이터입니다. 개별 행은 화면에 표시하지 않습니다.`
  const schema = [
    ['subject_id', '문자', '가명 식별자 (VS-0001 형식)', '—'],
    ['age', '정수', '만 나이 → 10세 구간으로 비교', '● 연령'],
    ['sex', '코드', 'M / F', '● 성별'],
    ['sido_code', '코드', '행정표준코드 시·도 2자리', '● 거주지역'],
    ['health_status', '코드', '건강인 / 환자', '● 건강상태'],
    ['disease_category', '코드', '6개 카테고리, 건강인은 null', '● 질환카테고리'],
    ['disease_detail', '문자', '기타 카테고리의 세부 질환명', '기타 입력 시 보조'],
    ['consent_matching', '불리언', '매칭 활용 동의 여부 (가상 데이터는 모두 true)', '전처리 조건']]
  $('schema').innerHTML = `<thead><tr><th>필드</th><th>형식</th><th>설명</th><th>매칭 변수</th></tr></thead><tbody>${
    schema.map((r) => `<tr><td class="mono">${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join('')}</tbody>`
}

// 사용 로그 CSV 내보내기. 엑셀에서 한글이 깨지지 않도록 BOM + CRLF.
function exportLogsCsv(): void {
  const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const lines = [['시각', '권한', '동작', '내용'], ...logs.map((l) => [l.t, l.role, l.action, l.detail])]
  const csv = '﻿' + lines.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url; a.download = `starc-logs-${ts(new Date()).replace(/[-: ]/g, '').replace(/^(\d{8})/, '$1-')}.csv`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* ---------- 탭·이벤트 ---------- */
const TABS = { input: ['t-input', 'p-input'], report: ['t-report', 'p-report'], admin: ['t-admin', 'p-admin'] } as const
function show(name: keyof typeof TABS): void {
  for (const k of Object.keys(TABS) as (keyof typeof TABS)[]) { const on = k === name; $(TABS[k][0]).setAttribute('aria-selected', String(on)); $(TABS[k][1]).hidden = !on }
  if (name === 'admin') renderAdmin()
}

function run(goto: boolean): boolean {
  readForm()
  if (!syncForm()) { toast('입력값을 확인하세요'); return false }
  last = { ...predict(db, state), c: structuredClone(state), at: new Date() }; renderReport()
  addLog('예측 조회', `${condText(state).join(' / ')} → 매칭 ${last.N}명, 예상 등록 ${f1(last.E)}명`)
  if (goto) show('report'); return true
}

function bind(): void {
  $('t-input').onclick = () => show('input')
  $('t-report').onclick = () => { if (last) show('report'); else toast('먼저 조건을 입력하고 리포트를 생성하세요') }
  $('t-admin').onclick = () => show('admin')
  $('back').onclick = () => show('input')
  document.querySelectorAll<HTMLButtonElement>('.info').forEach((b) => {
    b.onclick = () => { const t = $(b.getAttribute('aria-controls')!); t.hidden = !t.hidden; b.setAttribute('aria-expanded', String(!t.hidden)) }
  })
  // 내보내기 기록을 먼저 남겨서 내보낸 파일에도 포함되게 한다
  $('logCsv').onclick = () => { if (!logs.length) { toast('내보낼 기록이 없습니다'); return } addLog('로그 내보내기', `CSV ${Math.min(logs.length + 1, 200)}건`); exportLogsCsv() }
  $('form').addEventListener('submit', (e) => { e.preventDefault(); run(true) })
  $('form').addEventListener('input', () => { readForm(); syncForm() })
  $('form').addEventListener('change', () => { readForm(); syncForm() })
  const setRegions = (list: string[]) => { SIDO.forEach((s) => ($<HTMLInputElement>('rg-' + s.c).checked = list.includes(s.c))); readForm(); syncForm() }
  $('rgPrimary').onclick = () => setRegions(['26', '48'])
  $('rgSouth').onclick = () => setRegions(['26', '31', '48'])
  $('rgAll').onclick = () => setRegions(SIDO.map((s) => s.c))
  $('rgNone').onclick = () => setRegions([])
  $('reset').onclick = () => { state = structuredClone(DEFAULT); writeForm(); toast('예시 조건으로 되돌렸습니다') }
  $('role').addEventListener('change', (e) => {
    role = (e.target as HTMLSelectElement).value as typeof role
    addLog('권한 전환', role === 'admin' ? '신트리아 관리자로 전환' : '의뢰자로 전환')
    if (!$('p-admin').hidden) renderAdmin()
  })
  $('mask').addEventListener('change', (e) => { mask = (e.target as HTMLInputElement).checked; addLog('설정 변경', `소규모 셀 마스킹 ${mask ? '켬' : '끔'}`); renderReport() })
}

/* ---------- 시작: 예시 조건으로 리포트까지 채워 둠 ---------- */
openDb().then((d) => {
  db = d
  total = scalar('SELECT COUNT(*) FROM subjects')
  bind(); buildForm(); writeForm()
  last = { ...predict(db, state), c: structuredClone(state), at: new Date() }; renderReport()
  renderAdmin()
}).catch((err: unknown) => {
  document.querySelector('main')!.innerHTML = `<div class="sheet lock">DB 초기화 실패: ${esc(err)}</div>`
})
