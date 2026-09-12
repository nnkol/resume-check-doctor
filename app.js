/* 简历体检管家 v2.0 — 检测+改写+复检闭环
 * 依赖 detector.js (window.AIDETECT) + rewriter.js (window.AIREWRITE)
 */
var LAST = null;      // 最近一次检测 {text, r}
var REWRITE = null;    // 最近一次改写结果
var GENRE = 'resume';  // 当前文体族 resume/work/marketing
var TYPE = 'jianli';   // 当前具体类型 id

// 每文体族的类型列表 + 示例文本 + 提示
var GENRE_META = {
  resume: {
    placeholder: '把简历里的工作经历 / 自我评价粘贴到这里（建议100字以上）\n\n例：负责公司新媒体运营工作，积累了宝贵经验…',
    hint: '简历看：套话密度、旁观动词（负责/参与）、空泛名词（能力强/经验）、升华句。',
    demo: "2023年3月起在一家电商公司做用户运营，管5个微信群共2300人，月均拉新300人，留存率从38%做到52%。\n策划了618大促的社群活动，联动3个部门，活动期间GMV提升了18万，这是我个人主导的第一个跨部门项目。\n负责公众号内容排期，每周3篇原创，平均阅读量从1200涨到4500，最好的一篇冲到了10万+。\n自我评价：性格开朗，吃苦耐劳，抗压能力强，具有较强的沟通能力和团队协作精神，能够快速适应快节奏的工作环境。"
  },
  work: {
    placeholder: '把述职 / 总结 / 周报 / 个人陈述 / 绩效自评粘贴到这里（建议100字以上）\n\n例：在上级领导的正确领导下，圆满完成了各项工作任务…',
    hint: '职场文书看：八股套话（在XX领导下/圆满/再接再厉）、模板句式、序号骨架、总结升华句。',
    demo: "在上级领导的正确领导下，在同事们的帮助下，我认真学习了上级文件精神，圆满完成各项工作任务，进一步提升了自身业务能力。\n首先，我扎实开展基础工作，夯实业务基础；其次，我狠抓落实，重点突破难点问题；最后，我取得良好成效。\n回顾过去一年，我高度重视统筹推进，确保各项任务保质保量完成。展望未来，我将再接再厉，求真务实，再创佳绩。"
  },
  marketing: {
    placeholder: '把小红书 / 短视频口播 / 公众号 / 详情页文案粘贴到这里（建议100字以上）\n\n例：家人们谁懂啊，这款产品真的绝绝子，性价比之王…',
    hint: '营销文案看：套路腔（家人们/谁懂啊/绝绝子/干货满满）、模板（三招搞定）、用力过猛（感叹号+表情堆叠）。',
    demo: "家人们谁懂啊！在这个快节奏的时代，这款产品真的绝绝子，性价比之王，闭眼入不亏！\n三招让你轻松搞定护肤难题，亲测有效，干货满满，一键解锁奶油肌，从此告别熬夜脸！\n姐妹们快冲，入股不亏，谁懂啊，yyds，直接上链接，码住收藏不迷路！"
  }
};

function setGenre(genre) {
  GENRE = genre;
  TYPE = genre === 'work' ? 'zhishu' : genre === 'marketing' ? 'xhs' : 'jianli';
  // 高亮家族 tab
  ['resume', 'work', 'marketing'].forEach(function (g) {
    var el = document.getElementById('gt-' + g);
    if (el) el.className = 'genre-tab' + (g === genre ? ' on' : '');
  });
  renderTypeChips();
  // 更新 placeholder 与 hint
  var meta = GENRE_META[genre];
  document.getElementById('input').placeholder = meta.placeholder;
  document.getElementById('genreHint').textContent = meta.hint;
}

function renderTypeChips() {
  var types = (AIDETECT.genreTypes && AIDETECT.genreTypes[GENRE]) || [];
  var html = types.map(function (t) {
    return '<span class="type-chip' + (t.id === TYPE ? ' on' : '') + '" onclick="setType(\'' + t.id + '\')">' + t.label + '</span>';
  }).join('');
  document.getElementById('genreTypes').innerHTML = html;
}

