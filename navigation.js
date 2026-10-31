const sidebar = document.querySelector('#site-sidebar');
const pageMain = document.querySelector('.page-main');
let sidebarLoaded = false;
let certificateScrollPosition = 0;
let navigationController;
let sectionTrackingFrame = 0;
let revealObserver;

function applyTheme(theme) {
  const isDark = theme === 'dark';
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';

  document.querySelectorAll('.theme-toggle').forEach((themeToggle) => {
    themeToggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    themeToggle.setAttribute('aria-pressed', String(isDark));
  });
}

function updateMenuAccessibility() {
  const menuContainer = sidebar.querySelector('.sidebar');
  const menuToggle = sidebar.querySelector('.menu-toggle');
  const navPanel = sidebar.querySelector('.nav-panel');

  if (!menuContainer || !menuToggle || !navPanel) {
    return;
  }

  const isMobile = window.matchMedia('(max-width: 1050px)').matches;
  const isOpen = isMobile && menuContainer.classList.contains('is-menu-open');
  navPanel.inert = isMobile && !isOpen;
  navPanel.setAttribute('aria-hidden', String(isMobile && !isOpen));
  if (isOpen) {
    navPanel.setAttribute('role', 'dialog');
    navPanel.setAttribute('aria-modal', 'true');
    navPanel.setAttribute('aria-label', 'Navigation menu');
  } else {
    navPanel.removeAttribute('role');
    navPanel.removeAttribute('aria-modal');
    navPanel.removeAttribute('aria-label');
  }
  menuToggle.setAttribute('aria-expanded', String(isOpen));
  menuToggle.setAttribute('aria-label', isOpen ? 'Close navigation menu' : 'Open navigation menu');
  document.body.classList.toggle('menu-open', isOpen);
}

function setMenuOpen(isOpen, restoreFocus = false) {
  const menuContainer = sidebar.querySelector('.sidebar');
  if (!menuContainer) {
    return;
  }

  menuContainer.classList.toggle('is-menu-open', isOpen);
  updateMenuAccessibility();

  if (isOpen) {
    sidebar.querySelector('.side-nav a')?.focus();
  } else if (restoreFocus) {
    sidebar.querySelector('.menu-toggle')?.focus();
  }
}

async function loadSidebar() {
  try {
    const response = await fetch('sidebar.html');
    if (!response.ok) {
      throw new Error(`Sidebar request failed with status ${response.status}`);
    }

    sidebar.innerHTML = await response.text();
    sidebarLoaded = true;
    sidebar.setAttribute('aria-busy', 'false');
    updateMenuAccessibility();
    updateActiveNavigation();
    scheduleActiveSectionUpdate();
    applyTheme(document.documentElement.dataset.theme);
  } catch (error) {
    console.error('Unable to load the portfolio sidebar.', error);
    sidebar.setAttribute('aria-busy', 'false');
    sidebar.setAttribute('role', 'alert');
    sidebar.textContent = 'Navigation could not be loaded. Use your browser controls or reload the page.';
  }
}

function updateActiveNavigation(sectionId) {
  const isHomePage = (window.location.pathname.split('/').pop() || 'index.html') === 'index.html';
  const activeSection = sectionId || (isHomePage ? window.location.hash.slice(1) || 'home' : '');
  const currentNavigationSection = activeSection === 'about' ? 'home' : activeSection;

  sidebar.querySelectorAll('.side-nav a').forEach((link) => {
    const isCurrentSection = Boolean(currentNavigationSection) && new URL(link.href).hash.slice(1) === currentNavigationSection;
    link.classList.toggle('active', isCurrentSection);

    if (isCurrentSection) {
      link.setAttribute('aria-current', 'location');
    } else {
      link.removeAttribute('aria-current');
    }
  });
}

function scheduleActiveSectionUpdate() {
  if ((window.location.pathname.split('/').pop() || 'index.html') !== 'index.html') {
    return;
  }

  if (sectionTrackingFrame) {
    return;
  }

  sectionTrackingFrame = window.requestAnimationFrame(() => {
    sectionTrackingFrame = 0;
    const activationLine = sidebar.getBoundingClientRect().height + 42;
    const positions = [...document.querySelectorAll('[data-nav-section]')].map((section) => ({
      section,
      rect: section.getBoundingClientRect()
    }));
    const activeSection = positions
      .filter(({ rect }) => rect.top <= activationLine && rect.bottom > activationLine)
      .sort((first, second) => second.rect.top - first.rect.top)[0]
      || positions
        .filter(({ rect }) => rect.top > activationLine)
        .sort((first, second) => first.rect.top - second.rect.top)[0];

    if (activeSection) {
      updateActiveNavigation(activeSection.section.id);
    }
  });
}

function observeSectionEntrances() {
  revealObserver?.disconnect();

  if (!('IntersectionObserver' in window)) {
    return;
  }

  revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px -12% 0px' });

  document.querySelectorAll('.about-section, .portfolio-section').forEach((section) => {
    revealObserver.observe(section);
  });
}

