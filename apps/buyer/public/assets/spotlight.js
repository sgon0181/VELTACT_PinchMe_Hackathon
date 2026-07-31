/* Veltact v5 cursor spotlight.
   Any element with [data-glow] gets --mx/--my CSS vars tracking the cursor,
   consumed by the radial-gradient spotlight layers in its background-image.
   One passive document listener; inert on touch and reduced-motion. */
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (window.matchMedia('(hover: none)').matches) return;
  document.addEventListener('mousemove', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-glow]') : null;
    if (!el) return;
    var r = el.getBoundingClientRect();
    el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    el.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }, { passive: true });
})();
