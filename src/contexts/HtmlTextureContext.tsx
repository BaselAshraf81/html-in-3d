import { createContext, useContext } from "react";
import type { TextureWithUV } from "@/hooks/useHtmlTextures";

export const HtmlTextureContext = createContext<Map<string, TextureWithUV>>(
  new Map()
);

export function useHtmlTextureMap() {
  return useContext(HtmlTextureContext);
}
