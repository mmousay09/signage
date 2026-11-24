"use client";

import { useEffect } from "react";
import { EN, EN_PATTERNS } from "./en";

export const LANGUAGE_COOKIE = "admin_lang";

const ARABIC = /[؀-ۿ]/;
const ATTRIBUTES = ["placeholder", "aria-label", "title", "alt"] as const;
// نص المربعات الكبيرة من كتابة المستخدم فلا يُترجم، أما التلميح بداخلها فيُترجم
const SKIP = new Set(["SCRIPT", "STYLE", "CODE", "PRE"]);

// يُشغَّل قبل ظهور الصفحة: يضبط الاتجاه ويخفي المحتوى حتى تكتمل الترجمة الأولى، فلا يومض النص العربي
export const EARLY_SCRIPT = `(function(){try{if(document.cookie.split('; ').indexOf('${LANGUAGE_COOKIE}=en')<0)return;var h=document.documentElement;h.lang='en';h.dir='ltr';h.classList.add('i18n-pending');setTimeout(function(){h.classList.remove('i18n-pending')},1500)}catch(e){}})();`;

export function translate(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed || !ARABIC.test(trimmed)) return text;
  const lead = text.match(/^\s*/)?.[0] ?? "";
  const tail = text.match(/\s*$/)?.[0] ?? "";
  const exact = EN[trimmed];
  if (exact !== undefined) return lead + exact + tail;
  for (const [pattern, render] of EN_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) return lead + render(match, (part) => translate(part).trim()) + tail;
  }
  // علامة ترقيم عربية في آخر النص
  const punctuation = trimmed.match(/^(.+?)([:.،؟])$/);
  if (punctuation && EN[punctuation[1]] !== undefined) {
    const mark = { "،": ",", "؟": "?" }[punctuation[2]] ?? punctuation[2];
    return lead + EN[punctuation[1]] + mark + tail;
  }
  return text;
}

function skipped(element: Element | null) {
  return !element || SKIP.has(element.tagName) || Boolean(element.closest("[translate='no'], [data-no-translate]"));
}

function translateAttributes(element: Element) {
  for (const name of ATTRIBUTES) {
    const value = element.getAttribute(name);
    if (value && ARABIC.test(value)) {
      const next = translate(value);
      if (next !== value) element.setAttribute(name, next);
    }
  }
}

function translateText(node: Node) {
  if (node.parentElement?.tagName === "TEXTAREA") return;
  const value = node.nodeValue ?? "";
  if (!ARABIC.test(value)) return;
  const next = translate(value);
  if (next !== value) node.nodeValue = next;
}

function translateTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    if (!skipped(root.parentElement)) translateText(root);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE || skipped(root as Element)) return;
  translateAttributes(root as Element);
  // FILTER_REJECT يتخطى العنصر المستثنى وكل ما بداخله
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (node) =>
      node.nodeType === Node.ELEMENT_NODE && skipped(node as Element) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.ELEMENT_NODE) translateAttributes(node as Element);
    else translateText(node);
  }
}

/** يترجم لوحة التحكم إلى الإنجليزية أثناء العرض إن اختارها المستخدم */
export function AdminTranslator() {
  useEffect(() => {
    if (!document.cookie.split("; ").includes(`${LANGUAGE_COOKIE}=en`)) return;
    const html = document.documentElement;
    html.lang = "en";
    html.dir = "ltr";
    const title = () => {
      const next = translate(document.title);
      if (next !== document.title) document.title = next;
    };
    translateTree(document.body);
    title();
    html.classList.remove("i18n-pending");

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") translateTree(mutation.target);
        else if (mutation.type === "attributes") {
          const target = mutation.target as Element;
          if (!skipped(target)) translateAttributes(target);
        } else mutation.addedNodes.forEach(translateTree);
      }
      title();
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...ATTRIBUTES],
    });
    const head = new MutationObserver(title);
    const titleElement = document.querySelector("title");
    if (titleElement) head.observe(titleElement, { childList: true, characterData: true, subtree: true });
    return () => {
      observer.disconnect();
      head.disconnect();
    };
  }, []);
  return null;
}

/** زر اللغة: يبقى باسمه في لغته حتى يجده من لا يقرأ اللغة الأخرى */
export function LanguageToggle() {
  return (
    <button
      type="button"
      className="language-toggle"
      translate="no"
      onClick={() => {
        const english = document.cookie.split("; ").includes(`${LANGUAGE_COOKIE}=en`);
        document.cookie = `${LANGUAGE_COOKIE}=${english ? "ar" : "en"}; path=/; max-age=31536000; samesite=lax`;
        window.location.reload();
      }}
    >
      <span className="language-toggle-ar">English</span>
      <span className="language-toggle-en">العربية</span>
    </button>
  );
}
