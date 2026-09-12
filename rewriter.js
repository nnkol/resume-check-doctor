/* ai-flavor rewriter engine v3.0 — resume de-AI mechanical rewrite (readable edition)
 * Node (module.exports) + Browser (window.AIREWRITE)
 * RED LINE: only deterministic ops: delete / strip / restructure / question-hint.
 *   Never invent: no new numbers, no new facts, no synonym substitution (v2's 降级词 made 病句).
 * v3.0 (kill stiffness):
 *   - extreme words DELETED, not mapped to 书面 synonyms
 *   - cliche phrases DELETED + question hint 【→补：…】 appended at sentence end (no mid-sentence holes)
 *   - dead lines (all sentences eaten) collapse to ONE question line, not skeleton残骸
 *   - dangling connectors (并/和/以及) and fragment tails (专注于。/注重。) cleaned
 *   - wordStrip 我-cleanup narrowed (v2 ate 「名单有我」)
 *   - pass C: CV normalize merges/splits until CV>=0.28; tell-merge when 负责开头句>=3
 *   - label run head widened: 「效率改进专家：」8-char labels merge too
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AIREWRITE = factory();
}(typeof self !== 'undefined' ? self : this, function () {

  // ---------- word tables (sync with detector v1.2) ----------
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
  // extreme intensifiers: DELETE the word itself (never substitute — that made 病句)
  var EXTREME_WORDS = [
    '显著的', '显著', '极大的', '极大', '卓越的', '卓越', '出色的', '出色',
    '深刻的', '深刻', '大幅', '敏锐的', '敏锐', '扎实的', '扎实',
    '紧密的', '紧密', '精细化的', '精细化', '贴心的', '贴心',
    '高度的', '不断', '持续'
  ];
  var VAGUE_SELF = [
    '工作认真', '工作认真负责', '责任心强', '执行力强', '执行强',
    '积极主动', '良好沟通', '善于沟通', '注重细节', '精益求精',
    '吃苦耐劳', '抗压能力强', '性格开朗', '团队协作精神', '团队协作能力',
    '综合素质', '综合能力', '沟通能力强', '沟通技巧强', '较强的沟通',
    '高度的责任心', '学习能力强', '适应能力强', '严谨细致'
  ];
  var FILLER_START = ['总之', '综上', '总而言之', '通过以上', '在此过程中', '在这个过程中', '通过这份工作', '通过这工作', '在工作中始终', '在工作中保持', '在实习过程中'];
  // phrase strips: DELETE + question hint (no digits inside hints, keep number-check honest)
  // NOTE: only patterns that do NOT collide with CLAUSE_DEL whole-clause forms (order: clause first)
  var HINT_DEL = [
    { re: /积累了?[^\n。，；，]{0,10}经验/, hint: '这里删了一句「积累了…经验」——写你实际做过的一件事和它的结果' },
    { re: /(提升|提高|锻炼|增强)(?:了)?综合能力/, hint: '能力怎样用数字证明？管几个人、做过几回、结果如何' },
    { re: /(打下|奠定|筑牢)(?:了)?(?:坚实|良好|牢固)的?基础/, hint: '基础怎样证明？写一件你上手快或被夸的具体事' },
    { re: /实现了?(?:自我)?价值/, hint: '价值留面试说——这里写一件事和它的结果' },
    { re: /贡献(?:出)?自己(?:的)?(?:一份)?力量/, hint: '力量看不见——写你做成的一件具体的事' },
    { re: /实现了?[^，。；\d]{0,10}(?:稳步增长|稳步提升|最大化)/, hint: '涨了多少？写个大概数字或区间' },
    { re: /(?:不断|保持)(?:对?新?技术|新知识)?的?(?:学习|钻研)(?:热情|兴趣)?/, hint: '最近在学什么、用在哪里了？带个时间或场景' },
    { re: /实现了?[^，。；\d]{0,8}(?:能力|水平|素质)?的?全面提升/, hint: '全面到什么程度？给个数字' },
    { re: /(?:锻炼|培养|磨炼)(?:了)?[^，。；\d]{0,8}能力/, hint: '能力靠事证明——写一件体现它的事，带个数字' },
    { re: /有效(?:推动|维护|提升|防范|降低|减少)[^，。；\d]{0,16}(?:的)?(?:执行|运转|开展)/, hint: '推动到什么结果？写个数字或一件事' }
  ];
  // clause strips: whole clause deleted silently (fact-free residues)
  var CLAUSE_DEL_RE = [
    /，?确保[^，。；\d]{0,14}(?:进行|实施|运转|落地)?(?=[。；，]|$)/g,
    /，?致力于[^，。；\d]{0,16}(?=[。；，]|$)/g,
    /，?为[^，。；\d]{0,12}提供(?:了)?(?:重要|有力|坚实)[^，。；]{0,6}(?:支持|保障|帮助)?(?=[。；，]|$)/g,
    /，?(?:提升|提高|增强|扩大|培养|锻炼|打造)(?:了)?[^，。；\d]{0,8}(?:影响力|凝聚力|洞察力|执行力|竞争力|公信力|软实力|活力)(?=[。；，]|$)/g,
    /，?通过(?![^，。；]*\d)[^，。；\d]{2,22}(?=[，。；]|$)/g,
    /，?(?:不断|持续)[^，。；\d]{0,10}(?=[。；，]|$)/g,
    /，?能够快速适应[^，。；]{0,12}(?=[。；，]|$)/g,
    /，?以及(?:较强|扎实|丰富)[^，。；\d]{0,10}的?(?:能力|素养|经验|基础)(?=[。；，]|$)/g,
    /，?凭借[^，。；\d]{2,30}(?:功底|经验|态度|精神|能力|技能)(?=[。；，]|$)/g,
    /，?凭借[^，。；\d]{2,30}(?:洞察力|判断力|专业性)(?=[。；，]|$)/g,
    /^有效(?:推动|维护|提升|防范|降低|减少)[^，。；\d]{0,16}(?:的)?(?:执行|运转|开展)[，。；]*/g,
    /^为[^，。；\d]{0,12}提供(?:了)?[^，。；]{0,6}(?:支持|保障|帮助)[，。；]*/g,
    /，?具备[^，。；\d]{2,12}(?:精神|才能|素养)(?=[。；，]|$)/g,
    /，?(?:横跨|跨)部门推动[^，。；\d]{0,10}(?=[。；，]|$)/g,
    /，?实现了?[^，。；\d]{0,10}(?:标准化|高效化|体系化)(?=[。；，]|$)/g,
    /，?(?:善于|勤于|乐于|勇于|敢于)[\u4e00-\u9fa5]{2}(?:，(?:善于|勤于|乐于|勇于|敢于)[\u4e00-\u9fa5]{2}){1,}(?=[。；，]|$)/g,
    /，?积极参加(?:各类|各种)?[^，。；\d]{0,8}(?=[。；，]|$)/g,
    /，?充分(?:展现|发挥)(?:了)?[^，。；\d]{0,14}(?=[。；，]|$)/g,
    /，?(?:良好|优秀|不错)的?(?:学习能力和?适应能力|学习能力|适应能力|沟通能力|职业素养)(?=[。；，]|$)/g,
    /，?保持(?:高度|严谨|认真)?的?(?:责任心|工作态度|学习热情)(?=[。；，]|$)/g,
    /，?为[^，。；\d]{0,14}(?:贡献(?:了)?(?:自己)?的?力量|打下(?:了)?坚实基础|奠定(?:了)?坚实基础)(?=[。；，]|$)/g,
    /，?营造了?[^，。；\d]{0,10}氛围(?=[。；，]|$)/g,
    /，?增强了?[^，。；\d]{0,8}(?:归属感|凝聚力|满意度|信任)(?=[。；，]|$)/g,
    /，?确保了?[^，。；\d]{0,8}(?:顺利|顺畅|准确|及时|高效)举办?(?=[。；，]|$)/g,
    /，?有效(?:维护|推动|防范|提升|降低)[^，。；\d]{0,12}(?=[。；，]|$)/g,
    /，?(?:积累了?|拥有)[^，。；\d]{0,10}的?(?:经验|功底)(?=[。；，]|$)/g,
    /，?成功提升(?:了)?[^，。；\d]{0,12}(?=[。；，]|$)/g,
    /，?提高了?[^，。；\d]{0,6}(?:效率|质量|水平|竞争力)(?=[。；，]|$)/g,
    /，?提升了?[^，。；\d]{0,6}(?:效率|质量|水平|竞争力)(?=[。；，]|$)/g,
    /，?实现(?:了)?[^，。；\d]{0,10}(?:成长|进步|发展)(?=[。；，]|$)/g,
    /，?(?:充分)?展现(?:了)?(?:不错|出色|良好|优秀)的?(?:执行力|领导才能|专业能力|服务意识)(?=[。；，]|$)/g
  ];
  var SELF_EVAL_HEAD = /^(?:自我评价|个人评价|个人优势|自我介绍)[:：]/;
  var VAGUE_RESULT_HEAD = /^(?:提升|提高|增强)(?:了)?(?:品牌)?(?:影响力|凝聚力|执行力)/;
  // dangling tails after deletions: 「…专注于。」「…并，」「…并改善。」
  var FRAG_TAIL_RE = /[,，]?\s*(?:专注于|注重于|注重|致力于|强调|精于|擅长于?)[。；]$/;
  var CONN_TAIL_RE = /(?:并|和|以及|及|或者|或是)(?=[，。；]|$)/g;

  function hasNum(t) {
    return /\d|[一二两三四五六七八九十百千]+(?:个|名|人|次|天|周|月|年|万|家|条|单)/.test(t);
  }
  function stripMarks(t) { return t.replace(/【[^】]*】/g, ''); }
  function meaningfulNums(text) {
    var t = stripMarks(text).split(/\n/).map(function (l) {
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

  function stripExtremes(s, changes) {
    EXTREME_WORDS.forEach(function (w) {
      if (s.indexOf(w) >= 0) {
        s = s.split(w).join('');
        changes.push({ op: '删', from: '程度词：' + w });
      }
    });
    return s;
  }
  function delWithHints(s, changes, hints) {
    HINT_DEL.forEach(function (h) {
      var re = new RegExp(h.re.source, 'g');
      if (re.test(s)) {
        s = s.replace(re, '');
        changes.push({ op: '删', from: '套话短语：' + h.re.source.slice(0, 28) });
        if (h.hint) hints.push(h.hint);
      }
    });
    return s;
  }
  function clauseDels(s, changes) {
    CLAUSE_DEL_RE.forEach(function (p) {
      var re = new RegExp(p.source, 'g');
      if (re.test(s)) {
        s = s.replace(re, '');
        changes.push({ op: '删', from: '空泛从句：' + p.source.slice(0, 24) });
      }
    });
    return s;
  }
  function tidyFragments(s) {
    s = s.replace(FRAG_TAIL_RE, '。');
    s = s.replace(CONN_TAIL_RE, function (m, off, str) {
      var prev = off > 0 ? str[off - 1] : '';
      return /[\u4e00-\u9fa5\d】]/.test(prev) ? '' : m; // only strip when glued to real content
    });
    s = s.replace(/^[，,；;]\s*/, '')
         .replace(/，{2,}/g, '，')
         .replace(/，(?=[。；]|$)/g, '')
         .replace(/并(?=[。；]|$)/g, '')
         .replace(/(?:并|和|以及|及)(?=[。；]|$)/g, '')
         .replace(/(?:成功|协同|从而|真正)(?=[，。；]|$)/g, '')
         .replace(/(?:拥有|具备)[^，。；]{0,6}的?$/, '')
         .replace(/(?:实现|进行|开展|做到)[。；]?(?=$)/g, '')
         .replace(/^[，,、]\s*/g, '')
         .replace(/(?<=[\u4e00-\u9fa5])，?\s*[、]?$/g, '')
         .replace(/(?<=[\u4e00-\u9fa5]{1,3})。\s*$/g, '。')
         .replace(/，?一[A-Z…]?(?=[。；]|$)/g, '')
         .replace(/，?卺?(?=[。；]|$)/g, '')
         .replace(/(?:锻炼|培养|磨炼|打造|积累|统筹|实施|落实|推进)(?:了)?(?=[，。；]|$)/g, '')
         .replace(/(?:充分)?展现(?:了)?(?=[，。；]|$)/g, '')
         .replace(/(?:凭借|依靠|通过)(?=[，。；]|$)/g, '');
    return s;
  }
  // 词级剥离（最后一步）：残留自评词押掉 + 残端清理；骨架太薄整句折叠
  function wordStrip(s, marks) {
    VAGUE_SELF.forEach(function (w) {
      if (w.length >= 4 && s.indexOf(w) >= 0) {
        var before = s;
        s = s.split('，' + w + '，').join('，').split('，' + w).join('').split(w + '，').join('');
        if (s === before) s = s.split(w).join('');
        if (s !== before) marks.push({ op: '剥', from: '词级自评词：' + w });
      }
    });
    s = s.replace(/】和(?=[。；]|$)/g, '】')
         .replace(/，和(?=[。；]|$)/g, '')
         .replace(/，我(?=[。；]|$)/g, '')
         .replace(/^(?:在|在个人|在专业|在团队)[^，。；]{0,6}方面，我[，,]?/, '');
    if (!/^【/.test(s) && s.replace(/[\s，。；、【】：具体事例数字重写这句段事实自评己评价用三]/g, '').length < 8 && !hasNum(s)) {
      marks.push({ op: '标', detail: '清空后残句折叠：' + s.slice(0, 15) });
      return 'COLLAPSE_SENT';
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

    // pass A: label-run merge — consecutive >=3 「标签：」 lines (label up to 10 chars)
    var lines = splitLines(text).map(function (raw) {
      return { raw: raw, bullet: /^[·•\-—\d]/.test(raw) };
    });
    var labelRe = /^([^\u4e00-\u9fa5]{0,2})([\u4e00-\u9fa5]{2,10})[：:]/;
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
      // 整段折叠：自我评价头 / >=3 自评词无数字 / 空泛结果开头
      var selfHits = VAGUE_SELF.filter(function (p) { return rawLine.indexOf(p) >= 0; }).length;
      if ((SELF_EVAL_HEAD.test(rawLine) || selfHits >= 3 || VAGUE_RESULT_HEAD.test(rawLine)) && !hasNum(rawLine)) {
        keptLines.push({ raw: '【→补：这段全是形容词——改成三句事实，每句一个数字：管几个人、做过几回、结果如何】', bullet: false, hint: true });
        report.push({ op: '整段标', detail: '空泛自我评价整段折叠为问句（' + selfHits + '个自评词）' });
        return;
      }
      if (l.bullet) {
        var d1 = clauseDels(rawLine, report);
        d1 = delWithHints(d1, report, []);
        d1 = stripExtremes(d1, report);
        d1 = tidyFragments(d1);
        if (d1.replace(/[\s，。；、]/g, '').length > 4) keptLines.push({ raw: d1, bullet: true });
        else report.push({ op: '删', detail: '空bullet删除：' + rawLine.slice(0, 20) });
        return;
      }
      var sents = splitSentences(rawLine);
      var kept = [], lineHints = [];
      sents.forEach(function (s) {
        var isUplift = UPLIFT.some(function (p) { return p.test(s); });
        var isFiller = FILLER_START.some(function (p) { return s.indexOf(p) === 0; });
        var isVagueSelf = s.replace(/[，,。；;、\s]/g, '').length <= 30 &&
          VAGUE_SELF.some(function (p) { return s.indexOf(p) >= 0; }) && !hasNum(s);
        if ((isUplift || isFiller || isVagueSelf) && !hasNum(s) && s.indexOf('【') < 0) {
          report.push({ op: '删', detail: (isUplift ? '升华句' : isFiller ? '填充句' : '空泛自评') + '：' + s.slice(0, 25) });
          if (isVagueSelf) lineHints.push('这句自评删了——换成一件体现它的事，带数字');
          return;
        }
        var hints = [];
        var d = clauseDels(s, report);   // clause-level FIRST (longest match wins)
        d = delWithHints(d, report, hints); // phrase-level second
        d = stripExtremes(d, report);
        d = tidyFragments(d);
        if (!hasNum(d)) {
          var vagueHits = VAGUE_SELF.filter(function (p) { return d.indexOf(p) >= 0; }).length;
          if (vagueHits >= 2) {
            report.push({ op: '标', detail: '整句空泛自评折叠，原句：' + s.slice(0, 40) + '…' });
            lineHints.push('这句空话删了——换成一件具体的事，带个数字');
            return;
          }
        }
        d = wordStrip(d, report);
        if (d === 'COLLAPSE_SENT') { lineHints.push('这句清完只剩壳——换成一件具体的事，带个数字'); return; }
        var realLen = stripMarks(d).replace(/[\s，。；、]/g, '').length;
        if (realLen > 2) kept.push(d + (hints.length ? '【→补：' + hints[0] + '】' : ''));
        else if (realLen > 0) lineHints.push(hints[0] || '这句太空删了——换成事实+数字');
        else if (hints.length) lineHints.push(hints[0]);
      });
      if (kept.length) {
        var lineRaw = kept.join('');
        if (lineHints.length) lineRaw += '【→补：' + lineHints[0] + '】';
        keptLines.push({ raw: lineRaw, bullet: false });
      } else if (lineHints.length) {
        keptLines.push({ raw: '【→补：' + lineHints[0] + '】', bullet: false, hint: true });
        report.push({ op: '整段标', detail: '整行清空折叠为问句：' + rawLine.slice(0, 30) });
      }
    });

    // pass C: rhythm normalize — strip hints first, only touch real sentences
    // guard: if input already reads human (score<3.0), rhythm is the author's own — don't touch
    var humanGuard = false;
    if (typeof require === 'function') {
      try { humanGuard = require('./detector.js').detect(text).score < 3.0; } catch (e) { /* bundler: skip guard */ }
    }
    var finalLines = keptLines.slice();
    for (var round = 0; round < 6 && !humanGuard; round++) {
      var realSents = [];
      finalLines.forEach(function (l) {
        if (!l.bullet && !l.hint) splitSentences(stripMarks(l.raw)).forEach(function (s) { realSents.push(s); });
      });
      if (realSents.length < 3) break;
      var lens = realSents.map(function (s) { return s.length; });
      var mean = lens.reduce(function (a, b) { return a + b; }, 0) / lens.length;
      var vr = lens.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / lens.length;
      var cvv = Math.sqrt(vr) / mean;
      if (cvv >= 0.28) break;
      // merge the two most similar-length adjacent sentences inside one line (。->，)
      var best = -1, bestDiff = 1e9;
      finalLines.forEach(function (l, li) {
        if (l.bullet || l.hint) return;
        var ss = splitSentences(stripMarks(l.raw));
        for (var k = 0; k + 1 < ss.length; k++) {
          var diff = Math.abs(ss[k].length - ss[k + 1].length);
          if (diff < bestDiff) { bestDiff = diff; best = [li, k]; }
        }
      });
      if (best < 0) {
        // no intra-line pair: merge two adjacent real LINES (。->，) to vary length
        var lm = -1, lmDiff = 1e9;
        for (var li2 = 0; li2 + 1 < finalLines.length; li2++) {
          var A = finalLines[li2], B = finalLines[li2 + 1];
          if (A.bullet || A.hint || B.bullet || B.hint) continue;
          // never glue a resume-header line (公司/日期 header like 「XX科技…2023.06-2023.09」)
          if (/\d{4}[.年]/.test(A.raw) && A.raw.length < 40) continue;
          var la = stripMarks(A.raw).length, lb = stripMarks(B.raw).length;
          var df2 = Math.abs(la - lb);
          if (df2 < lmDiff) { lmDiff = df2; lm = li2; }
        }
        if (lm < 0 || lmDiff > 12) break;
        var L1 = finalLines[lm], L2 = finalLines[lm + 1];
        L1.raw = stripMarks(L1.raw).replace(/[。；]$/, '，') + stripMarks(L2.raw);
        finalLines.splice(lm + 1, 1);
        report.push({ op: '调句长', detail: '跨行合并等长句：' + L1.raw.slice(0, 12) + '…' });
        continue;
      }
      var target = finalLines[best[0]];
      var hintIdx = stripMarks(target.raw).length;  // hint (if any) starts right after real text
      var ts = splitSentences(target.raw.slice(0, hintIdx));
      if (ts.length < 2) break;
      var a = ts[best[1]], b = ts[best[1] + 1];
      var tail = target.raw.slice(hintIdx);         // keep trailing hint
      ts.splice(best[1], 2, a.replace(/[。；]$/,'') + '，' + b);
      target.raw = ts.join('') + tail;
      report.push({ op: '调句长', detail: '合并等长句拉大长短差：' + a.slice(0, 12) + '…' });
    }
    // pass C2: tell-merge — if 负责开头句 >=3 split across lines, join lines into one
    var tellCount = 0, realCount = 0;
    finalLines.forEach(function (l) {
      if (l.bullet || l.hint) return;
      splitSentences(stripMarks(l.raw)).forEach(function (s) {
        realCount++;
        if (/^(负责|参与|协助|配合|支持|完成领导|进行|从事|承担)/.test(s)) tellCount++;
      });
    });
    if (!humanGuard && realCount >= 3 && tellCount / realCount >= 0.6) {
      var body2 = [], hintTails = [];
      finalLines.forEach(function (l) {
        if (l.bullet) { body2.push(l.raw); return; }
        if (l.hint) { hintTails.push(l.raw); return; }
        // keep resume-header lines (「XX公司…2023.06-2023.09」) as own line
        if (/\d{4}[.年]/.test(l.raw) && l.raw.length < 40) { hintTails.push(l.raw); return; }
        body2.push(stripMarks(l.raw).replace(/[。；]$/, '，'));
      });
      var joined = body2.join('').replace(/，$/, '。');
      if (joined) {
        var merged = { raw: joined, bullet: false };
        if (hintTails.length) merged.raw += '\n' + hintTails.join('\n');
        finalLines = [merged];
        report.push({ op: '调句比', detail: '旁观式开头句过多，合并为一段叙事（' + tellCount + '/' + realCount + '）' });
      }
    }

    var result = finalLines.map(function (l) { return l.raw; }).join('\n');
    result = result
      .replace(/，{2,}/g, '，')
      .replace(/^[，,；;]\s*/gm, '')
      .replace(/(?<=。)。\s*/g, '。')
      .replace(/，(?=[。；]|$)/gm, '')
      .replace(/\n{2,}/g, '\n');
    var newNums = meaningfulNums(result);

    return {
      ok: true,
      text: result,
      report: report,
      check: { numsBefore: origNums, numsAfter: newNums, safe: newNums >= origNums }
    };
  }

  return { rewrite: rewrite, version: '3.0' };
}));
