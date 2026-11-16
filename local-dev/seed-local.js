'use strict';

const crypto = require('crypto');
const http = require('http');
const yaml = require('js-yaml');
const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo:27017/hydro';
const INIT_URL = 'http://127.0.0.1:8889/';

const HOMEPAGE_YAML = [
  '- width: 9',
  '  bulletin: true',
  '  contest: 5',
  '  blog: 5',
  '  discussion: 20',
  '- width: 3',
  '  hitokoto: true',
  '  announcement: true',
  '  ranking: 10',
  '  starred_problems: 50',
  '  suggestion: true',
  '  discussion_nodes: true',
  '',
].join('\n');

const SYSTEM_SETTINGS = {
  'server.name': 'CUGACM',
  'server.language': 'zh',
  'ui-default.nav_logo_dark': '/nav_logo_dark.png?v=20261114',
  'ui-default.domainNavigation': true,
  'ui-default.footer_extra_html': '',
  'ui-default.about': '',
  'hydrooj.homepage': HOMEPAGE_YAML,
  'local_dev_seeded': true,
};

const DEMO_PROBLEMS = [
  { docId: 2,  pid: 'P1001', title: '二分查找入门',         tag: ['二分', '基础'],         difficulty: 1, nSubmit: 412, nAccept: 298 },
  { docId: 3,  pid: 'P1002', title: '高精度加法',           tag: ['高精度', '模拟'],       difficulty: 2, nSubmit: 356, nAccept: 215 },
  { docId: 4,  pid: 'P1003', title: '0-1 背包问题',         tag: ['动态规划', '背包'],     difficulty: 3, nSubmit: 320, nAccept: 194 },
  { docId: 5,  pid: 'P1004', title: '最短路径 Dijkstra',    tag: ['图论', '最短路'],       difficulty: 4, nSubmit: 278, nAccept: 151 },
  { docId: 6,  pid: 'P1005', title: 'KMP 字符串匹配',       tag: ['字符串', 'KMP'],        difficulty: 4, nSubmit: 230, nAccept: 118 },
  { docId: 7,  pid: 'P1006', title: '并查集模板',           tag: ['数据结构', '并查集'],   difficulty: 3, nSubmit: 295, nAccept: 210 },
  { docId: 8,  pid: 'P1007', title: '线段树区间求和',       tag: ['数据结构', '线段树'],   difficulty: 5, nSubmit: 184, nAccept: 82  },
  { docId: 9,  pid: 'P1008', title: '拓扑排序与 DAG',       tag: ['图论', '拓扑排序'],     difficulty: 3, nSubmit: 204, nAccept: 136 },
  { docId: 10, pid: 'P1009', title: '最近公共祖先 LCA',     tag: ['树结构', 'LCA'],        difficulty: 5, nSubmit: 165, nAccept: 74  },
  { docId: 11, pid: 'P1010', title: '最长上升子序列 LIS',   tag: ['动态规划', 'LIS'],      difficulty: 3, nSubmit: 267, nAccept: 175 },
  { docId: 12, pid: 'P1011', title: '单调栈与最大矩形',     tag: ['数据结构', '单调栈'],   difficulty: 4, nSubmit: 142, nAccept: 79  },
  { docId: 13, pid: 'P1012', title: 'Trie 树前缀统计',      tag: ['字符串', 'Trie树'],     difficulty: 4, nSubmit: 129, nAccept: 68  },
  { docId: 14, pid: 'P1013', title: '树状数组求逆序对',     tag: ['数据结构', '树状数组'], difficulty: 4, nSubmit: 158, nAccept: 91  },
  { docId: 15, pid: 'P1014', title: '网络最大流初步',       tag: ['图论', '网络流'],       difficulty: 7, nSubmit: 76,  nAccept: 28  },
];

const DEMO_USERS = [
  { _id: 3, uname: 'alice',   rp: 1860, nAccept: 185, nSubmit: 290 },
  { _id: 4, uname: 'bob',     rp: 1740, nAccept: 162, nSubmit: 270 },
  { _id: 5, uname: 'charlie', rp: 1610, nAccept: 140, nSubmit: 245 },
  { _id: 6, uname: 'david',   rp: 1490, nAccept: 118, nSubmit: 210 },
  { _id: 7, uname: 'eve',     rp: 1350, nAccept: 96,  nSubmit: 180 },
];

