/* 简历体检管家 v1.0 — 前端逻辑
 * 依赖 detector.js (window.AIDETECT)
 */
var LAST = null; // 保存最近一次检测结果供复制

function loadDemo() {
  var demo = "负责公司用户社群的日常运营工作，通过精细化管理和贴心服务，积累了宝贵的用户运营经验，提升了综合能力。\n策划并执行线上拉新活动，充分发挥创造力和执行力，与团队紧密配合，成功提升了品牌影响力，锻炼了团队协作能力。\n撰写并发布多篇公众号文章，不断打磨内容质量，致力于为用户提供有价值的内容，培养了敏锐的用户洞察力。\n建立并完善了数据复盘体系，通过科学的分析方法，为内容优化提供了有力支撑，实现了运营效率的显著提升。\n自我评价：性格开朗，吃苦耐劳，抗压能力强，具有较强的沟通能力和团队协作精神，能够快速适应快节奏的工作环境。";
  document.getElementById('input').value = demo;
  doDetect();
}

function doDetect() {
  var text = document.getElementById('input').value;
  var r = AIDETECT.detect(text);
  if (r.score < 0) { alert(r.error || '文本太短，多贴一点'); return; }
  LAST = { text: text, r: r };

  document.getElementById('result').style.display = 'block';

  // 分数与判级
  var num = document.getElementById('scoreNum');
  var v = document.getElementById('verdict');
  num.textContent = r.score.toFixed(1);
  num.style.color = r.score <= 3 ? '#2e9e5b' : r.score <= 7 ? '#d98a16' : '#c94040';
  if (r.score <= 3) { v.textContent = '✓ 像真人手写'; v.className = 'verdict v-safe'; }
  else if (r.score <= 7) { v.textContent = '⚠ 有明显AI痕迹'; v.className = 'verdict v-mid'; }
  else { v.textContent = '✗ 一眼假，急需改写'; v.className = 'verdict v-bad'; }

  // 分项条形图
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
  document.getElementById('meters').innerHTML = html;

  // 问题定位
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
  document.getElementById('hits').innerHTML = hitsHtml;
  document.getElementById('hitsCard').style.display = r.hits.length === 0 ? 'none' : 'block';

  // 复制提示
  document.getElementById('copyNote').textContent = '共' + r.stats.chars + '字 · ' + r.stats.sents + '句 · 检出' + r.hits.length + '处风格问题';

  document.getElementById('result').scrollIntoView({ behavior: 'smooth' });
}

function copyReport() {
  if (!LAST) return;
  var r = LAST.r;
  var lines = [];
  lines.push('【简历AI味体检报告】');
  lines.push('AI味指数：' + r.score.toFixed(1) + ' / 10');
  lines.push('(3分以下像真人，5分以上HR会起疑，8分以上一眼假)');
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
    lines.push('');
    lines.push('二、分项数据');
    lines.push('套话' + (r.items.clicheFatal + r.items.clicheHeavy) + '处 / 极端词' + r.items.extreme + '处 / 连续同构句' + r.items.isoSentence + '组 / 排比标签' + r.items.labelRuns + '处 / 数字' + r.items.numbers + '个 / 空泛名词' + r.items.vague + '处');
  }
  lines.push('');
  lines.push('—— 简历体检管家（风格体检工具，检测在本地完成）');
  var txt = lines.join('\n');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(function () { toastOk(); }, function () { fallbackCopy(txt); });
  } else fallbackCopy(txt);
}
function fallbackCopy(txt) {
  var ta = document.createElement('textarea');
  ta.value = txt; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toastOk(); } catch (e) { alert('复制失败，请长按手动复制'); }
  document.body.removeChild(ta);
}
function toastOk() {
  var el = document.createElement('div');
  el.textContent = '✓ 报告已复制';
  el.style.cssText = 'position:fixed;top:40%;left:50%;transform:translate(-50%,-50%);background:#1a2a3a;color:#fff;padding:12px 28px;border-radius:8px;font-size:15px;z-index:99;';
  document.body.appendChild(el);
  setTimeout(function () { document.body.removeChild(el); }, 1600);
}
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
