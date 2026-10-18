const menuBtn = document.querySelector('.menu-btn');
const siteNav = document.querySelector('.site-nav');
if (menuBtn && siteNav) {
    menuBtn.addEventListener('click', () => {
        siteNav.classList.toggle('open');
    });
    siteNav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => siteNav.classList.remove('open')));
}
