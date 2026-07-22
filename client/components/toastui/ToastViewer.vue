<template>
  <div ref="viewerElement"></div>
</template>

<script setup>
import Viewer from "@toast-ui/editor/dist/toastui-editor-viewer";
import { onMounted, ref, watch } from "vue";

import baseOptions from "./baseOptions.js";
import extendedAutolinks from "./extendedAutolinks.js";

const props = defineProps({
  initialValue: String,
});

const emit = defineEmits(["change"]);

const viewerElement = ref();
let toastViewer = null;
let lastHandledTime = 0;

function cycleTaskMarkerInString(lineText) {
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
}

function handleCheckboxEvent(ev) {
  const target = ev.target;
  const listItemEl = target.closest ? target.closest(".task-list-item") : null;
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

  const nodeId = listItemEl.getAttribute("data-nodeid");
  if (!nodeId || !toastViewer || !toastViewer.toastMark) return;

  const mdNode = toastViewer.toastMark.findNodeById(Number(nodeId));
  if (!mdNode || !mdNode.sourcepos) return;

  const lineNum = mdNode.sourcepos[0][0];
  const lines = (props.initialValue || "").split("\n");
  if (lineNum >= 1 && lineNum <= lines.length) {
    lines[lineNum - 1] = cycleTaskMarkerInString(lines[lineNum - 1]);
    const updatedContent = lines.join("\n");
    emit("change", updatedContent);
  }
}

onMounted(() => {
  toastViewer = new Viewer({
    ...baseOptions,
    extendedAutolinks,
    el: viewerElement.value,
    initialValue: props.initialValue,
  });

  if (viewerElement.value) {
    viewerElement.value.addEventListener("pointerdown", handleCheckboxEvent, {
      capture: true,
    });
    viewerElement.value.addEventListener("touchstart", handleCheckboxEvent, {
      capture: true,
      passive: false,
    });
    viewerElement.value.addEventListener("click", handleCheckboxEvent, {
      capture: true,
    });
  }
});

watch(
  () => props.initialValue,
  (newValue) => {
    if (toastViewer && newValue !== undefined) {
      toastViewer.setMarkdown(newValue);
    }
  },
);
</script>

<style>
@import "@toast-ui/editor/dist/toastui-editor-viewer.css";
@import "prismjs/themes/prism.css";
@import "@toast-ui/editor-plugin-code-syntax-highlight/dist/toastui-editor-plugin-code-syntax-highlight.css";
@import "./toastui-editor-overrides.scss";
</style>
