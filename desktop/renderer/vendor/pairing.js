/**
 * 配对码：把端口与令牌压成一个字符串，方便用户在扩展里粘贴。
 *
 * 格式：lp1:<port>:<token>
 * 前缀带版本号，将来换格式时能直接判旧码。
 */

'use strict';

(function () {
  const PREFIX = 'lp1';

  function buildPairingCode(options) {
    const port = Number(options && options.port);
    const token = String((options && options.token) || '');
    if (!port || !token) return '';
    return PREFIX + ':' + port + ':' + token;
  }

  function parsePairingCode(code) {
    const text = String(code || '').trim();
    const parts = text.split(':');
    if (parts.length !== 3 || parts[0] !== PREFIX) return null;

    const port = Number(parts[1]);
    const token = parts[2];
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
    if (!/^[0-9a-f]{16,}$/i.test(token)) return null;

    return { port: port, token: token };
  }

  const API = { buildPairingCode: buildPairingCode, parsePairingCode: parsePairingCode };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.LPPairing = API;
})();
