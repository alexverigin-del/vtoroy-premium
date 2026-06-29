import type { NavigationItem, SiteSettings } from "@vtoroy/shared";
import type { ReactNode } from "react";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

export function SiteShell({
  settings,
  navigation,
  children,
}: {
  settings: SiteSettings;
  navigation: NavigationItem[];
  children: ReactNode;
}) {
  return (
    <>
      <SiteHeader settings={settings} navigation={navigation} />
      {children}
      <SiteFooter settings={settings} navigation={navigation} />
    </>
  );
}