function setType(id) {
  TYPE = id;
  renderTypeChips();
}

function loadDemo() {
  var demo = GENRE_META[GENRE] ? GENRE_META[GENRE].demo : GENRE_META.resume.demo;
  document.getElementById('input').value = demo;
  doDetect();
}

function doDetect() {
  var text = document.getElementById('input').value;
  var r = AIDETECT.detect(text, { genre: GENRE });
  if (r.score < 0) { alert(r.error || '文本太短，多贴一点'); return; }
  LAST = { text: text, r: r };
  REWRITE = null;

  document.getElementById('result').style.display = 'block';
  document.getElementById('rewriteCard').style.display = 'none';
  document.getElementById('compareCard').style.display = 'none';

  // 分数与判级
  var num = document.getElementById('scoreNum');
  var v = document.getElementById('verdict');
  num.textContent = r.score.toFixed(1);
  num.style.color = r.score <= 3 ? '#2e9e5b' : r.score <= 7 ? '#d98a16' : '#c94040';
  if (r.score <= 3) { v.textContent = '✓ 像真人手写'; v.className = 'verdict v-safe'; }
  else if (r.score <= 7) { v.textContent = '⚠ 有明显AI痕迹'; v.className = 'verdict v-mid'; }
  else { v.textContent = '✗ 一眼假，急需改写'; v.className = 'verdict v-bad'; }

  // 分项条形图
  renderMeters(r, 'meters');
  renderPlus(r);

  // 问题定位
  renderHits(r);

  // 复制提示
  document.getElementById('copyNote').textContent = '共' + r.stats.chars + '字 · ' + r.stats.sents + '句 · 检出' + r.hits.length + '处风格问题';

  // 改写按钮只在检出问题时显示
  document.getElementById('rewriteBtn').style.display = r.hits.length > 0 ? 'block' : 'none';

  document.getElementById('result').scrollIntoView({ behavior: 'smooth' });
}

function renderMeters(r, elId) {
  var items = [
    ['套话密度', r.items.clicheFatal + r.items.clicheHeavy],
    ['极端词', r.items.extreme],
    ['连续同构句', r.items.isoSentence],
    ['排比标签', r.items.labelRuns],
    ['数字缺失', r.stats.chars > 0 && r.items.numPer100 < 0.5 ? 2 : r.items.numPer100 < 0.8 ? 1 : 0],
    ['空泛名词', r.items.vague],
    ['tell动词', r.items.tellRatio >= 60 ? 2 : 0],
    ['句长均匀', r.items.cv > 0 && r.items.cv < 0.25 ? 2 : r.items.cv < 0.35 ? 1 : 0]
  ];
  var maxVal = 4;
  var html = '';
  items.forEach(function (it) {
    var pct = Math.min(100, it[1] / maxVal * 100);
    html += '<div class="meter-row"><div class="meter-name">' + it[0] + '</div><div class="meter-bar"><div class="meter-fill" style="width:' + pct + '%"></div></div><div class="meter-val">' + it[1] + '</div></div>';
  });
  document.getElementById(elId).innerHTML = html;
}

