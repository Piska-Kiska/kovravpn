// src/i18n/boot-script.ts
//
// The inline language boot script of the root layout (src/app/layout.tsx).
// It runs in <head> before the first paint and sets <html lang> and
// data-lang, so the page is announced in the language it is about to show.
//
// It mirrors bootLangFrom() in src/i18n/resolve.ts; tests/lang-boot.test.mjs
// runs this exact string against that function, so the two cannot drift.
//
// Cabinet pages and the landing also get `kc-lang-pending` for a non-English
// language: their English SSR markup stays hidden until React re-renders
// (CabinetRoot and the landing remove the class; a timer is the fallback).
// The translated pages (/terms, /privacy, /guide) are not hidden: they show
// their server text for the moment it takes to switch. /guide exists in
// Russian and English only (pageLang), so any other language is English there.
//
// Plain ES5, no template interpolation: it is inlined as is.

export const LANG_BOOT_SCRIPT = String.raw`(function(){try{var d=document.documentElement,S=['en','ru','es','de','fr'],p=location.pathname,l=null,q=null,s=null,x=null;var has=function(v){return S.indexOf(v)>=0};try{q=new URL(location.href).searchParams.get('lang')}catch(e){}try{s=localStorage.getItem('kovra_lang');x=localStorage.getItem('kovra_lang_explicit')}catch(e){}var cab=/^\/(login|register|dashboard|tg)(\/|$)/.test(p);if(cab||/^\/(terms|privacy|guide)(\/|$)/.test(p)){if(has(q))l=q;else if(has(s)&&(s!=='en'||x==='1'))l=s;else{var n=(navigator.languages&&navigator.languages.length)?navigator.languages:[navigator.language||''];for(var i=0;i<n.length&&!l;i++){var c=String(n[i]).trim().toLowerCase().split(/[-_]/)[0];if(has(c))l=c;}}if(!l)l='en';if(/^\/guide(\/|$)/.test(p)&&l!=='ru')l='en';}else if(/^\/(guides|vless|crypto)(\/|$)/.test(p))l='en';else if(p==='/')l=has(s)?s:'en';else if(/^\/(promo|p)(\/|$)/.test(p))l='ru';else l=has(q)?q:'en';if((cab||p==='/')&&l!=='en'){d.classList.add('kc-lang-pending');setTimeout(function(){d.classList.remove('kc-lang-pending')},1200);}d.setAttribute('lang',l);d.setAttribute('data-lang',l);}catch(e){}})()`;
