(() => {
  if (window.__imageBridgeModLoaded) return;
  window.__imageBridgeModLoaded = true;

  const FILE_TYPES = new Set([
    "image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/heic",
    "application/pdf", "text/plain", "text/markdown", "text/csv", "application/json", "application/rtf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ]);

  let picker;
  let currentForm = null;
  const pendingUploads = [];
  const uploadsByUrl = new Map();
  let replayingSubmit = false;

  function setStatus(message, isError = false) {
    const tray = currentForm?.querySelector(".ibm-preview-tray");
    if (!tray) return;
    const status = tray.querySelector(".ibm-preview-status");
    if (!status) return;
    status.textContent = message;
    status.dataset.error = isError ? "true" : "false";
    status.hidden = !message;
  }

  function getComposer(form) {
    return form.querySelector('#prompt-textarea, [contenteditable="true"], textarea');
  }

  function renderTray() {
    if (!currentForm) return;
    let tray = currentForm.querySelector(".ibm-preview-tray");
    if (!tray) {
      tray = document.createElement("div");
      tray.className = "ibm-preview-tray";
      const button = currentForm.querySelector(".ibm-button");
      currentForm.insertBefore(tray, button || null);
    }
    tray.replaceChildren();
    const visibleUploads = pendingUploads.filter(item => !item.submitted);
    if (!visibleUploads.length) {
      tray.hidden = true;
      return;
    }
    tray.hidden = false;
    const list = document.createElement("div");
    list.className = "ibm-preview-list";
    for (const item of visibleUploads) {
      const card = document.createElement("div");
      card.className = "ibm-preview-card";
      if (item.mime.startsWith("image/")) {
        const image = document.createElement("img");
        image.className = "ibm-preview-thumb";
        image.src = item.localPreview;
        image.alt = item.name;
        card.append(image);
      } else {
        const icon = document.createElement("span");
        icon.className = "ibm-preview-file-icon";
        icon.textContent = item.name.split(".").pop()?.toUpperCase() || "FILE";
        card.append(icon);
      }
      const details = document.createElement("div");
      details.className = "ibm-preview-details";
      const name = document.createElement("span");
      name.className = "ibm-preview-name";
      name.textContent = item.name;
      const state = document.createElement("span");
      state.className = "ibm-preview-state";
      state.textContent = "Listo para enviar";
      details.append(name, state);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "ibm-preview-remove";
      remove.textContent = "×";
      remove.title = "Quitar archivo";
      remove.setAttribute("aria-label", "Quitar " + item.name);
      remove.addEventListener("click", () => {
        const index = pendingUploads.indexOf(item);
        if (index >= 0) pendingUploads.splice(index, 1);
        URL.revokeObjectURL(item.localPreview);
        uploadsByUrl.delete(item.url);
        renderTray();
      });
      card.append(details, remove);
      list.append(card);
    }
    tray.append(list);
    const status = document.createElement("div");
    status.className = "ibm-preview-status";
    status.textContent = "";
    status.hidden = true;
    tray.append(status);
  }

  function addUrlsToComposer(form, items) {
    const editor = getComposer(form);
    if (!editor) throw new Error("No se encontró el campo de mensaje de ChatGPT.");

    const suffix = "\n\n" + items.map(item => "ImageBridge attachment (" + item.name + "): " + item.url).join("\n");
    editor.focus();

    if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
      const start = editor.selectionStart ?? editor.value.length;
      const end = editor.selectionEnd ?? editor.value.length;
      editor.setRangeText(suffix, start, end, "end");
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: suffix }));
      return;
    }

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    const inserted = document.execCommand("insertText", false, suffix);
    if (!inserted) {
      const text = document.createTextNode(suffix);
      range.insertNode(text);
    }

    // Keep the actual URL in the message payload, but display a compact placeholder in the draft.
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const value = node.nodeValue || "";
      const item = items.find(candidate => value.includes(candidate.url));
      if (!item) continue;
      const index = value.indexOf(item.url);
      const fragment = document.createDocumentFragment();
      if (index > 0) fragment.append(document.createTextNode(value.slice(0, index)));
      const hidden = document.createElement("span");
      hidden.className = "ibm-draft-url";
      hidden.textContent = item.url;
      hidden.setAttribute("data-imagebridge-url", item.url);
      fragment.append(hidden);
      if (index + item.url.length < value.length) fragment.append(document.createTextNode(value.slice(index + item.url.length)));
      node.replaceWith(fragment);
    }
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: suffix }));
  }

  function handleSubmit(form, event) {
    if (replayingSubmit) {
      replayingSubmit = false;
      return;
    }
    const items = pendingUploads.filter(item => !item.submitted);
    if (!items.length) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      addUrlsToComposer(form, items);
      for (const item of items) item.submitted = true;
      renderTray();
      replayingSubmit = true;
      const submitter = event.submitter;
      setTimeout(() => {
        if (!form.isConnected) {
          replayingSubmit = false;
          return;
        }
        try {
          if (submitter && submitter.isConnected) form.requestSubmit(submitter);
          else form.requestSubmit();
        } catch (error) {
          replayingSubmit = false;
          setStatus("No se pudo enviar el enlace. Vuelve a pulsar Enviar.", true);
          console.error("ImageBridge submit retry failed:", error);
        }
      }, 80);
    } catch (error) {
      setStatus(error.message || "No se pudieron preparar los archivos.", true);
    }
  }

  function hideUrlInMessage(message, url) {
    const links = [...message.querySelectorAll("a[href]")];
    for (const link of links) {
      try {
        if (new URL(link.href).href === url) link.style.display = "none";
      } catch {}
    }
    const walker = document.createTreeWalker(message, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      if (node.parentElement?.closest(".ibm-message-preview")) continue;
      if ((node.nodeValue || "").includes(url)) node.nodeValue = node.nodeValue.replace(url, "").trim();
    }
  }

  function renderSentPreviews() {
    const messages = document.querySelectorAll('[data-message-author-role="user"]');
    for (const message of messages) {
      for (const item of uploadsByUrl.values()) {
        if (!(message.textContent || "").includes(item.url)) continue;
        // ChatGPT can re-render message markup; hide the address and restore our visual preview.
        hideUrlInMessage(message, item.url);
        const alreadyVisible = [...message.querySelectorAll(".ibm-message-preview")]
          .some(node => node.dataset.imagebridgeUrl === item.url);
        if (!alreadyVisible) {
          const preview = document.createElement("div");
          preview.className = "ibm-message-preview";
          preview.dataset.imagebridgeUrl = item.url;
          if (item.mime.startsWith("image/")) {
            const image = document.createElement("img");
            image.src = item.url;
            image.alt = item.name;
            image.loading = "lazy";
            preview.append(image);
          } else {
            const icon = document.createElement("span");
            icon.className = "ibm-preview-file-icon";
            icon.textContent = item.name.split(".").pop()?.toUpperCase() || "FILE";
            preview.append(icon);
          }
          const caption = document.createElement("span");
          caption.textContent = item.name;
          preview.append(caption);
          message.append(preview);
        }
        if (!item.rendered) {
          item.rendered = true;
          URL.revokeObjectURL(item.localPreview);
          const index = pendingUploads.indexOf(item);
          if (index >= 0) pendingUploads.splice(index, 1);
          renderTray();
        }
      }
    }
  }

  async function uploadFile(file) {
    const encoded = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = () => reject(new Error("No se pudo leer " + file.name));
      reader.readAsDataURL(file);
    });
    const result = await chrome.runtime.sendMessage({
      type: "IMAGEBRIDGE_UPLOAD",
      file: { name: file.name, type: file.type, data: encoded }
    });
    if (!result?.ok) throw new Error(result?.error || "No se pudo subir " + file.name + ".");
    const item = {
      name: file.name,
      mime: file.type,
      url: result.url,
      localPreview: URL.createObjectURL(file),
      submitted: false,
      rendered: false
    };
    pendingUploads.push(item);
    uploadsByUrl.set(item.url, item);
    renderTray();
  }

  async function processFiles(files) {
    const uploads = [...files].filter(file => FILE_TYPES.has(file.type));
    if (!uploads.length) {
      setStatus("Elige una imagen o documento compatible.", true);
      return;
    }
    for (const file of uploads) {
      try {
        setStatus("Subiendo " + file.name + "…");
        await uploadFile(file);
        setStatus("");
      } catch (error) {
        setStatus(file.name + ": " + error.message, true);
      }
    }
  }

  function install() {
    const form = document.querySelector("form");
    if (!form) return;
    currentForm = form;
    if (!form.querySelector(".ibm-button")) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ibm-button";
      button.textContent = "✧ ImageBridge";
      button.title = "Agregar una imagen alojada por ImageBridge";
      button.addEventListener("click", () => picker.click());
      form.append(button);
    }
    if (!form.dataset.imageBridgeSubmitHook) {
      form.dataset.imageBridgeSubmitHook = "true";
      form.addEventListener("submit", event => handleSubmit(form, event), true);
    }
    if (pendingUploads.length) renderTray();
  }

  picker = document.createElement("input");
  picker.type = "file";
  picker.accept = "image/*,.heic,.pdf,.txt,.md,.csv,.json,.rtf,.docx,.xlsx,.pptx";
  picker.multiple = true;
  picker.hidden = true;
  picker.dataset.imageBridgePicker = "true";
  picker.addEventListener("change", () => {
    if (picker.files?.length) processFiles(picker.files);
    picker.value = "";
  });
  document.documentElement.append(picker);

  const observer = new MutationObserver(() => {
    install();
    renderSentPreviews();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  install();
})();