// v2.2.1 附加体检（不进总分，只展示；actRatio 已删——语料实测无区分力且方向误导）
function renderPlus(r) {
  var p = r.plus;
  if (!p) return;
  function level(v, good, mid) { return v >= good ? '' : v >= mid ? ' warn' : ' bad'; }
  // 阈值由 24+8 段语料实测校准：真人组 star 最低 19%（AI 组均值 8.9%）；真人组 clich 最高 6%（AI 组均值 52%）
  var rows = [
    ['句子带数字', p.starRatio + '%', level(p.starRatio, 50, 15), '有量级的句子占比——真人经历天然带数字'],
    ['套话句占比', p.clicheRatio + '%', p.clicheRatio <= 10 ? '' : (p.clicheRatio <= 30 ? ' warn' : ' bad'), '含套话模式的句子占比（越低越好，方向和上面相反）']
  ];
  var html = '';
  rows.forEach(function (it) {
    var pct = Math.min(100, parseInt(it[1], 10));
    html += '<div class="plus-row"><div class="plus-name">' + it[0] + '</div><div class="plus-bar"><div class="plus-fill' + it[2] + '" style="width:' + pct + '%"></div></div><div class="plus-val">' + it[1] + '</div></div>';
  });
  html += '<div class="hint" style="margin-top:6px">这两项不扣AI味分，是给“写得像真人之后，内容够不够强”的参考：' + rows[0][3] + '；' + rows[1][3] + '。</div>';
  document.getElementById('plusMeters').innerHTML = html;
}

function renderHits(r, elId) {
  elId = elId || 'hits';
  var hitsHtml = '';
  if (r.hits.length === 0) {
    hitsHtml = '<div class="hit" style="border-color:#2e9e5b;background:#f0faf4"><div class="hit-why" style="color:#2e7a4b">没有发现典型AI痕迹。这文本读起来像人写的——有具体的事、有量的概念、句式有长有短。</div></div>';
  } else {
    r.hits.forEach(function (h, i) {
      hitsHtml += '<div class="hit">' +
        (h.text ? '<div class="hit-text">“' + esc(h.text) + '”</div>' : '') +
        '<div class="hit-why">' + (i + 1) + '. ' + esc(h.why) + '</div>' +
        '<div class="hit-fix"><b>怎么改：</b>' + esc(h.fix) + '</div>' +
        '</div>';
    });
  }
  document.getElementById(elId).innerHTML = hitsHtml;
}

// ---------- v2: 一键降AI味 ----------
function doRewrite() {
  if (!LAST) { alert('先体检一次'); return; }
  var r = AIREWRITE.rewrite(LAST.text);
  if (!r.ok) { alert(r.error); return; }
  REWRITE = r;
  var after = AIDETECT.detect(r.text);

  // 改写卡
  var card = document.getElementById('rewriteCard');
  card.style.display = 'block';
  var opsHtml = '';
  r.report.forEach(function (o) {
    opsHtml += '<div class="op-row">' + opTag(o.op) + '<span>' + esc(o.detail || (o.from + (o.to ? ' → ' + o.to : ''))) + '</span></div>';
  });
  if (!r.report.length) opsHtml = '<div class="op-row"><span class="op-tag" style="background:#5a7a92">无</span><span>这段文本没有需要机械改写的问题，按报告手动改即可</span></div>';
  document.getElementById('opsList').innerHTML = opsHtml;

  // 前后对比卡
  var cmp = document.getElementById('compareCard');
  cmp.style.display = 'block';
  document.getElementById('beforeScore').textContent = LAST.r.score.toFixed(1);
  document.getElementById('afterScore').textContent = after.score >= 0 ? after.score.toFixed(1) : '—';
  document.getElementById('afterScore').style.color = after.score <= 3 ? '#2e9e5b' : after.score <= 7 ? '#d98a16' : '#c94040';
  var delta = (LAST.r.score - Math.max(0, after.score)).toFixed(1);
  document.getElementById('deltaScore').textContent = 'AI味↓' + delta;
  document.getElementById('afterText').value = r.text;

  // 待填提示（v3.0: 占位符是【→补：…】问句式）
  var fills = (r.text.match(/【→补：[^】]*】/g) || []).length;
  document.getElementById('fillNote').textContent = fills > 0
    ? '⚠ 改写稿里有 ' + fills + ' 处【→补】：原文这些地方只有套话没有事实，机器不能编。看提示句，在下面编辑框里填进你的真事，改完点「复检我改过的稿」。'
    : '✓ 本稿无【→补】标记：所有句子都保留了原文事实。可以继续在下面编辑框手动微调。';

  cmp.scrollIntoView({ behavior: 'smooth' });
}