function moveLightboxesToBody(container) {
  container.querySelectorAll('.lightbox').forEach((lightbox) => {
    document.body.append(lightbox);
  });
}

function updatePageContent(nextMain, nextTitle, nextDescription) {
  document.querySelectorAll('.lightbox').forEach((lightbox) => lightbox.remove());
  pageMain.classList.remove('is-entering');
  void pageMain.offsetWidth;
  pageMain.innerHTML = nextMain.innerHTML;
  moveLightboxesToBody(pageMain);
  pageMain.classList.add('is-entering');
  document.title = nextTitle;

  const description = document.querySelector('meta[name="description"]');
  if (description && nextDescription) {
    description.content = nextDescription;
  }

  applyTheme(document.documentElement.dataset.theme);
  updateActiveNavigation();
  scheduleActiveSectionUpdate();
  observeSectionEntrances();
  window.scrollTo(0, 0);
}

async function navigateTo(url, addHistoryEntry = true) {
  navigationController?.abort();
  const controller = new AbortController();
  navigationController = controller;

  let page;
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Page request failed with status ${response.status}`);
    }

    page = new DOMParser().parseFromString(await response.text(), 'text/html');
  } catch (error) {
    if (controller.signal.aborted) {
      return;
    }

    console.error(`Unable to load ${url.href}; falling back to regular navigation.`, error);
    window.location.assign(url.href);
    return;
  }

  const nextMain = page.querySelector('.page-main');
  if (!nextMain) {
    console.error(`Unable to load ${url.href}: the page has no main content area.`);
    window.location.assign(url.href);
    return;
  }

  const update = () => updatePageContent(
    nextMain,
    page.title,
    page.querySelector('meta[name="description"]')?.content
  );

  if (addHistoryEntry) {
    window.history.pushState({}, '', url);
  }

  update();

  if (url.hash) {
    const target = document.getElementById(url.hash.slice(1));
    if (target) {
      target.scrollIntoView();
      updateActiveNavigation(target.id);
    }
  }
}

document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) {
    return;
  }

  const menuToggle = event.target.closest('.menu-toggle');
  if (menuToggle) {
    setMenuOpen(!sidebar.querySelector('.sidebar')?.classList.contains('is-menu-open'));
    return;
  }

  if (event.target.closest('.menu-backdrop')) {
    setMenuOpen(false, true);
    return;
  }

  const themeToggle = event.target.closest('.theme-toggle');
  if (themeToggle) {
    const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('portfolio-theme', nextTheme);
    applyTheme(nextTheme);
    return;
  }

  const link = event.target.closest('a');
  if (!link) {
    return;
  }

  if (link.matches('.side-nav a')) {
    updateActiveNavigation(new URL(link.href, window.location.href).hash.slice(1));
    if (sidebar.querySelector('.sidebar')?.classList.contains('is-menu-open')) {
      setMenuOpen(false);
    }
  }

  if (link.matches('.nav-profile') && sidebar.querySelector('.sidebar')?.classList.contains('is-menu-open')) {
    setMenuOpen(false);
  }

  const lightboxTrigger = link.matches('.project-actions a[href^="#certificate-"]');
  const lightboxClose = link.matches('.lightbox-backdrop, .lightbox-close');
  if (lightboxTrigger) {
    event.preventDefault();
    certificateScrollPosition = window.scrollY;
    document.querySelector(link.getAttribute('href'))?.classList.add('is-open');
    return;
  }

  if (lightboxClose) {
    event.preventDefault();
    link.closest('.lightbox')?.classList.remove('is-open');
    window.scrollTo(0, certificateScrollPosition);
    return;
  }

  if (!sidebarLoaded || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target || link.hasAttribute('download')) {
    return;
  }

  const url = new URL(link.href, window.location.href);
  if (url.origin !== window.location.origin || !url.pathname.endsWith('.html') || url.pathname === window.location.pathname) {
    return;
  }

  event.preventDefault();
  navigateTo(url);
});

document.addEventListener('keydown', (event) => {
  const menuContainer = sidebar.querySelector('.sidebar');
  if (!menuContainer?.classList.contains('is-menu-open')) {
    return;
  }

  if (event.key === 'Escape') {
    setMenuOpen(false, true);
    return;
  }

  if (event.key === 'Tab') {
    const menuToggle = sidebar.querySelector('.menu-toggle');
    const focusableElements = [
      ...sidebar.querySelectorAll('.nav-panel a[href], .nav-panel button:not([disabled])'),
      menuToggle
    ].filter(Boolean);
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }
});

window.addEventListener('popstate', () => {
  navigateTo(new URL(window.location.href), false);
});

window.addEventListener('scroll', scheduleActiveSectionUpdate, { passive: true });
window.addEventListener('resize', () => {
  if (!window.matchMedia('(max-width: 1050px)').matches) {
    setMenuOpen(false);
  } else {
    updateMenuAccessibility();
  }
  scheduleActiveSectionUpdate();
});

moveLightboxesToBody(document);
applyTheme(localStorage.getItem('portfolio-theme') || 'dark');
observeSectionEntrances();
loadSidebar();
