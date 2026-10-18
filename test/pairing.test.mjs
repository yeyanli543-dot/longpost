import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const P = require('../desktop/lib/pairing.js');

describe('配对码', () => {
  const token = 'a'.repeat(48);

  it('生成带版本前缀的码', () => {
    assert.equal(P.buildPairingCode({ port: 52341, token }), 'lp1:52341:' + token);
  });

  it('往返一致', () => {
    const parsed = P.parsePairingCode(P.buildPairingCode({ port: 52341, token }));
    assert.deepEqual(parsed, { port: 52341, token });
  });

  it('缺参数返回空串', () => {
    assert.equal(P.buildPairingCode({ port: 0, token }), '');
    assert.equal(P.buildPairingCode({ port: 1234 }), '');
  });

  it('拒绝格式错误的码', () => {
    for (const bad of ['', 'lp1', 'lp1:abc:' + token, 'lp2:1234:' + token, 'lp1:70000:' + token, 'lp1:1234:short']) {
      assert.equal(P.parsePairingCode(bad), null, bad);
    }
  });

  it('接受纯数字端口', () => {
    const ok = P.parsePairingCode('lp1:1:' + token);
    assert.equal(ok.port, 1);
  });
});
