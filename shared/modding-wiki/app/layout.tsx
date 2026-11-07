import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { source } from '../lib/source';
import StaticSearchDialog from '../components/search';
import './global.css';

export const metadata: Metadata = {
  title: { template: '%s | SOCOM Legacy Modding', default: 'SOCOM Legacy Modding' },
  description: "The modding wiki for SOCOM Legacy's packs: the format, its current state, and how to build one.",
  icons: { icon: '/brand/sl-icon.png' },
};

// Search is Fumadocs' built-in index, exported at build (MW-9: app/api/search/route.ts) and searched in the browser by
// the static dialog (components/search.tsx).
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider search={{ SearchDialog: StaticSearchDialog }} theme={{ defaultTheme: 'dark' }}>
          <DocsLayout
            tree={source.getPageTree()}
            nav={{
              title: (
                <>
                  <img src="/brand/sl-icon.png" alt="" width={24} height={24} />
                  <span className="s2u-wordmark">SOCOM Legacy Modding</span>
                </>
              ),
            }}
          >
            {children}
          </DocsLayout>
        </RootProvider>
      </body>
    </html>
  );
}
