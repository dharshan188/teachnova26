const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

class Client {
  cookie = ''
  async request(method, path, body) {
    const headers = this.cookie ? { Cookie: this.cookie } : {}
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const res = await fetch(BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' })
    const sc = res.headers.get('set-cookie')
    const m = sc && sc.match(/buildhub_session=[^;]+/)
    if (m) this.cookie = m[0]
    const text = await res.text()
    let json = null
    try { json = text ? JSON.parse(text) : null } catch { json = null }
    return { status: res.status, json }
  }
  get(p) { return this.request('GET', p) }
  post(p, b) { return this.request('POST', p, b ?? undefined) }
}

const op = new Client()
const login = await op.post('/api/auth/login', { identifier: 'arjun', password: 'buildhub-demo1' })
console.log('login status:', login.status)
if (login.status !== 200) process.exit(1)
const faults = await op.post('/api/faults', { action: 'deactivate-all' })
console.log('deactivate-all:', faults.status)
const sum = await op.get('/api/observability/summary')
const ov1 = sum.json?.overview
console.log('SUMMARY overview:', JSON.stringify(ov1))
const st = await op.get('/api/security/status')
const stJson = st.json?.overview ?? st.json
console.log('SECURITY overview:', JSON.stringify(stJson))
