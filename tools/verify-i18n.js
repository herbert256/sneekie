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
const chromeNavSlugs = ['game', 'history', 'source', 'manual', 'bot', 'magazine', 'explained', 'migration', 'vram'];
const runtimeChromeKeys = [
  'brand',
  'primary',
  'skip',
  'navGame',
  'navManual',
  'navBot',
  'navMagazine',
  'navHistory',
  'navSource',
  'navExplained',
  'navMigration',
  'navVram',
  'language',
  'langEn',
  'langNl',
  'langUk',
  'footer'
];
const chromeFooters = {
  en: "Sneekie &copy; July '88 by HerbySoft<br>Published in MS(X)DOS Computer Magazine no.&nbsp;25 (October 1988).<br>Original: GW-BASIC, 80&times;25 text mode, POKEs straight into video memory.<br>Browser version: June 2026.",
  nl: "Sneekie &copy; juli '88 door HerbySoft<br>Gepubliceerd in MS(X)DOS Computer Magazine nr.&nbsp;25 (oktober 1988).<br>Origineel: GW-BASIC, 80&times;25 tekstmodus, met POKE direct in het videogeheugen.<br>Browserversie: juni 2026.",
  uk: "Sneekie &copy; липень '88, HerbySoft<br>Опубліковано в MS(X)DOS Computer Magazine №&nbsp;25 (жовтень 1988).<br>Оригінал: GW-BASIC, текстовий режим 80&times;25, POKE прямо у відеопамʼять.<br>Браузерна версія: червень 2026."
};
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

function countMatches(value, pattern){
  return (value.match(pattern) || []).length;
}

function assertSitePathParts(){
  const siteJs = read(path.join(docs, 'js', 'site.js'));
  assert(!siteJs.includes('renderTopHeader'), 'site.js must not inject header.top.');
  assert(!siteJs.includes('renderPageFooter'), 'site.js must not inject footer.');
  assert(!siteJs.includes("createElement('header')") && !siteJs.includes('createElement("header")'),
    'site.js must not create header elements.');
  assert(!siteJs.includes("createElement('footer')") && !siteJs.includes('createElement("footer")'),
    'site.js must not create footer elements.');
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
  const chromeKeys = runtimeChromeKeys.filter(key => key in table);
  assert(chromeKeys.length === 0, lang + ' still has static chrome strings in runtime i18n: ' + chromeKeys.join(', '));
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
    assert(countMatches(html, /<a class="skip" href="#main">/g) === 1, file + ' must contain one static skip link.');
    assert(countMatches(html, /<header class="top">/g) === 1, file + ' must contain one static top header.');
    assert(countMatches(html, /<footer>/g) === 1, file + ' must contain one static footer.');
    assert(/<main[^>]*id="main"[^>]*tabindex="-1"|<main[^>]*tabindex="-1"[^>]*id="main"/.test(html),
      file + ' main element must be a static skip target.');
    assert(html.includes(chromeFooters[lang]), file + ' footer is not localized.');
    for(const navSlug of chromeNavSlugs){
      assert(html.includes('href="../' + languagePathPrefix(lang) + '/' + navSlug + '.html" target="_top"'),
        file + ' header misses nav link for ' + navSlug + '.');
    }
    const navMatch = html.match(/<nav[\s\S]*?<\/nav>/);
    const navCurrent = navMatch ? countMatches(navMatch[0], /aria-current="page"/g) : 0;
    assert(navCurrent === (slug === 'bot-thinking' ? 0 : 1), file + ' has wrong current nav marker count.');
    const langSwitchMatch = html.match(/<div class="lang-switch"[\s\S]*?<\/div>/);
    const langSwitch = langSwitchMatch ? langSwitchMatch[0] : '';
    assert(countMatches(langSwitch, /aria-current="true"/g) === 1, file + ' has wrong current language marker count.');
    for(const targetLang of languageCodes){
      assert(langSwitch.includes('href="../' + languagePathPrefix(targetLang) + '/' + slug + '.html" target="_top"'),
        file + ' language switch misses ' + targetLang + ' link.');
    }
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
