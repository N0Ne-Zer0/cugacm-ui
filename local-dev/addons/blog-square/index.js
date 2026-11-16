'use strict';

const {
  DocumentModel,
  Handler,
  UserModel,
} = require('hydrooj');

const TYPE_BLOG = 70;

class BlogSquareHandler extends Handler {
  async get({ domainId }) {
    const page = Math.max(1, Number.parseInt(this.request.query.page, 10) || 1);
    const cursor = DocumentModel.getMulti('system', TYPE_BLOG, {}).sort({ _id: -1 });
    const [ddocs, dpcount] = await this.ctx.db.paginate(cursor, page, 15);
    const uids = Array.from(new Set(ddocs.map((d) => d.owner)));
    const udict = await UserModel.getList(domainId, uids);
    this.response.template = 'blog_square.html';
    this.response.body = {
      ddocs,
      dpcount,
      udict,
      page,
    };
  }
}

module.exports = {
  name: 'blog-square',
  apply(ctx) {
    ctx.Route('blog_square', '/blog', BlogSquareHandler);
    ctx.injectUI('Nav', 'blog_square', { prefix: 'blog' });

    // 博客「最后修改时间」：Hydro 自带的 BlogModel.edit 只写 title/content，
    // 不会动 updateAt，导致详情页分不清「发表于」和「更新于」。
    // 这里监听 document/set，只要标题或正文被改就补一次 updateAt；
    // 浏览数、收藏等其它字段不触发，避免阅读一次就把时间顶到最新。
    ctx.on('document/set', async (domainId, docType, docId, $set) => {
      if (docType !== TYPE_BLOG || !$set) return;
      if (!('title' in $set) && !('content' in $set)) return;
      try {
        await ctx.db.collection('document').updateOne(
          { _id: docId, docType: TYPE_BLOG },
          { $set: { updateAt: new Date() } },
        );
      } catch (e) {
        ctx.logger.warn('[blog-square] 更新博客 updateAt 失败: %s', e.message);
      }
    });

    ctx.withHandlerClass('HomeHandler', (HomeHandler) => {
      HomeHandler.prototype.getBlog = async function getBlog(domainId, limit = 5) {
        const count = Math.max(1, Math.min(20, Number(limit) || 5));
        const ddocs = await DocumentModel.getMulti('system', TYPE_BLOG, {})
          .sort({ _id: -1 })
          .limit(count)
          .toArray();
        this.collectUser(ddocs.map((d) => d.owner));
        return [ddocs];
      };
    });

    ctx.i18n.load('zh', {
      blog_square: '博客',
      'Blog Square': '博客广场',
      'Latest Blogs': '最新博客',
      'Write a Blog': '写博客',
      'My Blog': '我的博客',
      'No blog posts yet.': '暂无博客文章。',
      'Blog square intro': '分享题解、比赛游记、算法笔记与训练总结。',
    });
    ctx.i18n.load('zh_TW', {
      blog_square: '部落格',
      'Blog Square': '部落格廣場',
      'Latest Blogs': '最新部落格',
      'Write a Blog': '寫部落格',
      'My Blog': '我的部落格',
      'No blog posts yet.': '暫無部落格文章。',
      'Blog square intro': '分享題解、比賽遊記、演算法筆記與訓練總結。',
    });
    ctx.i18n.load('en', {
      blog_square: 'Blog',
      'Blog Square': 'Blog Square',
      'Latest Blogs': 'Latest Blogs',
      'Write a Blog': 'Write a Blog',
      'My Blog': 'My Blog',
      'No blog posts yet.': 'No blog posts yet.',
      'Blog square intro': 'Share editorials, contest diaries, algorithm notes, and training reflections.',
    });
  },
};
