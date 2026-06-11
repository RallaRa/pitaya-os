import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { AuthProvider } from "@/context/AuthContext";
import { StoreProvider } from "@/context/StoreContext";
import GlobalErrorBoundary from "@/components/error-boundary/GlobalErrorBoundary";
import AppProviders from "@/components/AppProviders";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Pitaya OS",
  description: "Pitaya Inc. Internal Operating System",
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${inter.className} bg-slate-950 text-slate-100`}>
        <AuthProvider>
          <StoreProvider>
            <GlobalErrorBoundary>
              <AppProviders>
                {children}
              </AppProviders>
            </GlobalErrorBoundary>
          </StoreProvider>
        </AuthProvider>
      </body>
    </html>
  );
}