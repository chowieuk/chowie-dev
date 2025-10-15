// @ts-check

import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import playformCompress from "@playform/compress";

import { defineConfig } from "astro/config";

import react from "@astrojs/react";

// https://astro.build/config
export default defineConfig({
  site: "https://chowie.uk",
  integrations: [mdx(), sitemap(), playformCompress(), react()],
});