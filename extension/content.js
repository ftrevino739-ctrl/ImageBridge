(() => {
  if (window.__imageBridgeModLoaded) return;
  window.__imageBridgeModLoaded = true;
  console.info("[ImageBridge] Mod loaded on", location.href);

  const FILE_TYPES = new Set([
    "image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/heic",
    "application/pdf", "text/plain", "text/markdown", "text/csv", "application/json", "application/rtf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ]);
  const MIME_BY_EXTENSION = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
    gif: "image/gif", avif: "image/avif", heic: "image/heic", pdf: "application/pdf",
    txt: "text/plain", md: "text/markdown", csv: "text/csv", json: "application/json",
    rtf: "application/rtf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  };
  const getMime = file => file.type || MIME_BY_EXTENSION[file.name.split(".").pop()?.toLowerCase()] || "";
  const ADD_PHOTOS_LABELS = [
    "add photos & files", "add photos and files", "add photos or files",
    "add files or photos", "agregar fotos y archivos", "añadir fotos y archivos",
    "agregar archivos y fotos", "adjuntar fotos y archivos"
  ];

  let picker;
  let currentForm = null;
  const pendingUploads = [];
  const uploadsByUrl = new Map();
  let replayingSubmit = false;
  let statusMessage = "";
  let statusIsError = false;

  const normalize = value => String(value || "").replace(/\s+/g, " ").trim().toLowerCase();

  function setStatus(message, isError = false) {
    statusMessage = message;
    statusIsError = isError;
    renderTray();
  }

  function getComposer() {
    return document.querySelector("#prompt-textarea, [data-testid='composer-text-input'], form [contenteditable='true'], form textarea");
  }

  function getComposerForm() {
    const editor = getComposer();
    return editor?.closest("form") || document.querySelector("form");
  }

  function renderTray() {
    if (!currentForm?.isConnected) return;
    let tray = currentForm.querySelector(".ibm-preview-tray");
    if (!tray) {
      tray = document.createElement("div");
      tray.className = "ibm-preview-tray";
      const editor = currentForm.querySelector("#prompt-textarea, [contenteditable='true'], textarea");
      if (editor?.parentElement) editor.parentElement.insertBefore(tray, editor);
      else currentForm.prepend(tray);
    }
    tray.replaceChildren();
    const visibleUploads = pendingUploads.filter(item => !item.submitted);
    tray.hidden = !visibleUploads.length && !statusMessage;

    if (visibleUploads.length) {
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
        details.append(name);

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "ibm-preview-remove";
        remove.textContent = "×";
        remove.title = "Quitar archivo";
        remove.setAttribute("aria-label", "Quitar " + item.name);
        remove.addEventListener("click", () => {
          const index = pendingUploads.indexOf(item);
          if (index >= 0) pendingUploads.splice(index, 1);
          uploadsByUrl.delete(item.url);
          URL.revokeObjectURL(item.localPreview);
          renderTray();
        });

        card.append(details, remove);
        list.append(card);
      }
      tray.append(list);
    }

    if (statusMessage) {
      const status = document.createElement("div");
      status.className = "ibm-preview-status";
      status.textContent = statusMessage;
      status.dataset.error = statusIsError ? "true" : "false";
      tray.append(status);
    }
  }

  function findAddPhotosMenuItem() {
    const candidates = [...document.querySelectorAll(
      '[role="menuitem"], [role="option"], [data-radix-collection-item], [tabindex="0"], [role="button"], button'
    )].filter(element => element.isConnected && element.getClientRects().length);

    const matches = candidates.map(element => {
      const text = normalize([
        element.getAttribute("aria-label"),
        element.getAttribute("data-testid"),
        element.innerText,
        element.textContent
      ].filter(Boolean).join(" "));
      const english = text.includes("add photos") && text.includes("files");
      const spanish = (text.includes("agregar") || text.includes("añadir")) &&
        (text.includes("fotos") || text.includes("imágenes")) &&
        (text.includes("archivos") || text.includes("ficheros"));
      return { element, text, matches: english || spanish };
    }).filter(item => item.matches && item.text.length < 180);

    matches.sort((a, b) => a.text.length - b.text.length);
    return matches[0]?.element || null;
  }

  function installPlusMenuItem() {
    const nativeItem = findAddPhotosMenuItem();
    if (!nativeItem?.parentElement) return false;
    if (nativeItem.parentElement.querySelector('[data-imagebridge-menu-item="true"]')) return true;

    // Clone the actual visible native row to inherit ChatGPT's menu layout and theme.
    const item = nativeItem.cloneNode(true);
    item.removeAttribute("id");
    item.removeAttribute("data-testid");
    item.removeAttribute("aria-controls");
    item.removeAttribute("aria-describedby");
    item.querySelectorAll("[id], [data-testid], [aria-controls], [aria-describedby]").forEach(node => {
      node.removeAttribute("id");
      node.removeAttribute("data-testid");
      node.removeAttribute("aria-controls");
      node.removeAttribute("aria-describedby");
    });
    item.dataset.imagebridgeMenuItem = "true";
    item.setAttribute("aria-label", "ImageBridge");
    item.setAttribute("title", "Seleccionar archivos con ImageBridge");
    if (item.tagName === "BUTTON") item.type = "button";
    else {
      item.setAttribute("role", nativeItem.getAttribute("role") || "menuitem");
      item.tabIndex = nativeItem.tabIndex >= 0 ? nativeItem.tabIndex : 0;
    }

    const textWalker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
    let labelTextNode = null;
    while (textWalker.nextNode()) {
      const candidate = normalize(textWalker.currentNode.nodeValue);
      if ((candidate.includes("add photos") && candidate.includes("files")) ||
          ((candidate.includes("agregar") || candidate.includes("añadir")) &&
           (candidate.includes("fotos") || candidate.includes("imágenes")) &&
           (candidate.includes("archivos") || candidate.includes("ficheros")))) {
        labelTextNode = textWalker.currentNode;
        break;
      }
    }
    if (labelTextNode) labelTextNode.nodeValue = "✧ ImageBridge";
    else {
      const label = item.querySelector("span, p, div") || item;
      label.textContent = "✧ ImageBridge";
    }

    item.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      picker.click();
    });
    item.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        item.click();
      }
    });
    nativeItem.parentElement.insertBefore(item, nativeItem.nextSibling);
    console.info("[ImageBridge] Added ImageBridge to ChatGPT's + menu.");
    return true;
  }

  function addUrlsToComposer(form, items) {
    const editor = form.querySelector("#prompt-textarea, [data-testid='composer-text-input'], [contenteditable='true'], textarea");
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
    if (!inserted) range.insertNode(document.createTextNode(suffix));

    // Preserve the literal URL in the editor's text content while hiding its glyphs.
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const value = node.nodeValue || "";
      const matched = items.find(candidate => value.includes(candidate.url));
      if (!matched) continue;
      const index = value.indexOf(matched.url);
      const fragment = document.createDocumentFragment();
      if (index > 0) fragment.append(document.createTextNode(value.slice(0, index)));
      const hidden = document.createElement("span");
      hidden.className = "ibm-draft-url";
      hidden.textContent = matched.url;
      hidden.setAttribute("data-imagebridge-url", matched.url);
      fragment.append(hidden);
      if (index + matched.url.length < value.length) fragment.append(document.createTextNode(value.slice(index + matched.url.length)));
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
          for (const item of items) item.submitted = false;
          setStatus("No se pudo enviar. Vuelve a pulsar Enviar.", true);
          console.error("ImageBridge submit retry failed:", error);
        }
      }, 80);
    } catch (error) {
      setStatus(error.message || "No se pudieron preparar los archivos.", true);
    }
  }

  function hideUrlInMessage(message, url) {
    for (const link of message.querySelectorAll("a[href]")) {
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
      file: { name: file.name, type: getMime(file), data: encoded }
    });
    if (!result?.ok) throw new Error(result?.error || "No se pudo subir " + file.name + ".");
    const item = {
      name: file.name,
      mime: getMime(file),
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
    const uploads = [...files].filter(file => FILE_TYPES.has(getMime(file)));
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

  function installPlusButtonHook() {
    const plus = document.querySelector('[data-testid="composer-plus-btn"], button[aria-label*="Add files and more" i], button[aria-label*="Agregar archivos" i], button[aria-label*="Adjuntar archivos" i]');
    if (!plus || plus.dataset.imageBridgePlusHook === "true") return;
    plus.dataset.imageBridgePlusHook = "true";
    plus.addEventListener("click", () => {
      // ChatGPT mounts the popover asynchronously. Retry after its menu rows exist.
      for (const delay of [40, 120, 260, 500]) {
        setTimeout(() => {
          const inserted = installPlusMenuItem();
          if (!inserted && delay === 500) {
            console.warn("[ImageBridge] Could not find the Add photos & files row. Check the current ChatGPT menu labels/DOM.");
          }
        }, delay);
      }
    });
  }

  function installComposerHooks() {
    const form = getComposerForm();
    if (!form) return;
    const changed = form !== currentForm;
    currentForm = form;
    if (!form.dataset.imageBridgeSubmitHook) {
      form.dataset.imageBridgeSubmitHook = "true";
      form.addEventListener("submit", event => handleSubmit(form, event), true);
    }
    if (changed || !form.querySelector(".ibm-preview-tray")) renderTray();
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
    installPlusButtonHook();
    installPlusMenuItem();
    installComposerHooks();
    renderSentPreviews();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  installPlusButtonHook();
  installPlusMenuItem();
  installComposerHooks();
})();
