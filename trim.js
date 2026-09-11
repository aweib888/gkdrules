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

// 1. 删除上游 apps 中命中的包
if (Array.isArray(data.apps)) {
  const before = data.apps.length;
  data.apps = data.apps.filter(app => !delSet.has(app.id));
  console.log(`upstream apps: ${before} -> ${data.apps.length}`);
}

// 2. 清理 globalGroups 中对被删包名的引用
if (Array.isArray(data.globalGroups)) {
  data.globalGroups.forEach(group => {
    if (Array.isArray(group.rules)) {
      group.rules = group.rules.filter(rule => {
        if (Array.isArray(rule.apps)) {
          rule.apps = rule.apps.filter(a => !delSet.has(a.id));
          // apps 被清空则整条规则删掉，避免变成对所有应用生效
          if (rule.apps.length === 0) return false;
        }
        return true;
      });
    }
  });
}

// 3. 合并自编规则：同包名以自编为准，其余追加
if (Array.isArray(myData.apps)) {
  const myIds = new Set(myData.apps.map(a => a.id));
  data.apps = data.apps.filter(a => !myIds.has(a.id));
  data.apps = data.apps.concat(myData.apps);
  console.log(`merged apps: ${data.apps.length}`);
}

// 4. 版本号：取两个来源的最大值
const upVer = Number(data.version) || 0;
const myVer = Number(myData.version) || 0;
data.version = Math.max(upVer, myVer);
console.log(`version: upstream=${upVer}, mine=${myVer} -> ${data.version}`);

// 5. 写回
fs.writeFileSync(outputPath, JSON5.stringify(data, null, 2));
console.log('Done.');
