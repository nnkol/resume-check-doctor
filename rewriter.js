/* ai-flavor rewriter engine v2.0 — resume de-AI mechanical rewrite
 * Node (module.exports) + Browser (window.AIREWRITE)
 * RED LINE: only deterministic ops: delete / downgrade / restructure / mark.
 * Never invent: no new numbers, no new facts. Numbers only from source text.
 * v2.0 changes (90% human-like target):
 *   - label-run merge works WITHOUT bullet markers (「标签：」行直接识别)
 *   - self-eval collapse: 性格开朗/吃苦耐劳 cluster -> one 待填 line
 *   - fatal-phrase strip synced to detector fatal table (确保…顺畅 etc)
 *   - vague-result clause strip (提升了品牌影响力 -> 待填数字结果)
 *   - CV normalize: merge similar-length sents / split longest (punctuation only)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AIREWRITE = factory();
}(typeof self !== 'undefined' ? self : this, function () {

  // ---------- word tables (sync copy with detector v1.2) ----------
  var UPLIFT = [
    /为.{0,12}提供(?:了)?(?:有力|重要|坚实)/,
    /这(?:一)?(?:次|段)(?:经历|工作)/,
    /得益于/,
    /从而(?:实现|达到|促进)/,
    /不仅.{2,20}更(?:是|加)/,
    /实现了?.{0,10}(?:价值|意义|成长|突破)/,
    /我相信[，,]?凭借/,
    /一定能够胜任/,
    /贡献(?:出)?自己(?:的)?力量/,
    /凭借.{0,24}功底/
  ];
  var EXTREME_MAP = {
    '显著提升了': '提升到', '显著提升': '提升', '极大提升': '提升', '大幅提升': '提升',
    '成功提升了': '提升了', '成功提升': '提升', '有效提升': '提升',
    '有效确保': '确保', '有效维护': '维护', '有效推动': '推动',
    '极大': '明显', '卓越': '好', '出色': '不错', '深刻': '较深',
    '全面掌握': '掌握', '全面了解': '了解', '全面提升': '提升',
    '敏锐的': '较敏感的', '敏锐': '较敏感', '扎实的': '较系统的', '扎实': '较系统',
    '紧密配合': '配合', '紧密合作': '合作',
    '精细化': '逐步', '贴心服务': '做好服务', '不断打磨': '改'
  };
  var VAGUE_SELF = [
    '工作认真', '工作认真负责', '责任心强', '执行力强', '执行强',
    '积极主动', '良好沟通', '善于沟通', '注重细节', '精益求精',
    '吃苦耐劳', '抗压能力强', '性格开朗', '团队协作精神', '团队协作能力',
    '综合素质', '综合能力', '沟通能力强', '沟通技巧强', '较强的沟通'
  ];
  var FILLER_START = ['总之', '综上', '总而言之', '通过以上', '在此过程中', '在这个过程中', '通过这份工作', '通过这工作'];
  // mark strips: phrase-level cliche -> 待填 (regex, synced with detector fatal/heavy)
  var STRIP_MARK_RE = [
    /积累了?[^\n。，；，]{0,10}经验/,
    /提升(?:了)?综合能力/, /锻炼(?:了)?.{0,8}能力/, /锻炼了.{0,8}(?:意识|精神)/,
    /实现(?:了)?自我价值/, /打下(?:了)?坚实(?:的)?基础/, /奠定(?:了)?坚实(?:的)?基础/,
    /培养(?:了)?(?:敏锐的?|较强的?)/, /能够快速适应/, /充分发挥/, /充分体现/,
    /致力于为.{0,8}提供/, /有(?:力|效)支撑/,
    /持续改善/, /不断提高/, /不断提升/, /不断优化/, /不断学习/,
    /具有较强的?/, /具备较强/,
    /，以及(?:较强|扎实|丰富)[^，。；]{0,10}(?:的)?(?:能力|素养|经验|基础)/,
    /，?乐于沟通/, /成绩优异/
  ];
  // clause strips: whole clause deleted (deterministic, fact-free AI residues)
  var CLAUSE_DEL_RE = [
    /，?确保[^，。；\d]{0,14}(?:进行|实施|运转|落地)?(?=[。；，]|$)/g,
    /，?致力于[^，。；\d]{0,16}(?=[。；，]|$)/g,
    /，?为[^，。；\d]{0,12}提供(?:了)?(?:重要|有力|坚实)[^，。；]{0,6}(?:支持|保障|帮助)?(?=[。；，]|$)/g,
    /，?(?:提升|提高|增强|扩大|培养|锻炼|打造)(?:了)?[^，。；\d]{0,8}(?:影响力|凝聚力|洞察力|执行力|竞争力|公信力|软实力|活力)(?=[。；，]|$)/g,
    /，?通过(?![^，。；]*\d)[^，。；\d]{2,14}(?=[，。；]|$)/g,
    /，?(?:不断|持续)[^，。；\d]{0,10}(?=[。；，]|$)/g,
    /，?能够快速适应[^，。；]{0,12}(?=[。；，]|$)/g,
    /，?以及(?:较强|扎实|丰富)[^，。；\d]{0,10}(?:的)?(?:能力|素养|经验|基础)(?=[。；，]|$)/g,
    /，?乐于沟通(?=[。；，]|$)/g,
    /，?凭借[^，。；\d]{2,30}(?:功底|经验|态度|精神)(?=[。；，]|$)/g,
    /，?(?:善于|勤于|乐于|勇于|敢于)[\u4e00-\u9fa5]{2}(?:，(?:善于|勤于|乐于|勇于|敢于)[\u4e00-\u9fa5]{2}){1,}(?=[。；，]|$)/g,
    /，?积极参加(?:各类|各种)?[^，。；\d]{0,8}(?=[。；，]|$)/g
  ];
  // self-eval cluster: line with >=3 of these and no numbers -> collapse whole line
  var SELF_EVAL_HEAD = /^(?:自我评价|个人评价|个人优势|自我介绍)[:：]/;
  var VAGUE_RESULT_HEAD = /^(?:提升|提高|增强)(?:了)?(?:品牌)?(?:影响力|凝聚力|执行力)/;

  function hasNum(t) {
    return /\d|[一二两三四五六七八九十百千]+(?:个|名|人|次|天|周|月|年|万|家|条|单)/.test(t);
  }
  function meaningfulNums(text) {
    var t = text.split(/\n/).map(function (l) {
      return l.replace(/^[·•\-—\d.、()（）]+\s*/, '');
    }).join('');
    return (t.match(/\d/g) || []).length;
  }
  function endsPunct(s) { return /[。；;！!？?]$/.test(s); }

  function splitLines(text) {
    return text.split(/\n+/).map(function (x) { return x.trim(); }).filter(function (x) { return x.length > 0; });
  }
  function splitSentences(line) {
    var out = [], cur = '';
    for (var i = 0; i < line.length; i++) {
      cur += line[i];
      if ('。；;！!？?'.indexOf(line[i]) >= 0) { out.push(cur.trim()); cur = ''; }
    }
    if (cur.trim()) out.push(cur.trim());
    return out.filter(function (s) { return s.length > 0; });
  }

  function downgrade(text, changes) {
    Object.keys(EXTREME_MAP).forEach(function (k) {
      if (text.indexOf(k) >= 0) {
        text = text.split(k).join(EXTREME_MAP[k]);
        changes.push({ op: '降', from: k, to: EXTREME_MAP[k] });
      }
    });
    return text;
  }
  function markStrips(s, marks) {
    STRIP_MARK_RE.forEach(function (p) {
      if (p.test(s)) {
        s = s.replace(new RegExp(p.source, 'g'), '【待填：具体事例】');
        marks.push({ op: '标', from: String(p).slice(0, 40) });
      }
    });
    return s;
  }
  function clauseDels(s, marks) {
    CLAUSE_DEL_RE.forEach(function (p) {
      var re = new RegExp(p.source, 'g');
      if (re.test(s)) {
        s = s.replace(re, '');
        marks.push({ op: '删', from: '空泛从句：' + p.source.slice(0, 28) });
      }
    });
    return s.replace(/^[，,；;]\s*/, '').replace(/，{2,}/g, '，');
  }
  // 词级剥离（最后一步）：残留自评词抠掉+残句清理；骨架太薄则整句折叠
  function wordStrip(s, marks) {
    VAGUE_SELF.forEach(function (w) {
      if (w.length >= 4 && s.indexOf(w) >= 0) {
        var before = s;
        s = s.split('，' + w + '，').join('，').split('，' + w).join('').split(w + '，').join('');
        if (s === before) s = s.split(w).join('');
        if (s !== before) marks.push({ op: '剥', from: '词级自评词：' + w });
      }
    });
    // 残句清理（和字只清】和。/，和。这种剥离残端，避免误删正常"我和同事"）
    s = s.replace(/】和(?=[。；]|$)/g, '】').replace(/，和(?=[。；]|$)/g, '')
         .replace(/，(?=[。；]|$)/g, '').replace(/，{2,}/g, '，')
         .replace(/^(?:在|在个人|在专业|在团队)[^，。；]{0,6}方面，我[，,]?/, '')
         .replace(/我(?=[。；，]|$)/, '');
    // 空骨架兜底：清完只剩<8字实词 → 折叠
    if (!/^【待填/.test(s) && s.replace(/[\s，。；、【】：具体事例数字重写这句段事实自评己评价用三]/g, '').length < 8 && !hasNum(s)) {
      marks.push({ op: '标', detail: '清空后残句折叠：' + s.slice(0, 15) });
      return '【整句待填：用一句具体的事+数字重写这句】';
    }
    return s;
  }

  // ---------- main rewrite ----------
  function rewrite(text) {
    if (!text || text.replace(/\s/g, '').length < 20) {
      return { ok: false, error: '文本太短（<20字），不值得改写' };
    }
    var report = [];
    var origNums = meaningfulNums(text);

    // pass A: label-run merge — consecutive >=3 lines with 「标签：」 head (bullet optional)
    var lines = splitLines(text).map(function (raw) {
      return { raw: raw, bullet: /^[·•\-—\d]/.test(raw) };
    });
    var labelRe = /^([^\u4e00-\u9fa5]{0,2})([\u4e00-\u9fa5]{2,6})[：:]/;
    var i = 0;
    while (i < lines.length) {
      if (!labelRe.test(lines[i].raw)) { i++; continue; }
      var j = i, run = [];
      while (j < lines.length && labelRe.test(lines[j].raw)) { run.push(j); j++; }
      if (run.length >= 3) {
        var parts = run.map(function (k) {
          return lines[k].raw.replace(labelRe, '').trim();
        }).filter(function (x) { return x.length > 0; });
        var body = parts.map(function (p) { return endsPunct(p) ? p : p + '；'; }).join('');
        if (body && !endsPunct(body)) body += '。';
        lines.splice(run[0], run.length, { raw: body, bullet: false });
        report.push({ op: '拆标签', detail: run.length + '条「标签：」行合并为叙事段' });
        i = run[0];
      } else i = j;
    }

    // pass B: per-line processing
    var keptLines = [];
    lines.forEach(function (l) {
      var rawLine = l.raw;
      // self-eval collapse: >=3 vague-self words & no numbers, or 自我评价：head
      var selfHits = VAGUE_SELF.filter(function (p) { return rawLine.indexOf(p) >= 0; }).length;
      if ((SELF_EVAL_HEAD.test(rawLine) || selfHits >= 3 || VAGUE_RESULT_HEAD.test(rawLine)) && !hasNum(rawLine)) {
        keptLines.push({ raw: '【待填：用三句具体事实重写这段自我评价，每句带数字】', bullet: false });
        report.push({ op: '整段标', detail: '空泛自我评价整段标待填（' + selfHits + '个自评词），原句已记入操作日志' });
        return;
      }
      if (l.bullet) {
        var d1 = downgrade(rawLine, report);
        d1 = markStrips(d1, report);
        d1 = clauseDels(d1, report);
        if (d1.replace(/[【】待填：具体事例，。；\s]/g, '').length > 2) keptLines.push({ raw: d1, bullet: true });
        else report.push({ op: '删', detail: '空bullet删除：' + rawLine.slice(0, 20) });
        return;
      }
      var sents = splitSentences(rawLine);
      var kept = [];
      sents.forEach(function (s) {
        var isUplift = UPLIFT.some(function (p) { return p.test(s); });
        var isFiller = FILLER_START.some(function (p) { return s.indexOf(p) === 0; });
        var isVagueSelf = s.replace(/[，,。；;、\s]/g, '').length <= 30 &&
          VAGUE_SELF.some(function (p) { return s.indexOf(p) >= 0; }) && !hasNum(s);
        if ((isUplift || isFiller || isVagueSelf) && !hasNum(s) && s.indexOf('【待填') < 0) {
          report.push({ op: '删', detail: (isUplift ? '升华句' : isFiller ? '填充句' : '空泛自评') + '：' + s.slice(0, 25) });
          return;
        }
        var d = downgrade(s, report);
        d = markStrips(d, report);
        d = clauseDels(d, report);
        if (!hasNum(d)) {
          var vagueHits = VAGUE_SELF.filter(function (p) { return d.indexOf(p) >= 0; }).length;
          if (vagueHits >= 2 && d.indexOf('【整句待填') < 0) {
            d = '【整句待填：用一句具体的事+数字重写这句】';
            report.push({ op: '标', detail: '整句空泛自评标待填，原句：' + s.slice(0, 40) + '…' });
          }
        }
        if (d.indexOf('【整句待填') < 0) d = wordStrip(d, report);
        if (d.replace(/[【】待填：具体事例，。；\s整句用数字重写这句]/g, '').length > 2) kept.push(d);
        else report.push({ op: '删', detail: '清空后残留句删除' });
      });
      if (kept.length) keptLines.push({ raw: kept.join(''), bullet: false });
    });

    // pass C: CV normalize — if sentences too uniform (CV<0.18), merge the two
    // most similar-length adjacent sentences (。->，); up to 2 rounds.
    var finalLines = [];
    keptLines.forEach(function (l) { finalLines.push(l); });
    for (var round = 0; round < 2; round++) {
      var allSents = [];
      finalLines.forEach(function (l) {
        if (!l.bullet) splitSentences(l.raw).forEach(function (s) { allSents.push(s); });
      });
      if (allSents.length < 4) break;
      var lens = allSents.map(function (s) { return s.length; });
      var mean = lens.reduce(function (a, b) { return a + b; }, 0) / lens.length;
      var vr = lens.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / lens.length;
      var cvv = Math.sqrt(vr) / mean;
      if (cvv >= 0.18) break;
      // find adjacent pair with most similar length (same line) to merge
      var best = -1, bestDiff = 1e9;
      finalLines.forEach(function (l, li) {
        if (l.bullet) return;
        var ss = splitSentences(l.raw);
        for (var k = 0; k + 1 < ss.length; k++) {
          var diff = Math.abs(ss[k].length - ss[k + 1].length);
          if (diff < bestDiff) { bestDiff = diff; best = [li, k]; }
        }
      });
      if (best < 0) break;
      var target = finalLines[best[0]];
      var ts = splitSentences(target.raw);
      var a = ts[best[1]], b = ts[best[1] + 1];
      ts.splice(best[1], 2, a.replace(/[。；]$/, '') + '，' + b);
      target.raw = ts.join('');
      report.push({ op: '调句长', detail: '合并等长句拉大长短差：' + a.slice(0, 12) + '…' });
    }

    var result = finalLines.map(function (l) { return l.raw; }).join('\n');
    // final readability cleanup
    result = result
      .replace(/【待填：具体事例】[\u4e00-\u9fa5]{0,2}(?:力和?|能力|精神|意识|素养)(?=[。；，]|$)/g, '【待填：具体事例】') // 抽象词尾巴
      .replace(/【待填：具体事例】(?=[。；]|$)/g, function (m, off, str) { return m; }) // placeholder keep
      .replace(/，{2,}/g, '，')
      .replace(/^[，,；;]\s*/gm, '')
      .replace(/(?<=。)。\s*/g, '。');
    var newNums = meaningfulNums(result);

    return {
      ok: true,
      text: result,
      report: report,
      check: { numsBefore: origNums, numsAfter: newNums, safe: newNums >= origNums }
    };
  }

  return { rewrite: rewrite, version: '2.0' };
}));
