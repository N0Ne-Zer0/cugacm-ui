'use strict';

/**
 * 依据 /opt/local-addons 下实际存在的插件目录，动态生成 /root/.hydro/addon.json。
 *
 * 这样做的目的：插件清单不再随 git 分支漂移。
 *  - 切到没有插件的分支 → 目录里没有插件 → 生成的清单就没有插件条目；
 *  - 切到带插件的分支 → 自动带上，不用手改 addon.json，也不用重建镜像。
 *
 * 顺序：官方基础插件 → 本地插件（按名字排序）→ ui-custom（必须最后覆盖模板）→ 官方 install 的插件。
 */

const fs = require('fs');

const ADDON_DIR = '/opt/local-addons';
const BASE = [
  '@hydrooj/ui-default',
  '@hydrooj/fps-importer',
  '@hydrooj/a11y',
  '@hydrooj/onsite-toolkit',
  '@hydrooj/blog',
];
const UI_OVERRIDE = '/root/.hydro/addons/ui-custom';
const INSTALLED = [
  '/root/.hydro/addons/scoreboard-xcpcio',
  '/root/.hydro/addons/hydrooj-resolver',
  '/root/.hydro/addons/hydro-aoplog',
  '/root/.hydro/addons/import-qduoj',
  '/root/.hydro/addons/import-hoj',
  '/root/.hydro/addons/vjudge',
];

function listLocalPlugins() {
  try {
    return fs.readdirSync(ADDON_DIR)
      .filter((name) => fs.existsSync(`${ADDON_DIR}/${name}/package.json`))
      .sort()
      .map((name) => `${ADDON_DIR}/${name}`);
  } catch (e) {
    return [];
  }
}

const plugins = listLocalPlugins();
const list = [...BASE, ...plugins, UI_OVERRIDE, ...INSTALLED.filter((p) => fs.existsSync(p))];
fs.writeFileSync('/root/.hydro/addon.json', `${JSON.stringify(list, null, 2)}\n`);
console.log(`[local-init] addon.json 已生成：${plugins.length} 个本地插件 ${plugins.map((p) => p.split('/').pop()).join(', ')}`);
