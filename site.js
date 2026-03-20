// apply theme before paint
(function(){
  var t = localStorage.getItem('lab-theme') || 'dark';
  document.documentElement.dataset.theme = t;
})();

var MOON = 'M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z';
var SUN  = 'M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12z';

function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem('lab-theme', t);
  var path  = document.getElementById('themeIconPath');
  var label = document.getElementById('themeLabel');
  if (path)  path.setAttribute('d', t === 'dark' ? MOON : SUN);
  if (label) label.textContent = t === 'dark' ? 'Light' : 'Dark';
}

document.addEventListener('DOMContentLoaded', function() {
  applyTheme(localStorage.getItem('lab-theme') || 'dark');

  var btn = document.getElementById('themeBtn');
  if (btn) btn.addEventListener('click', function() {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });

  // hamburger
  var burger    = document.getElementById('hamburger');
  var mobileNav = document.getElementById('mobileNav');
  if (burger && mobileNav) {
    burger.addEventListener('click', function() {
      var open = mobileNav.classList.toggle('open');
      burger.classList.toggle('open', open);
    });
    mobileNav.querySelectorAll('a').forEach(function(a) {
      a.addEventListener('click', function() {
        mobileNav.classList.remove('open');
        burger.classList.remove('open');
      });
    });
  }

  // scroll reveal
  var items = document.querySelectorAll('.fade-item');
  if ('IntersectionObserver' in window) {
    var obs = new IntersectionObserver(function(entries) {
      entries.forEach(function(e) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          e.target.querySelectorAll('.skfill').forEach(function(b) { b.style.width = b.dataset.w + '%'; });
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });
    items.forEach(function(i) { obs.observe(i); });
  } else {
    items.forEach(function(i) {
      i.classList.add('in');
      i.querySelectorAll('.skfill').forEach(function(b) { b.style.width = b.dataset.w + '%'; });
    });
  }
});
