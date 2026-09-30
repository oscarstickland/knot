import type { budgetCategoriesTable, eventBudgetsTable, expensesTable } from "../db/schema.ts";
import { z } from "zod";

export const CreateCategorySchema = z.object({
    name: z.string().min(1, "Category name cannot be empty").max(255)
});

export const UpdateCategorySchema = CreateCategorySchema;

export const SetEventBudgetsSchema = z.object({
    allocations: z.array(z.object({
        categoryId: z.number().int().positive(),
        allocatedAmount: z.number().nonnegative()
    }))
});

export const CreateExpenseSchema = z.object({
    categoryId: z.number().int().positive(),
    amount: z.number().positive(),
    description: z.string().min(1, "Description cannot be empty").max(500)
});

export const UpdateExpenseSchema = CreateExpenseSchema;

export type CreateCategoryData = z.infer<typeof CreateCategorySchema>;
export type UpdateCategoryData = z.infer<typeof UpdateCategorySchema>;
export type SetEventBudgetsData = z.infer<typeof SetEventBudgetsSchema>;
export type CreateExpenseData = z.infer<typeof CreateExpenseSchema>;
export type UpdateExpenseData = z.infer<typeof UpdateExpenseSchema>;

export type BudgetCategory = typeof budgetCategoriesTable.$inferSelect;
export type EventBudget = typeof eventBudgetsTable.$inferSelect;
export type Expense = typeof expensesTable.$inferSelect;

export type EventBudgetLine = EventBudget & { category: BudgetCategory; spent: number };

export type ExpenseWithRelations = Expense & {
    category: BudgetCategory;
    creator: { id: number; name: string };
};

export type EventBudgetSummary = {
    allocations: EventBudgetLine[];
    expenses: ExpenseWithRelations[];
    totalAllocated: number;
    totalSpent: number;
};

export type CategorySpending = {
    categoryId: number;
    name: string;
    totalAllocated: number;
    totalSpent: number;
};
