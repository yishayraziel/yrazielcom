import { defineCollection, z } from 'astro:content';

const works = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    client: z.string(),
    date: z.date(),
    youtube: z.string().url(),
    tags: z.array(z.string()).default([]),
  }),
});

export const collections = { works };
