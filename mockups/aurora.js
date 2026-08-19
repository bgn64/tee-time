(function () {
  var root = document.documentElement;
  var media = window.matchMedia('(prefers-color-scheme: dark)');
  var themePreference = 'system';
  var themeButtons = document.querySelectorAll('[data-theme-choice]');
  var resolvedTheme = document.getElementById('resolvedTheme');

  function resolveTheme() {
    return themePreference === 'system'
      ? (media.matches ? 'dark' : 'light')
      : themePreference;
  }

  function applyTheme() {
    var resolved = resolveTheme();
    root.dataset.theme = resolved;
    themeButtons.forEach(function (button) {
      button.setAttribute(
        'aria-pressed',
        String(button.getAttribute('data-theme-choice') === themePreference)
      );
    });
    if (resolvedTheme) {
      resolvedTheme.textContent =
        themePreference === 'system'
          ? 'System · ' + resolved
          : resolved;
    }
    document.querySelectorAll('[data-system-summary]').forEach(function (label) {
      label.textContent =
        'Following system · ' + (media.matches ? 'Dark' : 'Light');
    });
  }

  themeButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      themePreference = button.getAttribute('data-theme-choice') || 'system';
      applyTheme();
    });
  });

  function handleSystemThemeChange() {
    if (themePreference === 'system') {
      applyTheme();
    }
  }

  if (media.addEventListener) {
    media.addEventListener('change', handleSystemThemeChange);
  } else {
    media.addListener(handleSystemThemeChange);
  }

  var filterButtons = document.querySelectorAll('[data-screen-filter]');
  var groupedScreens = document.querySelectorAll('[data-screen-group]');

  filterButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      var filter = button.getAttribute('data-screen-filter') || 'all';
      filterButtons.forEach(function (candidate) {
        candidate.setAttribute('aria-pressed', String(candidate === button));
      });
      groupedScreens.forEach(function (element) {
        element.hidden =
          filter !== 'all' &&
          element.getAttribute('data-screen-group') !== filter;
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  var tees = document.getElementById('cdTees');
  if (tees) {
    var rows = tees.querySelectorAll('.trow');
    var nameEl = document.getElementById('cdScName');
    var totEl = document.getElementById('cdScTotal');
    var front = document.querySelectorAll('#cdFront .yd');
    var back = document.querySelectorAll('#cdBack .yd');

    function applyTee(row) {
      rows.forEach(function (candidate) {
        candidate.classList.remove('sel');
        var check = candidate.querySelector('.schk');
        if (check) check.remove();
      });
      row.classList.add('sel');
      if (!row.querySelector('.schk')) {
        var check = document.createElement('span');
        check.className = 'schk';
        check.textContent = '✓';
        row.appendChild(check);
      }
      row.getAttribute('data-front').split(',').forEach(function (value, index) {
        if (front[index]) front[index].textContent = value;
      });
      row.getAttribute('data-back').split(',').forEach(function (value, index) {
        if (back[index]) back[index].textContent = value;
      });
      if (nameEl) {
        nameEl.textContent = row.getAttribute('data-tee') + ' · par 72';
      }
      if (totEl) {
        totEl.textContent = 'Par 72 · ' + row.getAttribute('data-total');
      }
    }

    rows.forEach(function (row) {
      row.addEventListener('click', function () {
        applyTee(row);
      });
    });
  }

  applyTheme();
})();