function opTag(op) {
  var color = { '删': '#c94040', '剥': '#d98a16', '拆标签': '#8a5cd9', '拆同构': '#8a5cd9', '标': '#0e5a8a', '整段标': '#0e5a8a', '调句长': '#5a7a92', '调句比': '#5a7a92' };
  var label = { '删': '删·套话', '剥': '剥·自评词', '拆标签': '拆·排比标签', '拆同构': '拆·同构句', '标': '标·空话转问句', '整段标': '标·整段转问句', '调句长': '调·句长节奏', '调句比': '调·句式比例' };
  return '<span class="op-tag" style="background:' + (color[op] || '#5a7a92') + '">' + esc(label[op] || op) + '</span>';
}

function copyRewritten() {
  if (!REWRITE) { alert('先生成改写稿'); return; }
  copyText(document.getElementById('afterText').value);
}
// v2.1: 改写稿已可编辑，复检以编辑框当前内容为准
function recheckEdited() {
  var t = document.getElementById('afterText').value;
  if (!t || t.replace(/\s/g, '').length < 20) { alert('编辑框内容太短'); return; }
  document.getElementById('input').value = t;
  doDetect();
  document.getElementById('result').scrollIntoView({ behavior: 'smooth' });
}

// ---------- v2.1: 文件上传（本地解析，不上传服务器） ----------
var PARSERS_LOADED = {};
function setStatus(msg, isErr) {
  var el = document.getElementById('upStatus');
  el.textContent = msg;
  el.style.color = isErr ? '#c94040' : '#8a9aab';
}
function loadScript(src) {
  return new Promise(function (res, rej) {
    var s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = function () { rej(new Error('加载失败:' + src)); };
    document.head.appendChild(s);
  });
}
async function ensureMammoth() {
  if (window.mammoth) return;
  if (!PARSERS_LOADED.mammoth) { PARSERS_LOADED.mammoth = loadScript('libs/mammoth.browser.min.js'); }
  await PARSERS_LOADED.mammoth;
}
async function ensureTesseract() {
  if (window.Tesseract) return;
  if (!PARSERS_LOADED.tess) { PARSERS_LOADED.tess = loadScript('libs/tesseract.min.js'); }
  await PARSERS_LOADED.tess;
}

