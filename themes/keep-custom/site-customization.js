'use strict';

const fs = require('fs');
const path = require('path');

const customAssetsDir = __dirname;
const customAssets = [
  'css/APlayer.min.css',
  'css/site-custom.css',
  'js/APlayer.min.js',
  'js/Meting.min.js',
  'js/leaves.js',
  'js/lifeTime.js',
  'js/site-custom.js'
];

module.exports = function registerKeepCustomization(hexo) {

// Publish theme custom assets without placing them in the blog's source tree.
hexo.extend.generator.register('keep-custom-assets', function () {
  return customAssets.map(asset => ({
    path: asset,
    data: () => fs.createReadStream(path.join(customAssetsDir, asset))
  }));
});

const HEAD_SNIPPET = `
  <!-- Site SEO and analytics -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-CLX32WF4R1"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments)}
    gtag('js', new Date());
    gtag('config', 'G-CLX32WF4R1');
  </script>
  <script>
    (function(c,l,a,r,i,t,y){
      c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
      t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
      y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window,document,"clarity","script","yj7nocwazf");
  </script>
  <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"281999cc46a948d3b8199c1eb621f11e"}'></script>
`;

const PLAYER_SNIPPET = `
  <div id="aplayer">
    <meting-js server="netease" type="playlist" id="7345595717" api="https://api.injahow.cn/meting/?server=:server&type=:type&id=:id&r=:r" fixed="true" mini="true" autoplay="false" listFolded="true" order="random" preload="none"></meting-js>
  </div>
  <script src="/js/APlayer.min.js"></script>
  <script src="/js/Meting.min.js"></script>
`;

const FOOTER_SNIPPET = `
  <div class="site-runtime" style="color:var(--text-color-4);">
    <span id="timeDate">载入天数...</span><span id="times">载入时分秒...</span>(～￣▽￣)～
  </div>
  <a class="site-moe-icp" href="https://icp.gov.moe/?keyword=20222450" target="_blank" rel="noopener">萌ICP备20222450号</a>
`;

hexo.extend.filter.register('after_render:html', function (html, data) {
  if (!data.path || !data.path.endsWith('.html')) return html;

  let result = html;
  if (!result.includes('Site SEO and analytics')) {
    result = result.replace('</head>', `${HEAD_SNIPPET}</head>`);
  }
  if (data.path.startsWith('tags/') && !result.includes('name="robots" content="noindex,follow"')) {
    result = result.replace('</head>', '  <meta name="robots" content="noindex,follow">\n</head>');
  }
  if (!result.includes('class="site-runtime"')) {
    result = result.replace('</footer>', `${FOOTER_SNIPPET}</footer>`);
  }
  if (!result.includes('id="aplayer"')) {
    result = result.replace('</body>', `${PLAYER_SNIPPET}</body>`);
  }
  return result;
});

};
