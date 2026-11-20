const { performance } = require('perf_hooks');

async function benchmark() {
  console.log('Logging in...');
  const t0 = performance.now();
  const loginRes = await fetch('https://el-ka5y.vercel.app/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@clienthub.local', password: 'Password@123' })
  });
  const token = (await loginRes.json()).token;
  console.log(`Login took: ${(performance.now() - t0).toFixed(0)} ms`);

  const headers = { 'Authorization': `Bearer ${token}` };

  async function timeRequest(name, url) {
    const start = performance.now();
    const res = await fetch(url, { headers });
    const end = performance.now();
    const data = await res.json().catch(() => null);
    const count = data?.projects?.length ?? data?.clients?.length ?? data?.entries?.length ?? 'OK';
    return { name, status: res.status, timeMs: Math.round(end - start), count };
  }

  console.log('\n--- Round 1: Sequential Warm-up ---');
  for (const [name, url] of [
    ['/api/auth/me', 'https://el-ka5y.vercel.app/api/auth/me'],
    ['/api/settings/branding', 'https://el-ka5y.vercel.app/api/settings/branding'],
    ['/api/projects', 'https://el-ka5y.vercel.app/api/projects'],
    ['/api/clients', 'https://el-ka5y.vercel.app/api/clients'],
    ['/api/chat/unread', 'https://el-ka5y.vercel.app/api/chat/unread'],
  ]) {
    const res = await timeRequest(name, url);
    console.log(`${res.name.padEnd(25)}: ${res.status} in ${res.timeMs} ms (Items: ${res.count})`);
  }

  console.log('\n--- Round 2: Repeated Sequential (Measuring Server-side Caching & Warm Lambdas) ---');
  for (const [name, url] of [
    ['/api/auth/me', 'https://el-ka5y.vercel.app/api/auth/me'],
    ['/api/settings/branding', 'https://el-ka5y.vercel.app/api/settings/branding'],
    ['/api/projects', 'https://el-ka5y.vercel.app/api/projects'],
    ['/api/clients', 'https://el-ka5y.vercel.app/api/clients'],
    ['/api/chat/unread', 'https://el-ka5y.vercel.app/api/chat/unread'],
  ]) {
    const res = await timeRequest(name, url);
    console.log(`${res.name.padEnd(25)}: ${res.status} in ${res.timeMs} ms (Items: ${res.count})`);
  }

  console.log('\n--- Round 3: Simultaneous Parallel Requests (Simulating fresh page visit) ---');
  const pStart = performance.now();
  const parallelResults = await Promise.all([
    timeRequest('/api/auth/me', 'https://el-ka5y.vercel.app/api/auth/me'),
    timeRequest('/api/settings/branding', 'https://el-ka5y.vercel.app/api/settings/branding'),
    timeRequest('/api/projects', 'https://el-ka5y.vercel.app/api/projects'),
    timeRequest('/api/clients', 'https://el-ka5y.vercel.app/api/clients'),
    timeRequest('/api/chat/unread', 'https://el-ka5y.vercel.app/api/chat/unread'),
  ]);
  const pTotal = Math.round(performance.now() - pStart);
  parallelResults.forEach(r => console.log(`${r.name.padEnd(25)}: ${r.status} in ${r.timeMs} ms`));
  console.log(`Total parallel wall-clock time: ${pTotal} ms`);
}

benchmark().catch(console.error);
