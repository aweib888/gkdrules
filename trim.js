const fs = require('fs');
const JSON5 = require('json5');

const upstreamPath = process.argv[2] || 'upstream.json5';
const outputPath = process.argv[3] || 'gkd.json5';
const delListPath = process.argv[4] || 'delapplist.txt';
const myRulesPath = process.argv[5] || 'gkdzy.json5';

// 读取删除列表
const delSet = new Set(
  fs.readFileSync(delListPath, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
);

// 解析上游和自编规则
const data = JSON5.parse(fs.readFileSync(upstreamPath, 'utf8'));
const myData = JSON5.parse(fs.readFileSync(myRulesPath, 'utf8'));

// ===== 1. 删除上游 apps 中命中的包 =====
if (Array.isArray(data.apps)) {
  const before = data.apps.length;
  data.apps = data.apps.filter(app => !delSet.has(app.id));
  console.log(`upstream apps: ${before} -> ${data.apps.length}`);
}

// ===== 2. 全局黑名单：delapplist.txt 里的包名对所有 globalGroups 不生效 =====
if (Array.isArray(data.globalGroups)) {
  data.globalGroups.forEach(group => {
    if (!Array.isArray(group.apps)) group.apps = [];
    const existing = new Map(group.apps.map(a => [a.id, a]));
    delSet.forEach(id => {
      if (existing.has(id)) {
        existing.get(id).enable = false;
      } else {
        group.apps.push({id, enable: false});
      }
    });
  });
}

// ===== 3. 自编 globalGroups 黑名单：按 name 匹配上游，填 apps =====
if (Array.isArray(myData.globalGroups)) {
  myData.globalGroups.forEach(myGroup => {
    if (!myGroup.name || !Array.isArray(myGroup.apps)) {
      throw new Error(`gkdzy.json5 的 globalGroups 条目缺少 name 或 apps: ${JSON.stringify(myGroup)}`);
    }
    const target = (data.globalGroups || []).find(g => g.name === myGroup.name);
    if (!target) {
      throw new Error(`gkdzy.json5 中指定的全局规则 name 在上游找不到: "${myGroup.name}"`);
    }
    if (!Array.isArray(target.apps)) target.apps = [];
    const existing = new Map(target.apps.map(a => [a.id, a]));
    myGroup.apps.forEach(id => {
      if (typeof id !== 'string') {
        throw new Error(`gkdzy.json5 全局黑名单 apps 必须是包名字符串数组: ${myGroup.name}`);
      }
      if (existing.has(id)) {
        existing.get(id).enable = false;
      } else {
        target.apps.push({id, enable: false});
      }
    });
    console.log(`global blacklist applied: "${myGroup.name}" <- ${myGroup.apps.length} app(s)`);
  });
}

// ===== 4. 合并 apps：你的 groups 在前，上游 groups 在后；key 冲突改上游 =====
if (Array.isArray(myData.apps)) {
  // 先建一个上游 apps 的索引
  const upMap = new Map(data.apps.map(a => [a.id, a]));

  myData.apps.forEach(myApp => {
    const upApp = upMap.get(myApp.id);

    // 上游没有这个 App，直接追加
    if (!upApp) {
      data.apps.push(myApp);
      console.log(`app added (new): ${myApp.id}`);
      return;
    }

    // 两边都有：合并 groups
    const myGroups = Array.isArray(myApp.groups) ? myApp.groups : [];
    const upGroups = Array.isArray(upApp.groups) ? upApp.groups : [];

    // 收集你的所有 group key
    const myKeys = new Set(myGroups.map(g => g.key));

    // 该 App 当前所有 key（你的 + 上游的），用于分配新 key
    const allKeys = new Set();
    myGroups.forEach(g => allKeys.add(g.key));
    upGroups.forEach(g => allKeys.add(g.key));
    let nextKey = Math.max(...Array.from(allKeys).filter(k => typeof k === 'number'), 0) + 1;

    // 处理上游 groups：key 冲突的改 key，并同步改内部 preKeys
    const renamedUpGroups = upGroups.map(upGroup => {
      if (!myKeys.has(upGroup.key)) return upGroup;

      const oldKey = upGroup.key;
      const newKey = nextKey++;
      console.log(`  key conflict on ${myApp.id}: upstream group key ${oldKey} -> ${newKey}`);

      // 改 group 的 key
      upGroup.key = newKey;

      // 同步改内部 rules[].preKeys 里对 oldKey 的引用
      if (Array.isArray(upGroup.rules)) {
        upGroup.rules.forEach(rule => {
          if (Array.isArray(rule.preKeys)) {
            rule.preKeys = rule.preKeys.map(k => (k === oldKey ? newKey : k));
          }
        });
      }
      return upGroup;
    });

    // 检查改完后该 App 所有 group key 是否唯一
    const finalKeys = [...myGroups.map(g => g.key), ...renamedUpGroups.map(g => g.key)];
    const dup = finalKeys.filter((k, i) => finalKeys.indexOf(k) !== i);
    if (dup.length > 0) {
      throw new Error(`App ${myApp.id} 合并后存在重复 key: ${JSON.stringify([...new Set(dup)])}`);
    }

    // 你的在前，上游的在后
    upApp.groups = myGroups.concat(renamedUpGroups);

    // name 等字段以你的为准
    if (myApp.name) upApp.name = myApp.name;

    console.log(`app merged: ${myApp.id} (mine ${myGroups.length} + upstream ${renamedUpGroups.length})`);
  });
}

// ===== 5. 版本号：取两个来源的最大值 =====
const upVer = Number(data.version) || 0;
const myVer = Number(myData.version) || 0;
data.version = Math.max(upVer, myVer);
console.log(`version: upstream=${upVer}, mine=${myVer} -> ${data.version}`);

// ===== 6. 修改根 id 和 name，避免和上游订阅冲突 =====
data.id = 888;
data.name = 'Mrlc精简版（含自编规则）';

// ===== 7. 写回（紧凑格式） =====
fs.writeFileSync(outputPath, JSON5.stringify(data));
console.log('Done.');
