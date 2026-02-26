const els = document.querySelectorAll<HTMLElement>(".reveal");

const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        (e.target as HTMLElement).classList.add("is-in");
        io.unobserve(e.target);
      }
    }
  },
  { threshold: 0.12, rootMargin: "0px 0px -10% 0px" }
);

els.forEach((el) => io.observe(el));