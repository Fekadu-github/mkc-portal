const year = document.getElementById("year");
year.textContent = new Date().getFullYear();

const buttons = document.querySelectorAll(".lang-btn");
const translatable = document.querySelectorAll("[data-en][data-am]");
const menuBtn = document.querySelector(".menu-btn");
const mobileNav = document.querySelector(".mobile-nav");

function setLanguage(lang) {
  document.documentElement.lang = lang === "am" ? "am" : "en";
  document.body.classList.toggle("am", lang === "am");
  translatable.forEach(el => {
    el.textContent = el.dataset[lang];
  });
  buttons.forEach(btn => btn.classList.toggle("active", btn.dataset.lang === lang));
  localStorage.setItem("amanuel_meserete_kristos_language", lang);
}

buttons.forEach(btn => btn.addEventListener("click", () => setLanguage(btn.dataset.lang)));

menuBtn.addEventListener("click", () => {
  const open = mobileNav.classList.toggle("open");
  menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
  mobileNav.setAttribute("aria-hidden", open ? "false" : "true");
});

mobileNav.querySelectorAll("a").forEach(a => {
  a.addEventListener("click", () => {
    mobileNav.classList.remove("open");
    menuBtn.setAttribute("aria-expanded", "false");
    mobileNav.setAttribute("aria-hidden", "true");
  });
});

const saved = localStorage.getItem("amanuel_meserete_kristos_language");
setLanguage(saved === "am" ? "am" : "en");

// Sticky header gains a shadow once the page scrolls
const header = document.querySelector(".site-header");
if (header) {
  const toggleHeaderShadow = () => header.classList.toggle("scrolled", window.scrollY > 8);
  toggleHeaderShadow();
  window.addEventListener("scroll", toggleHeaderShadow, { passive: true });
}

// Gentle reveal-on-scroll for cards and section copy
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const revealTargets = document.querySelectorAll(
  ".update-card, .event-card, .sermon-card, .motto-inner, .section-label, .section h2"
);
revealTargets.forEach(el => el.classList.add("reveal"));
if (!reduceMotion && "IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  revealTargets.forEach(el => observer.observe(el));
} else {
  revealTargets.forEach(el => el.classList.add("in"));
}
