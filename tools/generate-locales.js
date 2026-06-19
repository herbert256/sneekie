#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = path.resolve(__dirname, '..');
const docs = path.join(repo, 'docs');
const sourceDir = path.join(repo, 'tools', 'i18n-source', 'html');
const i18n = loadI18n();
const defaultLang = i18n.defaultLang;
const languages = i18n.languages;
const strings = i18n.strings;
const pages = i18n.pageSlugs;
const staticStrings = {
  en: {
    close: 'Close',
    layoutPreview: 'Layout preview',
    magazinePreview: 'Magazine page preview'
  },
  nl: {
    close: 'Sluiten',
    layoutPreview: 'Layoutvoorbeeld',
    magazinePreview: 'Tijdschriftpagina voorbeeld'
  },
  uk: {
    close: 'Закрити',
    layoutPreview: 'Перегляд схеми',
    magazinePreview: 'Перегляд сторінки журналу'
  }
};

function loadI18n(){
  const sandbox = { window: {} };
  const code = fs.readFileSync(path.join(docs, 'js', 'i18n.js'), 'utf8');
  vm.runInNewContext(code, sandbox, { filename: 'docs/js/i18n.js' });
  return sandbox.window.SNEEKIE_I18N;
}

function ensureDir(dir){
  fs.mkdirSync(dir, { recursive: true });
}

function readSource(slug){
  return fs.readFileSync(path.join(sourceDir, slug + '.html'), 'utf8');
}

function writePage(lang, slug, html){
  const outDir = path.join(docs, languagePathPrefix(lang));
  ensureDir(outDir);
  fs.writeFileSync(path.join(outDir, slug + '.html'), html);
}

function pageUrl(lang, slug){
  return 'https://sneekie.xyz/' + languagePathPrefix(lang) + '/' + slug;
}

function localeFor(lang){
  return languages.find(item => item.code === lang)?.locale || 'en_US';
}

function languagePathPrefix(lang){
  return languages.find(item => item.code === lang)?.pathPrefix || lang;
}

function extractTemplate(html, lang){
  const re = new RegExp('<template id="main-template-' + lang + '">([\\s\\S]*?)<\\/template>');
  const match = html.match(re);
  return match ? match[1] : null;
}

function stripTemplates(html){
  return html.replace(/\n\s*<template id="main-template-[^"]+">[\s\S]*?<\/template>/g, '');
}

function replaceMain(html, lang){
  const match = html.match(/<main([^>]*)>([\s\S]*?)<\/main>/);
  if(!match) return html;
  const attrs = match[1].replace(/\sdata-lang-template\b/g, '');
  const body = (lang === defaultLang ? match[2] : (extractTemplate(html, lang) || match[2])).replace(/\s+$/, '');
  return html.replace(/<main[^>]*>[\s\S]*?<\/main>/, '<main' + attrs + '>' + body + '\n    </main>');
}

function stripTrailingWhitespace(html){
  return html.replace(/[ \t]+$/gm, '');
}

function translationFor(lang, key){
  return strings[lang]?.[key] ||
    staticStrings[lang]?.[key] ||
    strings[defaultLang]?.[key] ||
    staticStrings[defaultLang]?.[key] ||
    null;
}

function stripDataI18nAttr(attrs, name){
  return attrs.replace(new RegExp('\\s' + name + '="[^"]*"'), '');
}

function escapeAttr(value){
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function decodeEntities(value){
  const named = {
    amp: '&',
    apos: "'",
    copy: '(c)',
    gt: '>',
    lt: '<',
    mdash: '-',
    middot: '-',
    nbsp: ' ',
    quot: '"',
    rarr: '->',
    times: 'x'
  };
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(parseInt(num, 10)))
    .replace(/&([a-z]+);/gi, (_, name) => named[name] || ' ');
}

function plainText(value){
  return decodeEntities(String(value).replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function setAttr(tag, name, value){
  const escaped = escapeAttr(value);
  const attr = new RegExp('\\s' + name + '="[^"]*"');
  if(attr.test(tag)) return tag.replace(attr, ' ' + name + '="' + escaped + '"');
  return tag.replace(/\s*\/?>$/, match => ' ' + name + '="' + escaped + '"' + match);
}

function applyInlineTranslations(html, lang){
  html = html.replace(/<([a-z][\w:-]*)([^>]*\sdata-i18n="([^"]+)"[^>]*)>([\s\S]*?)<\/\1>/gi,
    (all, tag, attrs, key, body) => {
      const text = translationFor(lang, key);
      return '<' + tag + stripDataI18nAttr(attrs, 'data-i18n') + '>' + (text ?? body) + '</' + tag + '>';
    });
  html = html.replace(/<([a-z][\w:-]*)([^>]*\sdata-i18n-text="([^"]+)"[^>]*)>([\s\S]*?)<\/\1>/gi,
    (all, tag, attrs, key, body) => {
      const text = translationFor(lang, key);
      return '<' + tag + stripDataI18nAttr(attrs, 'data-i18n-text') + '>' + (text == null ? body : plainText(text)) + '</' + tag + '>';
    });
  html = html.replace(/<[^>]+data-i18n-aria="([^"]+)"[^>]*>/gi,
    (tag, key) => {
      const text = translationFor(lang, key);
      tag = stripDataI18nAttr(tag, 'data-i18n-aria');
      return text == null ? tag : setAttr(tag, 'aria-label', plainText(text));
    });
  html = html.replace(/<[^>]+data-i18n-title="([^"]+)"[^>]*>/gi,
    (tag, key) => {
      const text = translationFor(lang, key);
      tag = stripDataI18nAttr(tag, 'data-i18n-title');
      return text == null ? tag : setAttr(tag, 'title', plainText(text));
    });
  html = html.replace(/<[^>]+data-i18n-alt="([^"]+)"[^>]*>/gi,
    (tag, key) => {
      const text = translationFor(lang, key);
      tag = stripDataI18nAttr(tag, 'data-i18n-alt');
      return text == null ? tag : setAttr(tag, 'alt', plainText(text));
    });
  return html;
}

