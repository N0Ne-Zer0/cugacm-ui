'use strict';

const {
  Handler,
  PRIV,
  UserModel,
  ValidationError,
} = require('hydrooj');

// 头衔定义：name + 背景色 + 文字色（对应 Hydro 内置 badge 字段格式 name#bg#fg）
// 如需增删，可向 system 集合写入 _id 为 'user-title.titles'、value 为同结构数组的文档覆盖。
const DEFAULT_TITLES = [
  {
    key: 'novice',
    name: '菜鸟',
    bg: 'E8EEF4',
    fg: '5B6B7A',
    desc: '刚刚加入协会、还没有通过题目的新同学。',
    how: '注册账号并在题库提交第一份代码即可获得。',
  },
  {
    key: 'newbie',
    name: '新手',
    bg: 'D6E9C6',
    fg: '3C763D',
    desc: '已经完成一定数量基础题目的入门选手。',
    how: '累计通过 20 道题目，或完整参加一次新生赛。',
  },
  {
    key: 'master',
    name: '大佬',
    bg: 'FFD700',
    fg: '6B4E00',
    desc: '在训练与比赛中表现突出的高水平选手。',
    how: 'Rating 达到 1800 以上，或在校级以上比赛中获奖。',
  },
  {
    key: 'active',
    name: '现役队员',
    bg: 'C9302C',
    fg: 'FFFFFF',
    desc: '协会现役 ACM-ICPC 代表队队员。',
    how: '通过协会年度选拔进入现役队伍，由队长或指导老师授予。',
  },
];

const MAX_HOLDERS = 24;

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function getTitleDefs(ctx) {
  const doc = await ctx.db.collection('system').findOne({ _id: 'user-title.titles' });
  if (doc && Array.isArray(doc.value) && doc.value.length) return doc.value;
  return DEFAULT_TITLES;
}

function badgeFor(def) {
  return `${def.name}#${def.bg}${def.fg ? `#${def.fg}` : ''}`;
}

class TitleMainHandler extends Handler {
  async get({ domainId }) {
    const defs = await getTitleDefs(this.ctx);
    const udocs = await this.ctx.db.collection('user').find(
      { _id: { $gte: 2 }, badge: { $nin: ['', null] } },
      { projection: { _id: 1, uname: 1, avatar: 1, badge: 1 } },
    ).sort({ _id: 1 }).toArray();

    const byName = new Map();
    for (const u of udocs) {
      const name = String(u.badge || '').split('#')[0];
      if (!name) continue;
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(u._id);
    }

    const holders = {};
    const uids = [];
    for (const def of defs) {
      const list = (byName.get(def.name) || []).slice(0, MAX_HOLDERS);
      holders[def.key] = list;
      uids.push(...list);
    }
    const udict = uids.length ? await UserModel.getList(domainId, Array.from(new Set(uids))) : {};

    this.response.template = 'title_main.html';
    this.response.body = {
      defs, holders, udict,
    };
  }
}

class ManageTitleHandler extends Handler {
  async get({ domainId }) {
    this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
    const page = Math.max(1, Number.parseInt(this.args.page, 10) || 1);
    const q = String(this.args.q || '').trim();
    const filter = { _id: { $gte: 2 } };
    if (q) filter.uname = new RegExp(escapeRegExp(q), 'i');
    const cursor = this.ctx.db.collection('user')
      .find(filter, { projection: { _id: 1, uname: 1, badge: 1 } })
      .sort({ _id: 1 });
    const [udocs, ucount] = await this.ctx.db.paginate(cursor, page, 20);
    const defs = await getTitleDefs(this.ctx);

    this.response.template = 'manage_title.html';
    this.response.body = {
      udocs, ucount, page, defs, q,
    };
  }

  async post() {
    this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
    const uid = Number.parseInt(this.args.uid, 10);
    const key = String(this.args.titleKey || '');
    if (!uid) throw new ValidationError('uid');

    const defs = await getTitleDefs(this.ctx);
    const def = key ? defs.find((d) => d.key === key) : null;
    if (key && !def) throw new ValidationError('titleKey');

    await UserModel.setById(uid, { badge: def ? badgeFor(def) : '' });
    this.back();
  }
}

