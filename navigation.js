const sidebar = document.querySelector('#site-sidebar');
const pageMain = document.querySelector('.page-main');
let sidebarLoaded = false;
let certificateScrollPosition = 0;
let navigationController;

async function loadSidebar() {
  try {
    const response = await fetch('sidebar.html');
    if (!response.ok) {
      throw new Error(`Sidebar request failed with status ${response.status}`);
    }

    sidebar.innerHTML = await response.text();
    sidebarLoaded = true;
    sidebar.setAttribute('aria-busy', 'false');
    updateActiveNavigation();
  } catch (error) {
    console.error('Unable to load the portfolio sidebar.', error);
    sidebar.setAttribute('aria-busy', 'false');
    sidebar.setAttribute('role', 'alert');
    sidebar.textContent = 'Navigation could not be loaded. Use your browser controls or reload the page.';
  }
}

function updateActiveNavigation() {
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';

  sidebar.querySelectorAll('.side-nav a').forEach((link) => {
    const isCurrentPage = new URL(link.href).pathname.split('/').pop() === currentPage;
    link.classList.toggle('active', isCurrentPage);

    if (isCurrentPage) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });
}

function updatePageContent(nextMain, nextTitle, nextDescription) {
  pageMain.classList.remove('is-entering');
  void pageMain.offsetWidth;
  pageMain.innerHTML = nextMain.innerHTML;
  pageMain.classList.add('is-entering');
  document.title = nextTitle;

  const description = document.querySelector('meta[name="description"]');
  if (description && nextDescription) {
    description.content = nextDescription;
  }

  updateActiveNavigation();
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
}

document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) {
    return;
  }

  const link = event.target.closest('a');
  if (!link) {
    return;
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

window.addEventListener('popstate', () => {
  navigateTo(new URL(window.location.href), false);
});

loadSidebar();
