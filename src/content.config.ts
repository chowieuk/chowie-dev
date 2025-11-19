import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { AlgorithmNameSchema } from "./consts";

const blog = defineCollection({
  // Load Markdown and MDX files in the `src/content/blog/` directory.
  loader: glob({ base: "./src/content/blog", pattern: "**/*.{md,mdx}" }),
  // Type-check frontmatter using a schema
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      // Transform string to Date object
      pubDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      heroImage: image().optional(),
      heroCanvas: z
        .object({
          algorithm: AlgorithmNameSchema.optional(),
          seed: z
            .object({
              x: z.number(),
              y: z.number(),
              color: z.object({
                r: z.number(),
                g: z.number(),
                b: z.number(),
              }),
            })
            .optional(),
        })
        .optional(),
      draft: z.boolean().optional(),
    }),
});
const projects = defineCollection({
  // Load Markdown and MDX files in the `src/content/projects/` directory.
  loader: glob({ base: "./src/content/projects", pattern: "**/*.{md,mdx}" }),
  // Type-check frontmatter using a schema
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      // Transform string to Date object
      pubDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      heroImage: image().optional(),
      heroIframe: z
        .object({
          src: z.string().url(),
          title: z.string().optional().default("Project Demo"),
          id: z.string().optional(),
          // Allow string (e.g. "100%") or number (e.g. 800)
          width: z.union([z.string(), z.number()]).optional().default("100%"),
          height: z.union([z.string(), z.number()]).optional().default("480"),
        })
        .optional(),
      heroCanvas: z
        .object({
          algorithm: AlgorithmNameSchema.optional(),
          seed: z
            .object({
              x: z.number(),
              y: z.number(),
              color: z.object({
                r: z.number(),
                g: z.number(),
                b: z.number(),
              }),
            })
            .optional(),
        })
        .optional(),
      draft: z.boolean().optional(),
    }),
});

export const collections = { blog, projects };
