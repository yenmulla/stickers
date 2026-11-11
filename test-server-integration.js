const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body: data });
      });
    }).on('error', reject);
  });
}

function httpPostJson(url, postData) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(postData);
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };
    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body: data });
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function runIntegrationTest() {
  console.log('--- TwitSticker Server Integration Test ---');
  const serverProcess = spawn('node', ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: '3099' }
  });

  serverProcess.stdout.on('data', d => console.log('[Server stdout]:', d.toString().trim()));
  serverProcess.stderr.on('data', d => console.error('[Server stderr]:', d.toString().trim()));

  // Wait for server to bind port
  let serverReady = false;
  for (let i = 0; i < 20; i++) {
    await wait(300);
    try {
      const res = await httpGet('http://localhost:3099/');
      if (res.status === 200) {
        serverReady = true;
        break;
      }
    } catch (e) {}
  }

  if (!serverReady) {
    serverProcess.kill();
    throw new Error('Server failed to start within timeout');
  }

  console.log('✅ Server started on port 3099');

  try {
    // 1. Test Static files
    const home = await httpGet('http://localhost:3099/');
    console.log('GET / -> Status:', home.status, 'HTML length:', home.body.length);
    if (!home.body.includes('TwitSticker')) throw new Error('Missing TwitSticker title in homepage');

    // 2. Test Samples endpoint
    const samplesRes = await httpGet('http://localhost:3099/api/samples');
    const { samples } = JSON.parse(samplesRes.body);
    console.log(`GET /api/samples -> Status: ${samplesRes.status}, count: ${samples.length}`);
    if (samples.length === 0) throw new Error('No samples returned');

    // Verify all sample URLs exist
    for (const sample of samples) {
      const fileRes = await httpGet(`http://localhost:3099${sample.url}`);
      console.log(`Sample ${sample.id} (${sample.url}) -> Status: ${fileRes.status}`);
      if (fileRes.status !== 200) throw new Error(`Sample file missing: ${sample.url}`);
    }

    // 3. Test Network info & Health endpoints
    const netRes = await httpGet('http://localhost:3099/api/network-info');
    console.log('GET /api/network-info -> Status:', netRes.status);
    const healthRes = await httpGet('http://localhost:3099/healthz');
    console.log('GET /healthz -> Status:', healthRes.status);
    if (healthRes.status !== 200) throw new Error('Health check failed');

    // 4. Test Conversion endpoint
    console.log('Testing conversion of /samples/sample-bars.mp4 ...');
    const convRes = await httpPostJson('http://localhost:3099/api/convert', {
      videoUrl: '/samples/sample-bars.mp4',
      startTime: 0,
      duration: 1.5,
      fps: 12,
      quality: 60,
      packName: 'Automated Test',
      author: 'Tester',
      emojis: '🔥 ⚡'
    });

    console.log('POST /api/convert -> Status:', convRes.status);
    const convData = JSON.parse(convRes.body);
    console.log('Conversion result:', {
      success: convData.success,
      stickerId: convData.stickerId,
      sizeKb: convData.sizeKb,
      isCompliant: convData.isCompliant
    });

    if (!convData.success || !convData.stickerId) throw new Error('Conversion failed');

    // 5. Test Download sticker
    const dlRes = await httpGet(`http://localhost:3099/api/stickers/${convData.stickerId}/download`);
    console.log(`GET /api/stickers/${convData.stickerId}/download -> Status: ${dlRes.status}, Content-Type: ${dlRes.headers['content-type']}`);
    if (dlRes.status !== 200 || dlRes.headers['content-type'] !== 'image/webp') {
      throw new Error('Failed to download generated sticker');
    }

    // 6. Test Download pack
    const packRes = await httpGet(`http://localhost:3099/api/stickers/${convData.stickerId}/pack`);
    console.log(`GET /api/stickers/${convData.stickerId}/pack -> Status: ${packRes.status}, Content-Length: ${packRes.headers['content-length']}`);
    if (packRes.status !== 200) throw new Error('Failed to download sticker pack');

    console.log('\n🎉 ALL INTEGRATION TESTS PASSED PERFECTLY! 🎉\n');
  } finally {
    serverProcess.kill();
  }
}

runIntegrationTest().catch(err => {
  console.error('Integration test failed:', err);
  process.exit(1);
});

