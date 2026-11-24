/**
 * Pembersih HTML berbasis allowlist untuk konten materi (dijalankan di browser).
 * Dipakai saat menyimpan DAN saat menampilkan, supaya tempelan dari web atau data import
 * tidak bisa menyisipkan script/handler (XSS).
 */
const ALLOWED_TAGS = new Set([
  "h1", "h2", "h3", "h4", "p", "br", "hr", "div", "span", "strong", "b", "em", "i", "u", "s",
  "ul", "ol", "li", "a", "img", "blockquote", "code", "pre",
  "table", "thead", "tbody", "tr", "th", "td",
]);
const DROP_WITH_CONTENT = new Set(["script", "style", "iframe", "object", "embed", "svg", "math", "link", "meta", "form", "input", "button", "textarea", "select"]);

function safeUrl(raw: string, protocols: string[]): string | null {
  const v = raw.trim();
  if (!v) return null;
  try {
    const u = new URL(v, window.location.href);
    return protocols.includes(u.protocol) ? v : null;
  } catch {
    return null;
  }
}

function clean(parent: Element) {
  for (const child of Array.from(parent.children)) {
    const tag = child.tagName.toLowerCase();

    if (DROP_WITH_CONTENT.has(tag)) {
      child.remove();
      continue;
    }
    if (!ALLOWED_TAGS.has(tag)) {
      clean(child);
      child.replaceWith(...Array.from(child.childNodes));
      continue;
    }

    for (const attr of Array.from(child.attributes)) {
      const name = attr.name.toLowerCase();
      const keep =
        (tag === "a" && name === "href") ||
        (tag === "img" && (name === "src" || name === "alt")) ||
        ((tag === "td" || tag === "th") && (name === "colspan" || name === "rowspan"));
      if (!keep) child.removeAttribute(attr.name);
    }

    if (tag === "a") {
      const href = child.getAttribute("href");
      const ok = href ? safeUrl(href, ["http:", "https:", "mailto:"]) : null;
      if (ok) {
        child.setAttribute("href", ok);
        child.setAttribute("target", "_blank");
        child.setAttribute("rel", "noopener noreferrer");
      } else {
        child.removeAttribute("href");
      }
    }
    if (tag === "img") {
      const src = child.getAttribute("src");
      const ok = src ? safeUrl(src, ["https:"]) : null;
      if (!ok) {
        child.remove();
        continue;
      }
      child.setAttribute("loading", "lazy");
    }

    clean(child);
  }
}

export function sanitizeHtml(html: string): string {
  if (typeof window === "undefined" || !html) return "";
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  clean(doc.body);
  return doc.body.innerHTML;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Mengubah teks biasa (catatan) menjadi paragraf HTML yang aman. */
export function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}