module.exports = {
  name: 'user-title',
  apply(ctx) {
    ctx.Route('title_main', '/title', TitleMainHandler);
    ctx.Route('manage_title', '/manage/title', ManageTitleHandler, PRIV.PRIV_EDIT_SYSTEM);
    ctx.injectUI('Nav', 'title_main', { prefix: 'title' });

    ctx.i18n.load('zh', {
      title_main: '头衔',
      'User Titles': '协会头衔',
      'About Titles': '关于头衔',
      titles_intro: '头衔是协会对成员水平与身份的认可，获得后会显示在你的用户名旁边。',
      '{0} holders': '{0} 人获得',
      'How to get': '获取途径',
      Holders: '获得者',
      'Titles are granted manually by association administrators for now; automatic rules are still being designed.': '目前头衔由协会管理员手动授予，自动化评定规则仍在设计中。',
      'Titles appear next to your username on your profile, in discussions, blogs, and the ranking.': '头衔会显示在个人主页、讨论区、博客与排行榜的用户名旁边。',
      'Each account holds one title at a time; a new grant replaces the old one.': '每个账号同时只保有一个头衔，再次授予会替换原有头衔。',
      'Contact association administrators if you think you qualify for a title.': '如果你认为自己符合某个头衔的条件，可以联系协会管理员申请。',
      'Manage Titles': '管理头衔',
      'Assign Titles': '授予头衔',
      'Search username': '搜索用户名',
      Search: '搜索',
      Username: '用户名',
      'Current Title': '当前头衔',
      'Set Title': '设置头衔',
      None: '无',
      Save: '保存',
      'Search Users': '搜索用户',
    });
    ctx.i18n.load('zh_TW', {
      title_main: '頭銜',
      'User Titles': '協會頭銜',
      'About Titles': '關於頭銜',
      titles_intro: '頭銜是協會對成員水平與身份的認可，獲得後會顯示在你的使用者名稱旁邊。',
      '{0} holders': '{0} 人獲得',
      'How to get': '獲取途徑',
      Holders: '獲得者',
      'Titles are granted manually by association administrators for now; automatic rules are still being designed.': '目前頭銜由協會管理員手動授予，自動化評定規則仍在設計中。',
      'Titles appear next to your username on your profile, in discussions, blogs, and the ranking.': '頭銜會顯示在個人主頁、討論區、部落格與排行榜的使用者名稱旁邊。',
      'Each account holds one title at a time; a new grant replaces the old one.': '每個帳號同時只保有一個頭銜，再次授予會替換原有頭銜。',
      'Contact association administrators if you think you qualify for a title.': '如果你認為自己符合某個頭銜的條件，可以聯繫協會管理員申請。',
      'Manage Titles': '管理頭銜',
      'Assign Titles': '授予頭銜',
      'Search username': '搜尋使用者名稱',
      Search: '搜尋',
      Username: '使用者名稱',
      'Current Title': '目前頭銜',
      'Set Title': '設定頭銜',
      None: '無',
      Save: '儲存',
      'Search Users': '搜尋使用者',
    });
    ctx.i18n.load('en', {
      title_main: 'Titles',
      'User Titles': 'User Titles',
      'About Titles': 'About Titles',
      titles_intro: 'Titles recognize member level and role. Once granted, a title is shown next to your username.',
      '{0} holders': '{0} holders',
      'How to get': 'How to get',
      Holders: 'Holders',
      'Titles are granted manually by association administrators for now; automatic rules are still being designed.': 'Titles are currently granted manually by association administrators; automatic rules are still being designed.',
      'Titles appear next to your username on your profile, in discussions, blogs, and the ranking.': 'Titles appear next to your username on your profile, in discussions, blogs, and the ranking.',
      'Each account holds one title at a time; a new grant replaces the old one.': 'Each account holds one title at a time; a new grant replaces the old one.',
      'Contact association administrators if you think you qualify for a title.': 'Contact association administrators if you think you qualify for a title.',
      'Manage Titles': 'Manage Titles',
      'Assign Titles': 'Assign Titles',
      'Search username': 'Search username',
      Search: 'Search',
      Username: 'Username',
      'Current Title': 'Current Title',
      'Set Title': 'Set Title',
      None: 'None',
      Save: 'Save',
      'Search Users': 'Search Users',
    });
  },
};
