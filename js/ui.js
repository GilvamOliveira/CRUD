"use strict";

(function () {
  const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  const openModals = new Map();
  const stack = [];

  const focusableItems = (modal) =>
    [...modal.querySelectorAll(FOCUSABLE)].filter(
      (element) => element.getClientRects().length > 0,
    );

  const openModal = (id, options = {}) => {
    const modal = document.getElementById(id);
    if (!modal) return;

    openModals.set(id, {
      ...options,
      previous: document.activeElement,
    });
    stack.push(id);
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");

    const target = options.initialFocus
      ? modal.querySelector(options.initialFocus)
      : focusableItems(modal)[0];
    if (target) setTimeout(() => target.focus(), 50);
  };

  const closeModal = (id) => {
    const modal = document.getElementById(id);
    if (!modal) return;

    const entry = openModals.get(id);
    openModals.delete(id);
    const index = stack.lastIndexOf(id);
    if (index >= 0) stack.splice(index, 1);

    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
    if (!stack.length) document.body.classList.remove("modal-open");

    if (entry?.previous && document.contains(entry.previous)) {
      entry.previous.focus();
    }
  };

  const isOpen = (id) => openModals.has(id);

  document.addEventListener("keydown", (event) => {
    if (!stack.length) return;
    const id = stack[stack.length - 1];
    const modal = document.getElementById(id);
    if (!modal) return;

    const entry = openModals.get(id);

    if (event.key === "Escape") {
      if (entry?.onEscape) {
        event.preventDefault();
        entry.onEscape();
      }
      return;
    }

    if (event.key !== "Tab") return;
    const items = focusableItems(modal);
    if (!items.length) return;

    const first = items[0];
    const last = items[items.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  const toast = (message, type = "info", options = {}) => {
    const container = document.getElementById("toasts");
    if (!container) return () => {};

    const item = document.createElement("div");
    item.className = `toast toast-${type}`;
    item.setAttribute("role", "status");

    const text = document.createElement("span");
    text.className = "toast-text";
    text.textContent = message;
    item.appendChild(text);

    let timer;

    const remove = () => {
      clearTimeout(timer);
      item.classList.add("toast-out");
      setTimeout(() => item.remove(), 200);
    };

    if (options.actionLabel && typeof options.onAction === "function") {
      const action = document.createElement("button");
      action.type = "button";
      action.className = "toast-action";
      action.textContent = options.actionLabel;
      action.addEventListener("click", async () => {
        remove();
        await options.onAction();
      });
      item.appendChild(action);
    }

    const close = document.createElement("button");
    close.type = "button";
    close.className = "toast-close";
    close.setAttribute("aria-label", "Fechar aviso");
    close.textContent = "✕";
    close.addEventListener("click", remove);
    item.appendChild(close);

    container.appendChild(item);
    timer = setTimeout(remove, options.duration ?? (options.actionLabel ? 8000 : 4500));
    return remove;
  };

  let confirmResolver = null;

  const confirm = (message, options = {}) => {
    const {
      title = "Confirmação",
      okLabel = "Confirmar",
      cancelLabel = "Cancelar",
      danger = true,
    } = options;

    document.getElementById("confirmTitle").textContent = title;
    document.getElementById("confirmMessage").textContent = message;

    const ok = document.getElementById("confirmOk");
    const cancel = document.getElementById("confirmCancel");
    ok.textContent = okLabel;
    cancel.textContent = cancelLabel;
    ok.className = `button ${danger ? "red" : "blue"}`;

    if (confirmResolver) confirmResolver(false);

    return new Promise((resolve) => {
      const finish = (value) => {
        confirmResolver = null;
        closeModal("confirmModal");
        resolve(value);
      };

      confirmResolver = finish;
      ok.onclick = () => finish(true);
      cancel.onclick = () => finish(false);

      openModal("confirmModal", {
        initialFocus: "#confirmCancel",
        onEscape: () => finish(false),
      });
    });
  };

  const loading = (show) => {
    const element = document.getElementById("loading");
    if (element) element.hidden = !show;
  };

  const clearFieldErrors = () => {
    document.querySelectorAll(".field-error").forEach((element) => {
      element.textContent = "";
    });
    document.querySelectorAll(".input-error").forEach((element) => {
      element.classList.remove("input-error");
      element.removeAttribute("aria-invalid");
    });
  };

  const setFieldErrors = (fields = {}) => {
    clearFieldErrors();
    let first = null;

    Object.entries(fields).forEach(([name, message]) => {
      const error = document.querySelector(`[data-error-for="${name}"]`);
      if (error) error.textContent = message;

      const input = document.getElementById(name);
      if (input) {
        input.classList.add("input-error");
        input.setAttribute("aria-invalid", "true");
        if (!first) first = input;
      }
    });

    if (first) first.focus();
  };

  const setModeBanner = (mode, authRequired = false) => {
    const banner = document.getElementById("modoBanner");
    const text = document.getElementById("modoTexto");
    const logout = document.getElementById("sair");
    if (!banner || !text) return;

    banner.hidden = false;
    banner.className = `mode-banner ${mode}`;
    text.textContent =
      mode === "api"
        ? "API REST + SQLite conectada"
        : "Modo local (localStorage)";

    if (logout) {
      logout.hidden = !(mode === "api" && authRequired);
    }
  };

  window.UI = {
    openModal,
    closeModal,
    isOpen,
    toast,
    confirm,
    loading,
    clearFieldErrors,
    setFieldErrors,
    setModeBanner,
  };
})();
