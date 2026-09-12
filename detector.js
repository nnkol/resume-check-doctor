/* ai-flavor detector engine v2.0 — 多文体 AI 味检测
 * 双端可用：Node (module.exports) + 浏览器 (window.AIDETECT)
 * 文体族：resume(简历) / work(职场文书:述职·总结·周报·陈述·自评) / marketing(营销文案:小红书·短视频·公众号·详情页)
 * 分层：L1词法 → L2句法 → L3语义 → L3.5 文体深度维度 → L4评分映射
 * detect(text, opts) opts.genre 缺省 'resume'；返回 {score, items, hits, plus, stats, genre}
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AIDETECT = factory();
}(typeof self !== 'undefined' ? self : this, function () {

  // ---------- 通用工具 ----------
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
  function fourCharRuns(text) {
    var runs = 0;
    var m = text.match(/[\u4e00-\u9fa5]{4}(?:[、，,][\u4e00-\u9fa5]{4}){2,}/g);
    if (m) runs = m.length;
    return runs;
  }

  // ---------- 文体配置注册表 ----------
  // 每族含词表 + 深度维度阈值。默认族 resume（原简历逻辑，行为不变）。
  var GENRE_CONFIG = {
    resume: {
      label: '简历',
      cliche: {
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
      },
      extreme: [/显著/, /极大/, /卓越/, /出色/, /深刻/, /全面(?:掌握|提升|了解)/, /大幅/, /敏锐/, /扎实的?/, /紧密(?:配合|合作)/],
      vague: [/经验/, /能力/, /意识/, /素养/, /精神/, /凝聚力/, /影响力/, /洞察力/, /执行力/, /领导力/],
      tell: [/^负责/, /^参与/, /^协助/, /^配合/, /^支持/, /^完成领导/, /^进行/, /^从事/, /^承担/, /^主导(?!.{0,20}\d)/],
      uplift: [/为.{0,12}提供(?:了)?(?:有力|重要|坚实)/, /这(?:一)?(?:次|段)(?:经历|工作)/, /得益于/, /从而(?:实现|达到|促进)/, /不仅.{2,20}更(?:是|加)/, /实现了?.{0,10}(?:价值|意义|成长|突破)/],
      // —— 深度维度（resume 只启用结构套路/语域两项，其余为职场/营销扩展） ——
      template: [],
      structure: [/^(?:首先|其次|再次|最后)[，,、]/, /^[一二三四五六七八九十]+[、.]/, /^\((?:一|二|三|四|五|六|七|八|九|十)\)/],
      person: [],
      registerFormal: [],
      registerColloquial: [],
      emojiTh: 0.02,
      connectors: []
    },

    work: {
      label: '职场文书',
      cliche: {
        fatal: [
          /在(?:上级)?(?:领导|组织|公司)?的?(?:正确)?领导下/, /在(?:同事|领导|大家|各(?:位)?部门)的?(?:大力|全力|积极)?(?:支持|帮助|配合)下/,
          /认真(?:学习|贯彻)(?:了)?(?:上级|党的)?(?:文件|精神|政策)/, /深入(?:贯彻落实|开展)/,
          /圆满(?:完成|结束|收官)/, /保质保量/, /再接再厉/, /开拓创新/, /求真务实/, /团结(?:协作|一心)/,
          /再创(?:佳绩|辉煌)/, /为.{0,15}(?:发展|建设|事业)(?:做出|作出|贡献)(?:了)?(?:应有的|积极)?(?:贡献)?/, /为.{0,12}奠定(?:了)?坚实(?:的)?基础/
        ],
        heavy: [
          /高度(?:重视|关注)/, /统筹(?:推进|谋划)/, /狠抓(?:落实|推进)/, /有序(?:推进|开展)/,
          /稳步(?:推进|开展)/, /扎实推进/, /不断提升(?:自身|业务|工作)?(?:能力|水平)?/, /强化(?:意识|责任|学习)/,
          /夯实(?:基础|基层)/, /补足(?:短板|弱项)/, /全面推进/, /重点(?:突破|推进)/,
          /取得(?:了)?(?:良好|显著|阶段性)?(?:成效|成果|进展)/, /进一步(?:提升|加强|完善|优化)/,
          /切实(?:履行|提升|抓好)/, /持续(?:发力|用力)/
        ],
        light: [
          /尽职尽责/, /勤勉务实/, /恪尽职守/, /严于律己/, /学以致用/, /兢兢业业/, /任劳任怨/,
          /主动(?:作为|担当)/, /勇于(?:担当|创新|作为)/
        ]
      },
      extreme: [/圆满/, /深入/, /扎实的?/, /全面/, /显著/, /切实/, /持续/, /高度/, /有效/, /稳步/, /有序/, /深入贯彻/],
      vague: [/工作(?:实绩|作风)?/, /水平/, /成效/, /素质/, /能力/, /作风/, /思想/, /认识/, /站位/, /本领/, /共识/, /合力/],
      tell: [/^负责/, /^参与/, /^配合/, /^协助/, /^推进/, /^开展/, /^组织/, /^落实/, /^完成/, /^抓好/],
      uplift: [/在今后的工作中/, /展望(?:未来|新一年|明年)/, /再创(?:佳绩|辉煌)/, /为.{0,15}(?:发展|建设|事业)贡献/, /为.{0,12}奠定/, /今后我将/, /我们将(?:继续|一如既往)/],
      template: [
        /在.{0,10}的正确领导下/, /在.{0,10}的大?力支持下/, /按照.{0,12}的部署要求/, /以.{0,10}为抓手/,
        /把.{0,10}作为.{0,6}(?:首要|重要|重中之重)/, /既.{2,12}又.{2,12}/, /一手抓.{0,8}一手抓.{0,8}/,
        /不仅.{2,12}而且.{2,12}/, /在.{0,6}的.{0,6}(?:过程中|基础上|前提下)/
      ],
      structure: [/^(?:首先|其次|再次|最后|总之|综上所述|总的来说|总体而言)[，,、]/, /^[一二三四五六七八九十]+[、.]/, /^\((?:一|二|三|四|五|六|七|八|九|十)\)/, /(?:回顾|过去)的?(?:一|这)(?:年|段时间)/],
      person: [/^我[们]?[，,、]/, /^我们/, /本人/],
      registerFormal: [/^其(?:中|实|余)/, /予以/, /兹/, /特此/, /鉴于/, /此(?:外|次)/, /当(?:前|前)/, /上述/, /下述/, /诸如/],
      registerColloquial: [/挺(?:好|大|多|快|难)/, /特(?:别)?(?:好|大|多|快)/, /搞(?:定|好|完)/, /整(?:好|完)/, /蛮(?:好|大|多)/, /老(?:大|多|快|好)/],
      emojiTh: 0.01,
      connectors: [/与此同时/, /综上所述/, /总而言之/, /不难看出/, /由此可见/, /归根结底/]
    },

    marketing: {
      label: '营销文案',
      cliche: {
        fatal: [
          /在这个(?:快节奏|瞬息万变|充满机遇|物欲横流|看脸|内卷)的时代/, /随着(?:人们|大家|生活|消费)?(?:水平的)?(?:不断)?(?:提高|提升|升级)/,
          /众所周知/, /不得不提的是/, /值得一提的?是/, /无论.{0,10}都(?:是|会|能)/,
          /干货(?:满满|预警)/, /亲测有效/, /性价比(?:之王|超高|拉满)/, /闭眼(?:入|冲)/, /入股不亏/,
          /谁懂啊/, /绝绝子/, /家人们/, /姐妹们/, /宝子们/, /救命(?:啊)?(?:这|这个|这也)/,
          /我真的会谢/, /一整个(?:爱住|拿捏|震惊)/
        ],
        heavy: [
          /轻松(?:搞定|get|拥有)/, /一键(?:解锁|拥有|get)/, /告别.{0,10}烦恼/, /从此.{0,10}(?:轻松|无忧|变美|暴富)/,
          /再也不用/, /让你.{0,10}(?:轻松|秒|瞬间|轻松搞定)/, /助你/, /秒变/, /瞬间(?:提升|拥有|变美)/,
          /解锁.{0,8}(?:新|隐藏|逆天)/, /种草(?:了|啦)?/, /拔草/, /安利/, /yyds/, /天花板(?:级别)?/, /神仙(?:单品|颜值|好用)/
        ],
        light: [
          /超(?:好|值|绝|赞|好用|有料)/, /巨(?:好|值|好用)/, /太(?:绝|好|值|可)了/, /绝(?:了|绝子)/,
          /宝藏(?:店铺|单品|博主)?/, /真的绝/, /好用到哭/, /回头率(?:爆表|超高)/, /入股/, /冲就完(?:了|事)/, /码住/, /收藏(?:了|好)/
        ]
      },
      extreme: [/超(?:好|值|赞|级|快|强)/, /巨(?:好|值|好用|级)/, /极度/, /完美/, /无敌/, /绝(?:绝子|了|顶)/, /惊艳/, /疯狂/, /爆(?:好|火|赞)/, /天花板/, /封神/, /逆天/],
      vague: [/品质/, /体验/, /氛围/, /质感/, /幸福感/, /美好/, /快乐/, /价值/, /魅力/, /格调/, /仪式感/, /松弛感/, /高级感/],
      // 营销的 tell 是正常推荐动作，不作为 AI 味；这里仅弱化检测，阈值在深度维度处理
      tell: [],
      uplift: [/总之(?:这|看|说)/, /看完这个/, /相信我/, /这波(?:不亏|血赚)/, /快(?:冲|去|码|存)/, /码住(?:了)?/, /快冲/, /冲就完(?:了|事)/, /赶紧(?:冲|买|安排)/, /不懂就问/],
      template: [
        /姐妹(?:们)?[，,、]?[^。；]{0,10}(?:一定要|必看|千万别错过|快冲|快码)/, /家人们[，,、]?[^。；]{0,10}(?:谁懂|快冲|安排)/,
        /三招/, /三步/, /四(?:招|步)/, /五(?:招|步)/, /7个/, /七个/, /从.{0,6}到.{0,6}(?:的)?(?:蜕变|逆袭|过程)/,
        /不是.{2,14}而是.{2,14}/, /真正的.{0,10}是/, /只要.{0,10}就能/
      ],
      structure: [/^(?:首先|其次|最后)[，,、]/, /[一二三四五六七八九十]+\.[^。]{0,20}/, /^(?:一|二|三|四|五|六|七)[、.]/, /第[一二三四五六七八九十]{1,3}步/, /第[一二三四五六七八九十]{1,3}招/, /大家(?:先|可以)?(?:看|听|收藏)/],
      person: [/^我(?:们)?[，,、]/, /^你(?:们)?[，,、]/, /^咱(?:们)?[，,、]/, /宝(?:子|贝)?们/, /集美(?:们)?/],
      registerFormal: [/^此(?:外|次|前)/, /综上/, /鉴于/, /通常而言/, /一般而言/, /就(?:此|这样)而言/],
      registerColloquial: [/绝绝子/, /yyds/, /谁懂啊/, /家人们/, /姐妹们/, /宝子/, /集美/, /拿捏/, /拿捏(?:了)?/, /狠狠/, /直接(?:爱住|拿捏|封神)/, /一整个/],
      emojiTh: 0.06,   // 营销 emoji 正常高，超过阈值才算过度堆叠
      connectors: [/话不多说/, /直接(?:上|安利|安排|给大家)/, /上链接/, /安排(?:上|一下)/, /话不多说/, /懂的都懂/, /刷到就是赚到/]
    }
  };

  // 各文体族类型列表（供 UI 用）
  var GENRE_TYPES = {
    resume: [{ id: 'jianli', label: '简历' }],
    work: [
      { id: 'zhishu', label: '述职报告' },
      { id: 'zongjie', label: '年终总结' },
      { id: 'zhoubao', label: '工作周报' },
      { id: 'chenshu', label: '个人陈述' },
      { id: 'jixiao', label: '绩效自评' }
    ],
    marketing: [
      { id: 'xhs', label: '小红书笔记' },
      { id: 'duanpian', label: '短视频口播' },
      { id: 'gongzhonghao', label: '公众号文章' },
      { id: 'xiangqing', label: '产品详情页' }
    ]
  };

  // ---------- 主检测函数 ----------
  function detect(text, opts) {
    opts = opts || {};
    var genre = opts.genre || 'resume';
    var cfg = GENRE_CONFIG[genre] || GENRE_CONFIG.resume;
    var family = genre === 'marketing' ? 'marketing' : (genre === 'work' ? 'work' : 'resume');
    var CLICHE = cfg.cliche, EXTREME = cfg.extreme, VAGUE = cfg.vague, TELL = cfg.tell, UPLIFT = cfg.uplift;

    var chars = text.replace(/\s/g, '').length;
    if (chars < 20) return { score: -1, error: '文本太短（<20字），无法检测', items: {}, hits: [], stats: { chars: chars }, genre: genre };

    var items = {};
    var hits = [];
    var sents = splitSentences(text);
    var paras = splitParagraphs(text);
    var scanText = text.replace(/【[^】]*】/g, '');
    var scanSents = splitSentences(scanText);

    // --- L1 套话 ---
    var fatal = countMatches(scanText, CLICHE.fatal);
    var heavy = countMatches(scanText, CLICHE.heavy);
    var light = countMatches(scanText, CLICHE.light);
    items.clicheFatal = fatal.n; items.clicheHeavy = heavy.n; items.clicheLight = light.n;
    if (fatal.n > 0) hits.push({ text: fatal.hits.slice(0, 3).join(' / '), why: '致命套话：该文体AI最高频句式', fix: '整句删掉，换成具体事实（做了什么+数字结果）', weight: 2.0 });
    if (heavy.n >= 2) hits.push({ text: heavy.hits.slice(0, 3).join(' / '), why: '高频套话堆叠（' + heavy.n + '处）', fix: '每处换成实例：去掉空话，写具体过程和结果', weight: 1.0 });

    // --- L1 极端词 ---
    var ext = countMatches(scanText, EXTREME);
    items.extreme = ext.n;
    if (ext.n >= 2) hits.push({ text: ext.hits.slice(0, 3).join(' / '), why: '强调词堆叠（' + ext.n + '处）：AI爱用程度副词替代细节', fix: '删掉强调词，补具体量级或例子', weight: 0.8 });

    // --- L1 四字词堆砌 ---
    var four = fourCharRuns(scanText);
    items.fourChar = four;
    if (four > 0) hits.push({ text: '', why: '四字词连排：排比式堆砌的AI痕迹', fix: '四字词换成具体行为/过程', weight: 1.2 });

    // --- L2 句长波动 ---
    var lens = scanSents.map(function (s) { return s.length; });
    var cvAll = cv(lens);
    items.cv = Math.round(cvAll * 100) / 100;
    items.sentCount = scanSents.length;
    if (scanSents.length >= 3 && cvAll < 0.25) hits.push({ text: '', why: '句长过于均匀（CV=' + items.cv + '）：真人写作有长有短', fix: '把最空的一句删掉，最长的一句拆成两句', weight: 1.0 });

    // --- L2 连续同构句 ---
    var iso = 0;
    for (var i = 0; i + 2 < scanSents.length; i++) {
      var a = scanSents[i], b = scanSents[i + 1], c = scanSents[i + 2];
      var sameStart = a.slice(0, 2) === b.slice(0, 2) && b.slice(0, 2) === c.slice(0, 2);
      var closeLen = Math.abs(a.length - b.length) <= 5 && Math.abs(b.length - c.length) <= 5;
      if (sameStart && closeLen) iso++;
      else if (/^[\u4e00-\u9fa5]{1,3}了/.test(a) && /^[\u4e00-\u9fa5]{1,3}了/.test(b) && /^[\u4e00-\u9fa5]{1,3}了/.test(c)) iso++;
    }
    items.isoSentence = iso;
    if (iso > 0) hits.push({ text: sents.slice(0, 3).map(function (s) { return s.slice(0, 18) + '…'; }).join(' / '), why: '连续同构句（' + iso + '组）：三句一个模子', fix: '合并成一句信息密集的话，或三句改成三种不同结构', weight: 2.0 });

    // --- L2 排比（bullet 标签化） ---
    var bullets = paras.filter(function (p) { return /^[·•\-—\d]/.test(p) || /：.{10,}/.test(p); });
    var labelRuns = 0;
    for (var j = 0; j + 2 < bullets.length; j++) {
      var pat = /^([^\u4e00-\u9fa5]{0,2})([\u4e00-\u9fa5]{2,6})[：:]/;
      if (pat.test(bullets[j]) && pat.test(bullets[j + 1]) && pat.test(bullets[j + 2])) labelRuns++;
    }
    items.labelRuns = labelRuns;
    if (labelRuns > 0) hits.push({ text: '', why: '排比式标签条目（「标签：句子」三连）：GPT标志结构', fix: '去掉标签前缀，每条直接写内容；三条合并成一段', weight: 1.8 });

    // --- L3 数字密度 ---
    var nums = (scanText.match(/\d+(\.\d+)?%?|[一二两三四五六七八九十百千]+(?:个|名|人|次|天|周|月|年|万|家|条|单)/g) || []).length;
    items.numbers = nums;
    items.numPer100 = Math.round(nums / scanText.replace(/\s/g, '').length * 100 * 10) / 10;
    if (items.numPer100 < 0.3 && family !== 'marketing') hits.push({ text: '', why: '几乎无量化数字：真实经历天然带量级', fix: '补真实量级：管几个人/几天完成/多少钱/百分之几', weight: 1.2 });

    // --- L3 空泛名词 ---
    var vague = countMatches(scanText, VAGUE);
    items.vague = vague.n;
    if (vague.n >= 4) hits.push({ text: vague.hits.slice(0, 4).join(' / '), why: '空泛名词密度高（' + vague.n + '处）：全是抽象词无实事', fix: '每个抽象词后面跟一个具体例子', weight: 1.0 });

    // --- L3 tell/show（职场族启用；营销族 TELL 为空自然跳过） ---
    var tellCount = 0;
    scanSents.forEach(function (s) { if (TELL.some(function (p) { return p.test(s); })) tellCount++; });
    items.tellRatio = scanSents.length ? Math.round(tellCount / scanSents.length * 100) : 0;
    if (items.tellRatio >= 60 && scanSents.length >= 3 && TELL.length) hits.push({ text: '', why: '旁观式动词主导（负责/参与/协助占' + items.tellRatio + '%）：只说角色不说动作', fix: '「负责XX」→「做了XX，结果如何」', weight: 1.0 });

    // --- L3 升华句 ---
    var uplift = countMatches(scanText, UPLIFT);
    items.uplift = uplift.n;
    if (uplift.n > 0) hits.push({ text: uplift.hits.slice(0, 2).join(' / '), why: '总结升华句：该文体里写这个=AI感拉满', fix: '删。留事实和具体内容，感悟留给口头表达', weight: 1.5 });

    // --- L3.5 文体深度维度（新） ---
    // 1. 模板句式：该文体固定套路句（如职场"在...正确领导下"、营销"三招搞定"）
    var tpl = countMatches(scanText, cfg.template);
    items.template = tpl.n;
    if (tpl.n > 0) hits.push({ text: tpl.hits.slice(0, 3).join(' / '), why: '模板句式（' + tpl.n + '处）：AI按固定套路填句，千人一面', fix: '打破套路：去掉固定句式，用自己的话重写', weight: 1.6 });

    // 2. 结构套路：序号化清单/总分总骨架（AI结构化的标志）
    var struc = countMatches(scanText, cfg.structure);
    items.structure = struc.n;
    if (struc.n >= 2 && family !== 'resume') hits.push({ text: struc.hits.slice(0, 3).join(' / '), why: '结构套路（' + struc.n + '处）：过度工整的序号骨架是AI组织内容的典型手法', fix: '打破骨架：打散序号，用自然叙述流替换', weight: 1.2 });

    // 3. 人称冲突：我/你/我们 单复数或人称混用
    var personHits = scanSents.filter(function (s) { return cfg.person.some(function (p) { return p.test(s); }); });
    items.person = personHits.length;
    if (personHits.length >= 2 && cfg.person.length) hits.push({ text: personHits.slice(0, 2).map(function (s) { return s.slice(0, 15) + '…'; }).join(' / '), why: '人称或视角频繁切换（' + personHits.length + '句）：AI生成时主语漂移', fix: '统一人称：全文固定用"我"或"你"，别来回跳', weight: 1.1 });

    // 4. 语域一致性：正式书面词与口语词混搭
    var form = countMatches(scanText, cfg.registerFormal).n;
    var coll = countMatches(scanText, cfg.registerColloquial).n;
    items.registerFormal = form; items.registerColloquial = coll;
    if (form >= 2 && coll >= 2) hits.push({ text: '', why: '语域混搭：一边书面词（' + form + '处）一边口语词（' + coll + '处），AI拼凑两种风格的痕迹', fix: '统一语域：要么全文正式，要么全文口语，别混着来', weight: 1.1 });

    // 5. emoji/感叹号密度（营销族重点；职场族阈值极低触发提示）
    var bang = (text.match(/[！!]/g) || []).length;
    var emojiCount = (text.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || []).length;
    var emojiPer100 = Math.round((bang + emojiCount) / Math.max(1, chars) * 100 * 10) / 10;
    items.emoji = Math.round((bang + emojiCount) * 10) / 10;
    if (family === 'marketing' && emojiPer100 > cfg.emojiTh * 100) {
      hits.push({ text: '', why: '感叹号+表情过密（每百字 ' + emojiPer100 + ' 个）：AI文案的"用力过猛"信号', fix: '删掉多余感叹号和表情，一句话最多留一个', weight: 1.0 });
    }
    if (family !== 'marketing' && (bang + emojiCount) > 0) {
      hits.push({ text: '', why: '严肃文体里出现 ' + (bang + emojiCount) + ' 个感叹号/表情：语体不搭', fix: '去掉感叹号和表情，保持书面语', weight: 0.7 });
    }

    // 6. 文案连接词（营销族）：口播化套路过渡
    var conn = countMatches(scanText, cfg.connectors);
    items.connectors = conn.n;
    if (conn.n >= 2 && family === 'marketing') hits.push({ text: conn.hits.slice(0, 3).join(' / '), why: '口播套路连接词（' + conn.n + '处）：AI写营销的固定过渡句', fix: '删掉套路连接，直接讲内容', weight: 1.0 });

    // --- plus：附加维度（不进总分，只展示） ---
    var plus = {};
    (function () {
      var starSents = 0;
      scanSents.forEach(function (s) { if (/\d|[一二两三四五六七八九十百千](?:个|名|人|次|天|周|月|年|万|家|条|单)/.test(s)) starSents++; });
      var starRatio = scanSents.length ? Math.round(starSents / scanSents.length * 100) : 0;
      var clicheSents = 0;
      scanSents.forEach(function (s) {
        if (CLICHE.fatal.some(function (p) { return p.test(s); }) || CLICHE.heavy.some(function (p) { return p.test(s); })) clicheSents++;
      });
      var clicheRatio = scanSents.length ? Math.round(clicheSents / scanSents.length * 100) : 0;
      plus = { starRatio: starRatio, clicheRatio: clicheRatio, sentCount: scanSents.length, chars: chars };
    })();

    // --- L4 评分映射 ---
    var raw = 0;
    raw += Math.min(2.5, fatal.n * 1.2);
    raw += Math.min(1.5, heavy.n * 0.35);
    raw += Math.min(0.3, light.n * 0.1);
    raw += Math.min(1.0, ext.n * 0.25);
    raw += Math.min(1.2, four * 1.2);
    if (scanSents.length >= 3 && cvAll < 0.25) raw += 1.0; else if (cvAll < 0.35) raw += 0.4;
    raw += Math.min(2.0, iso * 2.0);
    raw += Math.min(1.8, labelRuns * 1.8);
    if (items.numPer100 < 0.3 && family !== 'marketing') raw += 1.2; else if (items.numPer100 < 0.8 && family !== 'marketing') raw += 0.6;
    raw += Math.min(1.0, (vague.n - 3) * 0.25 > 0 ? (vague.n - 3) * 0.25 : 0);
    if (items.tellRatio >= 60 && scanSents.length >= 3 && TELL.length) raw += 1.0;
    raw += Math.min(1.5, uplift.n * 1.5);
    raw += Math.min(1.6, tpl.n * 0.8);
    raw += Math.min(1.2, struc.n * 0.4);
    raw += Math.min(1.0, personHits.length * 0.5);
    if (form >= 2 && coll >= 2) raw += 1.1;
    if (family === 'marketing' && emojiPer100 > cfg.emojiTh * 100) raw += 1.0;
    if (family !== 'marketing' && (bang + emojiCount) > 0) raw += 0.5;
    raw += Math.min(1.0, conn.n * 0.4);
    var score = Math.max(0, Math.min(10, Math.round(raw * 10) / 10));

    return {
      score: score,
      items: items,
      hits: hits.sort(function (a, b) { return b.weight - a.weight; }),
      plus: plus,
      stats: { chars: chars, sents: scanSents.length, paras: paras.length },
      genre: genre, family: family, genreLabel: cfg.label
    };
  }

  return {
    detect: detect,
    version: '2.0',
    genres: GENRE_CONFIG,
    genreTypes: GENRE_TYPES,
    tables: { CLICHE: GENRE_CONFIG.resume.cliche, EXTREME: GENRE_CONFIG.resume.extreme, VAGUE: GENRE_CONFIG.resume.vague, TELL: GENRE_CONFIG.resume.tell, UPLIFT: GENRE_CONFIG.resume.uplift }
  };
}));