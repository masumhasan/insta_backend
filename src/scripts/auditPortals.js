const fs = require('fs');
const path = require('path');

function getPages(dir, base = '') {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      results = results.concat(getPages(full, path.join(base, file)));
    } else if (file === 'page.tsx' || file === 'page.jsx' || file === 'page.js') {
      let route = '/' + base.replace(/\\/g, '/').replace(/\(.*?\)\/?/g, '').replace(/\/$/, '');
      if (route === '') route = '/';
      // normalize multiple slashes
      route = route.replace(/\/+/g, '/');
      results.push(route);
    }
  }
  return results;
}

function findInternalLinks(dir) {
  let links = [];
  if (!fs.existsSync(dir)) return links;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.next') {
        links = links.concat(findInternalLinks(full));
      }
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      const content = fs.readFileSync(full, 'utf8');
      const pushMatches = content.matchAll(/router\.push\(\s*[`'"](\/[^`'"]*)[`'"]/g);
      for (const m of pushMatches) {
        links.push({ file: full, link: m[1] });
      }
      const hrefMatches = content.matchAll(/href=\s*[`'"](\/[^`'"]*)[`'"]/g);
      for (const m of hrefMatches) {
        links.push({ file: full, link: m[1] });
      }
    }
  }
  return links;
}

const portals = ['admin', 'sign_company', 'installer', 'warehouse', 'landing'];
const report = {};

portals.forEach(portal => {
  const appDir = path.join(__dirname, '..', '..', '..', portal, 'src', 'app');
  const pages = Array.from(new Set(getPages(appDir)));
  
  const srcDir = path.join(__dirname, '..', '..', '..', portal, 'src');
  const allLinks = findInternalLinks(srcDir);
  
  const deadLinks = [];
  allLinks.forEach(item => {
    // clean link (strip query params, dynamic IDs)
    let clean = item.link.split('?')[0].split('#')[0];
    if (clean === '/' || clean === '') return;
    
    // Check if matching page or dynamic page exists
    const match = pages.some(p => {
      if (p === clean) return true;
      if (p.includes('[') && clean.startsWith(p.split('[')[0])) return true;
      return false;
    });
    
    if (!match && !clean.startsWith('/api') && !clean.endsWith('.png') && !clean.endsWith('.jpg') && !clean.endsWith('.pdf') && !clean.endsWith('.svg')) {
      deadLinks.push({ file: path.relative(path.join(__dirname, '..', '..', '..'), item.file), link: clean });
    }
  });

  report[portal] = {
    pageCount: pages.length,
    pages: pages.sort(),
    deadLinks: deadLinks
  };
});

console.log(JSON.stringify(report, null, 2));

