const fetch = globalThis.fetch;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36';

async function getCaptchaPage(url, useMobile) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': useMobile ? MOBILE_UA : UA, 'Accept': 'text/html,*/*', 'cache-control': 'no-cache' },
    signal: AbortSignal.timeout(15000),
  });
  const text = await resp.text();
  
  console.log('=== Captcha page analysis == ');
  console.log('URL:', url);
  console.log('UA:', useMobile ? 'MOBILE' : 'DESKTOP');
  console.log('Status:', resp.status, '| len:', text.length);
  console.log('Is captcha:', text.includes('验证码中间页'));
  
  if (!text.includes('验证码中间页')) {
    console.log('NOT a captcha page. Has INIT_STATE:', text.includes('__INITIAL_STATE__'));
    return;
  }
  
  // Extract all scripts
  const scripts = [...text.matchAll(/<script[^>]*src="([^"]+)"[^>]*>/gi)];
  console.log('\nScripts:');
  for (const s of scripts) console.log('  ', s[1].slice(0, 100));
  
  // Extract inline JS
  const inlineScripts = [...text.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
  console.log('\nInline scripts:', inlineScripts.length);
  for (const s of inlineScripts) {
    const code = s[1].trim();
    if (code.length > 10 && !code.startsWith('window.performance') && !code.startsWith('!function')) {
      console.log('  ', code.slice(0, 300));
    }
  }
  
  // Extract meta tags
  const metas = [...text.matchAll(/<meta[^>]+>/gi)];
  console.log('\nMeta tags:');
  for (const m of metas) console.log('  ', m[0].slice(0, 150));
  
  // Look for window.TTGCaptcha
  const capIdx = text.indexOf('TTGCaptcha');
  if (capIdx >= 0) console.log('\nTTGCaptcha context:', text.slice(Math.max(0, capIdx - 50), capIdx + 200));
  
  // Look for verification-related content
  const verIdx = text.indexOf('验证');
  if (verIdx >= 0) console.log('\n验证 context:', text.slice(Math.max(0, verIdx - 50), verIdx + 200));
  
  // Look for any data/token in the page
  const tokenMatch = text.match(/token[^=]*=\s*['"]([^'"]+)['"]/i);
  if (tokenMatch) console.log('Token found:', tokenMatch[1]);
  
  const captchaIdMatch = text.match(/captcha_id[^=]*=\s*['"]([^'"]+)['"]/i);
  if (captchaIdMatch) console.log('Captcha ID:', captchaIdMatch[1]);
  
  // Check for form/redirect
  const formMatch = text.match(/<form[\s\S]*?<\/form>/i);
  if (formMatch) console.log('\nForm found:', formMatch[0].slice(0, 200));
  
  console.log('\nHTML first 1000 chars:');
  console.log(text.slice(0, 1000));
}

async function main() {
  // Try to trigger captcha with desktop UA
  await getCaptchaPage('https://fanqienovel.com/reader/7246248906823205411', false);
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Try with mobile UA on a different chapter (in case we need to trigger again)
  await getCaptchaPage('https://fanqienovel.com/reader/7253307807175442979', true);
}
main().catch(e => console.log('Error:', e.message));
