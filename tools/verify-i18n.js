#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = path.resolve(__dirname, '..');
const docs = path.join(repo, 'docs');
const sourceDir = path.join(repo, 'tools', 'i18n-source', 'html');
const i18n = loadI18n();
const languageCodes = i18n.languages.map(lang => lang.code);
const errors = [];

function loadI18n(){
  const sandbox = { window: {} };
  const code = fs.readFileSync(path.join(docs, 'js', 'i18n.js'), 'utf8');
  vm.runInNewContext(code, sandbox, { filename: 'docs/js/i18n.js' });
  return sandbox.window.SNEEKIE_I18N;
}

function fail(message){
  errors.push(message);
}

function assert(condition, message){
  if(!condition) fail(message);
}

function read(file){
  return fs.readFileSync(file, 'utf8');
}

function extractFunction(source, name){
  const start = source.indexOf('function ' + name + '(');
  if(start < 0) return null;
  const open = source.indexOf('{', start);
  if(open < 0) return null;
  let depth = 0;
  for(let index = open; index < source.length; index++){
    if(source[index] === '{') depth++;
    if(source[index] === '}') depth--;
    if(depth === 0) return source.slice(start, index + 1);
  }
  return null;
}

function pageUrl(lang, slug){
  return 'https://sneekie.xyz/' + languagePathPrefix(lang) + '/' + slug;
}

function languagePathPrefix(lang){
  return i18n.languages.find(item => item.code === lang)?.pathPrefix || lang;
}

function assertSitePathParts(){
  const siteJs = read(path.join(docs, 'js', 'site.js'));
  const helperSource = extractFunction(siteJs, 'sitePathPartsFromPathname');
  assert(helperSource, 'site.js does not define sitePathPartsFromPathname.');
  if(!helperSource) return;
  const sitePathPartsFromPathname = vm.runInNewContext('(' + helperSource + ')');
  const cases = [
    ['/en/game.html', ['en', 'game.html'], '../'],
    ['/nl/game.html', ['nl', 'game.html'], '../'],
    ['/uk/game.html', ['uk', 'game.html'], '../'],
    ['/docs/en/game.html', ['en', 'game.html'], '../'],
    ['/docs/uk/game.html', ['uk', 'game.html'], '../'],
    ['/Users/herbert/sneekie/docs/en/game.html', ['en', 'game.html'], '../'],
    ['/Users/herbert/sneekie/docs/uk/game.html', ['uk', 'game.html'], '../']
  ];
  for(const [pathname, expectedParts, expectedRoot] of cases){
    const parts = sitePathPartsFromPathname(pathname);
    assert(JSON.stringify(parts) === JSON.stringify(expectedParts),
      'site path parts for ' + pathname + ' were ' + JSON.stringify(parts) + '.');
    const root = languageCodes.includes(parts[0]) && parts.length > 1 ? '../' : '';
    assert(root === expectedRoot, 'page root for ' + pathname + ' was ' + root + '.');
  }
}

assert(i18n, 'SNEEKIE_I18N is not exported.');
assert(i18n.languages?.length, 'No languages registered.');
assert(i18n.languages.some(lang => lang.code === i18n.defaultLang), 'Default language is not registered.');
assertSitePathParts();

assert(new Set(languageCodes).size === languageCodes.length, 'Duplicate language codes.');
for(const lang of languageCodes){
  assert(languagePathPrefix(lang) === lang, lang + ' pathPrefix must match the language directory.');
}
assert(!fs.existsSync(path.join(docs, 'html')), 'Old docs/html directory still exists.');
assert(!fs.existsSync(path.join(docs, 'nl', 'html')), 'Old docs/nl/html directory still exists.');
assert(!fs.existsSync(path.join(docs, 'uk', 'html')), 'Old docs/uk/html directory still exists.');

