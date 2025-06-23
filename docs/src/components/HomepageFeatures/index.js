import React from 'react';
import clsx from 'clsx';
import styles from './styles.module.css';

const FeatureList = [
  {
    title: 'Easy to Use',
    Svg: require('@site/static/img/undraw_docusaurus_mountain.svg').default,
    description: (
      <>
        Variant-Linker is designed to be simple to use from the command line
        or as a JavaScript library. Get started with genetic variant annotation
        in minutes.
      </>
    ),
  },
  {
    title: 'Powered by Ensembl',
    Svg: require('@site/static/img/undraw_docusaurus_tree.svg').default,
    description: (
      <>
        Built on top of the robust Ensembl Variant Recoder and VEP APIs,
        providing comprehensive and up-to-date genetic variant annotations.
      </>
    ),
  },
  {
    title: 'Comprehensive Analysis',
    Svg: require('@site/static/img/undraw_docusaurus_react.svg').default,
    description: (
      <>
        Supports VCF files, inheritance pattern analysis, custom scoring,
        and multiple output formats including JSON, CSV, TSV, and VCF.
      </>
    ),
  },
];

function Feature({Svg, title, description}) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures() {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}