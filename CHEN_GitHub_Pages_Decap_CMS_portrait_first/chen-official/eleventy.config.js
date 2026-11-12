import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
function readJson(rel, fallback) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) return fallback;
  return JSON.parse(fs.readFileSync(full, 'utf8'));
}

export default function(eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ 'src/css': 'css' });
  eleventyConfig.addPassthroughCopy({ 'src/js': 'js' });
  eleventyConfig.addPassthroughCopy({ 'static': '.' });
  eleventyConfig.addGlobalData('buildYear', () => new Date().getFullYear());
  eleventyConfig.addGlobalData('about', () => readJson('content/about.json', {}));
  eleventyConfig.addGlobalData('profile', () => readJson('content/profile.json', {}));
  eleventyConfig.addGlobalData('contact', () => readJson('content/contact.json', {}));
  eleventyConfig.addGlobalData('gallery', () => readJson('content/gallery.json', {}));
  eleventyConfig.addGlobalData('settings', () => readJson('content/settings.json', {}));
  eleventyConfig.addGlobalData('works', () => {
    const folder = path.join(root, 'content/works');
    const entries = fs.readdirSync(folder).filter(n => n.endsWith('.json'));
    return entries.map(name => ({ ...readJson(`content/works/${name}`, {}), _source: name }))
      .filter(w => w.visible !== false)
      .sort((a,b) => (Number(b.year)||0)-(Number(a.year)||0) || (Number(a.sort_order)||0)-(Number(b.sort_order)||0));
  });
  eleventyConfig.addFilter('json', value => JSON.stringify(value ?? null).replace(/</g, '\\u003c'));
  eleventyConfig.addFilter('year', v => String(v ?? ''));
  return {
    dir: { input: 'src', output: '_site', includes: '_includes' },
    templateFormats: ['njk'],
    htmlTemplateEngine: 'njk',
    markdownTemplateEngine: 'njk'
  };
}