const defaultStrings = i18n.strings[i18n.defaultLang] || {};
const defaultKeys = Object.keys(defaultStrings).sort();
for(const lang of languageCodes){
  const table = i18n.strings[lang] || {};
  const keys = Object.keys(table).sort();
  const missing = defaultKeys.filter(key => !(key in table));
  const extra = keys.filter(key => !(key in defaultStrings));
  assert(missing.length === 0, lang + ' is missing shared string keys: ' + missing.join(', '));
  assert(extra.length === 0, lang + ' has unknown shared string keys: ' + extra.join(', '));
}

const rootIndex = read(path.join(docs, 'index.html'));
assert(rootIndex.includes('src="js/i18n.js"'), 'docs/index.html does not load js/i18n.js.');
for(const lang of languageCodes){
  assert(rootIndex.includes('hreflang="' + lang + '" href="' + pageUrl(lang, 'game') + '"'), 'docs/index.html lacks game hreflang for ' + lang + '.');
}

for(const slug of i18n.pageSlugs){
  const sourcePath = path.join(sourceDir, slug + '.html');
  assert(fs.existsSync(sourcePath), 'Missing source page: ' + sourcePath);
  if(fs.existsSync(sourcePath)){
    const source = read(sourcePath);
    assert(source.includes('src="../js/i18n.js"'), 'Source page does not load i18n.js: ' + slug);
    if(source.includes('data-lang-template')){
      for(const lang of languageCodes.filter(code => code !== i18n.defaultLang)){
        assert(source.includes('id="main-template-' + lang + '"'), 'Source page ' + slug + ' lacks template for ' + lang + '.');
      }
    }
  }

  for(const lang of languageCodes){
    const file = path.join(docs, languagePathPrefix(lang), slug + '.html');
    assert(fs.existsSync(file), 'Missing generated page: ' + file);
    if(!fs.existsSync(file)) continue;
    const html = read(file);
    assert(html.includes('<html lang="' + lang + '"'), file + ' has wrong html lang.');
    assert(!html.includes('main-template-'), file + ' still contains locale templates.');
    assert(!html.includes('data-lang-template'), file + ' still contains data-lang-template.');
    assert(!/\sdata-i18n(?:-[a-z]+)?=/.test(html), file + ' still contains runtime translation attributes.');
    assert(html.includes('href="' + pageUrl(lang, slug) + '"'), file + ' lacks self canonical URL.');
    for(const alt of languageCodes){
      assert(html.includes('hreflang="' + alt + '" href="' + pageUrl(alt, slug) + '"'), file + ' lacks hreflang for ' + alt + '.');
    }
    assert(html.includes('src="../js/i18n.js"'), file + ' does not load ../js/i18n.js.');
    assert(!/(href|src|data-full)="\.\.\/\.\.\//.test(html), file + ' still has two-level parent asset links.');
  }
}

const sw = read(path.join(docs, 'sw.js'));
assert(sw.includes('js/i18n.js'), 'Service worker does not precache js/i18n.js.');
for(const slug of i18n.pageSlugs){
  for(const lang of languageCodes){
    const prefix = languagePathPrefix(lang);
    assert(sw.includes("'" + prefix + '/' + slug + ".html'"), 'Service worker misses ' + prefix + '/' + slug + '.html.');
    assert(sw.includes("'" + prefix + '/' + slug + "'"), 'Service worker misses clean URL ' + prefix + '/' + slug + '.');
  }
}

const sitemap = read(path.join(docs, 'sitemap.xml'));
for(const slug of i18n.pageSlugs){
  for(const lang of languageCodes){
    assert(sitemap.includes('<loc>' + pageUrl(lang, slug) + '</loc>'), 'Sitemap misses ' + pageUrl(lang, slug) + '.');
  }
}

if(errors.length){
  console.error(errors.map(error => '- ' + error).join('\n'));
  process.exit(1);
}

console.log('i18n verification passed for ' + languageCodes.join(', ') + '.');
