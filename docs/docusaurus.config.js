// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const { themes } = require('prism-react-renderer');
const lightCodeTheme = themes.github;
const darkCodeTheme = themes.dracula;

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Variant-Linker',
  tagline: 'CLI and library for genetic variant annotation using Ensembl APIs',
  favicon: 'img/favicon.ico',

  // Set the production url of your site here
  url: 'https://berntpopp.github.io',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/variant-linker/',

  // GitHub pages deployment config.
  organizationName: 'berntpopp', // Usually your GitHub org/user name.
  projectName: 'variant-linker', // Usually your repo name.

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  // Even if you don't use internalization, you can use this field to set useful
  // metadata like html lang. For example, if your site is Chinese, you may want
  // to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: require.resolve('./sidebars.js'),
          // Please change this to your repo.
          editUrl: 'https://github.com/berntpopp/variant-linker/tree/main/docs/',
        },
        blog: {
          showReadingTime: true,
          // Please change this to your repo.
          editUrl: 'https://github.com/berntpopp/variant-linker/tree/main/docs/',
        },
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      }),
    ],
  ],

  // Note: TypeDoc plugin temporarily disabled for initial setup
  // Will be re-enabled once dependencies are stable
  plugins: [
    // [
    //   'docusaurus-plugin-typedoc',
    //   {
    //     entryPoints: ['../src/index.js'],
    //     tsconfig: '../tsconfig.json',
    //     out: 'api',
    //     sidebar: {
    //       categoryLabel: 'API Reference',
    //       position: 1,
    //       fullNames: true,
    //     },
    //     readme: 'none',
    //     excludePrivate: true,
    //     excludeProtected: true,
    //     excludeExternals: true,
    //     hideGenerator: true,
    //     sort: ['source-order'],
    //   },
    // ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      // Replace with your project's social card
      image: 'img/docusaurus-social-card.jpg',
      navbar: {
        title: 'Variant-Linker',
        logo: {
          alt: 'Variant-Linker Logo',
          src: 'img/logo.svg',
        },
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'tutorialSidebar',
            position: 'left',
            label: 'Documentation',
          },
          { to: '/blog', label: 'Blog', position: 'left' },
          {
            href: 'https://github.com/berntpopp/variant-linker',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Docs',
            items: [
              {
                label: 'Getting Started',
                to: '/docs/getting-started/installation',
              },
              {
                label: 'API Reference',
                to: '/docs/api',
              },
            ],
          },
          {
            title: 'Community',
            items: [
              {
                label: 'GitHub Issues',
                href: 'https://github.com/berntpopp/variant-linker/issues',
              },
              {
                label: 'GitHub Discussions',
                href: 'https://github.com/berntpopp/variant-linker/discussions',
              },
            ],
          },
          {
            title: 'More',
            items: [
              {
                label: 'Blog',
                to: '/blog',
              },
              {
                label: 'GitHub',
                href: 'https://github.com/berntpopp/variant-linker',
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} Variant-Linker. Built with Docusaurus.`,
      },
      prism: {
        theme: lightCodeTheme,
        darkTheme: darkCodeTheme,
        additionalLanguages: ['bash', 'json'],
      },
    }),
};

module.exports = config;
