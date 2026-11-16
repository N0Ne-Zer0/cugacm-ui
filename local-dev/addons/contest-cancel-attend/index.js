'use strict';

const {
  Handler,
  ObjectId,
  PERM,
  PRIV,
  ContestModel,
  ContestNotAttendedError,
  ContestNotLiveError,
  NotFoundError,
  ValidationError,
} = require('hydrooj');

/**
 * 取消比赛报名
 *
 * Hydro 自带 model 层 contest.cancelAttend()，但没有任何路由暴露它，
 * 所以默认只有「报名」没有「取消报名」。本插件补一个 POST 路由。
 *
 * 限制：
 *  - 仅比赛开始（beginAt）之前允许取消；开始后、结束后一律拒绝；
 *  - 作业（rule: homework）不允许取消；
 *  - 团队报名（tsdoc.members 多于 1 人）不允许自行取消，避免影响队友。
 */
class ContestCancelAttendHandler extends Handler {
  async post() {
    const domainId = this.args.domainId;
    const tid = new ObjectId(String(this.args.tid));

    this.checkPriv(PRIV.PRIV_USER_PROFILE);
    this.checkPerm(PERM.PERM_ATTEND_CONTEST);

    const tdoc = await ContestModel.get(domainId, tid);
    if (!tdoc) throw new NotFoundError(String(this.args.tid));
    if (tdoc.rule === 'homework') throw new ValidationError('rule');

    // 比赛已开始或已结束，禁止取消
    if (!ContestModel.isNotStarted(tdoc)) throw new ContestNotLiveError(domainId, tid);

    const uid = this.user._id;
    const tsdoc = await ContestModel.getStatus(domainId, tid, uid);
    if (!tsdoc?.attend) throw new ContestNotAttendedError(domainId, tid);

    // 团队报名需队长或管理员处理，避免单方面退出影响队友
    if (Array.isArray(tsdoc.members) && tsdoc.members.length > 1) throw new ValidationError('team');

    await ContestModel.cancelAttend(domainId, tid, uid);
    this.back();
  }
}

module.exports = {
  name: 'contest-cancel-attend',
  apply(ctx) {
    ctx.Route(
      'contest_cancel_attend',
      '/contest/:tid/cancel-attend',
      ContestCancelAttendHandler,
      PERM.PERM_VIEW_CONTEST,
    );

    ctx.i18n.load('zh', {
      'Cancel Registration': '取消报名',
      'Confirm cancel your registration for this contest?': '确定取消报名该比赛吗？',
      'Registration can only be cancelled before the contest starts.': '比赛开始后无法取消报名。',
    });
    ctx.i18n.load('zh_TW', {
      'Cancel Registration': '取消報名',
      'Confirm cancel your registration for this contest?': '確定取消報名該比賽嗎？',
      'Registration can only be cancelled before the contest starts.': '比賽開始後無法取消報名。',
    });
    ctx.i18n.load('en', {
      'Cancel Registration': 'Cancel Registration',
      'Confirm cancel your registration for this contest?': 'Confirm cancel your registration for this contest?',
      'Registration can only be cancelled before the contest starts.': 'Registration can only be cancelled before the contest starts.',
    });
  },
};
