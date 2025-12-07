document.addEventListener('DOMContentLoaded', function () {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('mainContent');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    if (!sidebar || !mainContent) return;

    const isSidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    let isMobile = window.innerWidth < 768;

    if (isMobile) {
        sidebar.classList.add('sidebar-mobile-hidden');
        mainContent.classList.add('main-content-mobile-full');
    } else if (isSidebarCollapsed) {
        sidebar.classList.add('sidebar-collapsed');
        mainContent.classList.add('ml-20');
    } else {
        sidebar.classList.add('sidebar-expanded');
        mainContent.classList.add('ml-64');
    }

    sidebarToggle?.addEventListener('click', () => {
        const collapsed = sidebar.classList.contains('sidebar-collapsed');

        sidebar.classList.toggle('sidebar-collapsed', !collapsed);
        sidebar.classList.toggle('sidebar-expanded', collapsed);
        mainContent.classList.toggle('ml-20', !collapsed);
        mainContent.classList.toggle('ml-64', collapsed);

        const icon = sidebarToggle.querySelector('i');
        if (icon) {
            icon.className = collapsed
                ? 'bi bi-chevron-left text-sm'
                : 'bi bi-chevron-right text-sm';
        }

        localStorage.setItem('sidebarCollapsed', !collapsed);
    });

    mobileMenuToggle?.addEventListener('click', () => {
        sidebar.classList.toggle('sidebar-mobile-hidden');
        sidebar.classList.toggle('sidebar-mobile-visible');
        sidebarOverlay?.classList.toggle('hidden');
    });

    sidebarOverlay?.addEventListener('click', () => {
        sidebar.classList.add('sidebar-mobile-hidden');
        sidebar.classList.remove('sidebar-mobile-visible');
        sidebarOverlay.classList.add('hidden');
    });

    window.addEventListener('resize', () => {
        const nowMobile = window.innerWidth < 768;
        if (nowMobile === isMobile) return;

        isMobile = nowMobile;

        sidebar.className = '';
        mainContent.className = '';

        if (isMobile) {
            sidebar.classList.add('sidebar-mobile-hidden');
            mainContent.classList.add('main-content-mobile-full');
        } else {
            const collapsed = localStorage.getItem('sidebarCollapsed') === 'true';
            sidebar.classList.add(collapsed ? 'sidebar-collapsed' : 'sidebar-expanded');
            mainContent.classList.add(collapsed ? 'ml-20' : 'ml-64');
        }

        sidebarOverlay?.classList.add('hidden');
    });
});
