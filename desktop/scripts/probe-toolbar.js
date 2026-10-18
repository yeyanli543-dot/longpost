(async function () {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (id) => document.getElementById(id);
  if ($('editorWrap').hidden) { $('btnNew').click(); await wait(900); }

  const tools = document.querySelector('.tools');
  const ids = ['btnPin','btnTagsEdit','btnChart','btnImage','btnFile','btnOutline','btnReading','btnPreview','btnFind','btnProGraph','btnProLab','btnProDiff','btnProBoard','btnSocialSlice','btnShare','btnMore'];
  const report = ids.map((id) => {
    const el = $(id);
    if (!el) return id + ':missing';
    const r = el.getBoundingClientRect();
    const visible = r.width > 0 && r.height > 0 && el.offsetParent !== null;
    return id + ':' + (visible ? 'ON' : 'OFF');
  });

  return JSON.stringify({
    window: window.innerWidth + 'x' + window.innerHeight,
    toolsScroll: tools.scrollWidth,
    toolsClient: tools.clientWidth,
    folded: Array.from(document.querySelectorAll('.tools .folded')).map((e) => e.id),
    buttons: report,
  });
})();