async function handleFile(file) {
  if (!file) return;
  var name = file.name || '';
  var ext = (name.match(/\.(\w+)$/) || [,''])[1].toLowerCase();
  var isImage = /^image\//.test(file.type || '');
  try {
    if (ext === 'txt' || ext === 'md' || ext === 'markdown' || file.type === 'text/plain') {
      var txt = await file.text();
      fillInput(txt, 'txt/md 已读取');
    } else if (ext === 'docx') {
      setStatus('解析docx中…');
      await ensureMammoth();
      var buf = await file.arrayBuffer();
      var out = await window.mammoth.extractRawText({ arrayBuffer: buf });
      fillInput(out.value, 'docx 已解析（' + name + '）');
    } else if (ext === 'pdf') {
      setStatus('解析pdf中…');
      var pdfjs = await import('./libs/pdfjs/pdf.min.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = 'libs/pdfjs/pdf.worker.min.mjs';
      var buf2 = await file.arrayBuffer();
      var doc = await pdfjs.getDocument({ data: buf2 }).promise;
      var parts = [];
      for (var i = 1; i <= doc.numPages; i++) {
        var pg = await doc.getPage(i);
        var tc = await pg.getTextContent();
        parts.push(tc.items.map(function (it) { return it.str; }).join(' '));
      }
      fillInput(parts.join('\n'), 'pdf 已解析（' + doc.numPages + '页）');
    } else if (isImage) {
      setStatus('图片OCR中…首次使用需下载识别库（约20MB，之后有缓存）');
      await ensureTesseract();
      var res = await window.Tesseract.recognize(file, 'chi_sim+eng', {
        corePath: 'libs/ocr/',
        logger: function (m) { if (m.status) setStatus(m.status + ' ' + Math.round((m.progress || 0) * 100) + '%'); }
      });
      fillInput(res.data.text, '图片OCR完成（识别质量建议人工核对）');
    } else if (ext === 'doc') {
      alert('老版 .doc 格式暂不支持：请用Word/WPS另存为 .docx，或直接复制文字粘贴到输入框');
    } else {
      fillInput(await file.text(), '已读取');
    }
  } catch (e) {
    setStatus('解析失败：' + (e && e.message ? e.message : e), true);
  }
}
function fillInput(text, msg) {
  if (!text || text.replace(/\s/g, '').length < 10) {
    setStatus('文件里没读到文字（可能是纯扫描件：试试截图后用「图片OCR」上传）', true);
    return;
  }
  document.getElementById('input').value = text.trim();
  var len = text.replace(/\s/g, '').length;
  setStatus('✓ ' + msg + '（' + len + '字）。可删掉无关部分只留工作经历，再点开始体检');
}
document.getElementById('fileInput').addEventListener('change', function (e) {
  handleFile(e.target.files[0]);
  e.target.value = '';
});

// ---------- 复制 ----------
function copyReport() {
  if (!LAST) return;
  var r = LAST.r;
  var lines = [];
  lines.push('【简历AI味体检报告】');
  lines.push('AI味指数：' + r.score.toFixed(1) + ' / 10');
  lines.push('(3分以下像真人，5分以上HR会起疑，8分以上一眼假)');
  if (r.plus) {
    lines.push('附加体检：句子带数字' + r.plus.starRatio + '% / 套话句' + r.plus.clicheRatio + '%（不计入指数，内容强度参考）');
  }
  lines.push('');
  if (r.hits.length === 0) {
    lines.push('未检出典型AI风格特征，文本读感像真人手写。');
  } else {
    lines.push('一、问题定位（按严重度）');
    r.hits.forEach(function (h, i) {
      lines.push((i + 1) + '. ' + h.why);
      if (h.text) lines.push('   原文：' + h.text);
      lines.push('   ' + h.fix);
    });
    if (REWRITE) {
      lines.push('');
      lines.push('二、机械改写操作（' + REWRITE.report.length + '处）');
      REWRITE.report.forEach(function (o) {
        lines.push('· [' + o.op + '] ' + (o.detail || (o.from + (o.to ? ' → ' + o.to : ''))));
      });
      lines.push('');
      lines.push('三、改写稿');
      lines.push(REWRITE.text);
    } else {
      lines.push('');
      lines.push('二、分项数据');
      lines.push('套话' + (r.items.clicheFatal + r.items.clicheHeavy) + '处 / 极端词' + r.items.extreme + '处 / 同构句' + r.items.isoSentence + '组 / 排比标签' + r.items.labelRuns + '处 / 数字' + r.items.numbers + '个');
    }
  }
  lines.push('');
  lines.push('—— 简历体检管家（检测+改写在本地完成，文本不上传）');
  copyText(lines.join('\n'));
}
function copyText(txt) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(function () { toastOk('✓ 已复制'); }, function () { fallbackCopy(txt); });
  } else fallbackCopy(txt);
}
function fallbackCopy(txt) {
  var ta = document.createElement('textarea');
  ta.value = txt; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toastOk('✓ 已复制'); } catch (e) { alert('复制失败，请长按手动复制'); }
  document.body.removeChild(ta);
}
function toastOk(msg) {
  var el = document.createElement('div');
  el.textContent = msg || '✓ 已复制';
  el.style.cssText = 'position:fixed;top:40%;left:50%;transform:translate(-50%,-50%);background:#1a2a3a;color:#fff;padding:12px 28px;border-radius:8px;font-size:15px;z-index:99;';
  document.body.appendChild(el);
  setTimeout(function () { document.body.removeChild(el); }, 1600);
}
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 页面加载时初始化文体选择器（默认简历）
setGenre('resume');
