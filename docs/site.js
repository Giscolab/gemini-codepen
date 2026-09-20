(() => {
  "use strict";

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const revealNodes = [...document.querySelectorAll(".reveal")];

  if (!reduced && "IntersectionObserver" in window) {
    document.documentElement.classList.add("reveal-ready");
    const io = new IntersectionObserver((entries, observer) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    revealNodes.forEach((node) => io.observe(node));
  } else {
    revealNodes.forEach((node) => node.classList.add("is-visible"));
  }

  const toggle = document.querySelector(".menu-toggle");
  const nav = document.getElementById("nav");
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    nav.addEventListener("click", (event) => {
      if (!event.target.closest("a")) return;
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    });
  }

  const shot = document.getElementById("projectShot");
  if (shot) {
    let stage = 0;
    shot.addEventListener("error", () => {
      stage += 1;
      if (stage === 1 && location.protocol !== "file:") {
        shot.src = shot.dataset.remote;
        return;
      }
      if (stage === 1 && location.protocol === "file:") {
        shot.src = shot.dataset.remote;
        return;
      }
      shot.src = shot.dataset.placeholder;
    });
  }
})();
