import codeSyntaxHighlight from "@toast-ui/editor-plugin-code-syntax-highlight/dist/toastui-editor-plugin-code-syntax-highlight-all.js";
import router from "../../router.js";

const customHTMLRenderer = {
  // Add id attribute to headings
  heading(node, { entering, getChildrenText, origin }) {
    const original = origin();
    if (entering) {
      original.attributes = {
        id: getChildrenText(node)
          .toLowerCase()
          .replace(/[^a-z0-9-\s]*/g, "")
          .trim()
          .replace(/\s/g, "-"),
      };
    }
    return original;
  },
  // Convert relative hash links to absolute links
  link(_, { entering, origin }) {
    const original = origin();
    if (entering) {
      const href = original.attributes.href;
      if (href.startsWith("#")) {
        const targetRoute = {
          ...router.currentRoute.value,
          hash: href,
        };
        original.attributes.href = router.resolve(targetRoute).href;
      }
    }
    return original;
  },
  // Support triple statuses for task list items (none [ ], staged [-] / [/], completed [x])
  item(node, { entering, origin }) {
    if (entering && !node.listData.task && node.firstChild) {
      let textNode = node.firstChild;
      while (textNode && textNode.type !== "text") {
        textNode = textNode.firstChild;
      }
      if (textNode && textNode.literal) {
        const match = textNode.literal.match(/^\[([-\/])\]\s*/);
        if (match) {
          textNode.literal = textNode.literal.slice(match[0].length);
          node.listData.task = true;
          node.listData.checked = "staged";
          const res = origin();
          res.attributes = res.attributes || {};
          res.attributes.class = (
            (res.attributes.class || "") + " task-list-item staged"
          ).trim();
          res.attributes["data-task"] = "";
          res.attributes["data-task-staged"] = "";
          return res;
        }
      }
    }
    return origin();
  },
};

const baseOptions = {
  height: "100%",
  plugins: [codeSyntaxHighlight],
  customHTMLRenderer: customHTMLRenderer,
  usageStatistics: false,
};

export default baseOptions;
