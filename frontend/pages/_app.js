import Head from 'next/head';
import '../styles/globals.css';

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>Waibo — Panel de control</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="96x96" href="/favicon.png" />
        <link rel="apple-touch-icon" href="/waibo-logo.png" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
