/* ai-flavor rewriter engine v1.0 — resume de-AI mechanical rewrite
 * Node (module.exports) + Browser (window.AIREWRITE)
 * RED LINE: only 4 deterministic ops: delete / downgrade / restructure / mark.
 * Never invent: no new numbers, no new facts. Numbers only from source text.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AIREWRITE = factory();
}(typeof self !== 'undefined' ? self : this, function () {

  // ---------- word tables (sync copy with detector v1.1) ----------
  var UPLIFT = [
    /为.{0,12}提供(?:了)?(?:有力|重要|坚实)/,
    /这(?:一)?(?:次|段)(?:经历|工作)/,
    /得益于/,
    /从而(?:实现|达到|促进)/,
    /不仅.{2,20}更(?:是|加)/,
    /实现了?.{0,10}(?:价值|意义|成长|突破)/
  ];
  var EXTREME_MAP = {
    '显著提升': '提升',
    '极大提升': '提升',
    '大幅提升': '提升',
    '成功提升了': '提升了',
    '成功提升': '提升',
    '有效提升': '提升',
    '有效确保': '确保',
    '有效维护': '维护',
    '有效推动': '推动',
    '极大': '明显',
    '卓越': '好',
    '出色': '不错',
    '深刻': '较深',
    '全面掌握': '掌握',
    '全面了解': '了解',
    '全面提升': '提升',
    '敏锐的': '较敏感的',
    '敏锐': '较敏感',
    '扎实的': '较系统的',
    '紧密配合': '配合',
    '紧密合作': '合作'
  };
  var VAGUE_SELF = [
    '工作认真', '工作认真负责', '责任心强', '执行力强', '执行强',
    '积极主动', '良好沟通', '善于沟通', '注重细节', '精益求精',
    '吃苦耐劳', '抗压能力强', '性格开朗', '团队协作精神', '团队协作能力',
    '综合素质', '综合能力', '沟通能力强', '沟通技巧强'
  ];
  var FILLER_START = ['总之', '综上', '总而言之', '通过以上', '在此过程中', '在这个过程中', '通过这份工作', '通过这工作'];
  // phrases stripped from kept sentences (cliche phrase -> marker)
  // phrases stripped from kept sentences (cliche phrase -> marker), regex for variants
  var STRIP_MARK_RE = [
    /积累了?[^\n。，；，]{0,10}经验/,          // 积累了宝贵的用户运营经验 etc
    /提升(?:了)?综合能力/, /锻炼(?:了)?.{0,8}能力/, /锻炼了.{0,8}(?:意识|精神)/,
    /实现(?:了)?自我价值/, /打下(?:了)?坚实(?:的)?基础/, /奠定(?:了)?坚实(?:的)?基础/,
    /培养(?:了)?(?:敏锐的?|较强的?)/, /能够快速适应/, /充分发挥/, /充分体现/,
    /致力于为.{0,8}提供/, /有(?:力|效)支撑/, /确保.{0,6}(?:质量|效率|及时|高效)/
  ];

  function hasNum(t) {
    return /\d|[一二两三四五六七八九十百千]+(?:个|名|人|次|天|周|月|年|万|家|条|单)/.test(t);
  }
  // count digits EXCLUDING bullet numbering prefixes (1. 2. · - etc), so merging labeled bullets never falsly "loses" numbers
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

  // ---------- op2: downgrade extreme words (string-level, global) ----------
  function downgrade(text, changes) {
    Object.keys(EXTREME_MAP).forEach(function (k) {
      if (text.indexOf(k) >= 0) {
        text = text.split(k).join(EXTREME_MAP[k]);
        changes.push({ op: '降', from: k, to: EXTREME_MAP[k] });
      }
    });
    return text;
  }

  // ---------- op4: mark unfilled cliche inside kept sentence ----------
  function markStrips(s, marks) {
    STRIP_MARK_RE.forEach(function (p) {
      if (p.test(s)) {
        s = s.replace(new RegExp(p.source, 'g'), '【待填：具体事例】');
        marks.push({ op: '标', from: String(p).slice(0, 40) });
      }
    });
    return s;
  }

  // ---------- main rewrite ----------
  function rewrite(text) {
    if (!text || text.replace(/\s/g, '').length < 20) {
      return { ok: false, error: '文本太短（<20字），不值得改写' };
    }
    var report = [];
    var origNums = meaningfulNums(text);

    // pass 1: line-level
    var lines = splitLines(text).map(function (raw) {
      return { raw: raw, bullet: /^[·•\-—\d]/.test(raw) };
    });

    // pass 2: label-run merge (op3a) — find consecutive labeled bullets >= 3
    var labelRe = /^([^\u4e00-\u9fa5]{0,2})([\u4e00-\u9fa5]{2,6})[：:]/;
    var i = 0;
    while (i < lines.length) {
      if (!lines[i].bullet || !labelRe.test(lines[i].raw)) { i++; continue; }
      var j = i, run = [];
      while (j < lines.length && lines[j].bullet && labelRe.test(lines[j].raw)) {
        run.push(j); j++;
      }
      if (run.length >= 3) {
        var parts = run.map(function (k) {
          return lines[k].raw.replace(labelRe, '').trim();
        }).filter(function (x) { return x.length > 0; });
        var body = parts.map(function (p) { return endsPunct(p) ? p : p + '；'; }).join('');
        if (body && !endsPunct(body)) body += '。';
        lines.splice(run[0], run.length, { raw: body, bullet: false });
        report.push({ op: '拆排比', detail: run.length + '条「标签：」合并为叙事段' });
        i = run[0];
      } else i = j;
    }

    // pass 3: sentence-level per line
    var keptLines = [];
    lines.forEach(function (l) {
      if (l.bullet) {
        // single bullet: keep, downgrade + mark only (no delete — bullet lines carry facts)
        var d = l.raw;
        d = downgrade(d, report);
        d = markStrips(d, report);
        keptLines.push({ raw: d, bullet: true });
        return;
      }
      var sents = splitSentences(l.raw);
      var kept = [];
      sents.forEach(function (s) {
        var isUplift = UPLIFT.some(function (p) { return p.test(s); });
        var isFiller = FILLER_START.some(function (p) { return s.indexOf(p) === 0; });
        var isVagueSelf = s.replace(/[，,。；;、\s]/g, '').length <= 30 &&
          VAGUE_SELF.some(function (p) { return s.indexOf(p) >= 0; }) && !hasNum(s);
        if ((isUplift || isFiller || isVagueSelf) && !hasNum(s) && s.indexOf('【待填') < 0) {
          report.push({ op: '删', detail: (isUplift ? '升华句' : isFiller ? '填充句' : '空泛自评') + '：' + s.slice(0, 25) });
          return; // drop sentence
        }
        var d = downgrade(s, report);
        d = markStrips(d, report);
        // 超长空泛句：含≥2个自评词且无数字 → 整句标待填（不删，保留骨架）
        if (!hasNum(d)) {
          var vagueHits = VAGUE_SELF.filter(function (p) { return d.indexOf(p) >= 0; }).length;
          if (vagueHits >= 2 && d.indexOf('【待填') < 0) {
            d = '【待填：用一句具体的事+数字重写这句】（原句：' + d.replace(/[。；]$/, '') + '）';
            report.push({ op: '标', detail: '整句空泛自评标待填：' + s.slice(0, 25) + '…' });
          }
        }
        kept.push(d);
      });
      if (kept.length) keptLines.push({ raw: kept.join(''), bullet: false });
    });

    // pass 4: iso-sentence triple merge (op3b) within same paragraph
    var finalLines = [];
    keptLines.forEach(function (l) {
      if (l.bullet) { finalLines.push(l); return; }
      var sents = splitSentences(l.raw);
      var out = [], k = 0;
      while (k < sents.length) {
        var a = sents[k], b = sents[k + 1], c = sents[k + 2];
        var trip = b && c &&
          ((a.slice(0, 2) === b.slice(0, 2) && b.slice(0, 2) === c.slice(0, 2) &&
            Math.abs(a.length - b.length) <= 5 && Math.abs(b.length - c.length) <= 5) ||
           (/^[\u4e00-\u9fa5]{1,3}了/.test(a) && /^[\u4e00-\u9fa5]{1,3}了/.test(b) && /^[\u4e00-\u9fa5]{1,3}了/.test(c)));
        if (trip) {
          var parts2 = [a];
          if (b.slice(0, 2) === a.slice(0, 2)) parts2.push(b.slice(2)); else parts2.push(b);
          if (c.slice(0, 2) === a.slice(0, 2)) parts2.push(c.slice(2)); else parts2.push(c);
          out.push(parts2.join('，') + (/[。？！]$/.test(a) ? '' : '。'));
          report.push({ op: '拆同构', detail: '三连同构句合并：' + a.slice(0, 15) + '…' });
          k += 3;
        } else { out.push(a); k++; }
      }
      if (out.length) finalLines.push({ raw: out.join(''), bullet: false });
    });

    var result = finalLines.map(function (l) { return l.raw; }).join('\n');
    var newNums = meaningfulNums(result);

    return {
      ok: true,
      text: result,
      report: report,
      check: { numsBefore: origNums, numsAfter: newNums, safe: newNums >= origNums }
    };
  }

  return { rewrite: rewrite, version: '1.0' };
}));
