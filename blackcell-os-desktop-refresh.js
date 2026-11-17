/* BLACKCELL OS desktop widget visibility. No account data or privileges changed. */
(() => {
  "use strict";
  function init() {
    const shell = document.getElementById("desktop");
    const panel = document.getElementById("bcSystemOverview");
    const toggle = document.getElementById("bcWidgetsToggle");
    if (!shell || !panel || !toggle) return;
    function setVisible(visible) {
      shell.classList.toggle("bc-widgets-hidden", !visible);
      toggle.setAttribute("aria-expanded", String(visible));
      toggle.setAttribute("aria-label", visible ? "Hide overview widgets" : "Show overview widgets");
      toggle.title = visible ? "Hide overview widgets" : "Show overview widgets";
      // The OS already observes workspace geometry; notify any other layout listeners.
      requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    }
    toggle.addEventListener("click", () => setVisible(shell.classList.contains("bc-widgets-hidden")));
    setVisible(true);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else init();
})();
