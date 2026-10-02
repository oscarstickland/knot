import type { budgetCategoriesTable, expensesTable } from "../db/schema.ts";
import { z } from "zod";

export const BudgetCategoryInputSchema = z.object({
    // Present for categories that already exist; omitted for new ones.
    id: z.number().int().positive().optional(),
    name: z.string().trim().min(1, "Category name cannot be empty").max(255),
    allocatedAmount: z.number().nonnegative()
});

export const SetEventBudgetSchema = z.object({
    categories: z.array(BudgetCategoryInputSchema)
}).refine(
    (data) => new Set(data.categories.map((category) => category.name.toLowerCase())).size === data.categories.length,
    { message: "Category names must be unique", path: ["categories"] }
);

export const CreateExpenseSchema = z.object({
    categoryId: z.number().int().positive(),
    amount: z.number().positive(),
    description: z.string().min(1, "Description cannot be empty").max(500)
});

export const UpdateExpenseSchema = CreateExpenseSchema;

export type BudgetCategoryInput = z.infer<typeof BudgetCategoryInputSchema>;
export type SetEventBudgetData = z.infer<typeof SetEventBudgetSchema>;
export type CreateExpenseData = z.infer<typeof CreateExpenseSchema>;
export type UpdateExpenseData = z.infer<typeof UpdateExpenseSchema>;

export type BudgetCategory = typeof budgetCategoriesTable.$inferSelect;
export type Expense = typeof expensesTable.$inferSelect;

export type EventBudgetLine = BudgetCategory & { spent: number };

export type ExpenseWithRelations = Expense & {
    category: BudgetCategory;
    creator: { id: number; name: string };
};

export type EventBudgetSummary = {
    categories: EventBudgetLine[];
    expenses: ExpenseWithRelations[];
    totalAllocated: number;
    totalSpent: number;
};

export type EventSpending = {
    eventId: number;
    name: string;
    start: string;
    archived: boolean;
    totalAllocated: number;
    totalSpent: number;
};