// Hydro 内置判题状态（与 @hydrooj/common/status.ts 保持一致）
const STATUS = {
  AC: 1, WA: 2, TLE: 3, MLE: 4, OLE: 5, RE: 6, CE: 7, SE: 8, JUDGING: 20,
};

const DEMO_LANGS = ['cc.cc17o2', 'cc.cc17o2', 'cc.cc17o2', 'c', 'py.py3'];

function httpReady(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => { req.destroy(); resolve(false); });
  });
}

function pwhash(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex').slice(0, 64);
}

// 构造带指定提交时间的 ObjectId（后 8 位用自增序号保证唯一）
function recordId(at, seq) {
  const ts = Math.floor(at.getTime() / 1000).toString(16).padStart(8, '0');
  const tail = (seq >>> 0).toString(16).padStart(8, '0');
  return new ObjectId(`${ts}00000000${tail}`);
}

async function seedDemoData(db, now) {
  const doc = db.collection('document');
  const stmt = db.collection('problem.statement');
  const docStatus = db.collection('document.status');
  const usr = db.collection('user');
  const domUsr = db.collection('domain.user');

  // 1. 演示用户与排行榜 RP
  const demoSalt = crypto.randomBytes(8).toString('hex');
  const demoHash = pwhash('123456', demoSalt);
  for (const u of DEMO_USERS) {
    const exists = await usr.findOne({ _id: u._id });
    if (!exists) {
      const mail = `${u.uname}@local.test`;
      await usr.insertOne({
        _id: u._id,
        mail,
        mailLower: mail,
        uname: u.uname,
        unameLower: u.uname,
        hash: demoHash,
        salt: demoSalt,
        hashType: 'hydro',
        regat: now,
        ip: ['127.0.0.1'],
        loginat: now,
        loginip: '127.0.0.1',
        priv: 16842756,
        avatar: `gravatar:${mail}`,
      });
    }
    await domUsr.updateOne(
      { uid: u._id, domainId: 'system' },
      // rpdelta 是 Hydro rating 脚本的 delta 类型输入，写入后即使 rp 被重算也能保住数值
      { $set: { join: true, rp: u.rp, rpdelta: u.rp, nAccept: u.nAccept, nSubmit: u.nSubmit } },
      { upsert: true },
    );
  }
  await domUsr.updateOne(
    { uid: 2, domainId: 'system' },
    { $set: { join: true, rp: 1980, rpdelta: 1980, nAccept: 210, nSubmit: 320 } },
    { upsert: true },
  );

  // 1.2 普通用户测试账号（无任何管理权限，用于验证普通用户视角的界面）
  const PLAIN_USER = { _id: 8, uname: 'student', mail: 'student@local.test' };
  if (!(await usr.findOne({ _id: PLAIN_USER._id }))) {
    await usr.insertOne({
      _id: PLAIN_USER._id,
      mail: PLAIN_USER.mail,
      mailLower: PLAIN_USER.mail,
      uname: PLAIN_USER.uname,
      unameLower: PLAIN_USER.uname,
      hash: demoHash,
      salt: demoSalt,
      hashType: 'hydro',
      regat: now,
      ip: ['127.0.0.1'],
      loginat: now,
      loginip: '127.0.0.1',
      priv: 16842756,
      avatar: `gravatar:${PLAIN_USER.mail}`,
    });
  }
  await domUsr.updateOne(
    { uid: PLAIN_USER._id, domainId: 'system' },
    { $set: { join: true, rp: 960, rpdelta: 960, nAccept: 12, nSubmit: 26 } },
    { upsert: true },
  );

  // 1.5 演示头衔（Hydro 内置 badge 字段：名称#背景色#文字色）
  const TITLE_COLORS = {
    菜鸟: 'E8EEF4#5B6B7A',
    新手: 'D6E9C6#3C763D',
    大佬: 'FFD700#6B4E00',
    现役队员: 'C9302C#FFFFFF',
  };
  const DEMO_BADGES = {
    2: '大佬',
    3: '大佬',
    4: '现役队员',
    5: '新手',
    6: '现役队员',
    7: '菜鸟',
    8: '菜鸟',
  };
  for (const [uid, name] of Object.entries(DEMO_BADGES)) {
    await usr.updateOne({ _id: Number(uid) }, { $set: { badge: `${name}#${TITLE_COLORS[name]}` } });
  }

  // 2. 演示题目（14 道，连同自带 P1000 共 15 道）
  const probCount = await doc.countDocuments({ domainId: 'system', docType: 10 });
  if (probCount <= 1) {
    for (const p of DEMO_PROBLEMS) {
      const sortKey = `P${String(1000 + p.docId - 1).padStart(6, '0')}`;
      await doc.insertOne({
        _id: new ObjectId(),
        content: '',
        owner: 2,
        domainId: 'system',
        docType: 10,
        docId: p.docId,
        title: p.title,
        tag: p.tag,
        difficulty: p.difficulty,
        hidden: false,
        nSubmit: p.nSubmit,
        nAccept: p.nAccept,
        sort: sortKey,
        data: [],
        additional_file: [],
        pid: p.pid,
        config: 'type: default\ntime: 1s\nmemory: 256m\n',
      });
      await stmt.insertOne({
        _id: new ObjectId(),
        domainId: 'system',
        docType: 10,
        docId: p.docId,
        name: 'zh.md',
        lang: 'zh',
        content: [
          `## 题目描述`,
          ``,
          `这是本地前端开发环境的演示题目 **${p.pid} · ${p.title}**，用于测试首页、题库列表、标签与题面排版效果。`,
          ``,
          `## 输入格式`,
          ``,
          `输入包含一行若干个整数。`,
          ``,
          `## 输出格式`,
          ``,
          `输出一个整数作为结果。`,
          ``,
          `## 样例 #1`,
          ``,
          '```input1\n3 5\n```',
          '',
          '```output1\n8\n```',
        ].join('\n'),
      });
    }

    // 给 admin 标记几道收藏/通过状态，方便预览首页“收藏题目”和题库状态图标
    for (const pid of [1, 2, 4]) {
      await docStatus.updateOne(
        { domainId: 'system', docType: 10, docId: pid, uid: 2 },
        { $set: { star: true, status: pid === 4 ? 0 : 1 } },
        { upsert: true },
      );
    }
  }

  // 2.5 演示评测记录（覆盖 AC / WA / TLE / RE / CE，时间分布在最近 10 天）
  const recordColl = db.collection('record');
  const recordCount = await recordColl.countDocuments({ domainId: 'system' });
  if (recordCount < 5) {
    const HOUR = 3600 * 1000;
    const pids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
    const uids = [2, 3, 4, 5, 6, 7];
    const outcomes = [
      STATUS.AC, STATUS.AC, STATUS.AC, STATUS.WA, STATUS.WA, STATUS.TLE, STATUS.RE, STATUS.CE,
    ];
    const CODE_SAMPLE = {
      'cc.cc17o2': '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    int a, b;\n    cin >> a >> b;\n    cout << a + b << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n\nint main() {\n    int a, b;\n    scanf("%d%d", &a, &b);\n    printf("%d\\n", a + b);\n    return 0;\n}\n',
      'py.py3': 'a, b = map(int, input().split())\nprint(a + b)\n',
    };

    const records = [];
    const best = new Map();
    let seq = 0;
    for (let i = 0; i < 48; i++) {
      const status = outcomes[i % outcomes.length];
      const uid = uids[(i * 3 + 1) % uids.length];
      const pid = pids[(i * 5 + 2) % pids.length];
      const at = new Date(now.getTime() - (i * 5 + 1) * HOUR - (i % 7) * 3 * 60 * 1000);
      const lang = DEMO_LANGS[i % DEMO_LANGS.length];
      const accepted = status === STATUS.AC;
      records.push({
        _id: recordId(at, seq++),
        domainId: 'system',
        pid,
        uid,
        lang,
        code: CODE_SAMPLE[lang] || CODE_SAMPLE['cc.cc17o2'],
        rejudged: false,
        contest: null,
        score: accepted ? 100 : (status === STATUS.WA ? 40 : 0),
        memory: 1024 + ((i * 613) % 24000),
        time: accepted ? 30 + ((i * 37) % 260) : (status === STATUS.TLE ? 1000 : 20 + ((i * 29) % 400)),
        judgeTexts: [],
        compilerTexts: [],
        testCases: [],
        judger: uid,
        judgeAt: at,
        status,
      });
      const rid = records[records.length - 1]._id;
      const key = `${uid}:${pid}`;
      const prev = best.get(key);
      if (!prev || accepted) {
        best.set(key, {
          status: accepted ? STATUS.AC : status,
          rid: accepted ? rid : (prev ? prev.rid : rid),
          score: accepted ? 100 : (prev ? prev.score : 0),
        });
      }
    }
    await recordColl.insertMany(records);

    // 同步 document.status：带上 rid / score，这样 Hydro 的 rp 脚本能正确算出积分
    for (const [key, v] of best) {
      const [uid, pid] = key.split(':').map(Number);
      await docStatus.updateOne(
        { domainId: 'system', docType: 10, docId: pid, uid },
        { $set: { status: v.status, rid: v.rid, score: v.score }, $setOnInsert: { star: false } },
        { upsert: true },
      );
    }

    // 让题目页的提交/通过计数与记录数量级保持协调
    for (const pid of pids) {
      const nSubmit = records.filter((r) => r.pid === pid).length;
      const nAccept = records.filter((r) => r.pid === pid && r.status === STATUS.AC).length;
      await doc.updateOne(
        { domainId: 'system', docType: 10, docId: pid },
        { $inc: { nSubmit, nAccept } },
      );
    }
  }

  // 3. 演示比赛（3 场：进行中 / 未开始 / 已结束）
  const hour = 3600 * 1000;
  const contestCount = await doc.countDocuments({ domainId: 'system', docType: 30, rule: { $ne: 'homework' } });
  if (contestCount === 0) {
    const contests = [
      {
        title: 'CUGACM 周赛 #12（演示进行中）',
        content: '本地前端调试专用模拟比赛，赛制为 ACM。',
        rule: 'acm',
        beginAt: new Date(now.getTime() - 1 * hour),
        endAt: new Date(now.getTime() + 4 * hour),
        pids: [1, 2, 3, 4],
        attend: 36,
      },
      {
        title: '2026 CUG 新生杯热身赛（演示未开始）',
        content: '新生杯热身赛模拟数据，用于预览比赛倒计时与卡片样式。',
        rule: 'acm',
        beginAt: new Date(now.getTime() + 48 * hour),
        endAt: new Date(now.getTime() + 53 * hour),
        pids: [2, 3, 5, 6],
        attend: 84,
      },
      {
        title: '算法基础阶段测试（演示已结束）',
        content: 'OI 赛制演示比赛。',
        rule: 'oi',
        beginAt: new Date(now.getTime() - 168 * hour),
        endAt: new Date(now.getTime() - 165 * hour),
        pids: [1, 4, 7, 8],
        attend: 52,
      },
    ];
    for (const c of contests) {
      const id = new ObjectId();
      await doc.insertOne({
        _id: id,
        docId: id,
        domainId: 'system',
        docType: 30,
        owner: 2,
        title: c.title,
        content: c.content,
        rule: c.rule,
        beginAt: c.beginAt,
        endAt: c.endAt,
        pids: c.pids,
        attend: c.attend,
        rated: false,
        assign: [],
      });
    }
  }

  // 3.5 演示作业（3 个：进行中 / 补交扣分期 / 已截止）
  const homeworkCount = await doc.countDocuments({ domainId: 'system', docType: 30, rule: 'homework' });
  if (homeworkCount === 0) {
    const homeworks = [
      {
        title: '第 1 周基础作业：顺序与二分（演示进行中）',
        content: '请在本周截止前完成指定基础题目。',
        beginAt: new Date(now.getTime() - 48 * hour),
        penaltySince: new Date(now.getTime() + 72 * hour),
        endAt: new Date(now.getTime() + 120 * hour),
        pids: [1, 2, 3],
        attend: 42,
      },
      {
        title: '第 2 周进阶作业：DP 与高精度（演示补交期）',
        content: '已进入逾期补交阶段，按逾期时长折算分数。',
        beginAt: new Date(now.getTime() - 120 * hour),
        penaltySince: new Date(now.getTime() - 12 * hour),
        endAt: new Date(now.getTime() + 48 * hour),
        pids: [3, 4, 11],
        attend: 38,
      },
      {
        title: '第 0 周摸底测试作业（演示已截止）',
        content: '摸底作业演示数据，已截止。',
        beginAt: new Date(now.getTime() - 336 * hour),
        penaltySince: new Date(now.getTime() - 240 * hour),
        endAt: new Date(now.getTime() - 192 * hour),
        pids: [1, 2],
        attend: 56,
      },
    ];
    for (const h of homeworks) {
      const id = new ObjectId();
      await doc.insertOne({
        _id: id,
        docId: id,
        domainId: 'system',
        docType: 30,
        owner: 2,
        title: h.title,
        content: h.content,
        rule: 'homework',
        beginAt: h.beginAt,
        penaltySince: h.penaltySince,
        endAt: h.endAt,
        penaltyRules: { 24: 0.8, 72: 0.5 },
        pids: h.pids,
        attend: h.attend,
        rated: false,
        assign: [],
      });
    }
  }

  // 4. 演示训练（2 个）
  const trainingCount = await doc.countDocuments({ domainId: 'system', docType: 40 });
  if (trainingCount === 0) {
    const trainings = [
      {
        title: 'CUGACM 新手入门训练营（示例）',
        description: '覆盖基础语法、二分、高精度与入门 DP，适合大一新生上手。',
        content: '按章节顺序完成即可。',
        attend: 48,
        pin: 1,
        dag: [
          { _id: 1, title: '第一阶段：语法与基础算法', requireNids: [], pids: [1, 2, 3] },
          { _id: 2, title: '第二阶段：基础动态规划', requireNids: [1], pids: [4, 11] },
        ],
      },
      {
        title: '数据结构与图论专题训练（示例）',
        description: '并查集、线段树、Dijkstra 与拓扑排序经典模板汇总。',
        content: '建议配合题解复习复杂度证明。',
        attend: 29,
        pin: 0,
        dag: [
          { _id: 1, title: '第一阶段：树与数据结构', requireNids: [], pids: [7, 8, 10, 14] },
          { _id: 2, title: '第二阶段：经典图论', requireNids: [1], pids: [5, 9, 15] },
        ],
      },
    ];
    for (const t of trainings) {
      const id = new ObjectId();
      await doc.insertOne({
        _id: id,
        docId: id,
        domainId: 'system',
        docType: 40,
        owner: 2,
        title: t.title,
        description: t.description,
        content: t.content,
        attend: t.attend,
        pin: t.pin,
        dag: t.dag,
      });
    }
  }

  // 5. 演示讨论（4 篇）
  const discussCount = await doc.countDocuments({ domainId: 'system', docType: 21 });
  if (discussCount === 0) {
    const discussions = [
      { parentId: 'ACM',  owner: 2, title: '2026 秋季集训与招新注意事项（演示置顶帖）', content: '欢迎加入中国地质大学（武汉）ACM-ICPC 协会！本帖为本地预览演示数据。', pin: true,  highlight: true,  nReply: 5, views: 128 },
      { parentId: '问答', owner: 3, title: 'P1004 最短路径 Dijkstra 为什么不能处理负权边？', content: '如题，如果图里有负权边应该改用 Bellman-Ford 还是 SPFA？',              pin: false, highlight: false, nReply: 3, views: 64  },
      { parentId: '题解', owner: 4, title: '上周周赛 0-1 背包状态压缩思路总结',            content: '倒序枚举容量即可把空间优化到一维数组，注意边界条件。',                   pin: false, highlight: true,  nReply: 2, views: 49  },
      { parentId: '分享', owner: 5, title: 'C++ 常用 STL 容器复杂度与快读模板整理',         content: '整理了 vector、set、unordered_map 常见避坑点，供本地排版测试。',          pin: false, highlight: false, nReply: 4, views: 92  },
    ];
    for (let i = 0; i < discussions.length; i++) {
      const d = discussions[i];
      const id = new ObjectId();
      const t = new Date(now.getTime() - i * 3600 * 1000);
      await doc.insertOne({
        _id: id,
        docId: id,
        domainId: 'system',
        docType: 21,
        parentType: 20,
        parentId: d.parentId,
        owner: d.owner,
        editor: d.owner,
        title: d.title,
        content: d.content,
        ip: '127.0.0.1',
        nReply: d.nReply,
        highlight: d.highlight,
        pin: d.pin,
        updateAt: t,
        views: d.views,
        sort: 100,
        hidden: false,
      });
    }
  }

  // 6. 演示博客（5 篇，不同作者与时间倒序）
  const blogCount = await doc.countDocuments({ domainId: 'system', docType: 70 });
  if (blogCount === 0) {
    const blogs = [
      {
        owner: 3,
        hoursAgo: 2,
        title: 'ICPC 区域赛武汉站参赛游记：从打铁边缘到银牌逆袭',
        content: '# 赛前准备\n\n这是本地前端开发环境的演示博客，用于预览全站博客广场和首页最新博客板块。\n\n## 比赛复盘\n\n- 开场 15 分钟顺过签到题\n- 中期卡在计算几何，及时换题稳住心态',
        views: 214,
        nReply: 7,
      },
      {
        owner: 4,
        hoursAgo: 26,
        title: '线段树与懒标记常见误区全梳理',
        content: '总结了区间加乘混合维护时 `pushdown` 的常见错误顺序与取模细节。',
        views: 156,
        nReply: 4,
      },
      {
        owner: 2,
        hoursAgo: 70,
        title: 'CUGACM 2026 秋季新生训练路线推荐',
        content: '给大一新生的算法入门顺序建议：语法与模拟 → 二分与双指针 → 基础 DP → 图论搜索。',
        views: 308,
        nReply: 11,
      },
      {
        owner: 5,
        hoursAgo: 130,
        title: 'Codeforces Div.2 A~D 快速切题技巧分享',
        content: '读题时先抓数据范围反推复杂度，往往能一眼确定二分或贪心方向。',
        views: 112,
        nReply: 2,
      },
      {
        owner: 6,
        hoursAgo: 220,
        title: '从零配置 VS Code C++ 算法竞赛调试环境',
        content: '整理了单文件编译快捷键、bits/stdc++.h 预编译头配置与本地对拍脚本。',
        views: 189,
        nReply: 5,
      },
    ];
    for (const b of blogs) {
      const t = new Date(now.getTime() - b.hoursAgo * hour);
      const id = ObjectId.createFromTime(Math.floor(t.getTime() / 1000));
      await doc.insertOne({
        _id: id,
        docId: id,
        domainId: 'system',
        docType: 70,
        owner: b.owner,
        title: b.title,
        content: b.content,
        ip: '127.0.0.1',
        updateAt: t,
        views: b.views,
        nReply: b.nReply,
      });
    }
  }
}

