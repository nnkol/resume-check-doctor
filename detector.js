/* ai-flavor detector engine v1.0 — 简历/工作经历文本
 * 双端可用：Node (module.exports) + 浏览器 (window.AIDETECT)
 * 分层：L1词法 → L2句法 → L3语义 → L4评分映射
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AIDETECT = factory();
}(typeof self !== 'undefined' ? self : this, function () {

  // ---------- L1 词法层 ----------
  // 套话分级：fatal=一处即重扣, heavy=每处扣分, light=轻微
  var CLICHE = {
    fatal: [
      /积累了宝贵的?经验/, /提升(?:了)?综合能力/, /锻炼(?:了)?.{0,6}(?:意识|能力)/,
      /培养了?敏锐的?/, /致力于为.{0,8}提供/, /为.{0,10}打下(?:了)?坚实(?:的)?基础/,
      /实现(?:了)?自我价值/, /具有(?:较强|出色)的?/, /能够快速适应/,
      /充分(?:发挥|体现)/, /显著提升/, /有效(?:提升|维护|推动|确保)/,
      /确保.{0,8}(?:顺畅|准确|及时|高效)/, /有(?:力|效)支撑/, /奠定了??.{0,4}基础/
    ],
    heavy: [
      /综合(?:素质|能力)/, /团队协作(?:精神|能力)/, /抗压能力强/, /吃苦耐劳/,
      /性格开朗/, /沟通(?:能力|技巧)强/, /快速适应/, /相关经验/,
      /不断(?:学习|提升|打磨|优化)/, /持续(?:改善|优化|迭代)/, /精益求精/,
      /注重细节/, /善于沟通/, /积累了?丰富(?:的)?经验/
    ],
    light: [
      /工作认真(?:负责)?/, /责任心强/, /执行(?:力)?强/, /积极主动/,
      /良好的?沟通/, /具备.{0,6}能力/, /熟悉.{2,12}(?:流程|操作|工具)/
    ]
  };
  // 极端/强调词（简历语域版）
  var EXTREME = [/显著/, /极大/, /卓越/, /出色/, /深刻/, /全面(?:掌握|提升|了解)/, /大幅/, /敏锐/, /扎实的?/, /紧密(?:配合|合作)/];
  // 空泛名词（无实例支撑的信号）
  var VAGUE = [/经验/, /能力/, /意识/, /素养/, /精神/, /凝聚力/, /影响力/, /洞察力/, /执行力/, /领导力/];
  // tell动词（旁观式描述）vs 有show嫌疑的结构
  var TELL = [/^负责/, /^参与/, /^协助/, /^配合/, /^支持/, /^完成领导/, /^进行/, /^从事/, /^承担/, /^主导(?!.{0,20}\d)/];
  // 升华/总结句式
  var UPLIFT = [/为.{0,12}提供(?:了)?(?:有力|重要|坚实)/, /这(?:一)?(?:次|段)(?:经历|工作)/, /得益于/, /从而(?:实现|达到|促进)/, /不仅.{2,20}更(?:是|加)/, /实现了?.{0,10}(?:价值|意义|成长|突破)/];

  // ---------- 工具 ----------
  function countMatches(text, patterns) {
    var n = 0, hits = [];
    for (var i = 0; i < patterns.length; i++) {
      var m = text.match(new RegExp(patterns[i].source, 'g'));
      if (m) { n += m.length; hits = hits.concat(m); }
    }
    return { n: n, hits: hits };
  }
  function splitSentences(text) {
    return text.split(/[。；;！!？?\n]+/).map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 1; });
  }
  function splitParagraphs(text) {
    return text.split(/\n+/).map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 2; });
  }
  function cv(nums) {
    if (nums.length < 2) return 0;
    var mean = nums.reduce(function (a, b) { return a + b; }, 0) / nums.length;
    if (mean === 0) return 0;
    var varr = nums.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / nums.length;
    return Math.sqrt(varr) / mean;
  }
  // 四字词序列检测（中文连续四字词≥3）
  function fourCharRuns(text) {
    var runs = 0;
    var m = text.match(/[\u4e00-\u9fa5]{4}(?:[、，,][\u4e00-\u9fa5]{4}){2,}/g);
    if (m) runs = m.length;
    return runs;
  }

  // ---------- 主检测函数 ----------
  /**
   * @param {string} text 简历文本（工作经历段/自我评价）
   * @param {object} opts {verbose:bool}
   * @returns {object} {score, items, hits, stats}
   */
  function detect(text) {
    var chars = text.replace(/\s/g, '').length;
    if (chars < 20) return { score: -1, error: '文本太短（<20字），无法检测', items: {}, hits: [], stats: { chars: chars } };

    var items = {};   // 各指标原始值
    var hits = [];    // 逐句定位 {text, why, fix, weight}
    var sents = splitSentences(text);
    var paras = splitParagraphs(text);

    // --- L1 套话 ---
    var fatal = countMatches(text, CLICHE.fatal);
    var heavy = countMatches(text, CLICHE.heavy);
    var light = countMatches(text, CLICHE.light);
    items.clicheFatal = fatal.n; items.clicheHeavy = heavy.n; items.clicheLight = light.n;
    if (fatal.n > 0) hits.push({ text: fatal.hits.slice(0, 3).join(' / '), why: '致命套话：AI简历最高频句式', fix: '整句删掉，换成具体事实（做了什么+数字结果）', weight: 2.0 });
    if (heavy.n >= 2) hits.push({ text: heavy.hits.slice(0, 3).join(' / '), why: '高频套话堆叠（' + heavy.n + '处）', fix: '每处换成实例：如「抗压能力强」→「旺季连续3周加班到23点扛住了双11备货」', weight: 1.0 });

    // --- L1 极端词 ---
    var ext = countMatches(text, EXTREME);
    items.extreme = ext.n;
    if (ext.n >= 2) hits.push({ text: ext.hits.slice(0, 3).join(' / '), why: '强调词堆叠（' + ext.n + '处）：AI爱用程度副词替数字', fix: '删掉强调词，补量级：如「显著提升」→「从X提到Y」', weight: 0.8 });

    // --- L1 四字词堆砌 ---
    var four = fourCharRuns(text);
    items.fourChar = four;
    if (four > 0) hits.push({ text: '', why: '四字词连排（自我评价典型AI痕迹）', fix: '四字词换成具体行为，如「吃苦耐劳」→「搬过300箱货没抱怨过」', weight: 1.2 });

    // --- L2 句长波动 ---
    var lens = sents.map(function (s) { return s.length; });
    var cvAll = cv(lens);
    items.cv = Math.round(cvAll * 100) / 100;
    items.sentCount = sents.length;
    if (sents.length >= 3 && cvAll < 0.25) hits.push({ text: '', why: '句长过于均匀（CV=' + items.cv + '）：真人写作有长有短', fix: '把最空的一句删掉，最长的一句拆成两句', weight: 1.0 });

    // --- L2 连续同构句 ---
    var iso = 0;
    for (var i = 0; i + 2 < sents.length; i++) {
      var a = sents[i], b = sents[i + 1], c = sents[i + 2];
      var sameStart = a.slice(0, 2) === b.slice(0, 2) && b.slice(0, 2) === c.slice(0, 2);
      var closeLen = Math.abs(a.length - b.length) <= 5 && Math.abs(b.length - c.length) <= 5;
      if (sameStart && closeLen) iso++;
      // 动词+了 起句三连
      else if (/^[\u4e00-\u9fa5]{1,3}了/.test(a) && /^[\u4e00-\u9fa5]{1,3}了/.test(b) && /^[\u4e00-\u9fa5]{1,3}了/.test(c)) iso++;
    }
    items.isoSentence = iso;
    if (iso > 0) hits.push({ text: sents.slice(0, 3).map(function (s) { return s.slice(0, 18) + '…'; }).join(' / '), why: '连续同构句（' + iso + '组）：三句一个模子，最重的AI痕迹', fix: '合并成一句信息密集的话，或三句改成三种不同结构', weight: 2.0 });

    // --- L2 排比（bullet 标签化） ---
    var bullets = paras.filter(function (p) { return /^[·•\-—\d]/.test(p) || /：.{10,}/.test(p); });
    var labelRuns = 0;
    for (var j = 0; j + 2 < bullets.length; j++) {
      var pat = /^([^\u4e00-\u9fa5]{0,2})([\u4e00-\u9fa5]{2,6})[：:]/;
      if (pat.test(bullets[j]) && pat.test(bullets[j + 1]) && pat.test(bullets[j + 2])) labelRuns++;
    }
    items.labelRuns = labelRuns;
    if (labelRuns > 0) hits.push({ text: '', why: '排比式标签条目（「四字标签：句子」三连）：GPT简历标志结构', fix: '去掉标签前缀，每条直接写事；三条合并成一段叙事', weight: 1.8 });

    // --- L3 数字密度 ---
    var nums = (text.match(/\d+(\.\d+)?%?|[一二两三四五六七八九十百千]+(?:个|名|人|次|天|周|月|年|万|家|条|单)/g) || []).length;
    items.numbers = nums;
    items.numPer100 = Math.round(nums / chars * 100 * 10) / 10;
    if (items.numPer100 < 0.5) hits.push({ text: '', why: '几乎无量化数字：真实经历天然带量级', fix: '补真实量级：管几个人/几天完成/多少钱/百分之几', weight: 1.2 });

    // --- L3 空泛名词 ---
    var vague = countMatches(text, VAGUE);
    items.vague = vague.n;
    if (vague.n >= 4) hits.push({ text: vague.hits.slice(0, 4).join(' / '), why: '空泛名词密度高（' + vague.n + '处）：全是抽象词无实事', fix: '每个「能力/经验」后面跟一个实例', weight: 1.0 });

    // --- L3 tell/show ---
    var tellCount = 0;
    sents.forEach(function (s) { if (TELL.some(function (p) { return p.test(s); })) tellCount++; });
    items.tellRatio = sents.length ? Math.round(tellCount / sents.length * 100) : 0;
    if (items.tellRatio >= 60 && sents.length >= 3) hits.push({ text: '', why: '旁观式动词主导（负责/参与/协助占' + items.tellRatio + '%）：只说角色不说动作', fix: '「负责社群运营」→「管3个群共1200人，把月活从10%拉到40%」', weight: 1.0 });

    // --- L3 升华句 ---
    var uplift = countMatches(text, UPLIFT);
    items.uplift = uplift.n;
    if (uplift.n > 0) hits.push({ text: uplift.hits.slice(0, 2).join(' / '), why: '总结升华句：简历里写这个=AI感拉满', fix: '删。简历只要事实，感悟留给面试说', weight: 1.5 });

    // --- L4 评分映射 ---
    var raw = 0;
    raw += Math.min(2.5, fatal.n * 1.2);
    raw += Math.min(1.5, heavy.n * 0.35);
    raw += Math.min(0.3, light.n * 0.1);
    raw += Math.min(1.0, ext.n * 0.25);
    raw += Math.min(1.2, four * 1.2);
    if (sents.length >= 3 && cvAll < 0.25) raw += 1.0; else if (cvAll < 0.35) raw += 0.4;
    raw += Math.min(2.0, iso * 2.0);
    raw += Math.min(1.8, labelRuns * 1.8);
    if (items.numPer100 < 0.3) raw += 1.2; else if (items.numPer100 < 0.8) raw += 0.6;
    raw += Math.min(1.0, (vague.n - 3) * 0.25 > 0 ? (vague.n - 3) * 0.25 : 0);
    if (items.tellRatio >= 60 && sents.length >= 3) raw += 1.0;
    raw += Math.min(1.5, uplift.n * 1.5);
    var score = Math.max(0, Math.min(10, Math.round(raw * 10) / 10));

    return {
      score: score,
      items: items,
      hits: hits.sort(function (a, b) { return b.weight - a.weight; }),
      stats: { chars: chars, sents: sents.length, paras: paras.length }
    };
  }

  return { detect: detect, version: '1.0' };
}));
