(function () {
  function preserveCodeBlockBehavior() {
    document.querySelectorAll('.post-content').forEach(function (element) {
      element.classList.add('code-block-unshrink');
    });
  }

  function run() {
    preserveCodeBlockBehavior();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  document.addEventListener('pjax:complete', run);
})();
