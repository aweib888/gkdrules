const fs = require('fs');
const JSON5 = require('json5');

const upstreamPath = process.argv[2] || 'upstream.json5';
const outputPath = process.argv[3] || 'gkd.json5';
const delListPath = process.argv[4] || 'delapplist.txt';

// 读取删除列表
const delSet = new Set(
  fs.readFileSync(delListPath, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
);

// 解析上游 JSON5
const raw = fs.readFileSync(upstreamPath, 'utf8');
const data = JSON5.parse(raw);

// 删除 apps 中命中的包
if (Array.isArray(data.apps)) {
  const before = data.apps.length;
  data.apps = data.apps.filter(app => !delSet.has(app.id));
  console.log(`apps: ${before} -> ${data.apps.length}`);
}

// 扫描 globalGroups，移除引用了被删包名的规则
if (Array.isArray(data.globalGroups)) {
  const filterGroups = (groups) => (groups || []).map(g => {
    if (Array.isArray(g.rules)) {
      g.rules = g.rules.filter(r => {
        // 如果规则里有 apps 字段且全部命中删除列表，则移除
        if (Array.isArray(r.apps)) {
          const remaining = r.apps.filter(id => !delSet.has(id));
          if (remaining.length === 0) return false;
          r.apps = remaining;
        }
        return true;
      });
    }
    if (Array.isArray(g.groups)) g.groups = filterGroups(g.groups);
    return g;
  }).filter(Boolean);

  data.globalGroups = filterGroups(data.globalGroups);
}

// 写回
fs.writeFileSync(outputPath, JSON5.stringify(data, null, 2));
console.log('Done.');