import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const base = {
  title: z.string(),
  summary: z.string().optional(),
  description: z.string().optional(),
  claims: z.array(z.string()).default([]),
};

const pages = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/pages' }),
  schema: z.object({
    ...base,
    // audit-card header content for the verification page: one entry per h2 id
    cases: z.array(z.object({ id: z.string(), tag: z.string(), delta: z.string().optional(), kind: z.enum(['case', 'practice']).default('case') })).default([]),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/projects' }),
  schema: z.object({
    ...base,
    status: z.string(),
    order: z.number(),
    metric: z.string().optional(),
    tags: z.array(z.string()).default([]),
    repo: z.string().nullable().default(null),
    visual: z.enum(['queue', 'pipeline', 'specimen', 'cpu']).optional(),
    // interactive component rendered after the page header
    lab: z.enum(['cpu']).optional(),
    // filter tab on the projects index
    area: z.enum(['hardware', 'ml', 'infrastructure']),
  }),
});

export const collections = { pages, projects };
