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

export const collections = { blog };
