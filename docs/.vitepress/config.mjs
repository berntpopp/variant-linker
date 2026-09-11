import { defineConfig } from 'vitepress';

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'Variant-Linker',
  description: 'CLI and library for genetic variant annotation using Ensembl APIs',
  base: '/variant-linker/',

  head: [['link', { rel: 'icon', href: '/variant-linker/favicon.ico' }]],

  appearance: 'dark',

  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: '/img/logo.svg',

    nav: [
      { text: 'Home', link: '/' },
      { text: 'Documentation', link: '/introduction' },
      { text: 'Package & Browser', link: '/guide/browser-and-package' },
      { text: 'Blog', link: '/blog/' },
    ],

    sidebar: [
      {
        text: 'Documentation',
        items: [
          { text: 'Introduction', link: '/introduction' },
          {
            text: 'Getting Started',
            collapsed: false,
            items: [
              { text: 'Installation', link: '/getting-started/installation' },
              { text: 'CLI Usage', link: '/getting-started/cli-usage' },
              { text: 'API Usage', link: '/getting-started/api-usage' },
              { text: 'Browser & Package', link: '/guide/browser-and-package' },
            ],
          },
          {
            text: 'Guides',
            collapsed: false,
            items: [
              { text: 'Reliable Processing', link: '/guide/reliable-processing' },
              { text: 'VCF and PED Files', link: '/guides/vcf-and-ped-files' },
              { text: 'Inheritance Analysis', link: '/guides/inheritance-analysis' },
              { text: 'Scoring Engine', link: '/guides/scoring-engine' },
              { text: 'Custom Annotations', link: '/guides/custom-annotations' },
              { text: 'Proxy Configuration', link: '/guides/proxy-configuration' },
              { text: 'Cache Configuration', link: '/CACHE' },
            ],
          },
          { text: 'Benchmarking', link: '/benchmarking' },
          { text: 'Contributing', link: '/contributing' },
        ],
      },
    ],

    socialLinks: [{ icon: 'github', link: 'https://github.com/berntpopp/variant-linker' }],

    footer: {
      message: 'Released under the MIT License.',
      copyright: `Copyright © ${new Date().getFullYear()} Variant-Linker`,
    },

    search: {
      provider: 'local',
    },

    editLink: {
      pattern: 'https://github.com/berntpopp/variant-linker/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
  },

  markdown: {
    theme: {
      light: 'github-light',
      dark: 'github-dark',
    },
    lineNumbers: true,
  },
});