async function main() {
  const mode = process.argv[2];
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  try {
    const db = client.db();
    const sys = db.collection('system');
    const dom = db.collection('domain');
    const usr = db.collection('user');
    const domUsr = db.collection('domain.user');

    if (mode === 'check') {
      const marker = await sys.findOne({ _id: 'local_dev_seeded' });
      process.exitCode = marker ? 0 : 1;
      return;
    }

    if (mode === 'wait_ready') {
      const deadline = Date.now() + 90000;
      while (Date.now() < deadline) {
        const ver = await sys.findOne({ _id: 'db.ver' });
        const ddoc = await dom.findOne({ _id: 'system' });
        const up = await httpReady(INIT_URL);
        if (ver && ddoc && up) return;
        await new Promise((r) => setTimeout(r, 500));
      }
      throw new Error('Timed out waiting for Hydro initial setup');
    }

    if (mode === 'apply') {
      for (const [_id, value] of Object.entries(SYSTEM_SETTINGS)) {
        await sys.updateOne({ _id }, { $set: { value } }, { upsert: true });
      }
      const cfgDoc = await sys.findOne({ _id: 'config' });
      const cfg = (cfgDoc && cfgDoc.value ? yaml.load(cfgDoc.value) : {}) || {};
      cfg.server = Object.assign({}, cfg.server, { name: 'CUGACM', language: 'zh' });
      cfg['ui-default'] = Object.assign({}, cfg['ui-default'], {
        nav_logo_dark: '/nav_logo_dark.png?v=20261114',
        domainNavigation: true,
      });
      await sys.updateOne({ _id: 'config' }, { $set: { value: yaml.dump(cfg) } }, { upsert: true });

      await dom.updateOne(
        { _id: 'system' },
        { $set: { name: 'ACM-ICPC协会', avatar: 'url:/stamp.png' } },
      );

      const now = new Date();
      const existingAdmin = await usr.findOne({ _id: { $gte: 2 } });
      if (!existingAdmin) {
        const salt = crypto.randomBytes(8).toString('hex');
        await usr.insertOne({
          _id: 2,
          mail: 'admin@local.test',
          mailLower: 'admin@local.test',
          uname: 'admin',
          unameLower: 'admin',
          hash: pwhash('123456', salt),
          salt,
          hashType: 'hydro',
          regat: now,
          ip: ['127.0.0.1'],
          loginat: now,
          loginip: '127.0.0.1',
          priv: -1,
          avatar: 'gravatar:admin@local.test',
        });
        await domUsr.updateOne(
          { uid: 2, domainId: 'system' },
          { $set: { join: true } },
          { upsert: true },
        );
      }

      await seedDemoData(db, now);
      return;
    }

    throw new Error(`Unknown mode: ${mode}`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
