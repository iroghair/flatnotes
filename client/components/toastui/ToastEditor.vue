<template>
  <div ref="editorElement"></div>
</template>

<script setup>
import Editor from "@toast-ui/editor";
import { onMounted, ref } from "vue";

import baseOptions from "./baseOptions.js";

const props = defineProps({
  initialValue: String,
  initialEditType: {
    type: String,
    default: "markdown",
  },
  addImageBlobHook: Function,
});

const emit = defineEmits(["change", "keydown"]);

const editorElement = ref();
let toastEditor;

onMounted(() => {
  toastEditor = new Editor({
    ...baseOptions,
    el: editorElement.value,
    initialValue: props.initialValue,
    initialEditType: props.initialEditType,
    events: {
      change: () => {
        emit("change");
      },
      keydown: (_, event) => {
        emit("keydown", event);
      },
    },
    hooks: props.addImageBlobHook
      ? { addImageBlobHook: props.addImageBlobHook }
      : {},
  });

  setupStagedTasks();
});

function setupStagedTasks() {
  if (!toastEditor) return;

  // 1. Patch ProseMirror schema toDOM for listItem (WYSIWYG DOM rendering)
  if (toastEditor.wwEditor?.schema?.nodes?.listItem) {
    const listItemSpec = toastEditor.wwEditor.schema.nodes.listItem.spec;
    const origToDOM = listItemSpec.toDOM;
    listItemSpec.toDOM = function (node) {
      const res = origToDOM.call(this, node);
      if (node.attrs.task) {
        if (node.attrs.checked === "staged") {
          res[1].class = "task-list-item staged";
          delete res[1]["data-task-checked"];
          res[1]["data-task-staged"] = "true";
        }
      }
      return res;
    };
  }

  // 2. Patch WYSIWYG -> Markdown serializer for listItem
  if (toastEditor.convertor?.toMdConvertors?.nodeTypeConvertors?.listItem) {
    toastEditor.convertor.toMdConvertors.nodeTypeConvertors.listItem = function (
      state,
      nodeInfo
    ) {
      const node = nodeInfo.node;
      const { task, checked } = node.attrs;
      if (task) {
        const mark = checked === "staged" ? "-" : checked === true ? "x" : " ";
        state.write("[" + mark + "] ");
      }
      state.convertNode(node);
    };
  }

  // 3. Add event listeners for interactive 3-way status cycling (works on touch & mouse)
  if (editorElement.value) {
    let lastHandledTime = 0;

    const cycleTaskMarkerInString = (lineText) => {
      if (/^\s*[-*+]\s+\[ \]/i.test(lineText)) {
        return lineText.replace(/^(\s*[-*+]\s+)\[ \]/i, "$1[-]");
      }
      if (/^\s*[-*+]\s+\[[-\/\]]/i.test(lineText)) {
        return lineText.replace(/^(\s*[-*+]\s+)\[[-\/\]]/i, "$1[x]");
      }
      if (/^\s*[-*+]\s+\[x\]/i.test(lineText)) {
        return lineText.replace(/^(\s*[-*+]\s+)\[x\]/i, "$1[ ]");
      }
      return lineText;
    };

    const handleCheckboxPointerEvent = (ev) => {
      const target = ev.target;
      const listItemEl = target.closest
        ? target.closest(".task-list-item")
        : null;
      if (!listItemEl) return;

      const style = window.getComputedStyle(listItemEl, ":before");
      const left = parseInt(style.left, 10) || 0;
      const top = parseInt(style.top, 10) || 0;
      const width =
        (parseInt(style.width, 10) || 18) +
        (parseInt(style.paddingLeft, 10) || 0) +
        (parseInt(style.paddingRight, 10) || 0);
      const height =
        (parseInt(style.height, 10) || 18) +
        (parseInt(style.paddingTop, 10) || 0) +
        (parseInt(style.paddingBottom, 10) || 0);

      const rect = listItemEl.getBoundingClientRect();
      let clientX, clientY;
      if (ev.touches && ev.touches.length > 0) {
        clientX = ev.touches[0].clientX;
        clientY = ev.touches[0].clientY;
      } else if (ev.changedTouches && ev.changedTouches.length > 0) {
        clientX = ev.changedTouches[0].clientX;
        clientY = ev.changedTouches[0].clientY;
      } else {
        clientX = ev.clientX;
        clientY = ev.clientY;
      }

      const offsetX = clientX - rect.left;
      const offsetY = clientY - rect.top;

      const isInBox =
        offsetX >= left - 6 &&
        offsetX <= left + width + 10 &&
        offsetY >= top - 6 &&
        offsetY <= top + height + 10;

      if (!isInBox) return;

      const now = Date.now();
      if (now - lastHandledTime < 300) {
        if (ev.cancelable) ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      lastHandledTime = now;

      if (ev.cancelable) ev.preventDefault();
      ev.stopPropagation();

      if (toastEditor.isWysiwygMode()) {
        const view = toastEditor.wwEditor.view;
        const mousePos = view.posAtCoords({
          left: clientX,
          top: clientY,
        });
        if (!mousePos) return;

        const doc = view.state.doc;
        const currentPos = doc.resolve(mousePos.pos);
        let depth = currentPos.depth;
        while (depth > 0 && currentPos.node(depth).type.name !== "listItem") {
          depth--;
        }
        if (depth <= 0) return;

        const listItemNode = currentPos.node(depth);
        const offset = currentPos.before(depth);
        const currentChecked = listItemNode.attrs.checked;
        let nextChecked;
        if (currentChecked === "staged") {
          nextChecked = true; // staged [-] -> completed [x]
        } else if (currentChecked === true) {
          nextChecked = false; // completed [x] -> none [ ]
        } else {
          nextChecked = "staged"; // none [ ] -> staged [-]
        }

        const tr = view.state.tr;
        tr.setNodeMarkup(offset, null, {
          ...listItemNode.attrs,
          task: true,
          checked: nextChecked,
        });
        view.dispatch(tr);
        emit("change");
      } else {
        // Markdown Mode Preview Pane
        const nodeId = listItemEl.getAttribute("data-nodeid");
        if (nodeId && toastEditor.toastMark) {
          const mdNode = toastEditor.toastMark.findNodeById(Number(nodeId));
          if (mdNode && mdNode.sourcepos) {
            const lineNum = mdNode.sourcepos[0][0];
            const content = toastEditor.getMarkdown();
            const lines = content.split("\n");
            if (lineNum >= 1 && lineNum <= lines.length) {
              lines[lineNum - 1] = cycleTaskMarkerInString(lines[lineNum - 1]);
              toastEditor.setMarkdown(lines.join("\n"));
              emit("change");
            }
          }
        }
      }
    };

    editorElement.value.addEventListener("pointerdown", handleCheckboxPointerEvent, { capture: true });
    editorElement.value.addEventListener("touchstart", handleCheckboxPointerEvent, { capture: true, passive: false });
    editorElement.value.addEventListener("mousedown", handleCheckboxPointerEvent, { capture: true });
    editorElement.value.addEventListener("click", handleCheckboxPointerEvent, { capture: true });
  }
}

function getMarkdown() {
  return toastEditor.getMarkdown();
}

function isWysiwygMode() {
  return toastEditor.isWysiwygMode();
}

defineExpose({ getMarkdown, isWysiwygMode });
</script>

<style>
@import "@toast-ui/editor/dist/toastui-editor.css";
@import "prismjs/themes/prism.css";
@import "@toast-ui/editor-plugin-code-syntax-highlight/dist/toastui-editor-plugin-code-syntax-highlight.css";
@import "./toastui-editor-overrides.scss";
</style>
