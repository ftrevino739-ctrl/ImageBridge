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

  function toast(message, url) {
    document.querySelector(".ibm-toast")?.remove();
    const box = document.createElement("div");
    box.className = "ibm-toast";
    const label = document.createElement("span");
    label.textContent = message;
    box.append(label);
    if (url) {
      const copy = document.createElement("button");
      copy.textContent = "Copy URL";
      copy.onclick = async () => {
        await navigator.clipboard.writeText(url);
        copy.textContent = "Copied ✓";
      };
      box.append(copy);
    }
    document.body.append(box);
    setTimeout(() => box.remove(), 9000);
  }

  function base64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = () => reject(new Error("Could not read " + file.name));
      reader.readAsDataURL(file);
    });
  }

  function attachNative(file) {
    const candidates = [...document.querySelectorAll('input[type="file"]')]
      .filter(input => !input.dataset.imageBridgePicker && !input.disabled);
    const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
    const target = candidates.find(input => {
      const accept = (input.accept || "").toLowerCase();
      return !accept || accept.includes("*/*") || accept.includes(file.type.toLowerCase()) || accept.split(",").some(value => value.trim() === ext);
    });
    if (!target) return false;
    try {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      target.files = transfer.files;
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch { return false; }
  }

  async function processFiles(files) {
    const uploads = [...files].filter(file => FILE_TYPES.has(file.type));
    if (!uploads.length) return toast("Choose a supported image or document (PDF, TXT, MD, CSV, JSON, RTF, DOCX, XLSX or PPTX).");
    for (const file of uploads) {
      try {
        toast("ImageBridge: uploading " + file.name + "…");
        const encoded = await base64(file);
        const result = await chrome.runtime.sendMessage({
          type: "IMAGEBRIDGE_UPLOAD",
          file: { name: file.name, type: file.type, data: encoded }
        });
        if (!result?.ok) throw new Error(result?.error || "Upload failed.");
        const attached = attachNative(file);
        toast(attached
          ? file.name + " hosted and sent to ChatGPT's native attachment flow."
          : file.name + " hosted. Native ChatGPT attachment was not detected; URL is not automatically visible to the model.",
          result.url);
      } catch (error) {
        toast("ImageBridge: " + error.message);
      }
    }
  }

  function install() {
    const form = document.querySelector("form");
    if (!form || form.querySelector(".ibm-button")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ibm-button";
    button.textContent = "✧ ImageBridge";
    button.title = "Upload an image with ImageBridge";
    button.addEventListener("click", () => picker.click());
    form.append(button);
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

  const observer = new MutationObserver(install);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  install();
})();
