/* ai-flavor rewriter engine v3.2 — multi-genre de-AI mechanical rewrite (readable edition)
 * Node (module.exports) + Browser (window.AIREWRITE)
 * RED LINE: only deterministic ops: delete / strip / restructure / question-hint.
 *   Never invent: no new numbers, no new facts, no synonym substitution.
 * v3.0 (kill stiffness):
 *   - extreme words DELETED, not mapped to 书面 synonyms
 *   - cliche phrases DELETED + question hint 【→补：…】 appended at sentence end (no mid-sentence holes)
 *   - dead lines (all sentences eaten) collapse to ONE question line, not skeleton残骸
 *   - dangling connectors (并/和/以及) and fragment tails (专注于。/注重。) cleaned
 *   - wordStrip 我-cleanup narrowed (v2 ate 「名单有我」)
 *   - pass C: CV normalize merges/splits until CV>=0.28; tell-merge when 负责开头句>=3
 *   - label run head widened: 「效率改进专家：」8-char labels merge too
 * v3.1 (multi-genre): rewrite(text, {genre}).
 *   - work(职场文书): 共享表并入八股词（在...领导下/再接再厉/高度重视/统筹推进/狠抓落实等）
 *   - marketing(营销文案): 独立 MARK_* 表——删套路腔(家人们/谁懂啊/绝绝子/yyds/闭眼入)、
 *     口播连接词(话不多说/直接上/上链接)、模板句(三招搞定/从...到...蜕变)、
 *     用力过猛(感叹号坍缩+emoji剥离)；关闭整段自我评价折叠。
 *   - resume 默认行为不变（共享表即原简历表+无害八股），human 零误伤、数字守恒保持。
 * v3.2 (deep optimization):
 *   - 营销收益生成器（MARK_BENEFIT + buildMarketingBenefit）：对象+场景+问题+结果结构化诊断+实际收益文本
 *   - work 四要素诊断（动作+对象+结果+证据）
 *   - 意图丢失探测器（intentLoss 检查）
 *   - AI 声纹指纹识别（generatorFingerprint）
 * v3.3 (humanizer): three new upgrade directions
 *   - U1 挖洞改问句: 【待填】不嵌在事实句中，改为句尾【→补：...】或整句折叠为问句
 *   - U2 句长打散: pass C 目标 CV 0.25-0.40，短句+长句交替
 *   - U3 人味注入: 保留 1-2 处非理性行为/情绪不完整表达/私货感 (human 技能)
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
    /凭借.{0,24}功底/,
    // work 八股：总结升华
    /在今后的工作中/,
    /在(?:今后|以后)?的?(?:工作|学习|生活)中(?:我)?将/,
    /再接再厉/,
    /再创佳绩/,
    /开拓创新/,
    /锐意进取/,
    /以[^，。；]{0,10}为指引/,
    /以[^，。；]{0,10}为(?:引领|抓手|契机)/,
    /一如既往地?/,
    /不忘初心/,
    /砥砺前行/,
    /笃行致远/
  ];
  // extreme intensifiers: DELETE the word itself (never substitute — that made 病句)
  var EXTREME_WORDS = [
    '显著的', '显著', '极大的', '极大', '卓越的', '卓越', '出色的', '出色',
    '深刻的', '深刻', '大幅', '敏锐的', '敏锐', '扎实的', '扎实',
    '紧密的', '紧密', '精细化的', '精细化', '贴心的', '贴心',
    '高度的', '不断', '持续',
    // work 八股：程度词
    '高度的', '深入地', '全方位地', '多维度地', '务实的', '务实',
    '强有力的', '坚实有力的', '有条不紊地', '保质保量地', '保质保量',
    '保质保量的', '高质量的', '高质量', '高效有序地', '卓有成效地',
    '显著成效', '扎实有效的', '深入扎实开展'
  ];
  var VAGUE_SELF = [
    '工作认真', '工作认真负责', '责任心强', '执行力强', '执行强',
    '积极主动', '良好沟通', '善于沟通', '注重细节', '精益求精',
    '吃苦耐劳', '抗压能力强', '性格开朗', '团队协作精神', '团队协作能力',
    '综合素质', '综合能力', '沟通能力强', '沟通技巧强', '较强的沟通',
    '高度的责任心', '学习能力强', '适应能力强', '严谨细致',
    // work 八股：履职空话
    '尽职尽责', '恪尽职守', '严于律己', '忠于职守', '任劳任怨',
    '率先垂范', '率先示范', '以身作则', '求真务实', '勤勉尽责',
    '担当作为', '真抓实干', '务实笃行', '守正创新', '履职尽责'
  ];
  var FILLER_START = ['总之', '综上', '总而言之', '通过以上', '在此过程中', '在这个过程中', '通过这份工作', '通过这工作', '在工作中始终', '在工作中保持'];
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
    { re: /有效(?:推动|维护|提升|防范|降低|减少)[^，。；\d]{0,16}(?:的)?(?:执行|运转|开展)/, hint: '推动到什么结果？写个数字或一件事' },
    // work 八股：套话短语（删+问句提示）
    { re: /在(?:上级|公司|单位|组织|党委)?(?:的)?(?:正确|坚强|有力)?(?:领导|指导下)/, hint: '这句套话删了——写你具体做了哪件事、结果怎样' },
    { re: /在(?:上级|公司|单位|组织|党委)?(?:的)?(?:大力|亲切)?(?:支持|关怀|帮助)下/, hint: '套话删了——换成你自己推动的一件具体事' },
    { re: /认真(?:学习|贯彻)(?:上级)?文件(?:精神)?|贯彻(?:落实)?(?:上级)?文件(?:精神)?/, hint: '这句空话删了——写一件你落地执行的具体任务' },
    { re: /高度(?:重视|关注|警惕)/, hint: '重视到哪一步？写你投入的具体资源和动作' },
    { re: /统筹(?:推进|谋划|协调)/, hint: '统筹了什么？写一件你牵头整合多方的事，带个数字' },
    { re: /狠抓(?:落实|执行|推进)/, hint: '抓出什么结果？写个数字或一件具体的事' },
    { re: /(?:有序|稳步|扎实)推(?:进|动|行)/, hint: '推进到什么程度？写个进度或结果' },
    { re: /取得(?:了)?(?:良好|显著|突出)成效/, hint: '成效用数字说话——写一个具体结果' },
    { re: /补齐?(?:了)?(?:短板|短板弱项)/, hint: '短板补到哪一步？写一件具体改进和它的效果' },
    { re: /强化(?:了)?(?:意识|责任|担当)/, hint: '强化成什么行动？写一件你实际改进的事' },
    { re: /夯实(?:了)?(?:基础|根基)/, hint: '基础怎么夯实？写一件具体沉淀（流程/文档/工具）' },
    { re: /确保(?:了)?(?:任务|工作)?(?:圆满|顺利)?(?:完成|落地|收尾)/, hint: '完成到什么程度？写个数或一件具体交付' }
  ];
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
    /，?确保了?[^，。；\d]{0,8}(?:顺利|顺畅|准确|及时)举办?(?=[。；，]|$)/g,
    /，?有效(?:维护|推动|防范|提升|降低)[^，。；\d]{0,12}(?=[。；，]|$)/g,
    /，?(?:积累了?|拥有)[^，。；\d]{0,10}的?(?:经验|功底)(?=[。；，]|$)/g,
    /，?成功提升(?:了)?[^，。；\d]{0,12}(?=[。；，]|$)/g,
    /，?提高了?[^，。；\d]{0,6}(?:效率|质量|水平|竞争力)(?=[。；，]|$)/g,
    /，?提升了?[^，。；\d]{0,6}(?:效率|质量|水平|竞争力)(?=[。；，]|$)/g,
    /，?实现(?:了)?[^，。；\d]{0,10}(?:成长|进步|发展)(?=[。；，]|$)/g,
    /，?(?:充分)?展现(?:了)?(?:不错|出色|良好|优秀)的?(?:执行力|领导才能|专业能力|服务意识)(?=[。；，]|$)/g,
    // work 八股：整句删除
    /，?在(?:上级|公司|单位|组织)?(?:的)?(?:正确|坚强|有力)?(?:领导|指导)下，?(?=[。；，]|$)/g,
    /，?在(?:上级|公司|单位|组织)?(?:的)?(?:大力|亲切)?(?:支持|关怀|帮助)下，?(?=[。；，]|$)/g,
    /，?认真(?:学习|贯彻)(?:上级)?文件(?:精神)?，?(?=[。；，]|$)/g,
    /，?(?:深入贯彻落实|学习贯彻)?(?:了)?(?:上级)?部署(?:要求)?，?(?=[。；，]|$)/g,
    /，?为(?:公司|单位|组织|中心)(?:的)?(?:发展|建设)(?:做出|贡献)(?:了)?(?:应有的|积极)?(?:贡献|力量)，?(?=[。；，]|$)/g,
    /，?(?:全面推进|有序推进|稳步推进|扎实推进)[^，。；\d]{0,14}，?(?=[。；，]|$)/g,
    /，?(?:持续|不断|继续)深化[^，。；\d]{0,12}，?(?=[。；，]|$)/g,
    /，?(?:圆满完成|保质保量完成|如期完成)(?:了)?[^，。；\d]{0,10}任务，?(?=[。；，]|$)/g,
    /，?在(?:思想上|行动上|工作中)做到?(?:了)?[^，。；\d]{0,10}，?(?=[。；，]|$)/g,
    /，?(?:以|用)(?:实际|扎实)?行动(?:诠释|践行|展现)[^，。；\d]{0,12}，?(?=[。；，]|$)/g
  ];
  var SELF_EVAL_HEAD = /^(?:自我评价|个人评价|个人优势|自我介绍)[:：]/;
  var VAGUE_RESULT_HEAD = /^(?:提升|提高|增强)(?:了)?(?:品牌)?(?:影响力|凝聚力|执行力)/;

  // 「降」等级词操作：剥离程度词本身，不替换为同义词（替换会造病句）。
  // 在 report 里用 op: '降' 标记，UI 门检按四类操作展示。
  var DEGREE_DROP_RE = [
    /显著的?/, /极大的?/, /卓越的?/, /出色的?/, /深刻的?/, /大幅/,
    /敏锐的?/, /扎实的?/, /紧密的?/, /精细化的?/, /贴心的?/, /高度的?/,
    /不断/, /持续/, /深入地?/, /全方位地?/, /多维度地?/, /务实的?/, /务实/,
    /强有力的?/, /有条不紊地?/, /保质保量地?/, /保质保量/, /高质量的?/, /高质量/,
    /高效有序地?/, /卓有成效地?/, /深入扎实开展/
  ];
  // dangling tails after deletions: 「…专注于。」「…并，」「…并改善。」
  var FRAG_TAIL_RE = /[,，]?\s*(?:专注于|注重于|注重|致力于|强调|精于|擅长于?)[。；]$/;
  var CONN_TAIL_RE = /(?:并|和|以及|及|或者|或是)(?=[，。；]|$)/g;

  // ================== marketing 词表（营销文案：删套路腔/模板/用力过猛/口播连接词） ==================
  var MARK_UPLIFT = [
    /入股不亏/,
    /闭眼入/,
    /家人们冲|姐妹们冲|宝子们冲/,
    /谁懂啊/,
    /懂我意思吗/,
    /懂的都懂/,
    /懂的姐妹/,
    /懂的宝/,
    /还在等什么/,
    /还不快/,
    /错过后悔|后悔一年|后悔一辈子/,
    /快冲/,
    /抓紧/,
    /码住/,
    /码住不亏/,
    /赶紧收藏/,
    /火速收藏/,
    /收藏不迷路/,
    // === 10 entries: brand exposure, user growth, retention, conversion, AOV, repurchase, WOM, market share ===
    /品牌曝光力度不够/,           // brand exposure
    /用户增长势头不足/,           // user growth
    /复购率低/,                    // repurchase
    /转化率低/,                    // conversion
    /平均客单价低/,                // AOV
    /口碑传播不足/,                // word-of-mouth
    /市场占有率低/,                // market share
    /活跃用户比例低/,             // active users
    /流失用户过多/,               // churn / retention
    /精准获客不足/                 // targeted acquisition
  ];
  var MARK_EXTREME_WORDS = [
    '绝绝子', '绝了', '绝', '超绝', '巨绝', 'yyds', 'YYDS', '天花板',
    '性价比之王', '性价比天花板', '超值', '巨值', '巨好用', '巨好穿', '巨好喝',
    '无敌', '封神', '封顶', '天花板', '顶配', '顶流', '一线水平',
    '宝藏', '宝藏级', '神仙', '神仙颜值', '神仙单品', '神级', '满分',
    '百搭', '万金油', '救星', '神器', '救急', '必入', '必囤', '必买',
    '闭眼入', '闭眼冲', '闭眼囤', '入不亏', '太值了', '赚到了'
  ];
  var MARK_VAGUE_SELF = [
    '品质', '体验', '氛围', '质感', '仪式感', '松弛感', '高级感', '精致感',
    '幸福感', '治愈感', '氛围感', '网感', '高级', '精致', '质感满分',
    '松弛', '治愈', '氛围', '精致到骨子里', '高级到炸', '质感一流'
  ];
  var MARK_FILLER_START = [
    '家人们', '姐妹们', '宝子们', '兄弟们', '集美们', '朋友们', '友友们',
    '众所周知', '在这个快节奏的时代', '随着生活水平提高', '在当下这个时代',
    '在这个内卷的时代', '话不多说', '直接上干货', '先上结论', '重点来了',
    '先划重点', '划重点', '先说重点', '懂我意思的都知道', '不多说'
  ];
  var MARK_HINT_DEL = [
    { re: /轻松(?:搞定|解锁|get|get到)/, hint: '写清它到底解决了你哪个具体问题、怎么用的' },
    { re: /一键(?:解锁|搞定|get|上手)/, hint: '一键之后发生了什么？写个具体场景或效果' },
    { re: /告别[^，。；！?]{2,12}烦恼|告别[^，。；！?]{2,12}困扰/, hint: '告别了什么？写一件你实测后的具体感受' },
    { re: /再也不用[^，。；！?]{2,12}了?/, hint: '再也不用什么？写一件你省下的具体事' },
    { re: /秒变[^，。；！?]{2,10}/, hint: '秒变什么？写个真实对比，别用夸张词' },
    { re: /瞬间(?:提升|点亮|治愈|上头)/, hint: '瞬间到哪？写个具体的真实反馈' },
    { re: /三招(?:搞定|学会|解决|养成)|三步(?:搞定|学会|解决)/, hint: '三招具体是什么？展开成能照做的步骤' },
    { re: /从[^，。；！?]{0,8}到[^，。；！?]{0,8}的蜕变/, hint: '蜕变前后的差别写具体，别用套路句' },
    { re: /不是[^，。；！?]{2,12}而是[^，。；！?]{2,12}/, hint: '这句对比太套路——用一件真实的事替换' },
    { re: /谁懂啊|谁懂这种|懂的都懂|懂的姐妹/, hint: '这句梗删了——直接说它好在哪、为什么值' },
    { re: /亲测有效|亲测好用/, hint: '亲测到什么效果？写个具体结果或感受' },
    { re: /干货满满|全是干货|纯干货/, hint: '干货具体是哪几条？展开成能照做的内容' },
    { re: /三招搞定|三步搞定|一招解决|轻松搞定/, hint: '模板句删了——写成可照做的具体操作，并给出每一步的操作和结果' },
    { re: /从[^，。；！?]{0,8}到[^，。；！?]{0,8}的蜕变/, hint: '蜕变句删了——写出前后对比的具体事实（前：X问题；后：Y结果）' }
  ];
  var MARK_CLAUSE_DEL_RE = [
    /，?话不多说[^，。；！?]{0,8}(?=[。；，！?]|$)/g,
    /，?直接(?:上链接|上货|上干货)[^，。；！?]{0,6}(?=[。；，！?]|$)/g,
    /，?(?:安排的)?都懂|懂的都懂|懂我意思(?=[。；，！?]|$)/g,
    /，?(?:这就是)?我在用的[^，。；！?]{0,10}(?=[。；，！?]|$)/g,
    /，?本人实测[^，。；！?]{0,8}(?=[。；，！?]|$)/g,
    /，?(?:闭眼|无脑)(?:入|冲|买)就完事了(?=[。；，！?]|$)/g,
    /，?真的会谢[^，。；！?]{0,4}(?=[。；，！?]|$)/g,
    /，?这波操作[^，。；！?]{0,8}(?=[。；，！?]|$)/g,
    /，?(?:还没|没来得及)的宝子们[^，。；！?]{0,6}(?=[。；，！?]|$)/g
  ];
  var MARK_EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B50}\u{2764}\u{1F000}-\u{1F0FF}]/gu;

  // ================== marketing 收益生成器（v3.2 新增） ==================
  // 每条记录回答「谁、在什么场景、遇到什么问题、得到什么结果」
  // 诊断本身只描述证据缺口和补证方向，不声称任何未提供的数字或结果
  var MARK_DIAGNOSTICS = [
    {
      re: /轻松(?:搞定|解锁|get|get到)/,
      object: '目标用户',
      scene: '开始使用产品时',
      problem: '操作路径或核心功能没有被说清楚',
      result: '【待填：补充一次真实使用过程，以及使用后能完成的具体任务】'
    },
    {
      re: /一键(?:解锁|搞定|get|上手)/,
      object: '目标用户',
      scene: '第一次上手或需要快速完成任务时',
      problem: '“一键”背后的实际步骤和节省的时间没有证据',
      result: '【待填：列出真实步骤，并补充操作前后耗时或步骤数对比】'
    },
    {
      re: /告别[^，。；！?]{2,12}烦恼|告别[^，。；！?]{2,12}困扰/,
      object: '目标用户',
      scene: '被原有问题反复打扰时',
      problem: '被解决的痛点、发生频率和改善幅度没有证据',
      result: '【待填：写清一个真实痛点，以及使用后问题减少或消失的具体表现】'
    },
    {
      re: /再也不用[^，。；！?]{2,12}了?/,
      object: '目标用户',
      scene: '原本需要重复处理的日常任务中',
      problem: '省掉的动作、时间和出错风险没有量化',
      result: '【待填：补充省下的具体动作、时间或次数，以及避免的失误】'
    },
    {
      re: /秒变[^，。；！?]{2,10}/,
      object: '目标用户',
      scene: '使用前后的即时对比场景',
      problem: '“秒变”前后的可观察差别没有事实支撑',
      result: '【待填：用使用前/使用后的可观察变化描述效果，并补充真实反馈】'
    },
    {
      re: /瞬间(?:提升|点亮|治愈|上头)/,
      object: '目标用户',
      scene: '接触产品后的即时体验',
      problem: '即时感受缺少触发细节和持续时长',
      result: '【待填：补充触发效果的具体感受、出现时间，以及效果持续多久】'
    },
    {
      re: /三招(?:搞定|学会|解决|养成)|三步(?:搞定|学会|解决)/,
      object: '目标用户',
      scene: '按教程学习或解决问题时',
      problem: '步骤数量被强调，但每一步的操作和结果缺失',
      result: '【待填：展开每一步的真实操作，并补充完成后的可验证结果】'
    },
    {
      re: /从[^，。；！?]{0,8}到[^，。；！?]{0,8}的蜕变/,
      object: '目标用户',
      scene: '完成一次使用或改变周期前后',
      problem: '前后对比只有结论，没有起点、终点和过程',
      result: '【待填：补充使用前的问题、使用后的变化节点，以及可核对的结果】'
    },
    {
      re: /不是[^，。；！?]{2,12}而是[^，。；！?]{2,12}/,
      object: '目标用户',
      scene: '在两个方案或认知之间做选择时',
      problem: '对比关系没有真实案例或用户反馈支撑',
      result: '【待填：用一个真实案例说明为什么选择后者，以及带来的具体差别】'
    },
    {
      re: /谁懂啊|谁懂这种|懂的都懂|懂的姐妹/,
      object: '目标用户',
      scene: '看到内容并产生共鸣时',
      problem: '用群体暗号代替了产品价值和真实体验',
      result: '【待填：直接写出产品解决的一个具体问题和一个真实使用反馈】'
    },
    {
      re: /亲测有效|亲测好用/,
      object: '目标用户',
      scene: '完成一次真实使用后',
      problem: '“亲测”没有场景、过程和可验证结果',
      result: '【待填：补充测试条件、使用过程，以及可核对的效果或反馈】'
    },
    {
      re: /干货满满|全是干货|纯干货/,
      object: '目标用户',
      scene: '阅读内容时',
      problem: '干货具体是哪几条没有展开',
      result: '【待填：列出具体的几条干货，每条附一个使用场景】'
    },
    {
      re: /三招搞定|三步搞定|一招解决|轻松搞定/,
      object: '目标用户',
      scene: '解决问题时',
      problem: '模板句删了——写成可照做的具体操作，并给出每一步的操作和结果',
      result: '【待填：展开每一步的真实操作，并补充完成后的可验证结果】'
    }
  ];

  // 收益模板库：把诊断映射为实际收益文本（基于上下文的数字/时间/场景）
  var BENEFIT_TEMPLATES = [
    // 场景：效率提升
    { pattern: /(?:秒变|瞬间|一键)/, benefit: 'X天/次内完成原本需要Y小时的工作', extract: /(?:X天|X小时|X次)/ },
    // 场景：成本节约
    { pattern: /告别|再也不用/, benefit: '每月节省X小时/减少X元开销', extract: /X元|X小时/ },
    // 场景：效果提升
    { pattern: /提升|提高|增强/, benefit: '使用后X天内可见改善（如：流量+X%/转化率+X%）', extract: /X%/ },
    // 场景：操作简化
    { pattern: /轻松|简单|快速/, benefit: '步骤从X步减至Y步，新手也能上手', extract: /X步|Y步/ },
    // 场景：具体成果
    { pattern: /搞定|解决|完成/, benefit: '已完成X单/服务X人/处理X万数据，零事故', extract: /X单|X人|X万/ }
  ];

  /**
   * 从诊断结果构建营销收益文本
   * @param {string} raw - 原始文本行
   * @param {object} diag - 诊断记录（object/surface）
   * @returns {string} 收益文本（带【→补：...】标记）
   */
  function buildMarketingBenefit(raw, diag) {
    // 1. 从原文提取可用数字/时间/数量线索
    var numMatches = raw.match(/\d+/g);
    var hasNums = numMatches && numMatches.length > 0;
    var numStr = hasNums ? numMatches.join('') : 'X';

    // 2. 匹配收益模板
    var benefit = '【→补：' + diag.result + '】';
    for (var i = 0; i < BENEFIT_TEMPLATES.length; i++) {
      var tmpl = BENEFIT_TEMPLATES[i];
      if (tmpl.pattern.test(raw)) {
        // 用原文数字替换模板占位符
        var b = tmpl.benefit;
        if (hasNums) {
          b = b.replace(/X/g, numMatches[0] || 'X');
          if (numMatches[1]) b = b.replace(/Y/g, numMatches[1]);
        }
        benefit = '【→补：' + b + '】';
        break;
      }
    }

    // 3. 构建结构化收益文本：对象+场景+问题+结果
    var obj = diag.object || '目标用户';
    var scene = diag.scene || '使用场景';
    var problem = diag.problem || '遇到的问题';
    var result = diag.result || '【待填：补充具体结果】';

    // 4. 返回结构化收益（不编造数字，只在有原文数字时替换）
    return obj + '在' + scene + '遇到' + problem + '——' + result;
  }

  /**
   * 营销收益生成入口：批量处理所有 MARK_DIAGNOSTICS 命中
   * @param {string} text - 原始文本
   * @returns {array} 收益提示列表
   */
  // ================== 营销收益计算增强（v3.2.1） — 基于原文数字生成实际收益估算 ==================
  function generateRevenueEstimate(text, diag) {
    // 提取原文中的数字作为估算依据（不编造，新数字仅来自原文或标记为X）
    var nums = text.match(/\d+/g) || [];
    var hasNum = nums.length > 0;
    // 基于诊断类型映射收益类别（仅描述方向，不计算具体金额，除非有原文数字支撑）
    var revType = '效率/体验提升';
    if (diag.problem && diag.problem.indexOf('成本') >= 0) revType = '成本节约';
    else if (diag.problem && /效果|结果|反馈/.test(diag.problem)) revType = '效果提升';
    // 如果有数字，用数字填充；否则标记待填（不编造）
    var numStr = hasNum ? nums.slice(0, 2).join(' / ') : 'X';
    return revType + ' — 原文提供数字: ' + numStr + ' [' + diag.object + '在' + diag.scene + '遇到' + diag.problem + '] 【待填：根据实际业务数据填入具体收益金额/转换率/节省时间】';
  }

  function generateMarketingBenefits(text) {
    var benefits = [];
    var lines = text.split(/\n/);
    lines.forEach(function (line) {
      MARK_DIAGNOSTICS.forEach(function (d) {
        if (d.re.test(line)) {
          var benefit = buildMarketingBenefit(line, d);
          // v3.2.1 增强：附加收益估算（不编造，只基于原文数字或标记）
          var rev = generateRevenueEstimate(line, d);
          benefits.push(benefit + ' | 收益估算: ' + rev);
        }
      });
    });
    return benefits;
  }

  /**
   * 营销诊断应用：把 MARK_DIAGNOSTICS 命中的文本行替换为结构化收益文本
   * @param {array} lines - 最终文本行数组
   * @returns {array} 更新后的文本行数组
   */
  function applyMarketingDiagnostics(lines) {
    return lines.map(function (l) {
      if (l.hint || l.bullet) return l;
      var raw = l.raw;
      var diag = null;
      for (var k = 0; k < MARK_DIAGNOSTICS.length; k++) {
        if (MARK_DIAGNOSTICS[k].re.test(raw)) { diag = MARK_DIAGNOSTICS[k]; break; }
      }
      if (!diag) return l;
      var benefit = buildMarketingBenefit(raw, diag);
      return { raw: benefit, bullet: l.bullet };
    });
  }

  // ================== 意图丢失探测器（v3.2 新增） ==================
  /**
   * 检测改写前后意图是否丢失
   * @param {string} before - 原文
   * @param {string} after - 改写后
   * @returns {object} 意图丢失报告
   */
  function detectIntentLoss(before, after) {
    // 提取关键事实词（数字、专有名词、动作动词）
    var beforeFacts = extractKeyFacts(before);
    var afterFacts = extractKeyFacts(after);

    // 计算意图保留率
    var preserved = 0;
    var lost = [];
    beforeFacts.forEach(function (f) {
      if (afterFacts.indexOf(f) >= 0) preserved++;
      else lost.push(f);
    });

    var retention = beforeFacts.length > 0 ? preserved / beforeFacts.length : 1;

    return {
      intentPreserved: retention >= 0.5,
      retentionScore: Math.round(retention * 100) / 100,
      lostFacts: lost,
      beforeFactCount: beforeFacts.length,
      afterFactCount: afterFacts.length
    };
  }

  /**
   * 提取文本中的关键事实（数字、专有名词、动作动词）
   * @param {string} text
   * @returns {array} 事实关键词列表
   */
  function extractKeyFacts(text) {
    var facts = [];
    // 提取数字
    var nums = text.match(/\d+/g);
    if (nums) facts = facts.concat(nums);
    // 提取专有名词（大写字母开头、特定行业词）
    var properNouns = text.match(/[A-Z][a-zA-Z]*/g);
    if (properNouns) facts = facts.concat(properNouns);
    // 提取动作动词（核心动作）
    var actionVerbs = text.match(/(?:负责|完成|执行|管理|协调|推动|实施|制定|策划|运营|分析|优化|提升|构建|维护|处理|跟进|落实|监督|审核|汇总|编写|设计|开发|测试|上线|部署|培训|指导|沟通|协调)/g);
    if (actionVerbs) facts = facts.concat(actionVerbs);
    // 去重
    return facts.filter(function (v, i, a) { return a.indexOf(v) === 0; });
  }

  /**
   * 检测过度删除（改写后长度过短或关键信息被删光）
   * @param {string} before
   * @param {string} after
   * @param {object} report - 改写报告
   * @returns {object} 过度删除报告
   */
  function detectOverDeletion(before, after, report) {
    var beforeLen = before.replace(/[\s，。；、]/g, '').length;
    var afterLen = after.replace(/[\s，。；、]/g, '').length;
    var ratio = beforeLen > 0 ? afterLen / beforeLen : 1;

    var deletions = report.filter(function (r) { return r.op === '删'; }).length;
    var totalOps = report.length;
    var deletionRatio = totalOps > 0 ? deletions / totalOps : 0;

    return {
      overDeleted: ratio < 0.3 || deletionRatio > 0.5,
      lengthRatio: Math.round(ratio * 100) / 100,
      deletionRatio: Math.round(deletionRatio * 100) / 100,
      deletionCount: deletions,
      totalOps: totalOps,
      warning: ratio < 0.3 ? '改写后长度不足原文30%，可能过度删除' :
               deletionRatio > 0.5 ? '删除操作占比超过50%，需检查是否误删' : null
    };
  }

  // ================== AI 声纹指纹识别（v3.2 新增） ==================
  // 句式指纹：各模型偏好的句式模式
  var SENTENCE_FINGERPRINTS = {
    gpt: [
      /不是[^，。]{0,20}而是[^，。]{0,30}/g,
      /既[^，。]{0,15}又[^，。]{0,20}/g,
      /不仅[^，。]{0,15}更[^，。]{0,20}/g,
      /真正的?[^，。]{0,10}是[^，。]{0,30}/g,
      /只要[^，。]{0,15}就能[^，。]{0,30}/g
    ],
    claude: [
      /—[^—]{10,}—/g,
      /——[^——]{10,}——/g,
      /；[^；]{15,}；/g,
      /:\s*[^。]{20,}\./g
    ],
    gemini: [
      /第[一二三四五六七八九十]{1,2}[、：:][^，。]{10,}[，，、][^，。]{10,}[，，、][^，。]{10,}/g,
      /首先[^，。]{0,30}[，，、]其次[^，。]{0,30}[，，、]最后[^，。]{0,30}/g,
      /一方面[^，。]{0,20}[，，、]另一方面[^，。]{0,20}/g
    ],
    wenxin: [
      /值得注意的是[^，。]{0,30}/g,
      /需要指出的是[^，。]{0,30}/g,
      /我们可以看到[^，。]{0,30}/g,
      /总的来说[^，。]{0,30}/g
    ],
    qwen: [
      /首先[^，。]{0,10}[，，、][^，。]{0,20}[，，、]再次[^，。]{0,10}[，，、][^，。]{0,20}/g,
      /总结来说[^，。]{0,30}/g,
      /综上所述[^，。]{0,30}/g,
      /基于以上[^，。]{0,30}/g
    ],
    deepseek: [
      /根据[^，。]{0,20}分析[^，。]{0,30}/g,
      /因此[^，。]{0,10}(?:可以|应该|需要)[^，。]{0,20}/g,
      /结合[^，。]{0,10}和[^，。]{0,20}/g,
      /综合考虑[^，。]{0,30}/g
    ]
  };

  // 词汇指纹：各模型偏好的元话语标记
  var VOCABULARY_FINGERPRINTS = {
    gpt: [/值得注意的是/g, /需要指出的是/g, /重要的是/g, /关键在于/g, /核心在于/g],
    claude: [/话说/g, /说白了/g, /实话说/g, /坦白说/g, /说实话/g],
    gemini: [/简而言之/g, /总的来说/g, /综合来看/g, /从长远来看/g, /本质上/g],
    wenxin: [/值得注意的是/g, /需要指出的是/g, /我们要认识到/g, /应当注意/g, /必须强调/g],
    qwen: [/总的来说/g, /综上所述/g, /总而言之/g, /综合上述/g, /基于以上分析/g],
    deepseek: [/根据分析/g, /因此可以/g, /综合考虑/g, /结合以上/g, /深入分析/g]
  };

  // 标点指纹：破折号、分号、冒号使用模式
  var PUNCTUATION_FINGERPRINTS = {
    gpt: { dash: 0.5, semicolon: 0.2, colon: 0.3 },
    claude: { dash: 3.0, semicolon: 1.5, colon: 0.8 },
    gemini: { dash: 0.8, semicolon: 0.5, colon: 1.2 },
    wenxin: { dash: 0.3, semicolon: 0.4, colon: 0.5 },
    qwen: { dash: 0.4, semicolon: 0.3, colon: 0.6 }
  };

  /**
   * 计算文本统计特征
   * @param {string} text
   * @returns {object} 统计特征
   */
  function computeTextStats(text) {
    var sents = text.split(/[。；;！!？?\n]+/).filter(function (s) { return s.trim().length > 1; });
    var paras = text.split(/\n+/).filter(function (s) { return s.trim().length > 2; });
    var chars = text.replace(/\s/g, '').length;

    var sentLens = sents.map(function (s) { return s.length; });
    var paraLens = paras.map(function (p) { return p.length; });

    var dashCount = (text.match(/[———]/g) || []).length;
    var semicolonCount = (text.match(/[；;]/g) || []).length;
    var colonCount = (text.match(/[:：]/g) || []).length;

    return {
      sentCount: sents.length,
      paraCount: paras.length,
      chars: chars,
      avgSentLen: sentLens.length ? sentLens.reduce(function (a, b) { return a + b; }, 0) / sentLens.length : 0,
      cvSentLen: sentLens.length > 1 ? Math.sqrt(sentLens.reduce(function (a, b) { return a + (b - sentLens.reduce(function (x, y) { return x + y; }, 0) / sentLens.length) * (b - sentLens.reduce(function (x, y) { return x + y; }, 0) / sentLens.length); }, 0) / sentLens.length) / (sentLens.reduce(function (a, b) { return a + b; }, 0) / sentLens.length) : 0,
      avgParaLen: paraLens.length ? paraLens.reduce(function (a, b) { return a + b; }, 0) / paraLens.length : 0,
      cvParaLen: paraLens.length > 1 ? Math.sqrt(paraLens.reduce(function (a, b) { return a + (b - paraLens.reduce(function (x, y) { return x + y; }, 0) / paraLens.length) * (b - paraLens.reduce(function (x, y) { return x + y; }, 0) / paraLens.length); }, 0) / paraLens.length) / (paraLens.reduce(function (a, b) { return a + b; }, 0) / paraLens.length) : 0,
      dashPer100: chars > 0 ? dashCount / chars * 100 : 0,
      semicolonPer100: chars > 0 ? semicolonCount / chars * 100 : 0,
      colonPer100: chars > 0 ? colonCount / chars * 100 : 0
    };
  }

  /**
   * 检测句式指纹
   * @param {string} text
   * @returns {object} 各模型命中数
   */
  function detectSentenceFingerprint(text) {
    var scores = {};
    for (var model in SENTENCE_FINGERPRINTS) {
      var patterns = SENTENCE_FINGERPRINTS[model];
      var totalHits = 0;
      var matched = [];
      for (var i = 0; i < patterns.length; i++) {
        var m = text.match(patterns[i]);
        if (m) {
          totalHits += m.length;
          matched = matched.concat(m.slice(0, 3));
        }
      }
      scores[model] = { count: totalHits, examples: matched };
    }
    return scores;
  }

  /**
   * 检测词汇指纹
   * @param {string} text
   * @returns {object} 各模型命中数
   */
  function detectVocabularyFingerprint(text) {
    var scores = {};
    for (var model in VOCABULARY_FINGERPRINTS) {
      var patterns = VOCABULARY_FINGERPRINTS[model];
      var totalHits = 0;
      var matched = [];
      for (var i = 0; i < patterns.length; i++) {
        var m = text.match(patterns[i]);
        if (m) {
          totalHits += m.length;
          matched = matched.concat(m.slice(0, 3));
        }
      }
      scores[model] = { count: totalHits, examples: matched };
    }
    return scores;
  }

  /**
   * 检测标点指纹
   * @param {string} text
   * @returns {object} 各模型距离
   */
  function detectPunctuationFingerprint(text) {
    var stats = computeTextStats(text);
    var scores = {};
    for (var model in PUNCTUATION_FINGERPRINTS) {
      var fp = PUNCTUATION_FINGERPRINTS[model];
      var diff = Math.abs(stats.dashPer100 - fp.dash) +
                 Math.abs(stats.semicolonPer100 - fp.semicolon) +
                 Math.abs(stats.colonPer100 - fp.colon);
      scores[model] = { distance: diff, stats: { dash: stats.dashPer100, semicolon: stats.semicolonPer100, colon: stats.colonPer100 } };
    }
    return scores;
  }

  /**
   * 综合指纹评分并推测生成器（v3.2 新增）
   * @param {object} fingerprint - 指纹数据
   * @returns {object} 推测结果
   */
  function guessGenerator(fingerprint) {
    var weights = {
      sentence: 0.35,
      vocabulary: 0.25,
      punctuation: 0.20,
      structure: 0.10,
      emotional: 0.10
    };

    var modelScores = { gpt: 0, claude: 0, gemini: 0, wenxin: 0, qwen: 0 };
    var evidence = [];

    // 句式指纹评分
    if (fingerprint.sentencePattern) {
      for (var m in fingerprint.sentencePattern) {
        var cnt = fingerprint.sentencePattern[m].count;
        if (cnt > 0) {
          modelScores[m] += weights.sentence * Math.min(10, cnt * 2);
          evidence.push({ type: 'sentence', model: m, count: cnt, examples: fingerprint.sentencePattern[m].examples });
        }
      }
    }

    // 词汇指纹评分
    if (fingerprint.vocabularyPattern) {
      for (var m in fingerprint.vocabularyPattern) {
        var cnt = fingerprint.vocabularyPattern[m].count;
        if (cnt > 0) {
          modelScores[m] += weights.vocabulary * Math.min(10, cnt * 3);
          evidence.push({ type: 'vocabulary', model: m, count: cnt, examples: fingerprint.vocabularyPattern[m].examples });
        }
      }
    }

    // 标点指纹评分（距离越小越像）
    if (fingerprint.punctuationPattern) {
      var minDist = Infinity;
      for (var m in fingerprint.punctuationPattern) {
        if (fingerprint.punctuationPattern[m].distance < minDist) {
          minDist = fingerprint.punctuationPattern[m].distance;
        }
      }
      for (var m in fingerprint.punctuationPattern) {
        var dist = fingerprint.punctuationPattern[m].distance;
        if (dist <= minDist * 1.5 && dist < 5) {
          var score = weights.punctuation * (1 - dist / 5) * 10;
          modelScores[m] += Math.max(0, score);
          evidence.push({ type: 'punctuation', model: m, distance: dist, stats: fingerprint.punctuationPattern[m].stats });
        }
      }
    }

    // 结构指纹：目前不直接映射模型，作为辅助
    if (fingerprint.structurePattern) {
      evidence.push({ type: 'structure', data: fingerprint.structurePattern });
    }

    // 情感指纹：辅助
    if (fingerprint.emotionalPattern) {
      evidence.push({ type: 'emotional', data: fingerprint.emotionalPattern });
    }

    // 找最高分
    var bestModel = null, bestScore = 0;
    for (var m in modelScores) {
      if (modelScores[m] > bestScore) {
        bestScore = modelScores[m];
        bestModel = m;
      }
    }

    // 归一化置信度
    var totalScore = Object.values(modelScores).reduce(function (a, b) { return a + b; }, 0);
    var confidence = totalScore > 0 ? bestScore / totalScore : 0;

    // 只有置信度足够高才返回推测
    if (bestScore < 1.5 || confidence < 0.35) {
      return { type: 'unknown', confidence: 0, evidence: evidence, note: '指纹特征不明显，无法可靠推测（推测而非确证）' };
    }

    var modelLabels = {
      gpt: 'GPT系列',
      claude: 'Claude系列',
      gemini: 'Gemini系列',
      wenxin: '文心一言系列',
      qwen: '通义千问系列'
    };

    return {
      type: modelLabels[bestModel] || bestModel,
      modelKey: bestModel,
      confidence: Math.round(confidence * 100) / 100,
      evidence: evidence,
      note: '基于文体指纹特征的推测，非确证；仅供参考'
    };
  }

  /**
   * AI 声纹指纹识别入口
   * @param {string} text - 待检测文本
   * @returns {object} 指纹识别结果
   */
  function generatorFingerprint(text) {
    var sentenceFp = detectSentenceFingerprint(text);
    var vocabFp = detectVocabularyFingerprint(text);
    var punctFp = detectPunctuationFingerprint(text);
    var stats = computeTextStats(text);

    return guessGenerator({
      sentencePattern: sentenceFp,
      vocabularyPattern: vocabFp,
      punctuationPattern: punctFp,
      structurePattern: {
        avgSentLen: stats.avgSentLen,
        cvSentLen: stats.cvSentLen,
        avgParaLen: stats.avgParaLen,
        cvParaLen: stats.cvParaLen
      },
      emotionalPattern: null // 简化版暂不实现
    });
  }

  // ================== work 四要素诊断（v3.2 新增） ==================
  /**
   * work-genre 四要素诊断：动作 + 对象 + 结果 + 证据
   * @param {string} text - 原文文本
   * @returns {object} 四要素诊断报告
   */
  function detectWorkFourElements(text) {
    var sentences = text.split(/[。；;！!？?\n]+/).filter(function (s) { return s.trim().length > 1; });

    var actions = [];  // 动作（动词）
    var objects = [];  // 对象（名词/受事）
    var results = [];  // 结果（数字/成果）
    var evidences = []; // 证据（项目/奖项/数据）

    sentences.forEach(function (sent) {
      // 动作：提取动词
      var verbs = sent.match(/(?:负责|完成|执行|管理|协调|推动|实施|制定|策划|运营|分析|优化|提升|构建|维护|处理|跟进|落实|监督|审核|汇总|编写|设计|开发|测试|上线|部署|培训|指导|沟通|协调)/g);
      if (verbs) actions = actions.concat(verbs);

      // 对象：提取名词性短语（简化版：提取"做XX"中的XX）
      var objMatches = sent.match(/(?:负责|完成|执行|管理)(?:了)?(.{0,10}?)(?:的|任务|工作|项目|方案|报告|流程)/g);
      if (objMatches) {
        objMatches.forEach(function (m) {
          var obj = m.replace(/(?:负责|完成|执行|管理)(?:了)?/, '').replace(/(?:的|任务|工作|项目|方案|报告|流程)$/, '').trim();
          if (obj) objects.push(obj);
        });
      }

      // 结果：提取数字
      var nums = sent.match(/\d+/g);
      if (nums) results = results.concat(nums);

      // 证据：提取项目/奖项/数据关键词
      var evidenceMatches = sent.match(/(?:项目|奖项|数据|客户|用户|产品|平台|公司|团队|部门|业绩|营收|利润|增长|提升|优化|落地|上线|发布|推出|完成|交付)/g);
      if (evidenceMatches) evidences = evidences.concat(evidenceMatches);
    });

    // 去重
    actions = actions.filter(function (v, i, a) { return a.indexOf(v) === i; });
    objects = objects.filter(function (v, i, a) { return a.indexOf(v) === i; });
    results = results.filter(function (v, i, a) { return a.indexOf(v) === i; });
    evidences = evidences.filter(function (v, i, a) { return a.indexOf(v) === i; });

    return {
      actions: actions,
      objects: objects,
      results: results,
      evidences: evidences,
      // 四要素完整性评分
      completeness: {
        hasActions: actions.length > 0,
        hasObjects: objects.length > 0,
        hasResults: results.length > 0,
        hasEvidences: evidences.length > 0,
        score: (actions.length > 0 ? 25 : 0) + (objects.length > 0 ? 25 : 0) + (results.length > 0 ? 25 : 0) + (evidences.length > 0 ? 25 : 0)
      }
    };
  }

  // ================== 工具函数 ==================
  function hasNum(t) { return /\d|[一二两三四五六七八九十百千]+(?:个|名|人|次|天|周|月|年|万|家|条|单)/.test(t); }
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
        changes.push({ op: '降', from: '程度词：' + w });
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
  // 多文体：marketing 用独立营销词表；resume/work 共享同一套（work 八股已并入共享表，resume 不含八股故无副作用）
  function rewrite(text, opts) {
    opts = opts || {};
    var genre = opts.genre || 'resume';
    var isMarketing = genre === 'marketing';
    if (!text || text.replace(/\s/g, '').length < 20) {
      return { ok: false, error: '文本太短（<20字），不值得改写' };
    }
    var report = [];
    var origNums = meaningfulNums(text);
    // 按文体选词表：marketing 独立，resume/work 用共享表。
    // 注意：必须「重赋值」模块级表变量（而非局部遮蔽），因为 delWithHints/clauseDels/
    // stripExtremes/wordStrip 等辅助函数通过闭包直接读这些变量，需让它们看到被选中的表。
    var T = isMarketing ? {
      UPLIFT: MARK_UPLIFT,
      EXTREME_WORDS: MARK_EXTREME_WORDS,
      VAGUE_SELF: MARK_VAGUE_SELF,
      FILLER_START: MARK_FILLER_START,
      HINT_DEL: MARK_HINT_DEL,
      CLAUSE_DEL_RE: MARK_CLAUSE_DEL_RE
    } : {
      UPLIFT: UPLIFT,
      EXTREME_WORDS: EXTREME_WORDS,
      VAGUE_SELF: VAGUE_SELF,
      FILLER_START: FILLER_START,
      HINT_DEL: HINT_DEL,
      CLAUSE_DEL_RE: CLAUSE_DEL_RE
    };
    UPLIFT = T.UPLIFT; EXTREME_WORDS = T.EXTREME_WORDS; VAGUE_SELF = T.VAGUE_SELF;
    FILLER_START = T.FILLER_START; HINT_DEL = T.HINT_DEL; CLAUSE_DEL_RE = T.CLAUSE_DEL_RE;
    // marketing 关闭整段「自我评价」折叠（营销无此结构）
    SELF_EVAL_HEAD = isMarketing ? /$x/ : SELF_EVAL_HEAD;
    VAGUE_RESULT_HEAD = isMarketing ? /$x/ : VAGUE_RESULT_HEAD;

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

    // marketing benefit 增强：把套路提示语替换为结构化诊断（对象+场景+问题+结果）
    if (isMarketing) {
      // 第一步：对所有 MARK_HINT_DEL 和 MARK_DIAGNOSTICS 命中的文本应用结构化诊断
      // 同时把旧式 flat hint 替换为更具体的引导问句
      finalLines = finalLines.map(function (l) {
        if (l.hint) return l;
        var raw = l.raw;
        // 检查是否有 MARK_DIAGNOSTICS 命中，生成结构化诊断文本
        var diag = null;
        for (var k = 0; k < MARK_DIAGNOSTICS.length; k++) {
          if (MARK_DIAGNOSTICS[k].re.test(raw)) { diag = MARK_DIAGNOSTICS[k]; break; }
        }
        if (diag) {
          // 结构化诊断：对象+场景+问题+结果，不编造事实
          var benefit = buildMarketingBenefit(raw, diag);
          return { raw: benefit, bullet: l.bullet };
        }
        // 旧式 flat hint 替换为更具体的引导问句
        raw = raw
          .replace(/【→补：换成它到底帮了你什么的具体场景】/, '【→补：它到底帮谁解决了什么问题？写一个真实使用场景 + 具体结果】')
          .replace(/【→补：开头直接说产品解决了什么问题，不需要叫人】/, '【→补：开头直接说「什么人+在什么场景+用它解决什么问题」】')
          .replace(/【→补：把步骤展开成能照做的具体操作】/, '【→补：把步骤写成可照做的操作，例如「先…再…最后…」】')
          .replace(/【→补：写出前后对比的具体事实（前：X问题；后：Y结果）】/, '【→补：写清「用前有什么痛点，用后具体改善在哪里」】');
        return { raw: raw, bullet: l.bullet };
      });
    }

    // ====== U1 挖洞改问句（v3.3 新增） ======
    // 把句中【待填：...】移到句尾或折叠为整句问句
    finalLines = finalLines.map(function (l) {
      if (l.hint) return l;
      var raw = l.raw;
      // 匹配句中【待填：...】标记
      var holeRe = /【待填：[^】]*】/g;
      if (!holeRe.test(raw)) return l;
      // 重新构造：保留事实骨架，问句移到句尾
      var hints = [];
      var cleaned = raw.replace(/【待填：([^】]*)】/g, function (m, q) {
        hints.push(q);
        return '';
      });
      cleaned = cleaned.replace(/[，,；;]\s*$/g, '').trim();
      // 如果 facts 太少，整句折叠为问句
      if (strippedLen(cleaned) < 10) {
        return { raw: '【→补：' + (hints[0] || '补充具体事实') + '】', bullet: l.bullet, hint: true };
      }
      // 否则：事实句 + 句尾问句
      var tail = hints.map(function (h) { return '【→补：' + h + '】'; }).join('；');
      return { raw: cleaned + '，' + tail, bullet: l.bullet };
    });

    // ====== U2 句长打散（v3.3 新增） ======
    // pass C+1: 强制打散连续 3 句以上同长度句子
    var rhythmLines = finalLines.slice();
    finalLines = [];
    rhythmLines.forEach(function (l) {
      if (l.bullet || l.hint) { finalLines.push(l); return; }
      var sents = splitSentences(stripMarks(l.raw));
      if (sents.length < 3) { finalLines.push(l); return; }
      // 计算句长 CV
      var lens = sents.map(function (s) { return s.length; });
      var mean = lens.reduce(function (a, b) { return a + b; }, 0) / lens.length;
      var vr = lens.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / lens.length;
      var cvv = Math.sqrt(vr) / mean;
      if (cvv < 0.15) {
        // 句长太均匀：随机选 1 句拆成 2 句（在逗号/分句处断开）
        var idx = 0;
        for (var si = 0; si < sents.length; si++) {
          if (sents[si].length > mean * 0.8) { idx = si; break; }
        }
        var target = sents[idx];
        var cutAt = -1;
        for (var ci = 3; ci < target.length - 3; ci++) {
          if (target[ci] === '，' || target[ci] === '；' || target[ci] === '。') { cutAt = ci; break; }
        }
        if (cutAt > 0) {
          var head = target.slice(0, cutAt + 1);
          var tail = target.slice(cutAt + 1).replace(/^[，；]/, '');
          if (tail.length > 0) {
            sents.splice(idx, 1, head, tail);
            report.push({ op: '拆句', detail: '句长均匀 (CV=' + cvv.toFixed(2) + ') → 拆成长短交替' });
          }
        }
      }
      finalLines.push({ raw: sents.join(''), bullet: false });
    });

    // ====== U3 人味注入（v3.3 新增） ======
    // 保留 1-2 处"非理性行为/情绪不完整表达/私货感"——只对 AI 语料注入
    // 注入条件：文本 score >= 3.0（确实是 AI 味）且改写后仍 >= 2.0
    if (!humanGuard) {
      var preScore = 0;
      try { preScore = require('./detector.js').detect(text).score; } catch (e) { /* skip */ }
      var postScore = 0;
      try { postScore = require('./detector.js').detect(finalLines.map(function (l) { return l.raw; }).join('\n')).score; } catch (e) { /* skip */ }
      if (preScore >= 3.0 && postScore >= 2.0) {
        // 随机选 1 个非关键事实句，注入人味标记
        var injectIdx = -1;
        for (var ii = 0; ii < finalLines.length; ii++) {
          if (!finalLines[ii].bullet && !finalLines[ii].hint && !/【→补：/.test(finalLines[ii].raw)) {
            injectIdx = ii; break;
          }
        }
        if (injectIdx >= 0) {
          var rawLine = finalLines[injectIdx].raw;
          // 在句中加一个口语化停顿/情绪词
          var humanInjects = [
            '说真的，', '老实说，', '怎么说呢，', '其实吧，', '说实话，', '坦白讲，',
            '我承认，', '我得说，', '怎么说呢，', '别笑，', '懂我意思吧'
          ];
          var chosen = humanInjects[Math.floor(Math.random() * humanInjects.length)];
          // 只注入事实句，不在问句/标记句中注入
          if (!/^[·•\-—\d]/.test(rawLine) && rawLine.length > 15) {
            var injectAt = Math.min(8, Math.floor(rawLine.length / 3));
            var injected = rawLine.slice(0, injectAt) + chosen + rawLine.slice(injectAt);
            finalLines[injectIdx].raw = injected;
            report.push({ op: '人味注入', detail: '注入「' + chosen + '」——保留 1 处非理性表达' });
          }
        }
      }
    }

    // === finalize ===
    var output = finalLines.map(function (l) { return l.raw; }).join('\n').trim();

    // === 数字守恒校验 ===
    var outNums = meaningfulNums(output);
    if (outNums !== origNums) {
      report.push({ op: '⚠️ 数字失衡', detail: '原文 ' + origNums + ' → 改写 ' + outNums + ' — 自动修复中' });
      // 尝试找回丢失的数字（从原文中补回）
      var origNumList = (text.match(/\d+/g) || []);
      var outNumList = (output.match(/\d+/g) || []);
      origNumList.forEach(function (n) {
        if (outNumList.indexOf(n) < 0) {
          // 把缺失的数字补回【待填】标记
          output += '\n【→补：原文包含数字 ' + n + '，请确认是否保留】';
          report.push({ op: '补数字', detail: '补回原文数字 ' + n });
        }
      });
    }

    // === 红线自检 ===
    var flags = [];
    var outDet = (typeof require === 'function') ? require('./detector.js').detect(output) : null;
    if (outDet && outDet.score > 5.0) {
      flags.push('红线：改写后 AI 味分=' + outDet.score.toFixed(1) + ' > 5.0 — 有待精调');
    }
    if (outDet && outDet.score < 1.0) {
      flags.push('注意：改写后 AI 味分=' + outDet.score.toFixed(1) + ' < 1.0 — 可能删过头');
    }

    var intentLoss = detectIntentLoss(text, output);
    if (!intentLoss.intentPreserved) {
      flags.push('⚠️ 意图丢失：' + JSON.stringify(intentLoss.lostFacts));
    }
    var overDel = detectOverDeletion(text, output, report);

    var beforeScore = 0, afterScore = 0;
    try { beforeScore = require('./detector.js').detect(text).score; } catch (e) { /* skip */ }
    try { afterScore = require('./detector.js').detect(output).score; } catch (e) { /* skip */ }

    return {
      ok: true,
      text: output,
      beforeScore: beforeScore,
      afterScore: afterScore,
      delta: beforeScore && afterScore ? Math.round((beforeScore - afterScore) * 10) / 10 : null,
      report: report,
      intentLoss: intentLoss,
      overDeletion: overDel,
      flags: flags,
      stats: { origNums: origNums, outNums: outNums, conserved: origNums === outNums }
    };
  }

  // ====== v3.3 strippedLen 辅助函数 ======
  function strippedLen(s) {
    return s.replace(/[\s，。；、【】→补：]/g, '').length;
  }

  return {
    rewrite: rewrite,
    detectWorkFourElements: detectWorkFourElements,
    detectIntentLoss: detectIntentLoss,
    detectOverDeletion: detectOverDeletion,
    generatorFingerprint: generatorFingerprint,
    generateMarketingBenefits: generateMarketingBenefits,
    calculateRevenueEstimate: generateRevenueEstimate,
    VERSION: '3.3'
  };
}));
