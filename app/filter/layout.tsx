import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Parser Simulator",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
