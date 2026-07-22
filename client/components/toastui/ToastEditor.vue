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

  // 3. Add mousedown event listener for interactive 3-way status cycling
  if (editorElement.value) {
    editorElement.value.addEventListener(
      "mousedown",
      (ev) => {
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
        const offsetX = ev.offsetX;
        const offsetY = ev.offsetY;

        const isInBox =
          offsetX >= left &&
          offsetX <= left + width &&
          offsetY >= top &&
          offsetY <= top + height;

        if (!isInBox) return;

        if (toastEditor.isWysiwygMode()) {
          const view = toastEditor.wwEditor.view;
          const mousePos = view.posAtCoords({
            left: ev.clientX,
            top: ev.clientY,
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

          ev.preventDefault();
          ev.stopPropagation();

          const tr = view.state.tr;
          tr.setNodeMarkup(offset, null, {
            ...listItemNode.attrs,
            task: true,
            checked: nextChecked,
          });
          view.dispatch(tr);
        }
      },
      true
    );
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
