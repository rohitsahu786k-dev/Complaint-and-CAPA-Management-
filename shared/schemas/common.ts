import { z } from "zod";

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.string().trim().max(60).optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
  search: z.string().trim().max(160).optional()
});

export type ListQuery = z.infer<typeof listQuerySchema>;

export type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function paginate<T>(items: T[], total: number, query: Pick<ListQuery, "page" | "pageSize">): Paginated<T> {
  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize))
  };
}
