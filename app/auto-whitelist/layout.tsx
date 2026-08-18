import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Auto Whitelist Creator",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
