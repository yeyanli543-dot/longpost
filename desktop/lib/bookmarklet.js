/**
 * 书签小工具代码生成。
 *
 * 用户把这段 javascript: 代码存进书签栏，在任意网页点一下，
 * 页面信息就会被 POST 到本机桥。
 *
 * 注意：书签代码是明文，令牌会出现在书签 URL 里。这是书签方案的固有代价，
 * 设置页会明确提示「令牌等同密码，别把书签同步到公共设备」。
 */

'use strict';

(function () {
  /**
   * @param {{port:number, token:string, endpoint?:string}} options
   * @returns {string} javascript: 开头的书签地址
   */
  function buildBookmarklet(options) {
    const port = Number(options && options.port);
    const token = String((options && options.token) || '');
    if (!port || !token) return '';

    const endpoint = String((options && options.endpoint) || '') || ('http://127.0.0.1:' + port + '/clip');
    const payload = [
      'var d=document,',
      'sel=(window.getSelection?String(window.getSelection()):""),',
      'body=d.body?d.body.innerText:"";',
      'fetch(' + JSON.stringify(endpoint) + ',{',
      'method:"POST",',
      'headers:{"Content-Type":"application/json","X-LongPost-Token":' + JSON.stringify(token) + '},',
      'body:JSON.stringify({title:d.title,url:location.href,content:body,selection:sel})',
      '}).then(function(r){',
      'alert(r.ok?"已保存到 LongPost":"保存失败（HTTP "+r.status+"）");',
      '}).catch(function(){alert("连不上 LongPost：请确认桌面端已打开");});',
    ].join('');

    return 'javascript:' + encodeURIComponent('(function(){' + payload + '})();');
  }

  /** 展示用的短令牌，避免设置页把整串铺满 */
  function maskToken(token) {
    const text = String(token || '');
    if (text.length <= 10) return text;
    return text.slice(0, 6) + '…' + text.slice(-4);
  }

  const API = { buildBookmarklet: buildBookmarklet, maskToken: maskToken };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.LPBookmarklet = API;
})();