function firstMatch(html, pattern){
  const match = html.match(pattern);
  return match ? plainText(match[1]) : '';
}

function pageTitle(html, slug){
  const h1 = firstMatch(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  return h1 ? 'Sneekie - ' + h1 : 'Sneekie';
}

function pageDescription(html){
  return firstMatch(html, /<p\b[^>]*class="[^"]*\blead\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i) ||
    firstMatch(html, /<p\b[^>]*class="[^"]*\bsub\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i) ||
    firstMatch(html, /<meta\s+name="description"\s+content="([^"]*)"/i) ||
    'Sneekie, the 1988 MS-DOS snake maze game by HerbySoft.';
}

function trimDescription(value){
  return value.length <= 180 ? value : value.slice(0, 177).replace(/\s+\S*$/, '') + '...';
}

function alternateLinks(slug){
  const links = languages.map(lang =>
    '    <link rel="alternate" hreflang="' + lang.code + '" href="' + pageUrl(lang.code, slug) + '" />'
  );
  links.push('    <link rel="alternate" hreflang="x-default" href="' + pageUrl(defaultLang, slug) + '" />');
  return links.join('\n');
}

function updateHead(html, lang, slug){
  const title = pageTitle(html, slug);
  const description = trimDescription(pageDescription(html));
  const url = pageUrl(lang, slug);
  html = html.replace(/<html lang="[^"]*"/, '<html lang="' + lang + '"');
  html = html.replace(/<title>[\s\S]*?<\/title>/i, '<title>' + escapeAttr(title) + '</title>');
  html = html.replace(/<meta\s+name="description"[^>]*>/i, tag => setAttr(tag, 'content', description));
  html = html.replace(/<meta\s+property="og:locale"[^>]*>/i, tag => setAttr(tag, 'content', localeFor(lang)));
  html = html.replace(/<meta\s+property="og:title"[^>]*>/i, tag => setAttr(tag, 'content', title));
  html = html.replace(/<meta\s+property="og:description"[^>]*>/i, tag => setAttr(tag, 'content', description));
  html = html.replace(/<meta\s+property="og:url"[^>]*>/i, tag => setAttr(tag, 'content', url));
  html = html.replace(/<meta\s+name="twitter:title"[^>]*>/i, tag => setAttr(tag, 'content', title));
  html = html.replace(/<meta\s+name="twitter:description"[^>]*>/i, tag => setAttr(tag, 'content', description));
  html = html.replace(/<link\s+rel="canonical"[^>]*>/i, tag => setAttr(tag, 'href', url));
  html = html.replace(/\n\s*<link rel="alternate" hreflang="[^"]+" href="[^"]+" \/>/g, '');
  return html.replace(/(<link\s+rel="canonical"[^>]*>)/i, '$1\n' + alternateLinks(slug));
}

function renderPage(lang, slug){
  let html = readSource(slug);
  html = replaceMain(html, lang);
  html = stripTemplates(html);
  html = applyInlineTranslations(html, lang);
  html = updateHead(html, lang, slug);
  return stripTrailingWhitespace(html);
}

function writeSitemap(){
  const rows = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'];
  for(const slug of pages){
    for(const lang of languages){
      rows.push('  <url>');
      rows.push('    <loc>' + pageUrl(lang.code, slug) + '</loc>');
      for(const alt of languages){
        rows.push('    <xhtml:link rel="alternate" hreflang="' + alt.code + '" href="' + pageUrl(alt.code, slug) + '" />');
      }
      rows.push('    <xhtml:link rel="alternate" hreflang="x-default" href="' + pageUrl(defaultLang, slug) + '" />');
      rows.push('  </url>');
    }
  }
  rows.push('</urlset>');
  fs.writeFileSync(path.join(docs, 'sitemap.xml'), rows.join('\n') + '\n');
}

for(const slug of pages){
  if(!fs.existsSync(path.join(sourceDir, slug + '.html'))){
    throw new Error('Missing source page: ' + slug);
  }
  for(const lang of languages){
    writePage(lang.code, slug, renderPage(lang.code, slug));
  }
}

writeSitemap();

console.log('Generated ' + pages.length + ' pages for ' +
  languages.map(lang => lang.code + (lang.code === defaultLang ? '' : ' (' + languagePathPrefix(lang.code) + ')')).join(', ') + '.');
