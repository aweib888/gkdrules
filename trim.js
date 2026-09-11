const fs = require('fs');
const JSON5 = require('json5');

const upstreamPath = process.argv[2] || 'upstream.json5';
const outputPath = process.argv[3] || 'gkd.json5';
const delListPath = process.argv[4] || 'delapplist.txt';

const delSet = new Set(
  fs.readFileSync(delListPath, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
);

const data = JSON5.parse(fs.readFileSync(upstreamPath, 'utf8'));

// 1. 删除 apps 中命中的包
if (Array.isArray(data.apps)) {
  const before = data.apps.length;
  data.apps = data.apps.filter(app => !delSet.has(app.id));
  console.log(`apps: ${before} -> ${data.apps.length}`);
}

// 2. 清理 globalGroups 中对被删包名的引用
if (Array.isArray(data.globalGroups)) {
  data.globalGroups.forEach(group => {
    if (Array.isArray(group.rules)) {
      group.rules = group.rules.filter(rule => {
        if (Array.isArray(rule.apps)) {
          rule.apps = rule.apps.filter(a => !delSet.has(a.id));
          // 如果 apps 被清空，整条规则删掉，避免变成对所有应用生效
          if (rule.apps.length === 0) return false;
        }
        return true;
      });
    }
  });
}

fs.writeFileSync(outputPath, JSON5.stringify(data, null, 2));
console.log('Done.');
