import sanitizeHtml from "sanitize-html";

/**
 * Sanitize HTML content từ rich text editor (react-quill, tiptap, v.v.)
 * Chỉ cho phép các tag và attribute an toàn — strip <script>, event handlers, v.v.
 */
export const sanitizeRichText = (dirty: string): string => {
  if (!dirty || typeof dirty !== "string") return "";

  return sanitizeHtml(dirty, {
    allowedTags: [
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "p",
      "br",
      "hr",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "strike",
      "ul",
      "ol",
      "li",
      "blockquote",
      "pre",
      "code",
      "a",
      "img",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "div",
      "span",
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "width", "height"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
      "*": ["class"], // cho phép class để giữ styling từ editor
    },
    allowedSchemes: ["http", "https", "mailto"],
    // Tự động thêm rel="noopener noreferrer" cho external links
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }),
    },
  });
};

/**
 * Strip toàn bộ HTML, chỉ giữ text thuần (dùng cho search/meta description)
 */
export const stripHtml = (html: string): string => {
  if (!html || typeof html !== "string") return "";
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} });
};
