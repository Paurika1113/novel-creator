const fetch = globalThis.fetch;

async function main() {
  const r = await fetch('https://fanqienovel.com/', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36', 'Accept': 'text/html,*/*' }
  });
  const b = await r.text();
  
  // Look for novel_web_id in HTML
  const idx = b.indexOf('novel_web_id');
  if (idx >= 0) {
    console.log('novel_web_id context:', b.slice(Math.max(0, idx - 100), idx + 150));
  } else {
    console.log('No novel_web_id in HTML');
  }
  
  // Check if there's __INITIAL_STATE__ with common.id
  const istIdx = b.indexOf('__INITIAL_STATE__=');
  if (istIdx >= 0) {
    const start = istIdx + 18;
    let depth = 0, inStr = false, ch = '', esc = false, end = start;
    for (let i = start; i < Math.min(start + 20000, b.length); i++) {
      const c = b[i];
      if (inStr) { if (esc) { esc = false; continue; } if (c === '\\') { esc = true; continue; } if (c === ch) inStr = false; if (c === '\n') inStr = false; continue; }
      if (c === '"' || c === "'") { inStr = true; ch = c; esc = false; continue; }
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    const raw = b.slice(start, end);
    try {
      const st = JSON.parse(raw);
      if (st.common) console.log('common:', JSON.stringify(st.common).slice(0, 200));
    } catch (e) {
      console.log('Parse error:', e.message);
    }
  }
  
  // Check set-cookie headers
  console.log('Set-Cookie:', r.headers.get('set-cookie'));
  console.log('Response headers:', [...r.headers.entries()].filter(h => h[0].includes('cookie') || h[0].includes('set')).map(h => h[0] + ': ' + h[1]).join('\n  '));
}

main().catch(e => console.log(e));
